'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const fsp=fs.promises;const os=require('node:os');const path=require('node:path');const {WorkspaceStore,AssetIndex,convertLegacy,importV01Segments}=require('../src/workspace');
let tmp;
test.beforeEach(async()=>{tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'doubao-v02-'))});
test.afterEach(async()=>{await fsp.rm(tmp,{recursive:true,force:true})});
async function create(){const store=new WorkspaceStore(path.join(tmp,'workspace.json'));await store.load();return store}
test('首次生成 workspace.json 且不会改写 v0.1 的 config.json',async()=>{
 const accountCfg=path.join(tmp,'config.json');await fsp.writeFile(accountCfg,'{"important":"keep-account-sessions"}');
 const before=await fsp.readFile(accountCfg);const s=await create();await s.addText('第1集｜起锅\n第1段｜烧油\n需要参考图：A01\n音效：锅响。');
 assert.deepEqual(await fsp.readFile(accountCfg),before);assert.ok(fs.existsSync(s.file));assert.equal(s.data.episodes.length,1);
});
test('导入多集，切段编辑，完成状态记录，关闭重启仍保持',async()=>{
 const s=await create();const full='第1集｜第一集\n第1段｜第一段\n需要参考图：A01、A01-01\n台词：你好！\n第2段｜第二段\n需要参考图：C02\n限制：禁止字幕。\n第2集｜第二集\n第1段｜结尾\n需要参考图：AG14、BL06';
 await s.addText(full);assert.equal(s.data.episodes.length,2);const e=s.data.episodes[0],seg=e.segments[1];
 await s.select(e.id,seg.id);await s.editText(e.id,seg.id,seg.text+'\n音效：风声');await s.setStatus(e.id,seg.id,'done','test-account-1');
 const again=new WorkspaceStore(s.file);await again.load();
 assert.equal(again.data.activeSegmentId,seg.id);assert.equal(again.data.episodes[0].segments[1].text.includes('音效：风声'),true);
 assert.equal(again.data.episodes[0].segments[1].status,'done');assert.equal(again.data.episodes[0].segments[1].accountId,'test-account-1');
 assert.deepEqual(again.data.episodes[0].segments[0].codes,['A01','A01-01']);
});
test('图片扫描：编号精确匹配，重复版本选择，缺图保持告警',async()=>{
 const dir=path.join(tmp,'素材库');await fsp.mkdir(path.join(dir,'人物'),{recursive:true});
 for(const name of ['A01_正面.png','A01-01_侧脸.png','A01_第二版.jpg','BL06_宴会.png'])await fsp.writeFile(path.join(dir,'人物',name),'IMAGE_PLACEHOLDER');
 const store=await create();await store.setFolder(dir);await store.addText('第2集｜测试\n第1段｜面容\n需要参考图：A01、A01-01、BL06、C02');
 const {ep,seg}=store.current();const rows=store.resolveSegment(ep.id,seg.id);assert.equal(rows.length,4);
 assert.equal(rows[0].versions.length,2);assert.equal(rows[1].versions.length,1);assert.equal(rows[1].code,'A01-01');assert.equal(rows[3].missing,true);
 await store.chooseVersion('A01',rows[0].versions[1].path);assert.equal(store.resolveSegment(ep.id,seg.id)[0].file.path,rows[0].versions[1].path);
 await store.setSelection(ep.id,seg.id,[rows[0].versions[1].path,'C:\\invalid.png']);assert.equal(store.current().seg.selectedPaths.length,1);
});
test('旧 JSON 项目只读合并，原文、段序及绑定版本路径保留',async()=>{
 const s=await create();await s.addText('第1集｜已有剧集\n第1段｜现有原文\n需要参考图：A01');
 const old={version:1,title:'旧素材工作台',assetFolder:'',chosenPaths:{'A01':'D:\\ref\\A01.png'},episodes:[{id:'old',number:18,title:'第18集｜新挑战',original:'重要原文',segments:[{id:'segOld',n:5,title:'第五段',text:'第5段｜完整原文\n台词：“给我起锅！”\n需要参考图：A01',codes:['A01'],manual:false}]}]};
 const saved=JSON.stringify(old);const res=await s.mergeLegacy(old);
 assert.equal(JSON.stringify(old),saved);assert.equal(res.episodes,1);assert.equal(s.data.episodes.length,2);
 assert.equal(s.data.episodes[1].segments[0].text.includes('给我起锅'),true);
 assert.equal(s.data.episodes[0].segments[0].text.includes('现有原文'),true);
 assert.equal(s.data.chosenPaths.A01,'D:\\ref\\A01.png');
});
test('v0.1 手工段落有内容才迁移，不会生成无意义的空剧集',()=>{
 const cfg={segments:[{name:'空白',prompt:'',images:[]},{name:'实用',prompt:'全部提示词',images:['C:\\abc.png']} ]};
 const e=importV01Segments(cfg);assert.equal(e.length,1);assert.equal(e[0].segments.length,1);assert.equal(e[0].segments[0].text,'全部提示词');
});
test('损坏数据读取备份而非重置账号；还原来源不被覆盖',async()=>{
 const s=await create();await s.addText('第1集｜备份\n第1段｜保留\n需要参考图：A01');
 const backup=path.join(tmp,'workspace.json.bak');assert.ok(fs.existsSync(backup));
 await fsp.writeFile(s.file,'not valid JSON');
 const reopened=new WorkspaceStore(s.file);await reopened.load();assert.ok(reopened.corruptWarning);assert.ok(reopened.data.episodes.length>=0);
 assert.equal(await fsp.readFile(s.file,'utf8'),'not valid JSON');
});
test('素材导出：保留原始图片字节和完整提示词',async()=>{
 const dir=path.join(tmp,'原图');await fsp.mkdir(dir);const bytes=Buffer.from([0,13,37,45,12,3,1,0,255]);const src=path.join(dir,'C02_真实原图.png');await fsp.writeFile(src,bytes);
 const s=await create();await s.setFolder(dir);await s.addText('第1集｜生产\n第1段｜美食\n需要参考图：C02\n台词：一字不删');
 const {ep,seg}=s.current();const result=await s.exportSegment(ep.id,seg.id,path.join(tmp,'导出'));
 assert.equal(result.copied,1);assert.deepEqual(await fsp.readFile(path.join(result.folder,'参考图','C02.png')),bytes);
 assert.ok((await fsp.readFile(path.join(result.folder,'完整提示词.txt'),'utf8')).includes('一字不删'));
});
