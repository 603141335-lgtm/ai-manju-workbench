'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {extractReferenceLabels}=require('../src/reference-labels');
const {createImportEngine}=require('../src/import-engine');
const {composeText}=require('../src/import-core');
const {fresh,scrub}=require('../src/workspace');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v093-'));
const img=code=>{const file=path.join(root,code+'.png');fs.writeFileSync(file,'fake-image');return {path:file,name:code+'.png'}};
test('人物编号A01小李与A01-01小李严格分离',()=>{
 const x=extractReferenceLabels('第2段｜标题\n需要参考图：A01小李、A01-01小李、A15 杜不凡、B02（图四）\n连续性参考：A01继续说话');
 assert.deepEqual(x.labels,{A01:'小李','A01-01':'小李',A15:'杜不凡'});
 assert.equal(x.conflicts.length,0);
});
test('图一不是人物名，栏目外不会绑定名字',()=>{
 const x=extractReferenceLabels('需要参考图：A02（图一）、A07（图二）\n场景与站位：A02陈老师\n台词：A07大爷发声');
 assert.deepEqual(x.labels,{});
});
test('同一编号两个人名冲突阻止自动引用',()=>{
 const x=extractReferenceLabels('需要参考图：A01小李、A01老张\n连续性参考：不变');
 assert.deepEqual(x.labels,{});assert.equal(x.conflicts.length,1);
});
test('图片+音频对应行在顶部，原台词不缩减',()=>{
 const original='第2段｜开场｜15秒\n需要参考图：A01小李、A15杜不凡\n连续性参考：上一段结束\n0—3秒｜小李说：“起锅烧油！”\n限制：禁止背景音乐和字幕';
 const items=[{code:'A01',label:'小李',file:img('A01')},{code:'A15',label:'杜不凡',file:img('A15')}];
 const voices=[{code:'A01',label:'少年男声',characterName:'小李',filename:'小李.wav',imageIndex:1}];
 const out=composeText(original,items,0,voices);
 assert.match(out,/图1 = A01 小李（A01\.png）/);assert.match(out,/图2 = A15 杜不凡（A15\.png）/);
 assert.match(out,/音频1 = A01 小李（少年男声：小李\.wav）/);
 assert(out.indexOf('音频1 = A01')<out.indexOf('连续性参考'));
 assert(out.endsWith('限制：禁止背景音乐和字幕'));
});
test('离线无豆包账号仍可生成完整发送稿预览',()=>{
 const text='第1段｜标题\n需要参考图：A01小李、A15杜不凡\n镜头：完整保留';
 const rows=['A01','A15'].map(code=>({code,file:img(code),versions:[img(code)],missing:false}));
 const eng=createImportEngine({getSegment:()=>({text}),resolveRows:()=>rows,getTailForSegment:()=>({state:'none'}),getVoiceForImages:()=>({items:[{code:'A01',label:'少年音色',path:path.join(root,'小李.wav'),filename:'小李.wav',imageIndex:1}],blocked:false})});
 const res=eng.getDraft({episodeId:'e',segmentId:'s'});
 assert.equal(res.items[0].label,'小李');assert.equal(res.items[1].label,'杜不凡');
 assert.match(res.previewText,/音频1 = A01 小李/);assert(!res.blocked);
});
test('旧版完成/隐藏/锁定与新版折叠设置兼容',()=>{
 const data={...fresh(),episodes:[{id:'e',number:1,title:'第1集',hidden:false,locked:true,segments:[{id:'s',n:1,title:'开场',text:'需要参考图：A01小李',codes:['A01'],status:'done',hidden:true,locked:false}]}],activeEpisodeId:'e',activeSegmentId:'s',treeExpandedEpisodeId:'e',layout:{bottomHeight:300,bottomCollapsed:false,rightWidth:440,foldActiveEpisode:true}};
 const x=scrub(data);
 assert(x.layout.foldActiveEpisode);assert(x.episodes[0].locked);assert(x.episodes[0].segments[0].hidden);
 assert.equal(x.episodes[0].segments[0].status,'done');assert.equal(x.episodes[0].segments[0].text,data.episodes[0].segments[0].text);
});
test('完整发送稿、单独同步、整行已完成UI存在',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 assert(html.includes('id="draftPreviewText"')&&html.includes('class="advancedLegacy"'));
 assert(renderer.includes('doneCompact')&&renderer.includes('importSyncText'));
});
