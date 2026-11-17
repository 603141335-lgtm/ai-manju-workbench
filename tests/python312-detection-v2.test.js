/* Python discovery V2 regression guards; runs on any OS without Python install. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root=path.resolve(__dirname,'..');
const resolver=fs.readFileSync(path.join(root,'scripts/find-python312.ps1'),'utf8');
test('Python detection no longer uses quote-sensitive -c execution',()=>{
 assert.match(resolver, /'--version'/);
 assert.match(resolver, /Get-Command/);
 assert.match(resolver, /'-3\.12'/);
 assert.match(resolver, /Python 3\\\.12/);
 assert.doesNotMatch(resolver, /\& \$exe[^\n]*'-c'/);
});
test('both builder entry points use the shared resolver',()=>{
 for(const name of ['scripts/build-release-win.ps1','scripts/check-build-environment.ps1']){
  assert.match(fs.readFileSync(path.join(root,name),'utf8'),/Find-DuduPython312/);
 }
});
test('Windows native detector agrees with existing py -3.12 --version', (t)=>{
 if(process.platform!=='win32')return t.skip('Only Windows PowerShell provides the native test environment');
 const py=spawnSync('py',['-3.12','--version'],{encoding:'utf8'});
 if(py.status!==0 || !/Python 3\.12\.\d+/.test((py.stdout||'')+(py.stderr||'')))return t.skip('Python 3.12 launcher not installed on CI runner');
 const probe=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/verify-python312.ps1')],{encoding:'utf8'});
 assert.equal(probe.status,0, 'PowerShell detector did not find Python despite working py launcher: '+probe.stdout+' '+probe.stderr);
 assert.match(probe.stdout, /\[OK\] Python 3\.12\.\d+/);
});
