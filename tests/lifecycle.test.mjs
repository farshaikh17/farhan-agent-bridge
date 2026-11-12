import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile, readFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const fake = `
import {writeFileSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
const forbidden=/^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GH_TOKEN|GITHUB_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|AZURE_CLIENT_SECRET|CLOUDFLARE_API_TOKEN)$/i;
if(Object.keys(process.env).some(k=>forbidden.test(k))) { console.error('unexpected sensitive environment variable'); process.exit(2); }
const args=process.argv.slice(2);
if(args[0]==='login' && process.env.FARHAN_BRIDGE_TEST_DIAGNOSTIC_TIMEOUT==='1') await new Promise(resolve=>setTimeout(resolve,5000));
else if(args[0]==='login') console.log('Logged in using ChatGPT');
else if(args[0]==='auth' && process.env.FARHAN_BRIDGE_TEST_HANG_AUTH==='1') await new Promise(resolve=>setTimeout(resolve,5000));
else if(args[0]==='auth') console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'pro'}));
else if(args[0]==='--version') console.log(process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.OPENAI_API_KEY ? 'unexpected inherited option' : 'mock 1.0');
else if(args.includes('--help')) console.log('--ignore-user-config --safe-mode --strict-mcp-config --tools --setting-sources');
else {
  const input=readFileSync(0,'utf8');
  if(input.includes('trigger windows tree timeout')) {
    const root=process.env.FARHAN_BRIDGE_DATA;
    const script="const fs=require('node:fs'); const path=require('node:path'); const root=process.env.FARHAN_BRIDGE_DATA; fs.writeFileSync(path.join(root,'tree-child-ready'),'ready'); setTimeout(()=>fs.writeFileSync(path.join(root,'tree-child-survived'),'alive'),8000)";
    spawn(process.execPath,['-e',script],{stdio:'ignore'}).unref();
    await new Promise(resolve=>setTimeout(resolve,12000));
    writeFileSync(join(root,'tree-parent-survived'),'alive');
    process.exit(0);
  }
  if(input.includes('trigger descendant timeout')) {
    const marker=join(process.env.FARHAN_BRIDGE_DATA,'descendant-finished');
    const script="setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'done'), 2500)";
    spawn(process.execPath,['-e',script,marker],{stdio:'ignore'}).unref();
    await new Promise(resolve=>setTimeout(resolve,5000));
    process.exit(0);
  }
  if(input.includes('trigger child error')) {
    if(args[0]==='exec') writeFileSync(args[args.indexOf('-o')+1],'partial answer');
    console.log(JSON.stringify({type:'test_child_error'}));
    await new Promise(resolve=>setTimeout(resolve,2000));
    writeFileSync(join(process.env.FARHAN_BRIDGE_DATA,'child-error-survived'),'alive');
    process.exit(0);
  }
  if(input.includes('trigger failed termination')) {
    await new Promise(resolve=>setTimeout(resolve,2500));
    writeFileSync(join(process.env.FARHAN_BRIDGE_DATA,'provider-survived'),'alive after timeout');
    process.exit(0);
  }
  if(input.includes('trigger mock timeout')) {
    if(args[0]==='exec') writeFileSync(args[args.indexOf('-o')+1],'partial answer');
    await new Promise(resolve=>setTimeout(resolve,5000));
    process.exit(0);
  }
  if(input.includes('trigger mock failure')) {console.error('mock provider failed');process.exit(1);}
  await new Promise(resolve=>setTimeout(resolve,500));
  if(args[0]==='exec') {writeFileSync(args[args.indexOf('-o')+1],'mock codex answer'); console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1}}));}
  else console.log(JSON.stringify({type:'result',subtype:'success',result:'mock claude answer',usage:{input_tokens:1}}));
}
`;
async function setup(t, {codex=true,claude=true,sharedData,timeout=false,authTimeout=false,diagnosticTimeout=false,terminationFailure=false,childError=false,eventError=false,workerCrash=false,windowsTree=false}={}) {
  const data=sharedData || await mkdtemp(join(tmpdir(),'bridge-lifecycle-'));
  const runner=join(data,'mock.mjs'); await writeFile(runner,fake);
  const server=fileURLToPath(new URL('../server/bridge.mjs',import.meta.url));
  const env={...process.env,FARHAN_BRIDGE_DATA:data,APPDATA:join(data,'empty'),PATH:'',NODE_OPTIONS:'--no-warnings',NODE_PATH:'synthetic-test-path',OPENAI_API_KEY:'synthetic-test-value',AWS_ACCESS_KEY_ID:'synthetic',AWS_SECRET_ACCESS_KEY:'synthetic',aws_session_token:'synthetic',GH_TOKEN:'synthetic',GITHUB_TOKEN:'synthetic',GOOGLE_APPLICATION_CREDENTIALS:'synthetic',AZURE_CLIENT_SECRET:'synthetic',CLOUDFLARE_API_TOKEN:'synthetic'};
  env.FARHAN_BRIDGE_TEST_CAPTURE_CRASH='1';
  if(workerCrash) env.FARHAN_BRIDGE_TEST_WORKER_CRASH='1';
  if(timeout) env.FARHAN_BRIDGE_TEST_TIMEOUT='1';
  if(windowsTree) env.FARHAN_BRIDGE_TEST_TREE_TIMEOUT='1'; // PATH stays empty in this test.
  if(childError) env.FARHAN_BRIDGE_TEST_CHILD_ERROR='1';
  if(eventError) env.FARHAN_BRIDGE_TEST_EVENT_ERROR='1';
  if(terminationFailure) env.FARHAN_BRIDGE_TEST_TERMINATION_FAILURE='1';
  if(diagnosticTimeout) env.FARHAN_BRIDGE_TEST_DIAGNOSTIC_TIMEOUT='1';
  if(authTimeout) env.FARHAN_BRIDGE_TEST_AUTH_TIMEOUT='1';
  if(codex) env.FARHAN_BRIDGE_TEST_RUNNER=runner;
  if(claude) env.FARHAN_BRIDGE_TEST_CLAUDE_RUNNER=runner;
  const child=spawn(process.execPath,[server,'--test-mode'],{env,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let sequence=0,stderr='';
  child.stderr.on('data',d=>stderr+=d);
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const m=JSON.parse(line);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);p.resolve(m);}});
  function call(name,args={}) {const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Timeout ${name}: ${stderr}`)),10000);pending.set(id,{resolve,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');});}
  t.after(async()=>{lines.close();const closed=once(child,'close');child.stdin.end();child.kill();await closed;await rm(data,{recursive:true,force:true,maxRetries:12,retryDelay:100});});
  return {call,data};
}
function data(result){assert.notEqual(result.result?.isError,true,result.result?.content?.[0]?.text);return JSON.parse(result.result.content[0].text);}
async function recoveryDiagnostics(dir,id) {
  const result={};
  for(const [key,path] of Object.entries({job:join(dir,'jobs',id+'.json'),lock:join(dir,'provider.lock'),answer:join(dir,'jobs',id+'.answer.txt'),marker:join(dir,'child-error-survived'),crash:join(dir,'test-worker-error.json')})) {
    try {
      await access(path);
      result[key]=key==='job'||key==='crash'?JSON.parse(await readFile(path,'utf8')):'present';
    } catch(e) { result[key]=e.code||e.name; }
  }
  return JSON.stringify(result);
}
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
  const {call,data:dir}=await setup(t);
  const s=data(await call('bridge_status'));
  assert.equal(s.chatgpt_sign_in,true); assert.equal(s.claude.subscription_sign_in,true);
  assert.equal(s.version,'mock 1.0'); assert.equal(s.claude.version,'mock 1.0');
  for(const provider of ['codex','claude']){
    const submitted=data(await call(`submit_${provider}_task`,{task:'test task'}));
    const blocked=await call(`submit_${provider}_task`,{task:'second task'});
    assert.equal(blocked.result.isError,true);
    assert.match(blocked.result.content[0].text,/One task is already active/);
    const j=await completed(call,provider,submitted.task_id);
    assert.equal(j.status,'completed',j.error);
    assert.equal(j.answer,`mock ${provider} answer`);
    assert.equal(j.task,undefined);
    const stored=JSON.parse(await readFile(join(dir,'jobs',submitted.task_id+'.json'),'utf8'));
    assert.equal(stored.task,undefined);
    if(provider==='codex') await assert.rejects(access(join(dir,'jobs',submitted.task_id+'.answer.txt')), {code:'ENOENT'});
  }
});

test('worker failure is reported and permits a later task',async t=>{
  const {call,data:dir}=await setup(t);
  const submitted=data(await call('submit_codex_task',{task:'trigger mock failure'}));
  const failed=await completed(call,'codex',submitted.task_id);
  assert.equal(failed.status,'failed');
  assert.equal(JSON.parse(await readFile(join(dir,'jobs',submitted.task_id+'.json'),'utf8')).task,undefined);
  assert.match(failed.error,/mock provider failed/);
  const retry=data(await call('submit_codex_task',{task:'retry'}));
  assert.equal((await completed(call,'codex',retry.task_id)).status,'completed');
});

test('provider timeout preserves recovery state and blocks subsequent work',async t=>{
  const {call,data:dir}=await setup(t,{timeout:true});
  for(const provider of ['codex','claude']) {
    const id=data(await call(`submit_${provider}_task`,{task:'trigger mock timeout'})).task_id;
    let job;
    const deadline=Date.now()+20000;
    do {
      job=data(await call(`get_${provider}_task`,{task_id:id}));
      if(job.termination_unconfirmed || ['completed','failed'].includes(job.status)) break;
      await delay(50);
    } while(Date.now()<deadline);
    assert.equal(job.status,'running',`${provider}: ${JSON.stringify(job)}`);
    assert.equal(job.termination_unconfirmed,true,`${provider}: ${JSON.stringify(job)}`);
    const file=join(dir,'jobs',id+'.json');
    const stored=JSON.parse(await readFile(file,'utf8'));
    assert.equal(stored.task,'trigger mock timeout');
    if(provider==='codex') assert.equal(await readFile(join(dir,'jobs',id+'.answer.txt'),'utf8'),'partial answer');
    const blocked=await call('submit_codex_task',{task:'must be blocked'});
    assert.equal(blocked.result.isError,true);
    assert.match(blocked.result.content[0].text,/already active/);
    // Synthetic provider has a finite lifetime; wait before simulating offline recovery.
    await delay(4200);
    await rm(file);
    await rm(join(dir,'provider.lock'));
  }
});


test('stale or malformed lock fails closed until manually removed',async t=>{
  const {call,data:dir}=await setup(t);
  for(const contents of ['{bad json',JSON.stringify({pid:2147483647})]) {
    await writeFile(join(dir,'submit.lock'),contents);
    const blocked=await call('submit_codex_task',{task:'test'});
    assert.equal(blocked.result.isError,true);
    assert.match(blocked.result.content[0].text,/stale submission lock/);
    assert.equal(await readFile(join(dir,'submit.lock'),'utf8'),contents);
    await rm(join(dir,'submit.lock'));
  }
  const accepted=data(await call('submit_codex_task',{task:'retry after recovery'}));
  assert.equal((await completed(call,'codex',accepted.task_id)).status,'completed');
});

test('two bridge processes sharing a data directory admit only one task',async t=>{
  const a=await setup(t);
  const b=await setup(t,{sharedData:a.data});
  const replies=await Promise.all([a.call('submit_codex_task',{task:'first'}),b.call('submit_codex_task',{task:'second'})]);
  const accepted=replies.filter(x=>!x.result.isError);
  const rejected=replies.filter(x=>x.result.isError);
  assert.equal(accepted.length,1);
  assert.equal(rejected.length,1);
  assert.match(rejected[0].result.content[0].text,/submission lock|already active/);
  const id=data(accepted[0]).task_id;
  assert.equal((await completed(a.call,'codex',id)).status,'completed');
});


test('old queued and running records block new work without being rewritten',async t=>{
  const {call,data:dir}=await setup(t);
  await call('bridge_status');
  for (const status of ['queued','running']) {
    const id='00000000-0000-4000-8000-000000000003';
    const file=join(dir,'jobs',id+'.json');
    const content=JSON.stringify({id,status,provider:'codex',worker_pid:2147483647,created_at:'2000-01-01T00:00:00.000Z',task:'private'});
    await writeFile(file,content);
    const blocked=await call('submit_codex_task',{task:'test'});
    assert.equal(blocked.result.isError,true);
    assert.match(blocked.result.content[0].text,/already active/);
    assert.equal(await readFile(file,'utf8'),content);
    await rm(file);
  }
  const accepted=data(await call('submit_codex_task',{task:'after recovery'}));
  assert.equal((await completed(call,'codex',accepted.task_id)).status,'completed');
});

test('unreadable job records block submissions without exposing their contents',async t=>{
  const {call,data:dir}=await setup(t);
  await call('bridge_status');
  const file=join(dir,'jobs','00000000-0000-4000-8000-000000000004.json');
  await writeFile(file,'invalid private material');
  const blocked=await call('submit_codex_task',{task:'test'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/job record is unreadable or invalid/);
  assert.match(blocked.result.content[0].text,/00000000-0000-4000-8000-000000000004\.json/);
  assert.doesNotMatch(blocked.result.content[0].text,/private material/);
  assert.equal(await readFile(file,'utf8'),'invalid private material');
});



test('a surviving POSIX descendant cannot permit overlapping work', {skip: process.platform==='win32'}, async t=>{
  const {call,data:dir}=await setup(t,{timeout:true});
  const id=data(await call('submit_codex_task',{task:'trigger descendant timeout'})).task_id;
  let job;
  for(let i=0;i<100;i++){
    job=data(await call('get_codex_task',{task_id:id}));
    if(job.termination_unconfirmed) break;
    await delay(50);
  }
  assert.equal(job.termination_unconfirmed,true);
  const blocked=await call('submit_codex_task',{task:'must remain blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
  const marker=join(dir,'descendant-finished');
  for(let i=0;i<100;i++){
    try { await access(marker); break; } catch { await delay(50); }
  }
  assert.equal(await readFile(marker,'utf8'),'done');
  assert.equal(data(await call('get_codex_task',{task_id:id})).status,'running');
});


test('Claude authentication timeout preserves recovery state and blocks new work', async t=>{
  const {call,data:dir}=await setup(t,{authTimeout:true});
  const id=data(await call('submit_claude_task',{task:'private recovery prompt'})).task_id;
  let job;
  for(let i=0;i<100;i++) {
    job=data(await call('get_claude_task',{task_id:id}));
    if(job.termination_unconfirmed) break;
    await delay(50);
  }
  assert.equal(job.status,'running');
  assert.equal(job.termination_unconfirmed,true);
  const stored=JSON.parse(await readFile(join(dir,'jobs',id+'.json'),'utf8'));
  assert.equal(stored.task,'private recovery prompt');
  const blocked=await call('submit_codex_task',{task:'must be blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
});


test('diagnostic timeout leaves a cross-process recovery block without a job', async t=>{
  const a=await setup(t,{diagnosticTimeout:true});
  const b=await setup(t,{sharedData:a.data});
  const status=a.call('bridge_status');
  const deadline=Date.now()+5000;
  while(true) {
    try { await access(join(a.data,'provider.lock')); break; }
    catch(e) { if(Date.now()>=deadline) throw e; await delay(20); }
  }
  const [otherStatus,blocked]=await Promise.all([
    b.call('bridge_status'), b.call('submit_codex_task',{task:'must be blocked'})
  ]);
  assert.equal(otherStatus.result.isError,true);
  assert.match(otherStatus.result.content[0].text,/submission lock/);
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/submission lock/);
  const result=await status;
  assert.match(JSON.stringify(result),/time limit|provider.lock/);
  const afterTimeout=await b.call('submit_codex_task',{task:'still blocked'});
  assert.equal(afterTimeout.result.isError,true);
  assert.match(afterTimeout.result.content[0].text,/provider.lock/);
  // Wait for the finite mock process before fixture cleanup; do not remove the lock.
  await delay(4500);
  await access(join(a.data,'provider.lock'));
});


test('status checks cannot interfere with an active worker', async t=>{
  const a=await setup(t);
  const b=await setup(t,{sharedData:a.data});
  const id=data(await a.call('submit_codex_task',{task:'test task'})).task_id;
  const blocked=await b.call('bridge_status');
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/task is active/);
  const job=await completed(a.call,'codex',id);
  assert.equal(job.status,'completed',job.error);
  assert.equal(job.answer,'mock codex answer');
  assert.equal(data(await b.call('bridge_status')).chatgpt_sign_in,true);
});


test('failed termination preserves recovery until explicit action', async t=>{
  const a=await setup(t,{timeout:true,terminationFailure:true});
  const b=await setup(t,{sharedData:a.data});
  const id=data(await a.call('submit_codex_task',{task:'trigger failed termination'})).task_id;
  let job;
  const deadline=Date.now()+20000;
  do {
    job=data(await a.call('get_codex_task',{task_id:id}));
    if(job.termination_unconfirmed || ['completed','failed'].includes(job.status)) break;
    await delay(50);
  } while(Date.now()<deadline);
  assert.equal(job.status,'running',JSON.stringify(job));
  assert.equal(job.termination_unconfirmed,true,JSON.stringify(job));
  await access(join(a.data,'provider.lock'));
  const blocked=await b.call('submit_codex_task',{task:'must stay blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
  const marker=join(a.data,'provider-survived');
  const markerDeadline=Date.now()+10000;
  while(true) {
    try { await access(marker); break; }
    catch(e) { if(Date.now()>=markerDeadline) throw e; await delay(50); }
  }
  assert.equal(await readFile(marker,'utf8'),'alive after timeout');
  await delay(500); // Allow the finite mock to close after producing its marker.
  await access(join(a.data,'provider.lock'));
  assert.equal(data(await a.call('get_codex_task',{task_id:id})).status,'running');
});


test('provider process error retains the job and partial answer for recovery', async t=>{
  const a=await setup(t,{childError:true});
  const b=await setup(t,{sharedData:a.data});
  const prompt='trigger child error';
  const id=data(await a.call('submit_codex_task',{task:prompt})).task_id;
  let job;
  const deadline=Date.now()+20000;
  do {
    job=data(await a.call('get_codex_task',{task_id:id}));
    if(job.termination_unconfirmed || ['completed','failed'].includes(job.status)) break;
    await delay(50);
  } while(Date.now()<deadline);
  assert.equal(job.status,'running',JSON.stringify(job));
  assert.equal(job.termination_unconfirmed,true,JSON.stringify(job));
  assert.match(job.error,/process error/);
  assert.equal(JSON.parse(await readFile(join(a.data,'jobs',id+'.json'),'utf8')).task,prompt);
  assert.equal(await readFile(join(a.data,'jobs',id+'.answer.txt'),'utf8'),'partial answer');
  await access(join(a.data,'provider.lock'));
  const blocked=await b.call('submit_codex_task',{task:'must be blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
  const marker=join(a.data,'child-error-survived');
  const markerDeadline=Date.now()+10000;
  while(true) {
    try { await access(marker); break; }
    catch(e) { if(Date.now()>=markerDeadline) throw e; await delay(50); }
  }
  assert.equal(await readFile(marker,'utf8'),'alive');
  await access(join(a.data,'provider.lock'));
});


test('event recording errors preserve recovery data and block later tasks', async t=>{
  const a=await setup(t,{eventError:true});
  const b=await setup(t,{sharedData:a.data});
  const prompt='trigger child error';
  const id=data(await a.call('submit_codex_task',{task:prompt})).task_id;
  let job;
  const deadline=Date.now()+20000;
  do {
    job=data(await a.call('get_codex_task',{task_id:id}));
    if(job.termination_unconfirmed || ['completed','failed'].includes(job.status)) break;
    await delay(50);
  } while(Date.now()<deadline);
  assert.equal(job.status,'running',JSON.stringify(job));
  assert.equal(job.termination_unconfirmed,true,await recoveryDiagnostics(a.data,id));
  assert.match(job.error,/Could not record provider progress/);
  assert.equal(JSON.parse(await readFile(join(a.data,'jobs',id+'.json'),'utf8')).task,prompt);
  assert.equal(await readFile(join(a.data,'jobs',id+'.answer.txt'),'utf8'),'partial answer');
  await access(join(a.data,'provider.lock'));
  const blocked=await b.call('submit_codex_task',{task:'must be blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
  const marker=join(a.data,'child-error-survived');
  const markerDeadline=Date.now()+10000;
  while(true) {
    try { await access(marker); break; }
    catch(e) { if(Date.now()>=markerDeadline) throw e; await delay(50); }
  }
  await access(join(a.data,'provider.lock'));
});


test('synthetic worker crash records diagnostics and keeps submission blocked', async t=>{
  const a=await setup(t,{workerCrash:true});
  const id=data(await a.call('submit_codex_task',{task:'synthetic crash'})).task_id;
  const crash=join(a.data,'test-worker-error.json');
  const deadline=Date.now()+15000;
  while(true) {
    try { await access(crash); break; }
    catch(e) { if(Date.now()>=deadline) throw e; await delay(50); }
  }
  const diagnostic=JSON.parse(await readFile(crash,'utf8'));
  assert.match(diagnostic.stack,/synthetic worker crash/);
  assert.equal(data(await a.call('get_codex_task',{task_id:id})).status,'running');
  const blocked=await a.call('submit_codex_task',{task:'must be blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
});


test('Windows taskkill stops a controlled mock process tree after timeout', {skip:process.platform!=='win32'}, async t=>{
  const a=await setup(t,{windowsTree:true});
  const b=await setup(t,{sharedData:a.data});
  const id=data(await a.call('submit_codex_task',{task:'trigger windows tree timeout'})).task_id;
  const ready=join(a.data,'tree-child-ready');
  const deadline=Date.now()+20000;
  while(true) {
    try { await access(ready); break; }
    catch(e) { if(Date.now()>=deadline) throw e; await delay(50); }
  }
  let job;
  do {
    job=data(await a.call('get_codex_task',{task_id:id}));
    if(job.termination_unconfirmed || ['completed','failed'].includes(job.status)) break;
    await delay(50);
  } while(Date.now()<deadline);
  assert.equal(job.status,'running',await recoveryDiagnostics(a.data,id));
  assert.equal(job.termination_unconfirmed,true,await recoveryDiagnostics(a.data,id));
  const blocked=await b.call('submit_codex_task',{task:'must remain blocked'});
  assert.equal(blocked.result.isError,true);
  assert.match(blocked.result.content[0].text,/already active/);
  // Both finite mock processes would leave markers if they outlived termination.
  await delay(13000);
  await assert.rejects(access(join(a.data,'tree-child-survived')),{code:'ENOENT'});
  await assert.rejects(access(join(a.data,'tree-parent-survived')),{code:'ENOENT'});
  await access(join(a.data,'provider.lock'));
  assert.equal(data(await a.call('get_codex_task',{task_id:id})).status,'running');
});
