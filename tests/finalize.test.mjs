import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeJob} from '../server/finalize.mjs';

const snapshot = job => JSON.parse(JSON.stringify(job));
const initial = () => ({provider:'codex',status:'completed',task:'private',answer:'the result'});

test('checkpoints answer before deleting file and publishing completion',()=>{
  const job=initial(), steps=[];
  finalizeJob(job,{save:j=>steps.push(['save',snapshot(j)]),removeAnswer:()=>steps.push(['remove'])});
  assert.deepEqual(steps.map(s=>s[0]),['save','remove','save']);
  assert.equal(steps[0][1].status,'running');
  assert.equal(steps[0][1].answer,'the result');
  assert.equal(steps[0][1].task,undefined);
  assert.equal(steps[2][1].status,'completed');
});

test('checkpoint failure leaves answer file untouched',()=>{
  let removed=false;
  assert.throws(()=>finalizeJob(initial(),{save:()=>{throw Error('disk error');},removeAnswer:()=>{removed=true;}}),/disk error/);
  assert.equal(removed,false);
});

test('final save failure leaves checkpoint with answer',()=>{
  let stored, writes=0, removed=false;
  assert.throws(()=>finalizeJob(initial(),{save:j=>{if(++writes===2)throw Error('disk error');stored=snapshot(j);},removeAnswer:()=>{removed=true;}}),/disk error/);
  assert.equal(removed,true);
  assert.equal(stored.status,'running');
  assert.equal(stored.answer,'the result');
});

test('cleanup failure is reported; absent file is harmless',()=>{
  for (const code of ['EACCES','ENOENT']) {
    let stored;
    finalizeJob(initial(),{save:j=>stored=snapshot(j),removeAnswer:()=>{throw Object.assign(new Error('unlink'),{code});}});
    assert.equal(stored.status,'completed');
    assert.equal(Boolean(stored.cleanup_warning),code==='EACCES');
  }
});


test('unconfirmed timeout stays nonterminal and preserves recovery data',()=>{
  const job={...initial(),status:'running',termination_unconfirmed:true};
  let stored,removed=false;
  finalizeJob(job,{save:j=>stored=snapshot(j),removeAnswer:()=>{removed=true;}});
  assert.equal(stored.status,'running');
  assert.equal(stored.task,'private');
  assert.equal(stored.finished_at,undefined);
  assert.equal(removed,false);
});
