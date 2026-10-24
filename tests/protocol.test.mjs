import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
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
  for(const task of ['', 'x'.repeat(50001)]){
    const bad=await request('tools/call',{name:'submit_claude_task',arguments:{task}});
    assert.equal(bad.result.isError,true);
    assert.match(bad.result.content[0].text,/50,000/);
  }
  assert.equal((await request('unsupported')).error.code,-32601);
});
