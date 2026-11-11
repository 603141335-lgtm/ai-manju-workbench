'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../src/import-core');
const {createImportEngine,createPlan}=require('../src/import-engine');
const {extractReferenceLabels}=require('../src/reference-labels');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v098-'));
function row(code,name=code+'.png'){
 const file=path.join(dir,name);fs.writeFileSync(file,'mock');
 return {code,file:{name,path:file},versions:[{name,path:file}],missing:false};
}
test('v0.9.8: stable tail/character/scene/food ordering, no silently dropped assets',()=>{
 const codes=['C05','B13','A02','AG01','BL03','A01-01','E02'];
 const rows=codes.map(c=>row(c));
 const original='第2段｜测试｜15秒\n需要参考图：'+codes.join('、')+'\n分镜：内容完整保留\n';
 const p=createPlan({prompt:original,rows,tail:{state:'none'}});
 assert.deepEqual(p.items.map(x=>x.code),['A02','AG01','A01-01','B13','BL03','C05','E02']);
 assert.equal(p.blocked,false);
 const tailFile=row('A99').file;
 const t=createPlan({prompt:original,rows,tail:{state:'ready',file:tailFile}});
 assert.equal(t.items[0].code,'尾帧');
 assert.deepEqual(t.items.slice(1).map(x=>x.code),p.items.map(x=>x.code));
});
test('v0.9.8: a unique concise line per image, native @ never forged as plaintext',()=>{
 const text='第1段｜新镜头｜15秒\n需要参考图：C05、B12、A01小李、A02安安\n连续性参考：上一镜\n台词：原样保留！\n';
 const labels=extractReferenceLabels(text).labels;
 const items=core.sortReferenceItems([
   {...row('C05'),label:''},{...row('B12'),label:''},
   {...row('A01','A01小李.png'),label:labels.A01},
   {...row('A02','A02安安.png'),label:labels.A02}
 ]);
 const result=core.composeText(text,items);
 const lines=result.split('\n');
 assert.deepEqual(lines.slice(0,4),[
   '图1锁定人物小李：','图2锁定人物安安：','图3场景参考：','图4食材参考：'
 ]);
 assert.equal(result.slice(lines.slice(0,4).join('\n').length+1),text);
 assert(!result.includes('@A01小李.png'),'fake blue tags must not be added as text');
 assert(!result.includes('图片顺序对应'),'previous verbose mapping is removed');
 assert.equal(new Set(lines.slice(0,4)).size,4);
 for(const [index,item] of items.entries()){
   const anchor=core.makeMapping([item],index);
   assert.equal(anchor,lines[index]);
   assert.equal(result.split(anchor).length,2);
 }
});
test('v0.9.8: real import plan uses same order as upload and character/voice mapping',()=>{
 const text='第1段｜测试｜15秒\n需要参考图：C05、B12、A01小李、A02安安\n限制：不修改！';
 const rows=['C05','B12','A01','A02'].map(code=>row(code,code==='A01'?'A01小李.png':code==='A02'?'A02安安.png':code+'.png'));
 const engine=createImportEngine({getSegment:()=>({text}),resolveRows:()=>rows,getTailForSegment:()=>({state:'none'}),getVoiceForImages:(items)=>({
  items:[{code:'A01',label:'小李声线',filename:'A01.wav',imageIndex:items.findIndex(x=>x.code==='A01')+1}],blocked:false,errors:[]})});
 const plan=engine.getDraft({episodeId:'ep',segmentId:'seg'});
 assert.deepEqual(plan.items.map(x=>x.code),['A01','A02','B12','C05']);
 assert.equal(plan.voicePlan.items[0].imageIndex,1);
 assert(plan.previewText.startsWith('图1锁定人物小李：\n图2锁定人物安安：\n图3场景参考：\n图4食材参考：\n'));
 assert(plan.previewText.endsWith(text));
 assert.equal(plan.blocked,false);
});
test('v0.9.8: no changes to installed public profile identity or import click handlers',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.build.appId,'com.manju.doubao.creativehub.public');
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 assert(html.includes('id="btnOneClickImport"'));
 assert(preload.includes('importExecute'));
 // Renderer code is obfuscated in packaged builds, so its identifier names are not stable.
 assert(main.includes("'import:execute'"));
});
