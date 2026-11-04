'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const edge=require('../app/edge-profiles');const ledger=require('../app/edge-ledger');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'manju-edge-'));
try {
  fs.mkdirSync(path.join(root,'Default'));fs.writeFileSync(path.join(root,'Default','Preferences'),'{}');
  fs.mkdirSync(path.join(root,'Profile 1'));fs.writeFileSync(path.join(root,'Profile 1','Preferences'),'{}');
  fs.mkdirSync(path.join(root,'Profile 2'));
  fs.writeFileSync(path.join(root,'Local State'),JSON.stringify({profile:{info_cache:{Default:{name:'创作账号'},'Profile 1':{name:'豆包2'}}}}));
  assert.deepEqual(edge.discoverProfiles(root).map(p=>p.id),['Default','Profile 1']);
  assert.equal(edge.discoverProfiles(root)[0].name,'创作账号');
  assert.equal(edge.isProfileDirectory('Profile ../../x'),false);
  assert.equal(edge.isProfileDirectory('Profile 1'),true);
  const task=ledger.makeRecord({profileId:'Profile 1',episode:10,segment:3});
  assert.equal(ledger.fileName(task),'第10集_第03段_V01.mp4');
  assert.equal(ledger.countSubmitted([task],'Profile 1'),1);
  task.status='failed';
  assert.equal(ledger.countSubmitted([task],'Profile 1'),0);
  const f=path.join(root,'ledger.json');ledger.saveLedger(f,[task]);
  assert.deepEqual(ledger.loadLedger(f),[task]);
  assert.throws(()=>ledger.makeRecord({profileId:'../Default',episode:1,segment:2}));
  console.log('PASS Edge profile discovery, validation, task ledger, video names');
}finally{fs.rmSync(root,{recursive:true,force:true});}
