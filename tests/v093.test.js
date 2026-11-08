'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {extractReferenceLabels}=require('../src/reference-labels');
const {createImportEngine,createPlan}=require('../src/import-engine');
const {composeText,makeMapping}=require('../src/import-core');
const {fresh,scrub}=require('../src/workspace');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v093-'));
const img=(code)=>{const filepath=path.join(root,code+'.png');fs.writeFileSync(filepath,'fake-image');return {path:filepath,name:code+'.png'};};
test('A01小李、A01-01小李、A15杜不凡：编号与中文姓名严格拆分',()=>{
 const x=extractReferenceLabels('第2段｜标题\n需要参考图：A01小李、A01-01小李、A15 杜不凡、B02（图四）\n连续性参考：A01继续说话');
 assert.deepEqual(x.labels,{A01:'小李','A01-01':'小李',A15:'杜不凡'});
 assert.equal(x.conflicts.length,0);
});
test('不把图一/图二误认为人物名，参考图栏目外的名字不影响关联',()=>{
 const x=extractReferenceLabels('需要参考图：A02（图一）、A07（图二）\n场景与站位：A02陈老师\n台词：A07大爷发声');
 assert.deepEqual(x.labels,{});
});
test('同一编号两个人名禁止静默覆盖',()=>{
 const x=extractReferenceLabels('需要参考图：A01小李、A01老张\n连续性参考：不变');
 assert.deepEqual(x.labels,{});assert.equal(x.conflicts.length,1);
});
test('图片图号、音频字符名映射位于上方，原文分镜完整保留',()=>{
 const original='第2段｜开场｜15秒\n需要参考图：A01小李、A15杜不凡\n连续性参考：上一段结束\n0—3秒｜小李说：“起锅烧油！”\n限制：禁止背景音乐和字幕';
 const items=[{code:'A01',label:'小李',file:img('A01')},{code:'A15',label:'杜不凡',file:img('A15')}];
 const voices=[{code:'A01',label:'少年男声',characterName:'小李',filename:'小李.wav',imageIndex:1}];
 const out=composeText(original,items,0,voices);
 assert.match(out,/图1 = A01 小李（A01\.png）/);assert.match(out,/图2 = A15 杜不凡（A15\.png）/);
 assert.match(out,/音频1 = A01 小李（少年男声：小李\.wav）/);
 assert(out.indexOf('音频1 = A01')<out.indexOf('连续性参考'));
 assert(out.endsWith('限制：禁止背景音乐和字幕'));
 assert.equal(out.split('0—3秒｜小李说').length,2);
});
test('离线无登录也可生成发送稿预览，声音自动对应A01',()=>{
 const text='第1段｜标题\n需要参考图：A01小李、A15杜不凡\n镜头：完整保留';
 const rows=['A01','A15'].map(code=>({code,file:img(code),versions:[img(code)],missing:false}));
 const engine=createImportEngine({getSegment:()=>({text}),resolveRows:()=>rows,getTailForSegment:()=>({state:'none'}),getVoiceForImages:items=>({items:[{code:'A01',label:'少年音色',path:path.join(root,'小李.wav'),filename:'小李.wav',imageIndex:1}],blocked:false})});
 const result=engine.getDraft({episodeId:'e',segmentId:'s'});
 assert.equal(result.items[0].label,'小李');assert.equal(result.items[1].label,'杜不凡');
 assert.match(result.previewText,/图1 = A01 小李/);
 assert.match(result.previewText,/音频1 = A01 小李/);
 assert.equal(result.blocked,false);
});
test('升级持久化：已完成状态和剧集折叠设置不丢，原hidden/locked兼容',()=>{
 const old={...fresh(),episodes:[{id:'e1',number:1,title:'第1集',hidden:false,locked:true,segments:[{id:'s1',n:1,title:'开场',text:'需要参考图：A01小李',codes:['A01'],status:'done',hidden:true,locked:false}]}],activeEpisodeId:'e1',activeSegmentId:'s1',treeExpandedEpisodeId:'e1',layout:{bottomHeight:300,bottomCollapsed:false,rightWidth:440,foldActiveEpisode:true}};
 const restored=scrub(old);
 assert.equal(restored.layout.foldActiveEpisode,true);
 assert.equal(restored.episodes[0].locked,true);
 assert.equal(restored.episodes[0].segments[0].status,'done');
 assert.equal(restored.episodes[0].segments[0].hidden,true);
 assert.equal(restored.episodes[0].segments[0].text,old.episodes[0].segments[0].text);
});
test('UI：剧集树行与已完成小卡存在；旧锁定隐藏位于高级管理',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert.match(html,/id="draftPreviewText"/);assert.match(html,/id="episodeTreeList"/);
 assert.match(html,/<details class="advancedLegacy">/);assert.match(renderer,/doneCompact/);
 assert.match(renderer,/importSyncText/);assert.match(renderer,/wsSetStatus\(eid,sid,next/);
});
