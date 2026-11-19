'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createPlan,createImportEngine}=require('../src/import-engine');
const core=require('../src/import-core');
const root=path.resolve(__dirname,'../src');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-import-test-'));
const fixtures=['A01','A01-01','A15','A32','AG14','B13','C36','E11'].map(code=>{
 const file=path.join(dir,code+'.png');fs.writeFileSync(file,Buffer.from('000000000000pngmock'));
 return {code,file:{name:code+'.png',path:file},versions:[{name:code+'.png',path:file}],missing:false};
});
test('源自独立插件的编号识别：只读取参考图栏目，A01/A01-01不串号',()=>{
 const txt='第1段\n需要参考图：A01、A01-01、AG14\n场景与站位：C36是台词中的编号不应加入\n';
 const p=createPlan({prompt:txt,rows:fixtures});
 assert.deepEqual(p.codes,['A01','A01-01','AG14']);assert.equal(p.blocked,false);
 assert.equal(p.items[1].file.name,'A01-01.png');
});
test('中英文标点紧邻编号仍能识别，字母数字相邻内容不会误匹配',()=>{
 const parsed=core.parseCodes('需要参考图：A02，A03。B12（C05）、E11；AG14:BL02\n场景与站位：A99 不应混入参考图栏目');
 assert.deepEqual(parsed.codes,['A02','A03','B12','C05','E11','AG14','BL02']);
 assert.equal(core.codeFromFile({name:'I02.png'}),'A02');
 const invalid=core.tokens('XA02 A02abc A0300');
 assert.deepEqual(invalid,[]);
});

test('重复版本、缺图、超过九张会阻止自动操作',()=>{
 const versions=[{...fixtures[2],versions:[fixtures[2].file,{name:'A15 other',path:'/tmp/A15-2.png'}]}];
 assert.equal(createPlan({prompt:'需要参考图：A15',rows:versions}).items[0].status,'conflict');
 assert.equal(createPlan({prompt:'需要参考图：A15',rows:versions,chosenPaths:{A15:fixtures[2].file.path}}).blocked,false);
 const p=createPlan({prompt:'需要参考图：A99',rows:fixtures});assert.equal(p.items[0].status,'missing');assert(p.blocked);
 const codes=Array.from({length:10},(_,i)=>'A'+String(i+1).padStart(2,'0'));
 assert.equal(createPlan({prompt:'需要参考图：'+codes.join('、'),rows:fixtures,limit:9}).overLimit,true);
});
test('图号映射严格按参考图顺序，完整保留原文（含末尾换行）',()=>{
 const original='需要参考图：A15、A32、AG14\n0—3秒｜对白完整\n';
 const s=core.composeText(original,fixtures.slice(2,5));
 assert.equal(s,'【蓝色参考图引用区】\nA15\nA32\nAG14\n\n【原始提示词】\n'+original,'蓝色原生@引用区置顶，原始提示词正文逐字保留');
});
test('网页已经有不同草稿时，未明确同意禁止覆写和上传',async()=>{
 let uploads=0;
 const wc={isDestroyed:()=>false,getURL:()=> 'https://www.doubao.com/chat/',executeJavaScript:async()=>({ready:true,prompt:'其他未保存草稿',names:[],thumbs:[],busy:false,mentions:[]})};
 const engine=createImportEngine({getActive:()=>({accountId:'acct1',webContents:wc}),getSegment:()=>({text:'需要参考图：A15'}),resolveRows:()=>fixtures});
 await assert.rejects(()=>engine.execute({episodeId:'e',segmentId:'s'}),/不同草稿/);assert.equal(uploads,0);
});
test('未找到正确素材时，一键导入不会触碰浏览器网页',async()=>{
 let calls=0;const wc={isDestroyed:()=>false,getURL:()=> 'https://www.doubao.com/chat/',executeJavaScript:async()=>{calls++;return {ready:true,prompt:'',names:[],thumbs:[],busy:false,mentions:[]}}};
 const engine=createImportEngine({getActive:()=>({accountId:'acct1',webContents:wc}),getSegment:()=>({text:'需要参考图：A99'}),resolveRows:()=>fixtures});
 await assert.rejects(()=>engine.execute({episodeId:'e',segmentId:'s'}),/缺图/);assert.equal(calls,1);
});
test('无网内载画布，公开版安装ID隔离且独立登录分区',()=>{
 const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.build.appId,'com.manju.doubao.creativehub.public');
 assert.match(read('src/main.js'),/persist:doubao_\$\{id\}/);
 assert.match(read('src/index.html'),/id="btnOneClickImport"/);
 assert.match(read('src/preload.js'),/importExecute/);
 assert.match(read('src/main.js'),/import:execute/);
 assert.equal(fs.existsSync(path.join(root,'canvas')),false);
});
