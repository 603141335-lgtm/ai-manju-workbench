'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../src/import-core');
const parser=require('../src/parser');
const {createPlan}=require('../src/import-engine');
const {NoticeService}=require('../src/notice-service');
const root=path.resolve(__dirname,'..');
test('brand: Windows ICO and 256px PNG are generated from one original SVG',()=>{
 const ico=fs.readFileSync(path.join(root,'assets/app.ico'));
 const png=fs.readFileSync(path.join(root,'assets/branding/dudu-icon-256.png'));
 assert.equal(ico.readUInt16LE(0),0);
 assert.equal(ico.readUInt16LE(2),1);
 assert(ico.readUInt16LE(4)>=5);
 assert.equal(png.subarray(1,4).toString('ascii'),'PNG');
 assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
 const svg=fs.readFileSync(path.join(root,'assets/branding/dudu-icon.svg'),'utf8');
 assert(svg.includes('viewBox="0 0 1024 1024"'));
});
test('brand: visible UI renamed, installed identity and existing userData path unchanged',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'1.1.0');
 assert.equal(pkg.build.productName,'独独AI工作台');
 assert.equal(pkg.build.appId,'com.manju.doubao.creativehub.public');
 const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
 assert(main.includes("DoubaoCreativeHubPublic"));
 assert(main.includes('persist:doubao_'));
 assert(html.includes('独独AI工作台'));
 assert(html.includes('../assets/branding/dudu-icon.svg'));
 assert(!html.includes('豆包创作舱'));
});
test('runtime: all reference IDs and source descriptions survive both parsers',()=>{
 const text='第1段｜测试｜15秒\n需要参考图：\nA15-01 杜不凡粉兔\nA15 杜不凡普通装\nAG18 双灶\nB15 场景\nC42 菜品\n连续性参考：A15-01 保持';
 const parsed=core.parseCodes(text);
 assert.deepEqual(parsed.codes,['A15-01','A15','AG18','B15','C42']);
 assert.deepEqual(core.referenceSlots(text).slots.map(x=>x.code),parsed.codes);
 assert.equal(core.composeText(text,[]),text);
 const legacy=parser.detectSegmentCodes(text);
 assert(legacy.codes.includes('A15-01'));
});
test('runtime: real reference import files and local cloud announcement still work',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-test-'));
 const rows=['C42','A15-01'].map(code=>{
   const p=path.join(directory,code+'.png');fs.writeFileSync(p,'image');
   return {code,file:{path:p,name:code+'.png'},versions:[{path:p}],missing:false};
 });
 const plan=createPlan({prompt:'需要参考图：C42 食材、A15-01 杜不凡',rows});
 assert.deepEqual(plan.items.map(x=>x.code),['C42','A15-01']);
 assert(!plan.blocked);
 const notices=new NoticeService({version:'1.1.0'});
 assert.equal(notices.snapshot().community.wechat,'du4du44');
 assert.equal(notices.snapshot().currentVersion,'1.1.0');
});
