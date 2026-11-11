'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalize,safeHttps,compareVersion,NoticeService}=require('../src/notice-service');
const root=path.join(__dirname,'..');
const source=(p)=>fs.readFileSync(path.join(root,p),'utf8');
test('public: empty promotion config does not call a network endpoint',async()=>{
 const cfg=JSON.parse(source('src/public-config.json'));
 assert.equal(cfg.noticeUrl,'');
 const service=new NoticeService({url:cfg.noticeUrl,version:'0.9.6'});
 const before=service.snapshot();assert.equal(before.configured,false);
 const after=await service.refresh();assert.equal(after.source,'unconfigured');
});
test('public: public installer and public userData are separate from private v0.9.4',()=>{
 const build=JSON.parse(source('release-build.json'));
 const pkg=JSON.parse(source('package.json'));
 assert.equal(pkg.version,'0.9.6');
 assert.equal(build.appId,'com.manju.doubao.creativehub.public');
 assert.equal(build.productName,'豆包创作舱（公开版）');
 assert.equal(pkg.build.appId,build.appId);
 const main=source('src/main.js');
 assert.match(main,/const publicUserDataDir=path\.join\(app\.getPath\('appData'\),'DoubaoCreativeHubPublic'\)/);
 assert.match(main,/fs\.mkdirSync\(publicUserDataDir,\{recursive:true\}\)/);
 assert.match(main,/app\.setPath\('userData',publicUserDataDir\)/);
 assert.match(main,/persist:doubao_\$\{id\}/);
 assert(!build.files.some(x=>!x.startsWith('!')&&/workspace\.json|config\.json|Cookies|User Data|AppData/.test(x)));
 assert(build.files.includes('src/**/*'));
});
test('public: remote content accepts text and HTTPS only, not HTML/script',()=>{
 const d=normalize({
   release:{version:'0.9.9',url:'file:///C:/private.exe',notes:'line\nok'},
   notice:{id:'a',title:'hi\u0000',body:'hello',showHint:true},
   community:{wechat:'abc',qqUrl:'javascript:alert(1)',qrUrl:'http://example.com/a.png'}
 });
 assert.equal(d.release.url,'');assert.equal(d.community.qqUrl,'');assert.equal(d.community.qrUrl,'');
 assert.equal(d.notice.title,'hi');assert.equal(d.notice.showHint,true);
 assert.equal(safeHttps('https://example.com/file.exe'),'https://example.com/file.exe');
 assert.equal(safeHttps('https://localhost/x'),'');
 assert.equal(safeHttps('https://user:password@example.com/x'),'');
});
test('public: version comparison does not invent upgrades',()=>{
 assert(compareVersion('0.9.6','0.9.5')>0);
 assert.equal(compareVersion('0.9.5','0.9.5'),0);
 assert(compareVersion('0.9.4','0.9.5')<0);
 const s=new NoticeService({version:'0.9.5'});
 s.data=normalize({release:{version:'0.9.6',url:'https://example.org/release'}});
 assert.equal(s.snapshot().hasUpdate,true);
 s.data=normalize({release:{version:'0.9.4',url:'https://example.org/old'}});
 assert.equal(s.snapshot().hasUpdate,false);
});
test('public: background views require opt-in before eviction',()=>{
 const main=source('src/main.js');
 assert.match(main,/showMessageBox\(win,/);
 assert.match(main,/if\(response!==1\)return performanceState\(\);/);
 assert.match(main,/LIVE_LIMITS=Object\.freeze\(\{light:1,balanced:2,performance:3\}\)/);
 assert.match(main,/noticeService=new NoticeService/);
 assert.match(source('src/preload.js'),/openNoticeLink/);
});
