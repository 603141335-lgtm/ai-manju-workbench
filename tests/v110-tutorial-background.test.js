'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalize}=require('../src/notice-service');
const {DEFAULT_SLIDES,WATERMARK}=require('../src/tutorial-content');
const {TaskJournal}=require('../src/task-journal');
const {TutorialMedia,imageType}=require('../src/tutorial-media');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v1.1.0: default 12 slides, remote backup WeChat and safe, edit-friendly manifest',()=>{
 const x=normalize({});
 assert.equal(x.tutorial.slides.length,12);
 assert.deepEqual(x.tutorial.slides.map(s=>s.id),DEFAULT_SLIDES.map(s=>s.id));
 assert.equal(x.community.wechat,'du4du44');
 assert.equal(x.community.backupWechat,'du6du66');
 assert.equal(WATERMARK.brand,'独独AI，让制作变得简单。');
 const updated=normalize({community:{wechat:'new-main',backupWechat:'new-backup'},tutorial:{version:'23',title:'新手指南',slides:[{id:'01',title:'改版图片',description:'点击红色框',imageUrl:'https://example.com/guide.webp',sha256:'a'.repeat(64)}]}});
 assert.equal(updated.community.wechat,'new-main');
 assert.equal(updated.community.backupWechat,'new-backup');
 assert.equal(updated.tutorial.slides[0].title,'改版图片');
 assert.equal(updated.tutorial.slides[0].sha256,'a'.repeat(64));
 assert.equal(normalize({tutorial:{slides:[{id:'bad',title:'恶意',imageUrl:'javascript:alert(1)'}]}}).tutorial.slides[0].imageUrl,'');
});
test('v1.1.0: watermarked guided media is image-only and never serves remote code',async()=>{
 assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])),'image/png');
 assert.equal(imageType(Buffer.from('<svg onload=alert(1)>')),'');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-guide-'));
 const media=new TutorialMedia({dir,appPath:dir,manifestUrl:'https://docs.example.com/manifest.json'});
 const result=await media.read({id:'01',imageUrl:'javascript:alert(1)',sha256:'a'.repeat(64)});
 assert.equal(result.source,'missing');
 await media.prune();
});
test('v1.1.0: task journal persists limited metadata and fail-closed interrupted state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-task-history-')),file=path.join(dir,'tasks.json');
 let journal=new TaskJournal(file);
 journal.update({accountId:'account1',episodeId:'ep1',segmentId:'seg1',state:'running',message:'正在上传',secret:'DONT_SAVE_ME'});
 await journal.flush();
 const body=fs.readFileSync(file,'utf8');assert(!body.includes('DONT_SAVE_ME'));
 journal=new TaskJournal(file);
 assert.equal(journal.list()[0].state,'interrupted');
 assert.match(journal.list()[0].message,/不会重复上传/);
 journal.update({accountId:'account1',state:'done',message:'附件校验完成'});
 await journal.flush();
 assert.equal(new TaskJournal(file).list()[0].state,'done');
});
test('v1.1.0: actual Electron selection no longer globally cancels one-click imports',()=>{
 const main=read('src/main.js'),engine=read('src/import-engine.js'),ui=read('src/renderer.js'),html=read('src/index.html');
 assert(main.includes('const importEnginesByAccount=new Map()'));
 assert(main.includes('getAccountImportEngine(id)'));
 assert(main.includes('activeImportAccounts.has(id)'));
 assert(main.includes('canStart:()=>activeImportAccounts.size<2'));
 assert(!main.includes('mentionRunner?.cancel();importEngine?.cancel()'));
 assert(engine.includes('await awaitForeground(ctx)'));
 assert(engine.includes('waiting-focus'));
 assert(engine.includes('getStatus,busy'));
 assert(ui.includes('localRunningAccounts')&&ui.includes('taskStateByAccount'));
 assert(html.includes('id="taskCenter"')&&html.includes('id="btnTaskCenter"'));
});
test('v1.1.0: new tutorial/backup-WeChat entry and cloud admin are wired',()=>{
 const html=read('src/index.html'),pre=read('src/preload.js'),main=read('src/main.js');
 for(const key of ['btnTutorial','tutorialDialog','tutorialSlideImage','btnTutorialPrev','btnTutorialNext','btnTutorialSkip','btnCommunityTutorial','noticeBackupWechat','btnNoticeCopyBackup'])assert(html.includes('id="'+key+'"'),key);
 assert(pre.includes('getTutorialImage'));
 assert(main.includes("'tutorial:image'"));
 const cloud=read('cloud-content/src/worker.js');
 assert(cloud.includes("p==='/api/admin/publish'")&&cloud.includes("p==='/api/admin/upload'")&&cloud.includes("p==='/api/admin/rollback'"));
 assert(!cloud.includes('DoubaoCreativeHubPublic'));
});
test('v1.1.0: screenshots are from actual workbench UI, bounded WebP with watermark generator',()=>{
 const script=read('scripts/generate-tutorial-screenshots.py');
 assert(script.includes("src/index.html")&&script.includes("src/renderer.js")&&script.includes("src/style.css"));
 assert(script.includes('独独AI，让制作变得简单。'));
 let generated=0;
 for(const slide of DEFAULT_SLIDES){
  const p=path.join(root,'assets','tutorial','step-'+slide.id+'.webp');
  if(!fs.existsSync(p))continue;
  generated++;
  const b=fs.readFileSync(p);
  assert(b.length>1000&&b.length<2097152);
  assert.equal(imageType(b),'image/webp');
 }
 if(generated)assert.equal(generated,12,'All twelve screenshots must be generated together');
});
