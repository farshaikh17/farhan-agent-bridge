import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {once} from 'node:events';

test('release manifests have a consistent version', async () => {
  const files=['../package.json','../plugin.json','../.codex-plugin/plugin.json'];
  const manifests=await Promise.all(files.map(f=>readFile(new URL(f,import.meta.url),'utf8').then(JSON.parse)));
  assert.deepEqual(manifests.map(m=>m.version),['0.2.0','0.2.0','0.2.0']);
  const server=await readFile(new URL('../server/bridge.mjs',import.meta.url),'utf8');
  assert.match(server,/bridge_version:'0\.2\.0'/);
});

test('stdio protocol and invalid inputs work without provider calls', async t => {
  const data=await mkdtemp(join(tmpdir(),'farhan-bridge-test-'));
  const server=fileURLToPath(new URL('../server/bridge.mjs',import.meta.url));
  const child=spawn(process.execPath,[server],{env:{...process.env,FARHAN_BRIDGE_DATA:data},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map();let sequence=0;let stderr='';
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const message=JSON.parse(line);const wait=pending.get(message.id);if(wait){pending.delete(message.id);wait.resolve(message);}});
  function request(method,params={}) {
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('RPC timeout: '+method+' '+stderr));},5000);
      pending.set(id,{resolve:message=>{clearTimeout(timer);resolve(message);}});
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    });
  }
  t.after(async()=>{lines.close();const closed=once(child,'close');child.stdin.end();child.kill();await closed;await rm(data,{recursive:true,force:true});});
  const init=await request('initialize');
  assert.equal(init.result.serverInfo.version,'0.2.0');
  assert.equal(init.result.protocolVersion,'2024-11-05');
  assert.deepEqual((await request('ping')).result,{});
  const listed=await request('tools/list');
  assert.deepEqual(listed.result.tools.map(x=>x.name),['bridge_status','submit_codex_task','get_codex_task','submit_claude_task','get_claude_task']);
  for(const name of ['get_codex_task','get_claude_task']){
    const bad=await request('tools/call',{name,arguments:{task_id:'../../auth'}});
    assert.equal(bad.result.isError,true);
    assert.match(bad.result.content[0].text,/Invalid task ID/);
  }
  const fixtures=[['codex','00000000-0000-4000-8000-000000000001'],['claude','00000000-0000-4000-8000-000000000002']];
  for(const [provider,id] of fixtures){
    await writeFile(join(data,'jobs',id+'.json'),JSON.stringify({id,provider,status:'completed',task:'private prompt',answer:'done',worker_pid:123}));
    const good=await request('tools/call',{name:`get_${provider}_task`,arguments:{task_id:id}});
    assert.equal(good.result.isError,undefined);
    const body=JSON.parse(good.result.content[0].text);
    assert.equal(body.answer,'done');
    assert.equal(body.task,undefined);
    assert.equal(body.worker_pid,undefined);
    const other=provider==='claude'?'codex':'claude';
    const bad=await request('tools/call',{name:`get_${other}_task`,arguments:{task_id:id}});
    assert.equal(bad.result.isError,true);
    assert.match(bad.result.content[0].text,/not a (Claude|Codex) task/);
  }
  for(const task of ['', 'x'.repeat(50001)]){
    const bad=await request('tools/call',{name:'submit_claude_task',arguments:{task}});
    assert.equal(bad.result.isError,true);
    assert.match(bad.result.content[0].text,/50,000/);
  }
  assert.equal((await request('unsupported')).error.code,-32601);
});


test('malformed requests receive errors and the server stays available', async t => {
  const data=await mkdtemp(join(tmpdir(),'bridge-invalid-'));
  const server=fileURLToPath(new URL('../server/bridge.mjs',import.meta.url));
  const child=spawn(process.execPath,[server],{env:{...process.env,FARHAN_BRIDGE_DATA:data},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const lines=createInterface({input:child.stdout});
  t.after(async()=>{lines.close();const closed=once(child,'close');child.stdin.end();child.kill();await closed;await rm(data,{recursive:true,force:true});});
  async function exchange(input) {
    const result=Promise.race([once(lines,'line').then(([line])=>JSON.parse(line)),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('response timeout')),3000);timer.unref();})]);
    child.stdin.write(input+'\n');
    return result;
  }
  for(const input of ['null','1','"text"','true','[]']) {
    const response=await exchange(input);
    assert.equal(response.id,null);
    assert.equal(response.error.code,-32600);
  }
  for(const invalid of [
    {id:1,method:'ping'},
    {jsonrpc:'1.0',id:1,method:'ping'},
    {jsonrpc:'2.0',id:1,method:4},
    {jsonrpc:'2.0',id:{},method:'ping'},
    {jsonrpc:'2.0',id:1,method:'tools/call',params:'bad'}
  ]) {
    const response=await exchange(JSON.stringify(invalid));
    assert.equal(response.id,null);
    assert.equal(response.error.code,-32600);
  }
  const pong=await exchange(JSON.stringify({jsonrpc:'2.0',id:42,method:'ping'}));
  assert.equal(pong.id,42);
  assert.deepEqual(pong.result,{});
});
