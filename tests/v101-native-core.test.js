'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const addonPath=path.join(root,'native','dudu_core.node');
test('v1.0.1 actual Rust N-API binary exists and exports stable APIs',()=>{
 assert(fs.existsSync(addonPath),'compiled native .node module not found');
 const native=require(addonPath);
 assert.equal(native.securityBuildInfo(),'dudu-native-core-1.0.1');
 for(const name of ['tokensJson','parseCodesJson','referenceSlotsJson','codeFromFile','normalizeCode'])
   assert.equal(typeof native[name],'function',name);
});
test('v1.0.1 reference logic runs through compiled Rust, not plaintext JS',()=>{
 const native=require(addonPath),api=require('../src/import-core');
 const source=fs.readFileSync(path.join(root,'src/import-core.js'),'utf8');
 if(source.includes('_0x')){
  assert(source.includes('_0x'),'native bridge not production-obfuscated');
 }else{
  assert(source.includes("require('../native/dudu_core.node')"));
  assert(!source.includes('const CODE = /'),'old regex should NOT ship in ASAR');
 }
 const prompt='第2段｜准确绑定\n需要参考图：\nA15-01 杜不凡粉兔营业装\nA15 杜不凡普通服装\nAG18 双灶站位\nB15 老街厨艺对决布置\nC42 食材成品\n连续性参考：上一镜\n台词：原样！';
 const parsed=api.parseCodes(prompt);
 assert.deepEqual(parsed.codes,['A15-01','A15','AG18','B15','C42']);
 const slots=api.referenceSlots(prompt);
 assert.deepEqual(slots.slots.map(x=>x.code),parsed.codes);
 assert.deepEqual(slots.slots.map(x=>x.anchor),['A15-01 杜不凡粉兔营业装','A15 杜不凡普通服装','AG18 双灶站位','B15 老街厨艺对决布置','C42 食材成品']);
 assert.deepEqual(slots.ambiguous,[]);
 assert.deepEqual(api.tokens('A15-01 A15,AG18'),['A15-01','A15','AG18']);
 assert.equal(api.codeFromFile({name:'A15-01杜不凡.png'}),'A15-01');
 assert.equal(api.codeFromFile({name:'A15-010非法.png'}),null);
 assert.equal(api.composeText(prompt,[]),prompt);
 assert(!api.composeText(prompt,[]).includes('图1锁定人物'));
});
test('v1.0.1 repeated references fail closed and no AI script fallback exists',()=>{
 const api=require('../src/import-core');
 const text='需要参考图：\nA15-01 第一套\nA15-01 第二套\n分镜：停止';
 assert.deepEqual(api.referenceSlots(text).ambiguous,['A15-01']);
 assert.equal(api.parseCodes(text).codes.length,1);
});
test('v1.0.1 data-directory action moved to advanced project management only',()=>{
 const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
 const nav=html.match(/<div class="topactions">([\s\S]*?)<\/div>/);
 assert(nav);
 assert(!nav[1].includes('btnData'),'top right must not show data directory');
 assert(html.includes('id="btnData"'));
 assert(html.includes('打开本地数据目录'));
 assert(html.includes('社群·公告'));
 const app=require('../package.json');
 assert.equal(app.version,'1.0.1');
 assert.equal(app.build.appId,'com.manju.doubao.creativehub.public');
 assert(app.build.asarUnpack.includes('native/*.node'));
 assert.equal(app.build.nsis.installerSidebar,'assets/installer/sidebar.bmp');
});
test('v1.0.1 NSIS side and header are exact 24-bit RGB bitmaps',()=>{
 for(const [name,w,h] of [['sidebar.bmp',164,314],['header.bmp',150,57]]){
  const data=fs.readFileSync(path.join(root,'assets','installer',name));
  assert.equal(data.toString('ascii',0,2),'BM');
  assert.equal(data.readUInt32LE(18),w);
  assert.equal(data.readUInt32LE(22),h);
  assert.equal(data.readUInt16LE(28),24);
 }
});
