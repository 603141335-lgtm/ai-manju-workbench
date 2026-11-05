'use strict';
const {app,BrowserWindow,ipcMain,dialog,clipboard,nativeImage,protocol,shell,net} = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {pathToFileURL} = require('url');
const {parseMultiEpisode,parseFilenameCode,safeName,detectSegmentCodes,extractCodes} = require('./parser');

protocol.registerSchemesAsPrivileged([{scheme:'manju-img',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const imageExtensions = new Set(['.png','.jpg','.jpeg','.webp','.bmp','.gif','.avif','.tif','.tiff']);
let win, project, assets = new Map(), byCode = new Map(), scanStats={}, saveQueue=Promise.resolve();
const blank = () => ({version:2,title:'我的AI漫剧项目',assetFolder:'',groups:[],episodes:[],chosenPaths:{}});
const storeFile = () => path.join(app.getPath('userData'),'workbench.json');
function sanitizeProject(input){
 if(!input || typeof input!=='object')return blank();
 const p=blank();
 p.title=String(input.title||p.title).slice(0,200);
 p.assetFolder=String(input.assetFolder||'');
 p.groups=Array.isArray(input.groups)?input.groups.slice(0,250).map(g=>({
  id:String(g.id||'').slice(0,100),title:String(g.title||'未命名标题').slice(0,180),
  parentId:g.parentId?String(g.parentId).slice(0,100):null
 })).filter(g=>g.id):[];
 // Damaged/legacy tree relations become root groups; document contents remain untouched.
 const groupIds=new Set(p.groups.map(g=>g.id));
 for(const g of p.groups)if(g.parentId===g.id||!groupIds.has(g.parentId))g.parentId=null;
 p.episodes=Array.isArray(input.episodes)?input.episodes.slice(0,500).map(e=>({
  id:String(e.id||'').slice(0,100),
  groupId:groupIds.has(e.groupId)?String(e.groupId):null,
  number:Number.isSafeInteger(e.number)?e.number:null,
  title:String(e.title||'未命名剧集').slice(0,500),original:String(e.original||''),preamble:String(e.preamble||''),
  segments:Array.isArray(e.segments)?e.segments.slice(0,800).map(s=>({
   id:String(s.id||'').slice(0,100),n:Number(s.n)||1,title:String(s.title||''),text:String(s.text||''),
   codes:Array.isArray(s.codes)?s.codes.map(c=>String(c)).slice(0,60):[],method:String(s.method||'栏目识别'),manual:!!s.manual
  })):[]
 })):[];
 p.chosenPaths=input.chosenPaths&&typeof input.chosenPaths==='object'&&!Array.isArray(input.chosenPaths)?input.chosenPaths:{};
 return p;
}
async function save(){
 const snapshot=JSON.stringify(project,null,2); const filename=storeFile();
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  await fsp.mkdir(path.dirname(filename),{recursive:true});
  const tmp=filename+'.tmp';await fsp.writeFile(tmp,snapshot,'utf8');
  try{await fsp.rename(tmp,filename);}catch(e){await fsp.copyFile(tmp,filename);await fsp.unlink(tmp).catch(()=>{});}
 });return saveQueue;
}
async function getState(){return {project,scanStats,assetList:[...byCode.entries()].map(([code,arr])=>({code,items:arr.map(a=>({id:a.id,name:a.name,relative:a.relative,size:a.size,path:a.path,thumb:`manju-img://asset/${a.id}`}))}))};}
async function scanFolder(folder){
 assets=new Map();byCode=new Map(); let count=0,images=0,miss=[],tooMany=false,errors=[]; const maxFiles=50000;let idx=0;
 async function walk(dir, rel='',depth=0){
  if(depth>20||tooMany)return;
  let entries;try{entries=await fsp.readdir(dir,{withFileTypes:true});}catch(err){errors.push(`${dir}: ${err.message}`);return;}
  entries.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  for(const entry of entries){
   if(++count>maxFiles){tooMany=true;break;}
   if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
   const full=path.join(dir,entry.name), child=path.join(rel,entry.name);
   if(entry.isDirectory()){await walk(full,child,depth+1);continue;}
   if(!entry.isFile()||!imageExtensions.has(path.extname(entry.name).toLowerCase()))continue;
   images++;
   const code=parseFilenameCode(entry.name,rel.split(/[\\/]/).filter(Boolean));
   if(!code){if(miss.length<300)miss.push(child);continue;}
   let size=0;try{size=(await fsp.stat(full)).size;}catch{continue;}
   const a={id:'a'+(++idx),code,path:full,name:entry.name,relative:child,size};
   assets.set(a.id,a);if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(a);
  }
 }
 if(folder&&fs.existsSync(folder))await walk(folder);
 scanStats={total:count,images,recognized:[...assets.values()].length,unique:byCode.size,duplicates:[...assets.values()].length-byCode.size,unrecognized:images-assets.size,unrecognizedFiles:miss,overflow:tooMany,errors};
 return scanStats;
}
function chosen(code){const list=byCode.get(code)||[];return list.find(a=>a.path===project.chosenPaths[code])||list[0]||null;}
function currentPaths(codes){return Array.from(new Set(codes.map(c=>chosen(c)?.path).filter(Boolean)));}
function getEpisode(id){return project.episodes.find(e=>e.id===id);}
function getGroup(id){return project.groups.find(g=>g.id===id);}
function makeId(){return 'doc_'+Date.now().toString(36)+'_'+require('crypto').randomBytes(5).toString('hex');}
function cleanGroupId(id){return id&&getGroup(id)?id:null;}
function getSegment(episode,segId){return episode?.segments.find(s=>s.id===segId);}
function findAssetById(id){return assets.get(id);}
function findDragPaths(msg){
 const ep=getEpisode(msg.episodeId),seg=getSegment(ep,msg.segmentId);
 if(!seg)throw new Error('找不到片段');
 const allowed=new Map(seg.codes.map(c=>[c,byCode.get(c)||[]]));
 let items=[];
 if(msg.mode==='group'){items=seg.codes.map(c=>chosen(c)).filter(Boolean);}
 else if(msg.mode==='selected'){
  const selections=Array.isArray(msg.imageIds)?msg.imageIds.slice(0,60):[];
  items=selections.map(findAssetById).filter(a=>a&&allowed.get(a.code)?.some(b=>b.path===a.path));
 }else if(msg.mode==='single'){
  const asset=findAssetById(String(msg.imageId||''));
  if(asset&&allowed.get(asset.code)?.some(a=>a.path===asset.path))items=[asset];
 }
 const unique=[...new Set(items.map(a=>a.path))];
 if(!unique.length)throw new Error('没有匹配的本地图片，请重新选择参考图文件夹');
 if(unique.length>40)throw new Error('单次最多拖拽40张，请分批');
 for(const f of unique){if(!fs.existsSync(f))throw new Error('图片已移动或不存在：'+f);}
 return unique;
}
const iconPath=path.join(__dirname,'drag.png');
function attachIpc(){
 ipcMain.handle('workspace:state',getState);
 ipcMain.handle('workspace:choose-folder',async()=>{
  const result=await dialog.showOpenDialog(win,{title:'选择全部参考图的总文件夹',properties:['openDirectory']});
  if(result.canceled||!result.filePaths.length)return null;
  project.assetFolder=result.filePaths[0];await save();await scanFolder(project.assetFolder);return getState();
 });
 ipcMain.handle('workspace:rescan',async()=>{await scanFolder(project.assetFolder);return getState();});
 ipcMain.handle('workspace:import-text',async(_event,input)=>{
  const source=typeof input==='object'&&input!==null?String(input.text||''):String(input||'');
  const groupId=cleanGroupId(input&&typeof input==='object'?input.groupId:null);
  if(source.length>20_000_000)throw Error('一次导入文本超过 20MB，请分批');
  const ep=parseMultiEpisode(source);if(!ep.length)throw Error('没有识别到有效提示词');
  for(const item of ep)item.groupId=groupId;
  project.episodes.push(...ep);await save();return {added:ep.length,segments:ep.reduce((n,e)=>n+e.segments.length,0),data:await getState()};
 });
 ipcMain.handle('workspace:import-files',async(_event,groupId)=>{
  const selected=await dialog.showOpenDialog(win,{title:'选择一个或多个 TXT / MD 提示词文件',properties:['openFile','multiSelections'],filters:[{name:'提示词文本',extensions:['txt','md','markdown']}]});
  if(selected.canceled)return null;let added=0;
  for(const file of selected.filePaths){const stat=await fsp.stat(file);if(stat.size>20_000_000)continue;let buf=await fsp.readFile(file);let s=buf.toString('utf8').replace(/^\uFEFF/,'');
   // GBK source: browsers often export UTF-8; users can paste instead for ANSI.
   const parsed=parseMultiEpisode(s,path.basename(file)); for(const ep of parsed)ep.groupId=cleanGroupId(groupId);project.episodes.push(...parsed);added+=parsed.length;
  }
  await save();return {added,data:await getState()};
 });
 ipcMain.handle('workspace:create-group',async(_event,{title,parentId}={})=>{
  const parent=parentId?getGroup(parentId):null;
  if(parentId&&!parent)throw Error('上级标题已不存在');
  if(parent?.parentId)throw Error('仅支持大标题与小标题两级');
  const clean=String(title||'').trim().slice(0,180);
  if(!clean)throw Error('请输入标题名称');
  const group={id:makeId(),title:clean,parentId:parent?.id||null};
  project.groups.push(group);await save();return {group,data:await getState()};
 });
 ipcMain.handle('workspace:rename-group',async(_event,{id,title})=>{
  const g=getGroup(id);if(!g)throw Error('标题不存在');
  const name=String(title||'').trim().slice(0,180);if(!name)throw Error('标题不可为空');
  g.title=name;await save();return getState();
 });
 ipcMain.handle('workspace:remove-group',async(_event,id)=>{
  const g=getGroup(id);if(!g)throw Error('标题不存在');
  // Non-destructive: keep documents and subheadings, reparent rather than delete.
  for(const ep of project.episodes)if(ep.groupId===id)ep.groupId=g.parentId||null;
  for(const child of project.groups)if(child.parentId===id)child.parentId=null;
  project.groups=project.groups.filter(item=>item.id!==id);
  await save();return getState();
 });
 ipcMain.handle('workspace:create-document',async(_event,{title,groupId}={})=>{
  const name=String(title||'').trim().slice(0,180);if(!name)throw Error('请输入文档名称');
  const seg={id:makeId(),n:1,title:'第1段',text:'',codes:[],method:'未找到编号',manual:false};
  const ep={id:makeId(),groupId:cleanGroupId(groupId),number:null,title:name,original:'',
    preamble:'',segments:[seg]};
  project.episodes.push(ep);await save();return {episode:ep,data:await getState()};
 });
 ipcMain.handle('workspace:rename-document',async(_event,{id,title})=>{
  const ep=getEpisode(id);if(!ep)throw Error('文档不存在');
  const name=String(title||'').trim().slice(0,180);if(!name)throw Error('文档名不可为空');
  ep.title=name;await save();return getState();
 });
 ipcMain.handle('workspace:move-document',async(_event,{id,groupId})=>{
  const ep=getEpisode(id);if(!ep)throw Error('文档不存在');
  ep.groupId=cleanGroupId(groupId);await save();return getState();
 });
 ipcMain.handle('workspace:remove-episode',async(_event,id)=>{project.episodes=project.episodes.filter(e=>e.id!==id);await save();return getState();});
 ipcMain.handle('workspace:rename',async(_event,title)=>{project.title=String(title||'我的AI漫剧项目').slice(0,120);await save();return getState();});
 ipcMain.handle('workspace:edit-segment',async(_event,{episodeId,segmentId,text,codes,manual})=>{
  const ep=getEpisode(episodeId),seg=getSegment(ep,segmentId);if(!seg)throw Error('片段不存在');
  if(typeof text==='string'){if(text.length>250000)throw Error('单段提示词过长');seg.text=text; if(ep.segments.length===1)ep.original=text; if(!manual){const det=detectSegmentCodes(text);seg.codes=det.codes;seg.method=det.method;seg.manual=false;}}
  if(manual){seg.codes=extractCodes(String(codes||''));seg.method='手动校正';seg.manual=true;}
  await save();return getState();
 });
 ipcMain.handle('workspace:choose-version',async(_event,{code,assetId})=>{
  const a=findAssetById(assetId);if(!a||a.code!==code)throw Error('图片版本不匹配');
  project.chosenPaths[code]=a.path;await save();return getState();
 });
 ipcMain.handle('workspace:copy',async(_event,text)=>{clipboard.writeText(String(text||''));return true;});
 ipcMain.handle('workspace:backup',async()=>{
  const d=await dialog.showSaveDialog(win,{title:'保存项目备份（不包含图片本体）',defaultPath:safeName(project.title)+'_项目备份.json',filters:[{name:'JSON 项目备份',extensions:['json']}]});
  if(d.canceled||!d.filePath)return null;await fsp.writeFile(d.filePath,JSON.stringify(project,null,2),'utf8');return d.filePath;
 });
 ipcMain.handle('workspace:restore',async()=>{
  const d=await dialog.showOpenDialog(win,{title:'恢复项目备份（会覆盖当前项目）',properties:['openFile'],filters:[{name:'JSON 项目备份',extensions:['json']}]});
  if(d.canceled||!d.filePaths.length)return null;
  const stat=await fsp.stat(d.filePaths[0]);if(stat.size>50_000_000)throw Error('项目备份超过50MB');
  project=sanitizeProject(JSON.parse(await fsp.readFile(d.filePaths[0],'utf8')));
  await save();await scanFolder(project.assetFolder);return getState();
 });
 ipcMain.handle('workspace:export-episode',async(_event,episodeId)=>{
  const ep=getEpisode(episodeId);if(!ep)throw Error('找不到剧集');
  const d=await dialog.showOpenDialog(win,{title:'选择输出目录（保存本集提示词及参考图）',properties:['openDirectory','createDirectory']});
  if(d.canceled||!d.filePaths.length)return null;
  let dst=path.join(d.filePaths[0],safeName(ep.title,70));let index=1;
  while(fs.existsSync(dst)){dst=path.join(d.filePaths[0],safeName(ep.title,65)+'_'+String(++index).padStart(2,'0'));}
  await fsp.mkdir(dst,{recursive:true});await fsp.writeFile(path.join(dst,'00_整集原文.txt'),ep.original,'utf8');
  let images=0,errors=[],miss=[];
  for(let i=0;i<ep.segments.length;i++){
   const s=ep.segments[i],dname=safeName(`${String(i+1).padStart(2,'0')}_第${String(s.n).padStart(2,'0')}段_${s.title}`,95),segmentDir=path.join(dst,dname);
   await fsp.mkdir(segmentDir,{recursive:true});await fsp.writeFile(path.join(segmentDir,'提示词.txt'),s.text,'utf8');
   const dir=path.join(segmentDir,'参考图');await fsp.mkdir(dir,{recursive:true});
   for(const code of s.codes){
    const a=chosen(code);if(!a){miss.push(`第${s.n}段 ${code}`);continue;}
    try{const out=path.join(dir,code+path.extname(a.name).toLowerCase());await fsp.copyFile(a.path,out);const st=await fsp.stat(out);if(st.size!==a.size)throw Error('复制后大小不一致');images++;}
    catch(e){errors.push(`${s.title} ${code}: ${e.message}`);}
   }
  }
  const report=`复制图片 ${images} 张\n缺失编号 ${miss.length} 处\n失败 ${errors.length} 处\n\n${miss.join('\n')}\n${errors.join('\n')}`;
  await fsp.writeFile(path.join(dst,'00_导出核验报告.txt'),report,'utf8');
  shell.openPath(dst);return {path:dst,images,missing:miss.length,errors};
 });
 ipcMain.handle('workspace:drag-tester',async()=>{
  const child=new BrowserWindow({width:650,height:460,title:'参考图原生拖拽验证',parent:win,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await child.loadFile(path.join(__dirname,'drag-test.html'));return true;
 });
 // Drag must be started during a real dragstart event, via synchronous renderer IPC send.
 ipcMain.on('workspace:native-drag-start',(event,payload)=>{
  try{const files=findDragPaths(payload);const icon=nativeImage.createFromPath(iconPath);
   event.sender.startDrag({files,file:files[0],icon});
  }catch(e){event.sender.send('workspace:drag-error',e.message);}
 });
}
async function boot(){
 project=blank();
 try{
  const raw=await fsp.readFile(storeFile(),'utf8'),saved=JSON.parse(raw);
  // Create a one-time backup before introducing new document title groups.
  if((Number(saved.version)||1)<2){
   const backup=storeFile()+'.before-document-upgrade.json';
   if(!fs.existsSync(backup))await fsp.copyFile(storeFile(),backup);
  }
  project=sanitizeProject(saved);
 }catch{}
 await scanFolder(project.assetFolder);
 protocol.handle('manju-img',async(request)=>{
  try{const id=new URL(request.url).pathname.split('/').filter(Boolean).pop();const asset=assets.get(id);
   if(!asset)return new Response('missing',{status:404});
   return net.fetch(pathToFileURL(asset.path).toString());
  }catch{return new Response('missing',{status:404});}
 });
 attachIpc();
 win=new BrowserWindow({width:1140,height:850,minWidth:640,minHeight:480,title:'AI漫剧提示词与参考图工作台',backgroundColor:'#f5f7fb',autoHideMenuBar:true,
  webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'index.html'));
}
app.whenReady().then(boot).catch(err=>{dialog.showErrorBox('软件启动失败',String(err.stack||err));app.quit();});
app.on('window-all-closed',()=>app.quit());
