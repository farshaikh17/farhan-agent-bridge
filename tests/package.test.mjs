import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const npmCli=process.env.npm_execpath;
test('offline package includes required files and excludes unrelated files', {skip:!npmCli}, async t=>{
  const dir=await mkdtemp(join(tmpdir(),'bridge-package-'));
  t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:12,retryDelay:100}));
  const root=fileURLToPath(new URL('..',import.meta.url));
  for(const path of ['package.json','README.md','SECURITY.md','LICENSE','plugin.json','mcp.json','.mcp.json','.codex-plugin','assets','server'])
    await cp(join(root,path),join(dir,path),{recursive:true});
  await writeFile(join(dir,'private-decoy.txt'),'synthetic');
  await writeFile(join(dir,'server','private-decoy.txt'),'synthetic');
  const userconfig=join(dir,'empty-user-config');
  const globalconfig=join(dir,'empty-global-config');
  await writeFile(userconfig,''); await writeFile(globalconfig,'');
  const env={PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||process.env.SYSTEMROOT||'',
    TEMP:process.env.TEMP||tmpdir(),TMP:process.env.TMP||tmpdir(),
    npm_config_cache:join(dir,'cache'),npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig};
  const result=spawnSync(process.execPath,[npmCli,'pack','--dry-run','--offline','--ignore-scripts','--json'],{cwd:dir,env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr||result.error?.message);
  const paths=JSON.parse(result.stdout)[0].files.map(f=>f.path);
  for(const expected of ['server/bridge.mjs','server/finalize.mjs','server/launch.mjs','server/windows-taskkill.mjs','assets/icon.svg','.mcp.json','.codex-plugin/plugin.json','plugin.json','mcp.json','README.md','SECURITY.md','LICENSE'])
    assert.ok(paths.includes(expected),`Missing ${expected}`);
  assert.ok(!paths.includes('private-decoy.txt'));
  assert.ok(!paths.includes('server/private-decoy.txt'));
});
