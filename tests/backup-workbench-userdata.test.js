'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const backup=fs.readFileSync(path.join(root,'scripts','backup-workbench-userdata.ps1'),'utf8');
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const build=JSON.parse(fs.readFileSync(path.join(root,'release-build.json'),'utf8'));
test('backup script targets the existing public userData without changing it',()=>{
  assert.match(backup,/DoubaoCreativeHubPublic/);
  assert.match(backup,/robocopy\.exe\s+\$source\s+\$destination\s+\/E/);
  assert.match(backup,/Get-FileHash/);
  assert.doesNotMatch(backup,/Remove-Item|rmdir|Clear-Content/);
  assert.match(main,/DoubaoCreativeHubPublic/);
  assert.equal(build.nsis.deleteAppDataOnUninstall,false);
});
