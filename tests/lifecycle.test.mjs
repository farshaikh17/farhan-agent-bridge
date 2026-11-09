import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const fake = `
import {writeFileSync,readFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args[0]==='login') console.log('Logged in using ChatGPT');
else if(args[0]==='auth') console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'pro'}));
else if(args[0]==='--version') console.log('mock 1.0');
else if(args.includes('--help')) console.log('--ignore-user-config --safe-mode --strict-mcp-config --tools --setting-sources');
else {
  const input=readFileSync(0,'utf8');
  if(input.includes('trigger mock failure')) {console.error('mock provider failed');process.exit(1);}
  await new Promise(resolve=>setTimeout(resolve,500));
  if(args[0]==='exec') {writeFileSync(args[args.indexOf('-o')+1],'mock codex answer'); console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1}}));}
  else console.log(JSON.stringify({type:'result',subtype:'success',result:'mock claude answer',usage:{input_tokens:1}}));
}
`;
async function setup(t, {codex=true,claude=true}={}) {
  const data=await mkdtemp(join(tmpdir(),'bridge-lifecycle-'));
  const runner=join(data,'mock.mjs'); await writeFile(runner,fake);
  const server=fileURLToPath(new URL('../server/bridge.mjs',import.meta.url));
  const env={...process.env,FARHAN_BRIDGE_DATA:data,APPDATA:join(data,'empty'),PATH:''};
  if(codex) env.FARHAN_BRIDGE_TEST_RUNNER=runner;
  if(claude) env.FARHAN_BRIDGE_TEST_CLAUDE_RUNNER=runner;
  const child=spawn(process.execPath,[server,'--test-mode'],{env,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let sequence=0,stderr='';
  child.stderr.on('data',d=>stderr+=d);
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const m=JSON.parse(line);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);p.resolve(m);}});
  function call(name,args={}) {const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Timeout ${name}: ${stderr}`)),10000);pending.set(id,{resolve,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');});}
  t.after(async()=>{lines.close();const closed=once(child,'close');child.stdin.end();child.kill();await closed;await rm(data,{recursive:true,force:true});});
  return {call};
}
function data(result){assert.notEqual(result.result?.isError,true,result.result?.content?.[0]?.text);return JSON.parse(result.result.content[0].text);}
async function completed(call,provider,id){for(let i=0;i<100;i++){const j=data(await call(`get_${provider}_task`,{task_id:id}));if(['completed','failed'].includes(j.status))return j;await delay(50);}throw new Error('Worker did not finish');}

test('status reports Claude even if Codex is absent',async t=>{
  const {call}=await setup(t,{codex:false});
  const s=data(await call('bridge_status'));
  assert.equal(s.chatgpt_sign_in,false);
  assert.match(s.codex_error,/Codex npm entrypoint not found/);
  assert.equal(s.claude.subscription_sign_in,true);
  assert.equal(s.claude.compatible_cli,true);
});

test('mock providers complete tasks and prevent overlapping work',async t=>{
  const {call}=await setup(t);
  const s=data(await call('bridge_status'));
  assert.equal(s.chatgpt_sign_in,true); assert.equal(s.claude.subscription_sign_in,true);
  for(const provider of ['codex','claude']){
    const submitted=data(await call(`submit_${provider}_task`,{task:'test task'}));
    const blocked=await call(`submit_${provider}_task`,{task:'second task'});
    assert.equal(blocked.result.isError,true);
    assert.match(blocked.result.content[0].text,/One task is already active/);
    const j=await completed(call,provider,submitted.task_id);
    assert.equal(j.status,'completed',j.error);
    assert.equal(j.answer,`mock ${provider} answer`);
    assert.equal(j.task,undefined);
  }
});

test('worker failure is reported and permits a later task',async t=>{
  const {call}=await setup(t);
  const submitted=data(await call('submit_codex_task',{task:'trigger mock failure'}));
  const failed=await completed(call,'codex',submitted.task_id);
  assert.equal(failed.status,'failed');
  assert.match(failed.error,/mock provider failed/);
  const retry=data(await call('submit_codex_task',{task:'retry'}));
  assert.equal((await completed(call,'codex',retry.task_id)).status,'completed');
});
