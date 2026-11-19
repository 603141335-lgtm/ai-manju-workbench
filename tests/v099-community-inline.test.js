'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {referenceSlots,composeText}=require('../src/import-core');
const {createImportEngine}=require('../src/import-engine');
const {normalize,NoticeService,notExpired}=require('../src/notice-service');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v0.9.9: line-level anchors are exact, A15 and A15-01 never collide',()=>{
 const text='第2段｜测试｜15秒\n需要参考图：\nA15-01 杜不凡粉兔营业装\nA15 杜不凡日常装\nAG18 双灶站位\nC42 菜品特写\n连续性参考：不修改 A15-01\n限制：禁止字幕';
 const r=referenceSlots(text);
 assert.deepEqual(r.slots.map(x=>x.code),['A15-01','A15','AG18','C42']);
 assert.deepEqual(r.slots.map(x=>x.anchor),['A15-01 杜不凡粉兔营业装','A15 杜不凡日常装','AG18 双灶站位','C42 菜品特写']);
 assert.deepEqual(r.ambiguous,[]);
 assert.equal(composeText(text,[]),text);
 assert(!composeText(text,[]).includes('图1锁定人物'));
});
test('v0.9.9: repeated reference ID never quietly binds to wrong line',()=>{
 const text='需要参考图：\nA15-01 第一服装\nA15-01 第二服装\n连续性参考：保持';
 const r=referenceSlots(text);
 assert.deepEqual(r.ambiguous,['A15-01']);
 const engine=createImportEngine({getSegment:()=>({text}),resolveRows:()=>[]});
 const plan=engine.getDraft({episodeId:'a',segmentId:'b'});
 assert(plan.blocked);
 assert(plan.referenceErrors.some(e=>e.includes('A15-01')));
});
test('v0.9.9: inline @ placement uses original line, not a generated 图N label',()=>{
 const source=read('src/import-engine.js');
 const browser=read('src/inline-mention-page.js');
 assert(source.includes('customAnchor||item.topAnchor||item.refAnchor'));
 assert(source.includes("scope:customAnchor?'all':'top-reference'"));
 assert(browser.includes("payload?.scope==='top-reference'"));
 assert(!source.includes('makeMapping([item],index)'));
 assert.match(source,/if\(!anchor\)return/);
});
test('v0.9.9: startup promo defaults to du4du44, cannot display expired QR',()=>{
 const d=normalize({});
 assert.equal(d.community.wechat,'du4du44');
 assert.equal(d.community.enabled,true);
 assert.equal(d.community.startup,true);
 assert.equal(d.community.qrExpiresAt,'2026-11-19T23:59:59+08:00');
 assert(notExpired(d.community.qrExpiresAt,Date.parse('2026-11-12T00:00:00+08:00')));
 assert(!notExpired(d.community.qrExpiresAt,Date.parse('2026-11-20T00:00:00+08:00')));
 const service=new NoticeService({version:'0.9.9'}); // no network
 assert.equal(service.snapshot().community.wechat,'du4du44');
 assert.equal(service.snapshot().configured,false);
});
test('v0.9.9: remote announcement safely overrides text and refuses dangerous links',()=>{
 const d=normalize({community:{
   title:'新群',wechat:'new-id',headline:'群聊更新',subtitle:'新资料',
   benefits:['交流','教程'],qrUrl:'https://example.org/group.png',
   qrExpiresAt:'2027-01-01T00:00:00+08:00',enabled:true,startup:false
 }});
 assert.equal(d.community.wechat,'new-id');
 assert.equal(d.community.benefits.length,2);
 assert.equal(d.community.startup,false);
 assert.equal(d.community.qrUrl,'https://example.org/group.png');
 assert.equal(normalize({community:{qrUrl:'javascript:alert(1)'}}).community.qrUrl,'');
 assert.equal(normalize({community:{qrUrl:'http://localhost/qr.png'}}).community.qrUrl,'');
});
test('v0.9.9: startup promo UI and durable opt-out IPC are wired, source QR decodes as PNG',()=>{
 const ui=read('src/index.html'),pre=read('src/preload.js'),main=read('src/main.js'),renderer=read('src/renderer.js');
 for(const id of ['noticeDialog','communityNoStartup','btnNoticeCopy','communityBenefitList','qrPlaceholder','qrExpiry','noticeQR','btnNoticeDone']){
   assert(ui.includes('id="'+id+'"'),id);
 }
 assert(pre.includes('getNoticePreferences')&&pre.includes('saveNoticePreferences'));
 assert(main.includes("'notice:savePreferences'")&&main.includes('notice-preferences.json'));
 assert(ui.includes('src="./community-qr.js"'));
 const qrSource=read('src/community-qr.js');
 const m=qrSource.match(/BUNDLED_COMMUNITY_QR='data:image\/png;base64,([A-Za-z0-9+/=]+)'/);
 assert(m,'local QR PNG must be embedded and available offline');
 const png=Buffer.from(m[1],'base64');
 assert.equal(png.subarray(1,4).toString('ascii'),'PNG');
 assert(png.length>2000);
 assert.equal(read('package.json').includes('"version": "1.3.0"'),true);
});
