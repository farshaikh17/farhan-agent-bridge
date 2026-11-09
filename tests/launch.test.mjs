import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {launchWorker} from '../server/launch.mjs';

const id='00000000-0000-4000-8000-000000000001';
const job=()=>({id,status:'queued',provider:'codex',task:'private prompt'});
const copy=j=>JSON.parse(JSON.stringify(j));

test('synchronous launch failure saves failed status without prompt',async()=>{
  let saved;
  await assert.rejects(launchWorker(job(),{start:()=>{throw Error('private detail')},save:j=>saved=copy(j)}),/Worker could not be started/);
  assert.equal(saved.status,'failed');
  assert.equal(saved.task,undefined);
  assert.match(saved.error,/no task was run/);
});

test('actual missing executable leaves failed record',async()=>{
  let saved;
  await assert.rejects(launchWorker(job(),{start:()=>spawn(process.execPath+'-missing-bridge-test'),save:j=>saved=copy(j)}),new RegExp(id));
  assert.equal(saved.status,'failed');
  assert.equal(saved.task,undefined);
});

test('failed status save tells caller which record requires recovery',async()=>{
  await assert.rejects(launchWorker(job(),{start:()=>{throw Error('spawn')},save:()=>{throw Error('disk')}}),/record could not be updated.*Task ID/);
});

test('successful spawn unrefs child and does not rewrite queued record',async()=>{
  const child=new EventEmitter();let unref=false, saved=false;
  child.unref=()=>{unref=true};
  const j=job();
  await launchWorker(j,{start:()=>{queueMicrotask(()=>child.emit('spawn'));return child},save:()=>{saved=true}});
  assert.equal(unref,true);
  assert.equal(saved,false);
  assert.equal(j.status,'queued');
});
