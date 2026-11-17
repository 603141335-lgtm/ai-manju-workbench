'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ThumbnailCache}=require('../src/thumbnail-cache');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v0.9.6: thumbnails are cached locally, original source stays unchanged',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-thumb-'));
 const original=path.join(dir,'A01.png');
 const bytes=Buffer.alloc(120,42);fs.writeFileSync(original,bytes);
 let calls=0;const cache=new ThumbnailCache({
  root:path.join(dir,'preview-cache'),
  createThumbnail:async(_file,size)=>{
   calls++;assert.deepEqual(size,{width:192,height:192});return Buffer.alloc(140,7);
  }
 });
 const preview=await cache.get(original);
 assert(preview.endsWith('.png'));assert.notEqual(preview,original);
 assert.equal((await fs.promises.readFile(preview)).length,140);
 assert.equal(calls,1);
 assert.equal(await cache.get(original),preview);
 assert.equal(calls,1);
 assert.deepEqual(fs.readFileSync(original),bytes);
});
test('v0.9.6: source image updates invalidate old preview cache',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-thumb-modified-'));
 const file=path.join(dir,'A09.jpg');fs.writeFileSync(file,'original');
 let calls=0;const cache=new ThumbnailCache({root:path.join(dir,'preview'),createThumbnail:async()=>{calls++;return Buffer.alloc(100,6)}});
 const a=await cache.get(file);
 fs.writeFileSync(file,'modified original');const b=await cache.get(file);
 assert.notEqual(a,b);assert.equal(calls,2);
});
test('v0.9.6: invalid and missing thumbnail sources fail closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-thumb-missing-'));
 const cache=new ThumbnailCache({root:path.join(dir,'preview'),createThumbnail:async()=>{throw Error('bad picture')}});
 const file=path.join(dir,'missing.png');
 assert.equal(await cache.get(file),file);
 assert.equal(await cache.get('/not-a-picture.exe'),'/not-a-picture.exe');
 const valid=path.join(dir,'X01.png');fs.writeFileSync(valid,'broken');
 assert.equal(await cache.get(valid),valid);
});
test('v0.9.6: memory cleanup only responds to explicit click; active and downloading pages excluded',()=>{
 const main=source('src/main.js'),html=source('src/index.html'),preload=source('src/preload.js');
 assert.match(main,/ipcMain\.handle\('perf:cleanup',\(\)=>prune\(\)\)/);
 assert.match(main,/protectedAccounts\.has\(id\)/);
 assert.match(main,/activeDownloads\.has\(id\)/);
 assert.match(main,/dialog\.showMessageBox\(win/);
 assert.doesNotMatch(main,/cfg\.activeAccountId=id;save\(\);void prune\(\)/);
 assert.match(html,/id="btnCleanupViews"/);
 assert.doesNotMatch(html,/id="performanceDialog"/);
 assert.doesNotMatch(html,/id="btnPerformance"/);
 assert.match(preload,/protectAccount/);
 assert.match(preload,/cleanupMemory/);
});
test('v0.9.6: thumbnail file used only for preview, not uploading',()=>{
 const main=source('src/main.js'),html=source('src/index.html');
 assert.match(main,/thumbUrl/);
 assert.match(html,/id="imageGrid"/);
 assert.match(main,/file:r\.file\?\{\.\.\.r\.file,url:originalUrl,thumbUrl\}/);
 assert.match(main,/source=r\.file\?\.path/);
 assert.match(main,/thumbnailCache=new ThumbnailCache/);
 assert.match(main,/createThumbnailFromPath/);
});
