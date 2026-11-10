'use strict';
const {app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, clipboard, nativeImage, session} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const {createInitialData,normalizeName,safeBounds,allowedImage,allowedEdgeProfile} = require('./store');
const {WorkspaceStore} = require('./workspace');
const {parseMultiEpisode} = require('./parser');
const {DownloadManager,inspectManifest}=require('./downloads');
const {createMentionRunner}=require('./mention-runner');
const {createImportEngine}=require('./import-engine');
const {VoiceBindingsStore}=require('./voice-bindings');
const {TailFrameStore,binaries,findPredecessor}=require('./tailframe');
const {TailFrameQueue}=require('./tailframe-queue');
const {DownloadAssociations}=require('./download-association');
const {createVideoModeController}=require('./video-mode-controller');
const {detectSegmentCodes}=require('./parser');

const DOUBAO_URL='https://www.doubao.com/chat/';
const MAX_LIVE_VIEWS=3;
let win, cfg, cfgFile, workspace, downloads, extensionCandidate=null, lastBounds=null, activeId=null, overlayShown=false;
const loadedExtensions=new Map();
const views=new Map(); // account ID -> {view,lastUsed}
let mentionRunner=null,importEngine=null,tailframes=null,voiceBindings=null,videoMode=null,tailframeQueue=null;
const downloadAssociations=new DownloadAssociations();
const now=()=>Date.now();
const exists=(p)=>{try{return fs.statSync(p).isFile()}catch{return false}};
function log(err){try{fs.appendFileSync(path.join(app.getPath('userData'),'diagnostic.log'),`\n${new Date().toISOString()} ${String(err?.stack||err)}\n`)}catch{}}
function save(){
  try{const temp=cfgFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(cfg,null,2),'utf8');fs.renameSync(temp,cfgFile)}catch(e){log(e);throw e}
}
function readCfg(){
  fs.mkdirSync(app.getPath('userData'),{recursive:true});cfgFile=path.join(app.getPath('userData'),'config.json');
  if(exists(cfgFile)){
    try {const v=JSON.parse(fs.readFileSync(cfgFile,'utf8'));
      if(v.version===1&&Array.isArray(v.accounts)&&Array.isArray(v.groups)&&Array.isArray(v.segments))return v;
    }catch(e){log(e);fs.copyFileSync(cfgFile,cfgFile+'.corrupted-'+Date.now())}
  }
  const data=createInitialData(randomUUID);cfg=data;save();return data;
}
function update(mutator){mutator();save();return cfg;}
function tell(channel,payload){if(win&&!win.isDestroyed())win.webContents.send(channel,payload)}
function account(id){const a=cfg.accounts.find(x=>x.id===id);if(!a)throw new Error('账号不存在');return a;}
function segment(id){const s=cfg.segments.find(x=>x.id===id);if(!s)throw new Error('段落不存在');return s;}
function getDownloadPath(filename){
  const folder=path.join(app.getPath('downloads'),'豆包创作舱');fs.mkdirSync(folder,{recursive:true});
  const safe=path.basename(filename).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,180)||'download';
  const ext=path.extname(safe), stem=path.basename(safe,ext);
  let candidate=path.join(folder,safe),i=1;
  while(fs.existsSync(candidate))candidate=path.join(folder,`${stem} (${i++})${ext}`);
  return candidate;
}
function setupSession(sess,accountId){
  if(sess.__creativeHubReady)return;
  sess.__creativeHubReady=true;
  sess.on('will-download',(_ev,item)=>{
    try{
      const match=downloadAssociations.find(accountId);
      const acc=cfg.accounts.find(a=>a.id===accountId);
      let ep=null,seg=null;
      if(match.state==='matched'){ep=workspace.data.episodes.find(e=>e.id===match.context.episodeId);seg=ep?.segments.find(s=>s.id===match.context.segmentId);}
      const safeMatch=!!ep&&!!seg&&!ep.deletedAt&&!seg.deletedAt;
      const context={project:workspace.data.title,episode:safeMatch?ep.title:'未关联剧集',segment:safeMatch?seg.title:'未关联段落',
        episodeNumber:safeMatch&&ep.number!=null?'第'+ep.number+'集':'未分集',segmentNumber:safeMatch?'第'+seg.n+'段':'未分段',
        episodeId:safeMatch?ep.id:'',segmentId:safeMatch?seg.id:'',accountId,account:acc?.name||'未知账号'};
      const record=downloads.begin(item.getFilename(),context,item.getURL());
      item.setSavePath(record.path);
      if(context.segmentId)downloadAssociations.confirmed({...context});
      tell('app:toast',`开始下载：${record.file}`);
      tell('download:changed',downloads.snapshot());
      let lastProgress=0;
      item.on('updated',(_event,state)=>{
        const stamp=Date.now();if(stamp-lastProgress<1100 && state!=='interrupted')return;lastProgress=stamp;
        downloads.update(record.id,state==='interrupted'?'interrupted':'progressing',item.getReceivedBytes(),item.getTotalBytes());tell('download:changed',downloads.snapshot());
      });
      item.on('done',(_event,state)=>{
        downloads.update(record.id,state,item.getReceivedBytes(),item.getTotalBytes());
        tell('download:changed',downloads.snapshot());
        tell('app:toast',state==='completed'?`下载完成：${record.file}`:`下载${state==='cancelled'?'已取消':'中断'}：${record.file}`);
        if(state==='completed'&&record.type==='视频'){
          if(record.episodeId&&record.segmentId)tailframeQueue?.enqueue(record);
          else tell('app:toast','视频已下载，来源段落不明确；请在下载管理中点击「关联当前段」后自动截尾帧');
        }
      });
    }catch(e){log(e);tell('app:toast','下载保存目录异常：'+e.message)}
  });
  sess.setPermissionRequestHandler((_contents,permission,callback)=>callback(false));
}
function configureView(id){
  const sess=session.fromPartition(`persist:doubao_${id}`);
  setupSession(sess,id);
  const view=new WebContentsView({webPreferences:{session:sess,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
  const wc=view.webContents;
  wc.setWindowOpenHandler(({url})=>{
    try{if(new URL(url).protocol!=='https:')return {action:'deny'}}catch{return {action:'deny'}}
    return {action:'allow',overrideBrowserWindowOptions:{width:1100,height:760,autoHideMenuBar:true,webPreferences:{session:sess,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}}};
  });
  wc.on('did-start-loading',()=>{importEngine?.cancel();tell('web:status',{id,status:'正在加载…'})});
  wc.on('did-navigate-in-page',()=>importEngine?.cancel());
  wc.on('did-stop-loading',()=>{
    tell('web:status',{id,status:'网页已加载'});
    // A successful login may require multiple page loads; only the active account is modified.
    if(id===activeId&&videoMode)videoMode.ensure({accountId:id,automatic:true}).catch(()=>{});
  });
  wc.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3)tell('web:status',{id,status:`加载失败 (${code})：${description}`,url})});
  wc.on('render-process-gone',(_e,details)=>{tell('web:status',{id,status:`网页进程退出：${details.reason}，可点刷新重试`})});
  wc.loadURL(DOUBAO_URL).catch(e=>{log(e);tell('web:status',{id,status:'豆包打开失败：'+e.message})});
  return {view,lastUsed:now()};
}
function prune(){
  while(views.size>MAX_LIVE_VIEWS){
    const candidates=[...views.entries()].filter(([id])=>id!==activeId).sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
    if(!candidates.length)break;
    const [id,slot]=candidates[0];
    try{win.contentView.removeChildView(slot.view);slot.view.webContents.close()}catch(e){log(e)}
    views.delete(id);
  }
}
function selectAccount(id){
  account(id);
  if(activeId&&id!==activeId){mentionRunner?.cancel();importEngine?.cancel();}
  if(activeId&&views.has(activeId)){
    const old=views.get(activeId);
    try{win.contentView.removeChildView(old.view)}catch(e){log(e)}
  }
  activeId=id;
  let slot=views.get(id);
  if(!slot){slot=configureView(id);views.set(id,slot)}
  slot.lastUsed=now();
  if(!overlayShown)win.contentView.addChildView(slot.view);
  if(lastBounds)slot.view.setBounds(lastBounds);
  cfg.activeAccountId=id;save();prune();
  tell('web:selected',{id});
  if(videoMode&&!slot.view.webContents.isLoading())videoMode.ensure({accountId:id,automatic:true}).catch(()=>{});
  return {id};
}
function navigate(action){
  const wc=views.get(activeId)?.view.webContents;
  if(!wc||wc.isDestroyed())return;
  if(action==='reload')wc.reload();
  if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  if(action==='home')wc.loadURL(DOUBAO_URL).catch(log);
  if(action==='zoomIn')wc.setZoomFactor(Math.min(1.7,wc.getZoomFactor()+0.1));
  if(action==='zoomOut')wc.setZoomFactor(Math.max(0.6,wc.getZoomFactor()-0.1));
}
function getEdgePath(){
  const candidates=[
    path.join(process.env['PROGRAMFILES(X86)']||'', 'Microsoft','Edge','Application','msedge.exe'),
    path.join(process.env.PROGRAMFILES||'', 'Microsoft','Edge','Application','msedge.exe'),
    path.join(process.env.LOCALAPPDATA||'', 'Microsoft','Edge','Application','msedge.exe')
  ];return candidates.find(exists);
}

