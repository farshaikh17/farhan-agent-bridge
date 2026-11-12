import test from 'node:test';
import assert from 'node:assert/strict';
import {windowsTaskkillPath} from '../server/windows-taskkill.mjs';

test('Windows termination uses the system directory instead of PATH',()=>{
  assert.equal(windowsTaskkillPath({SystemRoot:'C:\\Windows',PATH:'C:\\untrusted'}),'C:\\Windows\\System32\\taskkill.exe');
  assert.equal(windowsTaskkillPath({WINDIR:'D:\\Windows',PATH:'C:\\untrusted'}),'D:\\Windows\\System32\\taskkill.exe');
});

test('missing or non-drive-qualified Windows roots are rejected',()=>{
  for(const root of [undefined,'','relative','\\\\server\\share','C:relative','C:\\Windows\0bad'])
    assert.throws(()=>windowsTaskkillPath({SystemRoot:root}),/unavailable/);
});
