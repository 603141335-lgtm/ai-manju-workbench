'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {makeRecord}=require('../app/edge-ledger');
const {archiveFile,createWatcher}=require('../app/edge-downloads');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'edge-lite-download-'));
try{
 const downloads=path.join(root,'downloads'),archive=path.join(root,'archive');
 fs.mkdirSync(downloads);fs.mkdirSync(archive);
 const t=makeRecord({profileId:'Default',episode:10,segment:3});
 const first=path.join(downloads,'browser-video.mp4');fs.writeFileSync(first,'data1');
 const a=archiveFile(first,t,archive);
 assert.equal(path.basename(a),'第10集_第03段_V01.mp4');
 assert.equal(fs.readFileSync(a,'utf8'),'data1');
 const second=path.join(downloads,'browser-video.mp4');fs.writeFileSync(second,'data2');
 const b=archiveFile(second,t,archive);
 assert.equal(path.basename(b),'第10集_第03段_V02.mp4');
 assert.equal(fs.readFileSync(a,'utf8'),'data1');
 const events=[],watch=createWatcher({source:downloads,notify:v=>events.push(v),pollMs:1000});
 const previous=path.join(downloads,'existing.mp4');fs.writeFileSync(previous,'old');
 watch.arm(t,archive);watch.tick();assert(fs.existsSync(previous),'Existing file never moved');
 watch.disarm();
 // Multiple new videos at once must never be auto attributed.
 watch.arm(t,archive);
 fs.writeFileSync(path.join(downloads,'new1.mp4'),'one');
 fs.writeFileSync(path.join(downloads,'new2.mp4'),'two');
 watch.tick();
 assert(events.some(x=>x.kind==='ambiguous'),'Ambiguous downloads should be held');
 assert(fs.existsSync(path.join(downloads,'new1.mp4')));
 assert(fs.existsSync(path.join(downloads,'new2.mp4')));
 assert.equal(watch.get().armed,null);
 watch.stop();
 console.log('PASS download archive versioning, preservation, existing files, ambiguity guard');
}finally{fs.rmSync(root,{recursive:true,force:true});}
