'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../src/import-core');
const {createImportEngine,createPlan}=require('../src/import-engine');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v099-ref-'));
const file=code=>{const name=code+'.png',p=path.join(dir,name);fs.writeFileSync(p,'mock');return {name,path:p};};
const row=code=>({code,file:file(code),versions:[file(code)],missing:false});
test('v0.9.9: original author order controls both upload and references',()=>{
 const codes=['C05','B13','A02','AG01','BL03','A01-01','E02'];
 const original='第2段｜测试｜15秒\n需要参考图：'+codes.join('、')+'\n分镜：完整保留\n';
 const p=createPlan({prompt:original,rows:codes.map(row),tail:{state:'none'}});
 assert.deepEqual(p.items.map(x=>x.code),codes);
 const tail=createPlan({prompt:original,rows:codes.map(row),tail:{state:'ready',file:file('tail')}});
 assert.deepEqual(tail.items.map(x=>x.code),['尾帧',...codes]);
 assert.equal(p.blocked,false);
});
test('v0.9.9: no synthetic image lines, original prompt byte-for-byte intact',()=>{
 const original='第1段｜开场｜15秒\n需要参考图：\nA15-01 杜不凡·荧光粉兔耳营业装\nA33 钱少东·聚福轩少东\nAG18 街口麻婆豆腐斗菜双灶站位\nB15 老街十字路口厨艺对决布置\nC42 两版麻婆豆腐食材与成品\n连续性参考：上一镜头\n限制：原样保留！\n';
 const codes=['A15-01','A33','AG18','B15','C42'];
 const plan=core.referenceSlots(original);
 assert.deepEqual(plan.slots.map(x=>x.code),codes);
 assert.deepEqual(plan.slots.map(x=>x.anchor),[
 'A15-01 杜不凡·荧光粉兔耳营业装','A33 钱少东·聚福轩少东',
 'AG18 街口麻婆豆腐斗菜双灶站位','B15 老街十字路口厨艺对决布置','C42 两版麻婆豆腐食材与成品']);
 assert.deepEqual(plan.ambiguous,[]);
 assert.equal(core.composeText(original,codes.map(row)),'【蓝色参考图引用区】\n'+codes.join('\n')+'\n\n【原始提示词】\n'+original);
 assert(!core.composeText(original,codes.map(row)).includes('图1锁定人物'));
});
test('v0.9.9: exact original line anchors reach the real import plan',()=>{
 const text='第1段｜测试｜15秒\n需要参考图：\nC05 食材和成品\nB12 主会场\nA01小李 青年\nA02安安 小女孩\n分镜：保持原样';
 const codes=['C05','B12','A01','A02'];
 const engine=createImportEngine({getSegment:()=>({text}),resolveRows:()=>codes.map(row),getTailForSegment:()=>({state:'none'}),getVoiceForImages:items=>({items:[{code:'A01',label:'小李',filename:'A01.wav',imageIndex:items.findIndex(x=>x.code==='A01')+1}],blocked:false,errors:[]})});
 const plan=engine.getDraft({episodeId:'e',segmentId:'s'});
 assert.deepEqual(plan.items.map(x=>x.code),codes);
 assert.deepEqual(plan.items.map(x=>x.refAnchor),['C05 食材和成品','B12 主会场','A01小李 青年','A02安安 小女孩']);
 assert.equal(plan.voicePlan.items[0].imageIndex,3);
 assert(plan.previewText.includes('【蓝色参考图引用区】'));assert(plan.previewText.includes('【原始提示词】\n'+text));
 assert(plan.previewText.includes('音频1 = A01'));
 assert.equal(plan.blocked,false);
});
test('v0.9.9: stable installed public profile and import IPC are retained',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.build.appId,'com.manju.doubao.creativehub.public');
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 assert(html.includes('id="btnOneClickImport"'));
 assert(preload.includes('importExecute'));
 assert(main.includes("'import:execute'"));
});