let updater=null;
let updateStatus={state:'unconfigured',message:'尚未配置在线更新地址。可使用新版安装包覆盖升级，账号登录数据不会主动删除。'};
function reportUpdate(state,message,version){
  updateStatus={state,message,version:version||null};
  tell('app:updateStatus',updateStatus);
}
function initializeUpdater(){
  const feedFile=app.isPackaged&&path.join(process.resourcesPath,'app-update.yml');
  if(!feedFile||!exists(feedFile))return;
  try{
    updater=require('electron-updater').autoUpdater;
    updater.autoDownload=false;
    updater.autoInstallOnAppQuit=false;
    updater.on('checking-for-update',()=>reportUpdate('checking','正在检查更新'));
    updater.on('update-not-available',()=>reportUpdate('current','已经是最新版本'));
    updater.on('update-available',async info=>{
      reportUpdate('downloading','发现新版 '+info.version+'，正在下载',info.version);
      try{await updater.downloadUpdate()}catch(err){reportUpdate('error','下载更新失败：'+err.message)}
    });
    updater.on('download-progress',p=>reportUpdate('downloading','下载更新 '+Math.round(p.percent)+'%'));
    updater.on('update-downloaded',info=>reportUpdate('ready','新版 '+info.version+' 已下载，点击安装',info.version));
    updater.on('error',err=>reportUpdate('error','更新失败：'+err.message));
    updateStatus={state:'idle',message:'点击检查更新'};
  }catch(err){reportUpdate('error','更新模块初始化失败：'+err.message)}
}

function registerHandlers(){
  ipcMain.handle('cfg:get',()=>cfg);
  ipcMain.handle('app:updateStatus',()=>updateStatus);
  ipcMain.handle('app:checkUpdate',async()=>{
    if(!updater)return updateStatus;
    try{await updater.checkForUpdates()}catch(err){reportUpdate('error','检查更新失败：'+err.message)}
    return updateStatus;
  });
  ipcMain.handle('app:installUpdate',()=>{
    if(!updater||updateStatus.state!=='ready')return false;
    updater.quitAndInstall(false,true);return true;
  });
  ipcMain.handle('account:select',(_e,id)=>selectAccount(id));
  ipcMain.handle('video:status',()=>videoMode?.getStatus(activeId)||null);
  ipcMain.handle('video:ensure',()=>videoMode.ensure({accountId:activeId}));
  ipcMain.on('web:bounds',(_e,b)=>{
    if(!win||win.isDestroyed())return;
    const size=win.getContentBounds(); const v=safeBounds(b,{width:size.width,height:size.height});
    if(v){lastBounds=v;const slot=views.get(activeId);if(slot)slot.view.setBounds(v)}
  });
  ipcMain.on('overlay:set',(_e,shown)=>{
    if(!win||win.isDestroyed())return;const slot=views.get(activeId);
    if(!slot||overlayShown===!!shown)return;
    try{if(shown)win.contentView.removeChildView(slot.view);else{win.contentView.addChildView(slot.view);if(lastBounds)slot.view.setBounds(lastBounds)}overlayShown=!!shown}catch(e){log(e)}
  });
  ipcMain.handle('nav:action',(_e,a)=>{if(!['reload','back','forward','home','zoomIn','zoomOut'].includes(a))throw Error('不支持此操作');navigate(a)});
  ipcMain.handle('group:add',(_e,name)=>update(()=>{cfg.groups.push({id:randomUUID(),name:normalizeName(name),edgeProfile:'Default'})}));
  ipcMain.handle('group:rename',(_e,id,name)=>update(()=>{const g=cfg.groups.find(g=>g.id===id);if(!g)throw Error('分组不存在');g.name=normalizeName(name)}));
  ipcMain.handle('group:edge',(_e,id,p)=>update(()=>{const g=cfg.groups.find(g=>g.id===id);if(!g||!allowedEdgeProfile(p))throw Error('Edge 配置无效');g.edgeProfile=p}));
  ipcMain.handle('account:add',(_e,groupId,name)=>update(()=>{if(!cfg.groups.some(g=>g.id===groupId))throw Error('分组不存在');cfg.accounts.push({id:randomUUID(),groupId,name:normalizeName(name),done:0})}));
  ipcMain.handle('account:rename',(_e,id,name)=>update(()=>{account(id).name=normalizeName(name)}));
  ipcMain.handle('account:remove',(_e,id)=>{
    if(cfg.accounts.length<=1)throw Error('至少保留一个账号');
    if(activeId===id)selectAccount(cfg.accounts.find(a=>a.id!==id).id);
    const slot=views.get(id);if(slot){try{win.contentView.removeChildView(slot.view);slot.view.webContents.close()}catch(e){log(e)}views.delete(id)}
    // Deliberately does not delete a profile directory or its cookies; accidental removal is reversible via backup.
    return update(()=>{cfg.accounts=cfg.accounts.filter(a=>a.id!==id)});
  });
  ipcMain.handle('account:progress',(_e,id,delta)=>update(()=>{const a=account(id);a.done=Math.max(0,Math.min(999,a.done+Number(delta||0)))}));
  ipcMain.handle('account:reset',()=>update(()=>cfg.accounts.forEach(a=>a.done=0)));
  ipcMain.handle('target:set',(_e,n)=>update(()=>{cfg.target=Math.max(1,Math.min(99,Math.round(Number(n)||2)))}));
  ipcMain.handle('segment:add',(_e,name)=>update(()=>{const s={id:randomUUID(),name:normalizeName(name),prompt:'',images:[]};cfg.segments.push(s);cfg.activeSegmentId=s.id}));
  ipcMain.handle('segment:select',(_e,id)=>update(()=>{segment(id);cfg.activeSegmentId=id}));
  ipcMain.handle('segment:rename',(_e,id,name)=>update(()=>{segment(id).name=normalizeName(name)}));
  ipcMain.handle('segment:delete',(_e,id)=>update(()=>{if(cfg.segments.length<=1)throw Error('至少保留一个段落');cfg.segments=cfg.segments.filter(x=>x.id!==id);if(cfg.activeSegmentId===id)cfg.activeSegmentId=cfg.segments[0].id}));
  ipcMain.on('segment:prompt',(_e,id,prompt)=>{
    try{if(typeof prompt==='string'&&prompt.length<1000000)update(()=>{segment(id).prompt=prompt})}catch(e){log(e)}
  });
  ipcMain.handle('images:choose',async (_e,id)=>{
    segment(id);
    const res=await dialog.showOpenDialog(win,{title:'添加漫剧参考图',properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp','bmp','gif']}]});
    if(res.canceled)return cfg;
    return update(()=>{const s=segment(id);s.images=[...new Set([...s.images,...res.filePaths.filter(f=>exists(f)&&allowedImage(f))])].slice(0,200)});
  });
  ipcMain.handle('images:drop',(_e,id,paths)=>update(()=>{const s=segment(id);if(!Array.isArray(paths))throw Error('文件路径格式错误');s.images=[...new Set([...s.images,...paths.slice(0,100).filter(f=>typeof f==='string'&&exists(f)&&allowedImage(f))])].slice(0,200)}));
  ipcMain.handle('images:remove',(_e,id,file)=>update(()=>{const s=segment(id);s.images=s.images.filter(p=>p!==file)}));
  ipcMain.handle('images:view',(_e,paths)=>{
    if(!Array.isArray(paths))return [];
    return paths.slice(0,200).filter(f=>typeof f==='string').map(p=>({path:p,name:path.basename(p),url:exists(p)&&allowedImage(p)?pathToFileURL(p).toString():null}));
  });
  ipcMain.handle('image:copy',(_e,file)=>{
    if(typeof file!=='string'||!exists(file)||!allowedImage(file))throw Error('图片不存在');
    const img=nativeImage.createFromPath(file);if(img.isEmpty())throw Error('无法复制该图片；请尝试 PNG/JPG');clipboard.writeImage(img);return true;
  });
  ipcMain.handle('image:reveal',(_e,file)=>{if(typeof file!=='string'||!exists(file))throw Error('文件已移动');shell.showItemInFolder(file)});
  ipcMain.on('images:native-drag',(e,files)=>{
    const s=cfg.segments.find(s=>s.id===cfg.activeSegmentId);if(!s||!Array.isArray(files))return;
    const paths=files.slice(0,20).filter(p=>typeof p==='string'&&s.images.includes(p)&&exists(p)&&allowedImage(p));
    if(!paths.length)return;
    const icon=nativeImage.createFromPath(paths[0]).resize({width:80,height:80});
    try{e.sender.startDrag({files:paths,file:paths[0],icon})}catch(err){log(err);tell('app:toast','原生拖动失败：可先复制图片，再粘贴到豆包')}
  });
  ipcMain.handle('text:copy',(_e,text)=>{if(typeof text!=='string')throw Error('内容无效');clipboard.writeText(text);return true});
  ipcMain.handle('edge:launch',(_e,groupId)=>{
    const g=cfg.groups.find(g=>g.id===groupId);if(!g)throw Error('分组不存在');
    if(process.platform!=='win32')throw Error('此功能仅限 Windows');
    const exe=getEdgePath();if(!exe)throw Error('未找到 Edge；可在 Edge 中直接打开豆包');
    const args=[`--profile-directory=${allowedEdgeProfile(g.edgeProfile)?g.edgeProfile:'Default'}`,DOUBAO_URL];
    const child=spawn(exe,args,{detached:true,stdio:'ignore'});child.unref();return true;
  });
  ipcMain.handle('download:state',()=>downloads.snapshot());
  ipcMain.handle('download:choose',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'选择豆包下载成品总目录',defaultPath:downloads.root,properties:['openDirectory','createDirectory']});
    if(pick.canceled)return {cancelled:true};
    await downloads.chooseRoot(pick.filePaths[0]);tell('download:changed',downloads.snapshot());return downloads.snapshot();
  });
  ipcMain.handle('download:open',async()=>{await fs.promises.mkdir(downloads.root,{recursive:true});return shell.openPath(downloads.root)});
  ipcMain.handle('download:reveal',(_event,id)=>{
    const record=downloads.history.find(r=>r.id===id);if(!record||!exists(record.path))throw Error('下载文件不存在或已移动');shell.showItemInFolder(record.path);return true;
  });
  ipcMain.handle('extension:inspect',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'选择已解压的扩展目录（不会读取你的 Edge 个人数据）',properties:['openDirectory']});
    if(pick.canceled)return {cancelled:true};
    extensionCandidate=inspectManifest(pick.filePaths[0]);return extensionCandidate;
  });
  ipcMain.handle('extension:status',()=>({candidate:extensionCandidate,loaded:loadedExtensions.get(activeId)||null,account:cfg.accounts.find(a=>a.id===activeId)?.name||''}));
  ipcMain.handle('extension:load',async()=>{
    if(!extensionCandidate)throw Error('请先检查本地扩展源码');
    // Explicit per-session opt-in: only load into the selected account, never into all profiles.
    const {response}=await dialog.showMessageBox(win,{type:'warning',buttons:['取消','我已检查源码，测试载入'],defaultId:0,cancelId:0,title:'第三方扩展权限提示',message:`仅在 ${account(activeId).name} 的会话内测试：${extensionCandidate.name}`,detail:'扩展可能读取豆包网页内的内容。Electron 不保证下载 API、MV3 后台服务及去水印功能兼容。\n\n权限：'+(extensionCandidate.permissions.join('、')||'无')+'\n网站：'+(extensionCandidate.hosts.join('、')||'无')+'\n提醒：'+(extensionCandidate.warnings.join('；')||'无')});
    if(response!==1)return {cancelled:true};
    const id=activeId,sess=session.fromPartition(`persist:doubao_${id}`);
    if(!sess.extensions||typeof sess.extensions.loadExtension!=='function')throw Error('当前 Electron 不支持扩展载入接口');
    const found=await sess.extensions.loadExtension(extensionCandidate.path,{allowFileAccess:false});
    loadedExtensions.set(id,{id:found.id,name:extensionCandidate.name,account:account(id).name,loadedAt:new Date().toISOString(),verified:false});
    const slot=views.get(id);if(slot&&!slot.view.webContents.isDestroyed())slot.view.webContents.reload();
    return {loaded:true,unverified:true,extension:loadedExtensions.get(id)};
  });
  ipcMain.handle('extension:unload',async()=>{
    const loaded=loadedExtensions.get(activeId);if(!loaded)return {unloaded:false};
    const sess=session.fromPartition(`persist:doubao_${activeId}`);sess.extensions.removeExtension(loaded.id);loadedExtensions.delete(activeId);const slot=views.get(activeId);if(slot&&!slot.view.webContents.isDestroyed())slot.view.webContents.reload();return {unloaded:true};
  });
  ipcMain.handle('app:downloads',()=>shell.openPath(downloads.root));
  ipcMain.handle('app:dataPath',()=>app.getPath('userData'));
  ipcMain.handle('app:openData',()=>shell.openPath(app.getPath('userData')));
  // V0.2 workspace IPC is deliberately separate from v0.1 account config and session partitions.
  ipcMain.handle('ws:state',()=>workspace.snapshot());
  ipcMain.handle('ws:importText',async(_e,text,filename)=>workspace.addText(text,filename));
  ipcMain.handle('ws:importFiles',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'导入一份或多份 TXT/MD 完整提示词',properties:['openFile','multiSelections'],filters:[{name:'提示词文件',extensions:['txt','md']}]});
    if(pick.canceled)return {cancelled:true};
    let addedEpisodes=0,addedSegments=0;const errors=[];
    for(const filename of pick.filePaths){try{
      const stat=await fs.promises.stat(filename);if(stat.size>20_000_000)throw Error('单文件超过20MB');
      let text=await fs.promises.readFile(filename,'utf8');text=text.replace(/^\uFEFF/,'');
      if(text.includes('�'))throw Error('文件可能不是UTF-8编码；请转为UTF-8后导入，避免乱码');
      const result=await workspace.addText(text,path.basename(filename));addedEpisodes+=result.addedEpisodes;addedSegments+=result.addedSegments;
    }catch(err){errors.push(path.basename(filename)+': '+err.message)}}
    return {addedEpisodes,addedSegments,errors};
  });
  ipcMain.handle('ws:importOld',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'只读导入旧素材工作台 project/workbench.json',properties:['openFile'],filters:[{name:'旧版项目 JSON',extensions:['json']}]});
    if(pick.canceled)return {cancelled:true};
    const file=pick.filePaths[0];if((await fs.promises.stat(file)).size>50_000_000)throw Error('旧项目文件超过50MB');
    return workspace.mergeLegacy(JSON.parse(await fs.promises.readFile(file,'utf8')));
  });
  ipcMain.handle('ws:folder',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'选择参考图总目录（会递归扫描子目录）',properties:['openDirectory']});
    if(pick.canceled)return {cancelled:true};
    return workspace.setFolder(pick.filePaths[0]);
  });
  ipcMain.handle('ws:rescan',()=>workspace.assetIndex.scan(workspace.data.assetFolder));
  ipcMain.handle('ws:select',async(_e,eid,sid)=>{await workspace.select(eid,sid);return workspace.snapshot()});
  ipcMain.handle('ws:editText',async(_e,eid,sid,text)=>{await workspace.editText(eid,sid,text);return workspace.snapshot()});
  ipcMain.handle('ws:editCodes',async(_e,eid,sid,codes)=>{await workspace.editCodes(eid,sid,codes);return workspace.snapshot()});
  ipcMain.handle('ws:status',async(_e,eid,sid,status,aid)=>{await workspace.setStatus(eid,sid,status,aid);return workspace.snapshot()});
  ipcMain.handle('ws:hidden',(_e,eid,sid,hidden)=>workspace.setHidden(eid,sid,hidden));
  ipcMain.handle('ws:locked',(_e,eid,sid,locked)=>workspace.setLocked(eid,sid,locked));
  ipcMain.handle('ws:showHidden',(_e,show)=>workspace.setShowHidden(show));
  ipcMain.handle('ws:hideDone',()=>workspace.hideDone());
  ipcMain.handle('ws:treeEpisode',(_e,eid)=>workspace.setTreeEpisode(eid));
  ipcMain.handle('ws:trash',()=>workspace.trash());
  ipcMain.handle('ws:deleteEpisode',(_e,eid)=>workspace.deleteEpisode(eid));
  ipcMain.handle('ws:deleteSegment',(_e,eid,sid)=>workspace.deleteSegment(eid,sid));
  ipcMain.handle('ws:restoreEpisode',(_e,eid)=>workspace.restoreEpisode(eid));
  ipcMain.handle('ws:restoreSegment',(_e,eid,sid)=>workspace.restoreSegment(eid,sid));
  ipcMain.handle('ws:selection',async(_e,eid,sid,paths)=>{await workspace.setSelection(eid,sid,paths);return workspace.snapshot()});
  ipcMain.handle('ws:version',async(_e,code,p)=>{await workspace.chooseVersion(code,p);return workspace.snapshot()});
  ipcMain.handle('ws:layout',async(_e,patch)=>{await workspace.setLayout(patch);return true});
  ipcMain.handle('ws:rename',async(_e,name)=>{if(typeof name!=='string'||!name.trim())throw Error('项目名称不能为空');workspace.data.title=name.trim().slice(0,150);await workspace.save();return workspace.snapshot()});
  ipcMain.handle('tail:status',(_e,eid,sid)=>{
    workspace.findSegment(eid,sid);
    const r=tailframes.status(workspace.data,eid,sid);
    return {...r,file:r.file?{...r.file,url:pathToFileURL(r.file.path).toString()}:null};
  });
  ipcMain.handle('tail:versions',(_e,eid,sid)=>{workspace.findSegment(eid,sid);return tailframes.listVersions(eid,sid)});
  ipcMain.handle('tail:lock',(_e,eid,sid,locked)=>{workspace.findSegment(eid,sid);return tailframes.setLocked(eid,sid,locked)});
  ipcMain.handle('tail:choose',async(_e,eid,sid)=>{
    workspace.findSegment(eid,sid);
    const previous=findPredecessor(workspace.data,eid,sid);
    if(!previous)return {state:'first',message:'本集第一段没有前一段成片'};
    const pick=await dialog.showOpenDialog(win,{title:`选择第${previous.seg.n}段最终成片（提取尾帧用于当前段）`,properties:['openFile'],filters:[{name:'视频文件',extensions:['mp4','mov','mkv','webm','avi']}]});
    if(pick.canceled)return {state:'cancelled'};
    const result=await tailframes.setFinal(workspace.data,eid,previous.seg.id,pick.filePaths[0],{auto:false});
    tell('tail:updated',{episodeId:eid,segmentId:previous.seg.id,...result});
    return result;
  });
  ipcMain.handle('voice:list',()=>voiceBindings.snapshot());
  ipcMain.handle('voice:add',async(_e,code,label)=>{
    const pick=await dialog.showOpenDialog(win,{title:'为参考图 '+code+' 绑定人物音频（WAV/MP3，单段2-15秒）',properties:['openFile','multiSelections'],filters:[{name:'人物声音',extensions:['wav','mp3']}]});
    if(pick.canceled||!pick.filePaths.length)return {cancelled:true,...voiceBindings.snapshot()};
    return voiceBindings.add(code,pick.filePaths,label||'人物声音');
  });
  ipcMain.handle('voice:default',(_e,code,id)=>voiceBindings.setDefault(code,id));
  ipcMain.handle('voice:remove',(_e,code,id)=>voiceBindings.remove(code,id));
  ipcMain.handle('voice:play',async(_e,code,id)=>{
    const file=(voiceBindings.data.bindings[code]||[]).find(x=>x.id===id)?.path;
    if(!file||!exists(file))throw Error('声音文件已失效');
    const result=await shell.openPath(file);if(result)throw Error(result);return true;
  });
  ipcMain.handle('import:draft',(_e,eid,sid,prompt)=>importEngine.getDraft({episodeId:eid,segmentId:sid,previewText:prompt}));
  ipcMain.handle('import:sync-text',(_e,eid,sid,replaceDraft)=>importEngine.syncText({episodeId:eid,segmentId:sid,replaceDraft:!!replaceDraft}));
  ipcMain.handle('import:preflight',async(_e,eid,sid)=>{
    await videoMode.ensure({accountId:activeId});
    return importEngine.getPlan({episodeId:eid,segmentId:sid});
  });
  ipcMain.handle('import:execute',async(_e,eid,sid,options)=>{
    const accountId=activeId;
    await videoMode.ensure({accountId});
    const result=await importEngine.execute({episodeId:eid,segmentId:sid,replaceDraft:!!options?.replaceDraft,attemptNative:options?.attemptNative!==false});
    if(result?.state==='done'){
      const {ep,seg}=workspace.findSegment(eid,sid);
      downloadAssociations.record({accountId,episodeId:eid,segmentId:sid,project:workspace.data.title,episode:ep.title,segment:seg.title});
    }
    return result;
  });
  ipcMain.handle('import:cancel',()=>importEngine.cancel());
  ipcMain.handle('import:confirm',(_e,approved)=>importEngine.confirm(approved===true));
  ipcMain.handle('mention:preflight',(_e,eid,sid)=>mentionRunner.preflight({episodeId:eid,segmentId:sid}));
  ipcMain.handle('mention:execute',(_e,eid,sid)=>mentionRunner.execute({episodeId:eid,segmentId:sid}));
  ipcMain.handle('mention:cancel',()=>mentionRunner.cancel());
  ipcMain.handle('download:associate',(_e,downloadId,eid,sid)=>{
    const {ep,seg}=workspace.findSegment(eid,sid);
    if(ep.deletedAt||seg.deletedAt)throw Error('不能关联到回收站内的段落');
    const record=downloads.history.find(r=>r.id===downloadId);
    if(!record)throw Error('下载记录已不存在');
    if(record.accountId&&record.accountId!==activeId)throw Error('请切换到下载该视频的豆包账号');
    const row=downloads.associate(downloadId,{accountId:activeId,episodeId:eid,segmentId:sid,episode:ep.title,segment:seg.title});
    tailframeQueue.enqueue(row);tell('download:changed',downloads.snapshot());return downloads.snapshot();
  });
  ipcMain.handle('ws:images',(_e,eid,sid)=>workspace.resolveSegment(eid,sid).map(r=>({
    code:r.code,file:r.file?{...r.file,url:exists(r.file.path)?pathToFileURL(r.file.path).toString():null}:null,
    versions:r.versions.map(v=>({...v,url:exists(v.path)?pathToFileURL(v.path).toString():null})),
    missing:r.missing || !!(r.file&&!exists(r.file.path)),duplicate:r.duplicate,manual:!!r.manual
  })));
  ipcMain.handle('ws:manualImages',async(_e,eid,sid)=>{
    workspace.findSegment(eid,sid);
    const pick=await dialog.showOpenDialog(win,{title:'补充本段参考图',properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp','bmp','gif','avif','tif','tiff']}]});
    if(pick.canceled)return {cancelled:true};
    await workspace.addManualImages(eid,sid,pick.filePaths);return workspace.snapshot();
  });
  ipcMain.on('ws:drag',(event,payload)=>{
    try{
      const eid=String(payload?.episodeId||''),sid=String(payload?.segmentId||'');
      const rows=workspace.resolveSegment(eid,sid);const allowed=new Set(rows.filter(r=>r.file&&!r.missing).map(r=>r.file.path));
      const selected=Array.isArray(payload?.paths)?payload.paths:[];
      const paths=[...new Set(selected.filter(p=>typeof p==='string'&&allowed.has(p)&&exists(p)))].slice(0,20);
      if(!paths.length)throw Error('没有可拖动的真实图片，请先检查素材文件夹');
      let icon=nativeImage.createFromPath(paths[0]);if(icon.isEmpty())icon=nativeImage.createEmpty();
      else icon=icon.resize({width:80,height:80});
      event.sender.startDrag({files:paths,file:paths[0],icon});
    }catch(err){log(err);tell('app:toast','原生拖拽未成功：'+err.message+'，可使用“备用上传文件夹”');}
  });
  ipcMain.handle('ws:export',async(_e,eid,sid)=>{
    workspace.findSegment(eid,sid);
    const folder=path.join(app.getPath('downloads'),'豆包创作舱','本段上传素材');
    await fs.promises.mkdir(folder,{recursive:true});
    const r=await workspace.exportSegment(eid,sid,folder);
    await shell.openPath(path.join(r.folder,'参考图'));
    return r;
  });
  ipcMain.handle('ws:backup',async()=>{
    const pick=await dialog.showSaveDialog(win,{title:'保存 v0.3 漫剧项目备份（不包含登录信息及图片本体）',defaultPath:'漫剧项目备份-v0.3.json',filters:[{name:'项目备份',extensions:['json']}]});
    if(pick.canceled||!pick.filePath)return {cancelled:true};
    await fs.promises.writeFile(pick.filePath,JSON.stringify(workspace.data,null,2),'utf8');return {path:pick.filePath};
  });
  ipcMain.handle('ws:restore',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'恢复 v0.3 漫剧项目（将替换当前漫剧项目，请先备份）',properties:['openFile'],filters:[{name:'项目 JSON',extensions:['json']}]});
    if(pick.canceled)return {cancelled:true};
    if((await fs.promises.stat(pick.filePaths[0])).size>50_000_000)throw Error('备份文件过大');
    const data=JSON.parse(await fs.promises.readFile(pick.filePaths[0],'utf8'));
    if(!Array.isArray(data.episodes)||![2,3].includes(data.version))throw Error('不是有效的 v0.2/v0.3 项目备份');
    // Preserve the previous state before replacing it; this action does not affect account cookies.
    const safeguard=workspace.file+'.before-restore-'+Date.now()+'.json';
    await fs.promises.writeFile(safeguard,JSON.stringify(workspace.data,null,2),'utf8');
    const {scrub}=require('./workspace');workspace.data=scrub(data);await workspace.save();
    await workspace.assetIndex.scan(workspace.data.assetFolder);
    return {safeguard};
  });
  ipcMain.handle('app:backup',async()=>{
    const response=await dialog.showSaveDialog(win,{title:'备份工作台清单（不含登录凭据）',defaultPath:'豆包创作舱-工作台备份.json',filters:[{name:'JSON',extensions:['json']}]});
    if(response.canceled||!response.filePath)return false;
    fs.writeFileSync(response.filePath,JSON.stringify(cfg,null,2));return true;
  });
}
function createWindow(){
  win=new BrowserWindow({width:1550,height:920,minWidth:990,minHeight:610,backgroundColor:'#0c1321',title:'豆包创作舱',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('render-process-gone',(_e,details)=>log('UI renderer exited: '+details.reason));
  win.loadFile(path.join(__dirname,'index.html')).catch(log);
  win.on('resize',()=>tell('app:layout',{}));
  win.on('closed',()=>{for(const slot of views.values())try{slot.view.webContents.close()}catch{}views.clear();win=null});
}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
  process.on('uncaughtException',log);process.on('unhandledRejection',log);
  app.whenReady().then(async()=>{cfg=readCfg();workspace=new WorkspaceStore(path.join(app.getPath('userData'),'workspace.json'));await workspace.load(cfg);downloads=new DownloadManager(app.getPath('userData'),path.join(app.getPath('downloads'),'豆包创作舱','下载成品'));await downloads.load();tailframes=await new TailFrameStore(app.getPath('userData'),{tools:binaries({packaged:app.isPackaged,resourcesPath:process.resourcesPath})}).load();
    tailframeQueue=new TailFrameQueue({tailframes,workspace,
      notify:info=>{tell('tail:updated',info);if(info.message&&info.state!=='extracting')tell('app:toast',info.message);tell('download:changed',downloads.snapshot());},
      onRecord:(id,status,message)=>downloads.setTailStatus(id,status,message)});
    videoMode=createVideoModeController({getActive:()=>{const slot=views.get(activeId);return slot?{accountId:activeId,webContents:slot.view.webContents}:null},
      notify:info=>tell('video:status',info)});
voiceBindings=await new VoiceBindingsStore(path.join(app.getPath('userData'),'voice-bindings.json'),{ffprobe:binaries({packaged:app.isPackaged,resourcesPath:process.resourcesPath}).ffprobe}).load();mentionRunner=createMentionRunner({getActive:()=>{const slot=views.get(activeId);return slot?{accountId:activeId,webContents:slot.view.webContents}:null},resolveRows:(eid,sid,prompt)=>{const seg=workspace.findSegment(eid,sid).seg;const codes=detectSegmentCodes(prompt).codes;return workspace.assetIndex.resolve(codes.length?codes:seg.codes,workspace.data.chosenPaths,seg.manualPaths);},getCodes:(eid,sid)=>workspace.findSegment(eid,sid).seg.codes,getChosenPaths:()=>workspace.data.chosenPaths,notify:info=>tell('mention:status',info)});importEngine=createImportEngine({getActive:()=>{const slot=views.get(activeId);return slot?{accountId:activeId,webContents:slot.view.webContents}:null},getSegment:(eid,sid)=>workspace.findSegment(eid,sid).seg,resolveRows:(eid,sid)=>workspace.resolveSegment(eid,sid),getChosenPaths:()=>workspace.data.chosenPaths,getCurrentSelection:()=>({episodeId:workspace.data.activeEpisodeId,segmentId:workspace.data.activeSegmentId}),getTailForSegment:(eid,sid)=>tailframes.status(workspace.data,eid,sid),getVoiceForImages:items=>voiceBindings.plan(items),notify:info=>tell('import:status',info)});registerHandlers();initializeUpdater();createWindow()}).catch(err=>{log(err);dialog.showErrorBox('豆包创作舱启动失败',String(err.stack||err));app.quit()});
  app.on('window-all-closed',()=>app.quit());
}
