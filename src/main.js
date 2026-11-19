'use strict';
const {app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, clipboard, nativeImage, session, safeStorage, Tray, Menu} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const {createInitialData,normalizeName,safeBounds,allowedImage,allowedEdgeProfile} = require('./store');
const {saveAccountConfig,readOrCreateAccountConfig}=require('./account-config-store');
const {configureAssetAliases,getDefaultAssetAliases}=require('./asset-aliases');
const {quotaCycleDate,normalizeQuota,shouldResetQuota}=require('./account-quota');
const {WorkspaceStore} = require('./workspace');
const {parseMultiEpisode} = require('./parser');
const {DownloadManager,inspectManifest}=require('./downloads');
const {createMentionRunner}=require('./mention-runner');
const {createImportEngine}=require('./import-engine');
const {VoiceBindingsStore}=require('./voice-bindings');
const {TailFrameStore,binaries,findPredecessor}=require('./tailframe');
const {detectSegmentCodes}=require('./parser');
const videoMode=require('./video-mode');
const {ApiSettings}=require('./api-settings');
const {NoticeService,safeHttps}=require('./notice-service');
const {TutorialMedia}=require('./tutorial-media');
const {TaskJournal}=require('./task-journal');
const {ThumbnailCache}=require('./thumbnail-cache');
const {LicenseClient}=require('./license-client');
const publicConfig=require('./public-config.json');

// Never share production profiles, Doubao sessions or license caches with the local test server.
// Packaged builds ignore DUDU_LOCAL_TEST_PROFILE, even if it was inherited from the environment.
const localTestProfile=!app.isPackaged&&process.env.DUDU_LOCAL_TEST_PROFILE==='1';
const publicUserDataDir=path.join(app.getPath('appData'),localTestProfile?'DoubaoCreativeHubLocalTest':'DoubaoCreativeHubPublic');
fs.mkdirSync(publicUserDataDir,{recursive:true});
app.setPath('userData',publicUserDataDir);
function loadLicenseRuntimeConfig(){
  if(localTestProfile){
    const localFile=path.join(publicUserDataDir,'license-config.local.json');
    const local=JSON.parse(fs.readFileSync(localFile,'utf8'));
    if(local?.localTestMode!==true)throw Error('本机测试授权配置无效：请先运行本机测试服务');
    return local;
  }
  return require('./license-config.json');
}


const DOUBAO_URL='https://www.doubao.com/chat/';
const LIVE_LIMITS=Object.freeze({light:2,balanced:4,performance:6});
const IMPORT_LIMITS=Object.freeze({light:1,balanced:2,performance:3});
let noticeService=null,noticeTimer=null,tutorialMedia=null,taskJournal=null,licenseClient=null,pruneInProgress=false,quotaTimer=null,preloadRunning=false,tray=null,isQuitting=false;
function guardedHandle(channel,handler){ipcMain.handle(channel,(...args)=>{if(!licenseClient)throw Error('授权中心尚未初始化');licenseClient.requireValid();return handler(...args)})}
const protectedAccounts=new Set();
const activeDownloads=new Map();
const activeImportAccounts=new Set();
const reservedImportSlots=new Set(); // synchronously reserve before asynchronous mode/upload checks
const importEnginesByAccount=new Map();
const importStatesByAccount=new Map();
let win, cfg, cfgFile, workspace, downloads, extensionCandidate=null, lastBounds=null, activeId=null, overlayShown=false;
const loadedExtensions=new Map();
const views=new Map(); // account ID -> {view,lastUsed}
let mentionRunner=null,tailframes=null,voiceBindings=null,thumbnailCache=null,apiSettings=null;
const now=()=>Date.now();
const exists=(p)=>{try{return fs.statSync(p).isFile()}catch{return false}};
function log(err){try{fs.appendFileSync(path.join(app.getPath('userData'),'diagnostic.log'),`\n${new Date().toISOString()} ${String(err?.stack||err)}\n`)}catch{}}
function save(){
 try{saveAccountConfig(cfgFile,cfg)}catch(e){log(e);throw e}
}
function readCfg(){
 cfgFile=path.join(app.getPath('userData'),'config.json');
 return readOrCreateAccountConfig(cfgFile,()=>createInitialData(randomUUID));
}
function normalizeAccountSettings(){
 let changed=false;
 for(const a of cfg.accounts){
  const normalized=normalizeQuota(a.quota||{});
  if(JSON.stringify(a.quota)!==JSON.stringify(normalized)){a.quota=normalized;changed=true;}
  if(typeof a.preloadPinned!=='boolean'){a.preloadPinned=false;changed=true;}
  if(shouldResetQuota(a.quota)){a.quota.status='available';a.quota.markedDate=null;changed=true;}
 }
 if(changed)save();
}
function refreshQuotaStates(){
 let changed=false;
 for(const a of cfg.accounts){const q=a.quota||(a.quota={status:'available',markedDate:null,resetHour:0});if(shouldResetQuota(q)){q.status='available';q.markedDate=null;changed=true;}}
 if(changed){save();tell('accounts:changed',cfg);}
}
function loadAssetAliases(){
 const file=path.join(app.getPath('userData'),'asset-aliases.json');
 try{
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(getDefaultAssetAliases(),null,2),'utf8');
  configureAssetAliases(JSON.parse(fs.readFileSync(file,'utf8')));
 }catch(err){log(err);configureAssetAliases(getDefaultAssetAliases());}
}
function update(mutator){
 const before=structuredClone(cfg);
 try{mutator();save();return cfg}
 catch(err){cfg=before;throw err}
}
function tell(channel,payload){if(win&&!win.isDestroyed())win.webContents.send(channel,payload)}
function account(id){const a=cfg.accounts.find(x=>x.id===id);if(!a)throw new Error('账号不存在');return a;}
function segment(id){const s=cfg.segments.find(x=>x.id===id);if(!s)throw new Error('段落不存在');return s;}
function getDownloadPath(filename){
  const folder=path.join(app.getPath('downloads'),'豆包创作舱-公开版');fs.mkdirSync(folder,{recursive:true});
  const safe=path.basename(filename).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,180)||'download';
  const ext=path.extname(safe), stem=path.basename(safe,ext);
  let candidate=path.join(folder,safe),i=1;
  while(fs.existsSync(candidate))candidate=path.join(folder,`${stem} (${i++})${ext}`);
  return candidate;
}
const pendingVideoChecks=new Map();
const manualVideoSessions=new Map(); // account -> {webContentsId, confirmedAt}
const lastPreparedByAccount=new Map();
async function ensureVideoMode(id=activeId){
  const wc=views.get(id)?.view?.webContents;
  if(!wc||wc.isDestroyed())return {ready:false,message:'豆包网页尚未加载'};
  if(pendingVideoChecks.has(id))return pendingVideoChecks.get(id);
  const task=videoMode.ensure(wc).then(result=>{
    const manual=manualVideoSessions.get(id);
    if(!result.ready&&manual&&manual.webContentsId===wc.id&&Date.now()-manual.confirmedAt<30*60*1000){
      // User explicitly confirmed on this account/page; never label settings as automatically verified.
      result={...result,ready:true,video:true,manual:true,settingsVerified:false,
        message:'已人工确认当前账号的视频模式；模型、16:9和15秒仍需你在豆包网页检查'};
    }
    tell('video:status',{accountId:id,...result});
    return result;
  }).finally(()=>pendingVideoChecks.delete(id));
  pendingVideoChecks.set(id,task);return task;
}
function scheduleVideoCheck(id){
  setTimeout(()=>{if(views.has(id))ensureVideoMode(id).catch(e=>tell('video:status',{accountId:id,ready:false,message:e.message}))},900);
}
function setupSession(sess,accountId){
  if(sess.__creativeHubReady)return;
  sess.__creativeHubReady=true;
  sess.on('will-download',(_ev,item)=>{
    activeDownloads.set(accountId,(activeDownloads.get(accountId)||0)+1);
    tell('perf:changed',performanceState());
    item.once('done',()=>{const n=(activeDownloads.get(accountId)||1)-1;if(n>0)activeDownloads.set(accountId,n);else activeDownloads.delete(accountId);tell('perf:changed',performanceState());});
    try{
      const selected=workspace.current();
      const prepared=lastPreparedByAccount.get(accountId);
      const usable=prepared&&Date.now()-prepared.at<6*60*60*1000;
      const preparedEp=usable?workspace.data.episodes.find(e=>e.id===prepared.episodeId):null;
      const preparedSeg=preparedEp?.segments.find(x=>x.id===prepared.segmentId);
      const ep=preparedSeg?preparedEp:(activeId===accountId?selected.ep:null);
      const seg=preparedSeg?preparedSeg:(activeId===accountId?selected.seg:null);
      const acc=cfg.accounts.find(a=>a.id===accountId);
      const context={project:workspace.data.title,episode:ep?.title||'未分集',segment:seg?.title||'未分段',episodeNumber:ep?.number?`第${ep.number}集`:'未分集',segmentNumber:seg?`第${seg.n}段`:'未分段',episodeId:ep?.id||'',segmentId:seg?.id||'',account:acc?.name||'未知账号'};
      const record=downloads.begin(item.getFilename(),context,item.getURL());
      item.setSavePath(record.path);
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
        if(state==='completed'&&record.type==='视频'&&(!record.episodeId||!record.segmentId)){
          tell('app:toast','视频已下载，但未能可靠确认所属段落；没有自动绑定尾帧，请从右侧选择最终成片');
        }
        if(state==='completed'&&record.type==='视频'&&record.episodeId&&record.segmentId){
          tailframes?.setFinal(workspace.data,record.episodeId,record.segmentId,record.path,{auto:true})
            .then(info=>{tell('tail:updated',{episodeId:record.episodeId,segmentId:record.segmentId,...info});
              if(info.message)tell('app:toast',info.message);})
            .catch(e=>log(e));
        }
      });
    }catch(e){log(e);tell('app:toast','下载保存目录异常：'+e.message)}
  });
  sess.setPermissionRequestHandler((_contents,permission,callback)=>callback(false));
}
function configureView(id){
  const sess=session.fromPartition(`persist:doubao_${id}`);
  setupSession(sess,id);
  const view=new WebContentsView({webPreferences:{session:sess,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:false}});
  const wc=view.webContents;
  wc.setWindowOpenHandler(({url})=>{
    try{if(new URL(url).protocol!=='https:')return {action:'deny'}}catch{return {action:'deny'}}
    return {action:'allow',overrideBrowserWindowOptions:{width:1100,height:760,autoHideMenuBar:true,webPreferences:{session:sess,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}}};
  });
  wc.on('did-start-loading',()=>{importEnginesByAccount.get(id)?.cancel();tell('web:status',{id,status:'正在加载…'})});
  wc.on('did-navigate-in-page',()=>{manualVideoSessions.delete(id);importEnginesByAccount.get(id)?.cancel();scheduleVideoCheck(id)});
  wc.on('did-stop-loading',()=>{manualVideoSessions.delete(id);tell('web:status',{id,status:'网页已加载'});scheduleVideoCheck(id)});
  wc.on('did-fail-load',(_e,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3)tell('web:status',{id,status:`加载失败 (${code})：${description}`,url})});
  wc.on('render-process-gone',(_e,details)=>{tell('web:status',{id,status:`网页进程退出：${details.reason}，可点刷新重试`})});
  wc.loadURL(DOUBAO_URL).catch(e=>{log(e);tell('web:status',{id,status:'豆包打开失败：'+e.message})});
  return {view,lastUsed:now()};
}
function waitForPageReady(wc,timeoutMs=20000){
 return new Promise(resolve=>{
  if(!wc||wc.isDestroyed())return resolve(false);
  if(!wc.isLoading())return resolve(true);
  let settled=false;
  const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);wc.removeListener('did-stop-loading',onReady);wc.removeListener('destroyed',onDestroyed);resolve(ok)};
  const onReady=()=>finish(true),onDestroyed=()=>finish(false);
  const timer=setTimeout(()=>finish(false),timeoutMs);
  wc.once('did-stop-loading',onReady);wc.once('destroyed',onDestroyed);
 });
}
async function preloadPinnedAccounts(){
 if(preloadRunning||!cfg)return;
 preloadRunning=true;
 try{
  const max=performanceState().limit,reserveActive=activeId?0:1;
  const candidates=cfg.accounts.filter(a=>a.preloadPinned&&a.id!==activeId&&!views.has(a.id));
  for(const a of candidates){
   if(views.size>=Math.max(0,max-reserveActive))break;
   const slot=configureView(a.id);views.set(a.id,slot);
   tell('web:status',{id:a.id,status:'后台预加载中…'});
   const ready=await waitForPageReady(slot.view.webContents,20000);
   tell('web:status',{id:a.id,status:ready?'后台网页已加载；切换后仍需确认登录和创作页':'后台网页加载超时，可切换账号后手动刷新'});
   tell('perf:changed',performanceState());
   await new Promise(resolve=>setTimeout(resolve,2500));
  }
 }catch(err){log(err)}
 finally{
  preloadRunning=false;tell('perf:changed',performanceState());
  const availableLimit=Math.max(0,performanceState().limit-(activeId?0:1));
  if(views.size<availableLimit&&cfg.accounts.some(a=>a.preloadPinned&&a.id!==activeId&&!views.has(a.id)))setTimeout(()=>preloadPinnedAccounts().catch(log),500);
 }
}
function performanceState(){
  const mode=LIVE_LIMITS[cfg?.performanceMode]?cfg.performanceMode:'balanced';
  const metrics=app.getAppMetrics()||[];
  const memoryKb=metrics.reduce((sum,m)=>sum+Math.max(0,m.memory?.workingSetSize||0),0);
  return {
    mode,limit:LIVE_LIMITS[mode],importLimit:IMPORT_LIMITS[mode],liveViews:views.size,memoryMb:Math.round(memoryKb/1024),
    protectedCount:protectedAccounts.size,
    activeProtected:protectedAccounts.has(activeId),
    activeDownloads:[...activeDownloads.values()].reduce((a,b)=>a+b,0),
    overLimit:Math.max(0,views.size-LIVE_LIMITS[mode])
  };
}
async function prune(){
  if(pruneInProgress)return performanceState();
  const max=performanceState().limit;
  if(views.size<=max){tell('app:toast','当前浏览器数量已符合性能模式');return performanceState();}
  pruneInProgress=true;
  try{
    const candidates=[...views.entries()]
      .filter(([id])=>id!==activeId&&!protectedAccounts.has(id)&&!activeDownloads.has(id)&&!activeImportAccounts.has(id)&&!reservedImportSlots.has(id)&&!cfg.accounts.find(a=>a.id===id)?.preloadPinned)
      .sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
    const needed=views.size-max;
    const pick=candidates.slice(0,needed);
    if(!pick.length){
      tell('app:toast','后台网页受到保护，或存在正在下载的任务，没有可以安全候选的页面');
      return performanceState();
    }
    const names=pick.map(([id])=>cfg.accounts.find(a=>a.id===id)?.name||'未知账号');
    const {response}=await dialog.showMessageBox(win,{
      type:'warning',
      buttons:['取消，保留所有网页','我已确认这些账号没有生成任务，释放网页'],
      defaultId:0,cancelId:0,
      title:'释放后台浏览器（需确认）',
      message:'将释放 '+pick.length+' 个后台豆包网页',
      detail:'候选账号：'+names.join('、')+
        '\n\n官方豆包任务的后台生成状态无法可靠自动识别。请确保这些账号没有正在生成、上传或编辑中的内容。关闭后账号登录 Cookie 和本地剧集不会删除，但未保存的网页状态可能丢失。'
    });
    if(response!==1)return performanceState();
    let count=0;
    for(const [id,slot] of pick){
      if(id===activeId||protectedAccounts.has(id)||activeDownloads.has(id)||!views.has(id))continue;
      try{win.contentView.removeChildView(slot.view);slot.view.webContents.close()}catch(e){log(e)}
      views.delete(id);count++;
    }
    tell('app:toast','已释放 '+count+' 个后台浏览器，账号登录信息保留');
    return performanceState();
  }finally{
    pruneInProgress=false;
    tell('perf:changed',performanceState());
  }
}
function selectAccount(id){
  account(id);
  if(activeId&&id!==activeId){mentionRunner?.cancel();/* Independent one-click imports keep running in their bound WebContentsView. */}
  if(activeId&&views.has(activeId)){
    const old=views.get(activeId);
    try{win.contentView.removeChildView(old.view)}catch(e){log(e)}
  }
  activeId=id;
  let slot=views.get(id);
  if(!slot){slot=configureView(id);views.set(id,slot)}
  slot.lastUsed=now();
  if(!overlayShown&&licenseClient?.status().valid)win.contentView.addChildView(slot.view);
  if(lastBounds)slot.view.setBounds(lastBounds);
  cfg.activeAccountId=id;save();
  tell('perf:changed',performanceState());
  preloadPinnedAccounts().catch(log);
  tell('web:selected',{id});
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
let updateStatus={state:'unconfigured',message:'尚未配置安装包自动更新源。请在社群·公告中查看最新版本下载入口。'};
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
  ipcMain.handle('license:status',()=>licenseClient.status());
  ipcMain.handle('license:trial',async()=>{const r=await licenseClient.startTrial();if(r.valid&&activeId)selectAccount(activeId);tell('license:updated',r);return r;});
  ipcMain.handle('license:activate',async(_event,code)=>{const r=await licenseClient.activate(code);if(r.valid&&activeId)selectAccount(activeId);tell('license:updated',r);return r;});
  ipcMain.handle('license:refresh',()=>licenseClient.refresh());
  ipcMain.handle('license:apply',(_event,contact,reason)=>licenseClient.applyFreeLicense(contact,reason));
  ipcMain.handle('license:applicationStatus',async()=>{
    const result=await licenseClient.applicationStatus();
    if(result.application?.status==='approved'){
      const state=await licenseClient.refresh();tell('license:updated',state);
      return {...result,license:state};
    }
    return result;
  });
  ipcMain.handle('license:products',()=>licenseClient.getProducts());
  ipcMain.handle('license:createOrder',(_event,productId,paymentMethod)=>licenseClient.createOrder(productId,paymentMethod));
  ipcMain.handle('license:orders',()=>licenseClient.getOrders());
  ipcMain.handle('license:reconcileOrder',async(_event,orderId)=>{
    const result=await licenseClient.reconcileOrder(orderId);
    if(result.status==='paid'){
      const state=await licenseClient.refresh();tell('license:updated',state);
      return {...result,license:state};
    }
    return result;
  });
  ipcMain.handle('license:orderStatus',async(_event,orderId)=>{
    const order=await licenseClient.orderStatus(orderId);
    if(order.status==='paid'){
      const state=await licenseClient.refresh();tell('license:updated',state);
      return {...order,license:state};
    }
    return order;
  });
  ipcMain.handle('license:openAdmin',async()=>{
    const target=licenseClient?.adminUrl?.();
    if(!target)throw Error('运营管理中心尚未配置授权服务');
    const parsed=new URL(target);
    if(parsed.origin!==licenseClient.service||(app.isPackaged&&parsed.protocol!=='https:'))throw Error('后台地址不安全，已阻止打开');
    await shell.openExternal(target);return true;
  });
  ipcMain.handle('license:openCheckout',async(_event,url)=>{
    let target=safeHttps(url);
    if(!target&&licenseClient.localTestMode){
      try{const local=new URL(String(url));if(local.origin===licenseClient.service&&local.protocol==='http:'&&local.hostname==='127.0.0.1'&&local.port==='8788')target=local.toString()}catch{}
    }
    if(!target||new URL(target).origin!==licenseClient.service)throw Error('支付地址无效，已阻止打开');
    await shell.openExternal(target);return true;
  });
  ipcMain.handle('cfg:get',()=>cfg);
  ipcMain.handle('api:get',()=>apiSettings.snapshot());
  ipcMain.handle('api:save',(_event,settings)=>apiSettings.save(settings));
  ipcMain.handle('api:check',()=>apiSettings.check());
  guardedHandle('api:chat',(_event,prompt)=>apiSettings.chat(prompt));
  ipcMain.handle('perf:get',()=>performanceState());
  ipcMain.handle('perf:set',async(_e,mode)=>{
    if(!Object.prototype.hasOwnProperty.call(LIVE_LIMITS,mode))throw Error('无效的性能模式');
    update(()=>{cfg.performanceMode=mode});
    const result=performanceState();tell('perf:changed',result);preloadPinnedAccounts().catch(log);return result;
  });
  ipcMain.handle('perf:cleanup',()=>prune());
  ipcMain.handle('perf:protect',(_e,enabled)=>{
    if(!activeId||!cfg.accounts.some(a=>a.id===activeId))throw Error('尚未选中账号');
    if(enabled===true)protectedAccounts.add(activeId);
    else protectedAccounts.delete(activeId);
    const result=performanceState();tell('perf:changed',result);return result;
  });
  ipcMain.handle('notice:preferences',()=>{
    const file=path.join(app.getPath('userData'),'notice-preferences.json');
    try{
      const saved=JSON.parse(fs.readFileSync(file,'utf8'));
      return {startupEnabled:saved.startupEnabled!==false};
    }catch{return {startupEnabled:true}}
  });
  ipcMain.handle('notice:savePreferences',async(_event,prefs)=>{
    if(typeof prefs?.startupEnabled!=='boolean')throw Error('社群弹窗设置无效');
    const file=path.join(app.getPath('userData'),'notice-preferences.json');
    const tmp=file+'.tmp';
    await fs.promises.writeFile(tmp,JSON.stringify({startupEnabled:prefs.startupEnabled}),'utf8');
    await fs.promises.rename(tmp,file);
    return {startupEnabled:prefs.startupEnabled};
  });
  ipcMain.handle('notice:get',()=>noticeService.snapshot());
  ipcMain.handle('tutorial:image',async(_event,id)=>{
    const slide=noticeService.snapshot().tutorial.slides.find(s=>s.id===id);
    if(!slide)throw Error('教程步骤不存在');
    return tutorialMedia.read(slide);
  });
  ipcMain.handle('notice:refresh',async()=>{
    const result=await noticeService.refresh();tell('notice:updated',result);return result;
  });
  ipcMain.handle('notice:open',async(_e,target)=>{
    const data=noticeService.snapshot();
    const href=target==='download'?data.release.url:target==='qq'?data.community.qqUrl:target==='qr'?data.community.qrUrl:'';
    if(!safeHttps(href))throw Error('此入口尚未配置有效的 HTTPS 链接');
    // Only on explicit user action. Never auto-download, run an EXE, or evaluate cloud text.
    await shell.openExternal(href);return true;
  });

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
  ipcMain.on('web:bounds',(_e,b)=>{
    if(!win||win.isDestroyed())return;
    const size=win.getContentBounds(); const v=safeBounds(b,{width:size.width,height:size.height});
    if(v){lastBounds=v;const slot=views.get(activeId);if(slot)slot.view.setBounds(v)}
  });
  ipcMain.on('overlay:set',(_e,shown)=>{
    if(!win||win.isDestroyed())return;const slot=views.get(activeId);
    if(!slot||overlayShown===!!shown)return;
    try{if(shown)win.contentView.removeChildView(slot.view);else if(licenseClient?.status().valid){win.contentView.addChildView(slot.view);if(lastBounds)slot.view.setBounds(lastBounds)}overlayShown=!!shown}catch(e){log(e)}
  });
  ipcMain.handle('nav:action',(_e,a)=>{if(!['reload','back','forward','home','zoomIn','zoomOut'].includes(a))throw Error('不支持此操作');navigate(a)});
  guardedHandle('group:add',(_e,name)=>update(()=>{cfg.groups.push({id:randomUUID(),name:normalizeName(name),edgeProfile:'Default'})}));
  guardedHandle('group:rename',(_e,id,name)=>update(()=>{const g=cfg.groups.find(g=>g.id===id);if(!g)throw Error('分组不存在');g.name=normalizeName(name)}));
  ipcMain.handle('group:edge',(_e,id,p)=>update(()=>{const g=cfg.groups.find(g=>g.id===id);if(!g||!allowedEdgeProfile(p))throw Error('Edge 配置无效');g.edgeProfile=p}));
  guardedHandle('account:add',(_e,groupId,name)=>update(()=>{if(!cfg.groups.some(g=>g.id===groupId))throw Error('分组不存在');cfg.accounts.push({id:randomUUID(),groupId,name:normalizeName(name),done:0,quota:{status:'available',markedDate:null,resetHour:0},preloadPinned:false})}));
  guardedHandle('account:rename',(_e,id,name)=>update(()=>{account(id).name=normalizeName(name)}));
  guardedHandle('account:quotaToggle',(_e,id)=>update(()=>{const a=account(id),q=a.quota||(a.quota={status:'available',markedDate:null,resetHour:0}),cycle=quotaCycleDate(Date.now(),q.resetHour);if(q.status==='exhausted'&&q.markedDate===cycle){q.status='available';q.markedDate=null;}else{q.status='exhausted';q.markedDate=cycle;}}));
  guardedHandle('account:quotaResetHour',(_e,id,value)=>update(()=>{const a=account(id),q=a.quota||(a.quota={status:'available',markedDate:null,resetHour:0});const hour=Number(value);if(!Number.isInteger(hour)||hour<0||hour>23)throw Error('每日额度刷新时间必须是 0–23 点');q.resetHour=hour;if(q.status==='exhausted'&&q.markedDate!==quotaCycleDate(Date.now(),hour)){q.status='available';q.markedDate=null;}}));
  guardedHandle('account:preloadToggle',(_e,id)=>{const result=update(()=>{const a=account(id);a.preloadPinned=!a.preloadPinned});if(account(id).preloadPinned)preloadPinnedAccounts();return result});
  guardedHandle('account:remove',(_e,id)=>{
    if(!cfg.accounts.some(a=>a.id===id))throw Error('账号不存在');
    if(cfg.accounts.length<=1)throw Error('至少保留一个账号');
    if(activeImportAccounts.has(id))throw Error('此账号正在上传或绑定图片，请先取消该账号任务再删除');
    if(activeId===id)selectAccount(cfg.accounts.find(a=>a.id!==id).id);
    importEnginesByAccount.delete(id);importStatesByAccount.delete(id);
    const slot=views.get(id);if(slot){try{win.contentView.removeChildView(slot.view);slot.view.webContents.close()}catch(e){log(e)}views.delete(id)}
    manualVideoSessions.delete(id);
    protectedAccounts.delete(id);
    // Deliberately does not delete a profile directory or its cookies; accidental removal is reversible via backup.
    return update(()=>{cfg.accounts=cfg.accounts.filter(a=>a.id!==id)});
  });
  ipcMain.handle('account:progress',(_e,id,delta)=>update(()=>{const a=account(id);a.done=Math.max(0,Math.min(999,a.done+Number(delta||0)))}));
  guardedHandle('account:reset',()=>update(()=>cfg.accounts.forEach(a=>a.done=0)));
  ipcMain.handle('target:set',(_e,n)=>update(()=>{cfg.target=Math.max(1,Math.min(99,Math.round(Number(n)||2)))}));
  guardedHandle('segment:add',(_e,name)=>update(()=>{const s={id:randomUUID(),name:normalizeName(name),prompt:'',images:[]};cfg.segments.push(s);cfg.activeSegmentId=s.id}));
  ipcMain.handle('segment:select',(_e,id)=>update(()=>{segment(id);cfg.activeSegmentId=id}));
  guardedHandle('segment:rename',(_e,id,name)=>update(()=>{segment(id).name=normalizeName(name)}));
  guardedHandle('segment:delete',(_e,id)=>update(()=>{if(cfg.segments.length<=1)throw Error('至少保留一个段落');cfg.segments=cfg.segments.filter(x=>x.id!==id);if(cfg.activeSegmentId===id)cfg.activeSegmentId=cfg.segments[0].id}));
  ipcMain.on('segment:prompt',(_e,id,prompt)=>{
    if(!licenseClient?.status().valid)return;
    try{if(typeof prompt==='string'&&prompt.length<1000000)update(()=>{segment(id).prompt=prompt})}catch(e){log(e)}
  });
  guardedHandle('images:choose',async (_e,id)=>{
    segment(id);
    const res=await dialog.showOpenDialog(win,{title:'添加漫剧参考图',properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp','bmp','gif']}]});
    if(res.canceled)return cfg;
    return update(()=>{const s=segment(id);s.images=[...new Set([...s.images,...res.filePaths.filter(f=>exists(f)&&allowedImage(f))])].slice(0,200)});
  });
  guardedHandle('images:drop',(_e,id,paths)=>update(()=>{const s=segment(id);if(!Array.isArray(paths))throw Error('文件路径格式错误');s.images=[...new Set([...s.images,...paths.slice(0,100).filter(f=>typeof f==='string'&&exists(f)&&allowedImage(f))])].slice(0,200)}));
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
  ipcMain.handle('video:ensure',()=>ensureVideoMode());
  ipcMain.handle('video:manualConfirm',async()=>{
    const id=activeId,wc=views.get(id)?.view?.webContents;
    if(!wc||wc.isDestroyed()||!/^https:\/\/(?:www\.)?doubao\.com\//i.test(wc.getURL()))throw Error('请先打开豆包官网');
    const {response}=await dialog.showMessageBox(win,{
      type:'warning',buttons:['取消','我已在豆包网页确认视频生成模式'],defaultId:0,cancelId:0,
      title:'人工确认视频模式',
      message:'请检查豆包输入框已切换成「视频生成」',
      detail:'并确认使用 Seedance 2.0 Fast、16:9、15秒。此操作只解除当前账号此页的模式识别限制，有效30分钟或页面重新加载之前；不会替代参考图/附件上传的真实性验证，也不会自动发送视频生成任务。'
    });
    if(response!==1)return {cancelled:true};
    manualVideoSessions.set(id,{webContentsId:wc.id,confirmedAt:Date.now()});
    const result=await ensureVideoMode(id);
    tell('video:status',{accountId:id,...result});
    return result;
  });
  guardedHandle('ws:delete',async(_e,eid,sid)=>{
    const r=await workspace.deleteItem(eid,sid||null);
    tell('app:toast','已移入回收站；原始视频和参考图未删除');
    return r;
  });
  guardedHandle('ws:restoreItem',(_e,id)=>workspace.restoreItem(id));
  ipcMain.handle('ws:state',()=>workspace.snapshot());
  guardedHandle('ws:importText',async(_e,text,filename)=>workspace.addText(text,filename));
  guardedHandle('ws:importFiles',async()=>{
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
  guardedHandle('ws:importOld',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'只读导入旧素材工作台 project/workbench.json',properties:['openFile'],filters:[{name:'旧版项目 JSON',extensions:['json']}]});
    if(pick.canceled)return {cancelled:true};
    const file=pick.filePaths[0];if((await fs.promises.stat(file)).size>50_000_000)throw Error('旧项目文件超过50MB');
    return workspace.mergeLegacy(JSON.parse(await fs.promises.readFile(file,'utf8')));
  });
  guardedHandle('ws:folder',async()=>{
    const pick=await dialog.showOpenDialog(win,{title:'选择参考图总目录（会递归扫描子目录）',properties:['openDirectory']});
    if(pick.canceled)return {cancelled:true};
    return workspace.setFolder(pick.filePaths[0]);
  });
  guardedHandle('ws:rescan',()=>workspace.assetIndex.scan(workspace.data.assetFolder));
  ipcMain.handle('ws:select',async(_e,eid,sid)=>{await workspace.select(eid,sid);return workspace.snapshot()});
  guardedHandle('ws:editText',async(_e,eid,sid,text)=>{await workspace.editText(eid,sid,text);return workspace.snapshot()});
  guardedHandle('ws:editCodes',async(_e,eid,sid,codes)=>{await workspace.editCodes(eid,sid,codes);return workspace.snapshot()});
  guardedHandle('ws:status',async(_e,eid,sid,status,aid)=>{await workspace.setStatus(eid,sid,status,aid);return workspace.snapshot()});
  guardedHandle('ws:linkVideo',async(_e,eid,sid,downloadId)=>{
    const record=downloads.history.find(x=>x.id===downloadId);
    if(!record||record.status!=='completed'||record.type!=='视频')throw Error('请选择已经下载完成的视频记录');
    if(!exists(record.path))throw Error('下载的视频文件已不存在，请刷新下载记录');
    await workspace.linkVideo(eid,sid,record.path,activeId,record.id);return workspace.snapshot();
  });
  guardedHandle('ws:undoLinkVideo',async(_e,eid,sid)=>{await workspace.undoLinkVideo(eid,sid);return workspace.snapshot()});
  guardedHandle('ws:hidden',(_e,eid,sid,hidden)=>workspace.setHidden(eid,sid,hidden));
  guardedHandle('ws:locked',(_e,eid,sid,locked)=>workspace.setLocked(eid,sid,locked));
  ipcMain.handle('ws:showHidden',(_e,show)=>workspace.setShowHidden(show));
  guardedHandle('ws:hideDone',()=>workspace.hideDone());
  ipcMain.handle('ws:treeEpisode',(_e,eid)=>workspace.setTreeEpisode(eid));
  guardedHandle('ws:selection',async(_e,eid,sid,paths)=>{await workspace.setSelection(eid,sid,paths);return workspace.snapshot()});
  guardedHandle('ws:version',async(_e,code,p)=>{await workspace.chooseVersion(code,p);return workspace.snapshot()});
  ipcMain.handle('ws:layout',async(_e,patch)=>{await workspace.setLayout(patch);return true});
  guardedHandle('ws:rename',async(_e,name)=>{if(typeof name!=='string'||!name.trim())throw Error('项目名称不能为空');workspace.data.title=name.trim().slice(0,150);await workspace.save();return workspace.snapshot()});
  ipcMain.handle('tail:status',(_e,eid,sid)=>{
    workspace.findSegment(eid,sid);
    const r=tailframes.status(workspace.data,eid,sid);
    return {...r,file:r.file?{...r.file,url:pathToFileURL(r.file.path).toString()}:null};
  });
  guardedHandle('tail:choose',async(_e,eid,sid)=>{
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
  guardedHandle('voice:add',async(_e,code,label)=>{
    const pick=await dialog.showOpenDialog(win,{title:'为参考图 '+code+' 绑定人物音频（WAV/MP3，单段2-15秒）',properties:['openFile','multiSelections'],filters:[{name:'人物声音',extensions:['wav','mp3']}]});
    if(pick.canceled||!pick.filePaths.length)return {cancelled:true,...voiceBindings.snapshot()};
    return voiceBindings.add(code,pick.filePaths,label||'人物声音');
  });
  guardedHandle('voice:default',(_e,code,id)=>voiceBindings.setDefault(code,id));
  guardedHandle('voice:remove',(_e,code,id)=>voiceBindings.remove(code,id));
  ipcMain.handle('voice:play',async(_e,code,id)=>{
    const file=(voiceBindings.data.bindings[code]||[]).find(x=>x.id===id)?.path;
    if(!file||!exists(file))throw Error('声音文件已失效');
    const result=await shell.openPath(file);if(result)throw Error(result);return true;
  });
  ipcMain.handle('import:draft',(_e,eid,sid,prompt)=>getAccountImportEngine(activeId).getDraft({episodeId:eid,segmentId:sid,previewText:prompt}));
  guardedHandle('import:sync-text',(_e,eid,sid,replaceDraft)=>getAccountImportEngine(activeId).syncText({episodeId:eid,segmentId:sid,replaceDraft:!!replaceDraft}));
  ipcMain.handle('import:preflight',async(_e,eid,sid)=>{
    const id=activeId;
    const mode=await ensureVideoMode(id);
    if(!mode.ready)return {ready:false,blocked:true,error:mode.message||'视频生成模式未就绪',videoCheck:mode};
    const plan=await getAccountImportEngine(id).getPlan({episodeId:eid,segmentId:sid});
    return {...plan,videoCheck:{ready:mode.ready,settingsVerified:mode.settingsVerified,message:mode.message}};
  });
  guardedHandle('import:execute',async(_e,eid,sid,options)=>{
    const accountId=activeId;
    if(!accountId)throw Error('尚未选择账号');
    if(reservedImportSlots.has(accountId))throw Error('当前账号已有一个导入任务；请等待或取消，防止同一聊天输入框被同时改写');
    const maxImports=IMPORT_LIMITS[cfg?.performanceMode]||IMPORT_LIMITS.balanced;
    if(reservedImportSlots.size>=maxImports)throw Error(`当前性能模式最多允许 ${maxImports} 个账号并行导入，请等待任务完成或调整性能模式`);
    reservedImportSlots.add(accountId);
    try{
      const mode=await ensureVideoMode(accountId);
      if(!mode.ready)throw Error(mode.message||'视频生成模式未就绪');
      const result=await getAccountImportEngine(accountId).execute({episodeId:eid,segmentId:sid,replaceDraft:!!options?.replaceDraft,attemptNative:options?.attemptNative!==false});
      if(result?.state==='done')lastPreparedByAccount.set(accountId,{episodeId:eid,segmentId:sid,at:Date.now()});
      return result;
    }finally{reservedImportSlots.delete(accountId)}
  });
  ipcMain.handle('import:cancel',()=>importEnginesByAccount.get(activeId)?.cancel()||false);
  ipcMain.handle('import:confirm',(_e,approved)=>importEnginesByAccount.get(activeId)?.confirm(approved===true)||false);
  ipcMain.handle('tasks:list',()=>{
    const combined=new Map((taskJournal?.list()||[]).map(x=>[x.accountId,x]));
    for(const [accountId,state] of importStatesByAccount)combined.set(accountId,{...state,accountId,active:activeImportAccounts.has(accountId)});
    return [...combined.values()];
  });
  ipcMain.handle('tasks:cancel',(_e,id)=>{
    account(id);return importEnginesByAccount.get(id)?.cancel()||false;
  });
  ipcMain.handle('tasks:confirm',(_e,id,approved)=>{
    account(id);return importEnginesByAccount.get(id)?.confirm(approved===true)||false;
  });
  ipcMain.handle('mention:preflight',(_e,eid,sid)=>mentionRunner.preflight({episodeId:eid,segmentId:sid}));
  guardedHandle('mention:execute',(_e,eid,sid)=>mentionRunner.execute({episodeId:eid,segmentId:sid}));
  ipcMain.handle('mention:cancel',()=>mentionRunner.cancel());
  ipcMain.handle('ws:images',async(_e,eid,sid)=>{
    const records=workspace.resolveSegment(eid,sid);
    // Only previews become low-resolution cached images; paths for dragging and upload remain originals.
    return Promise.all(records.map(async(r,i)=>{
      const source=r.file?.path;
      const originalUrl=source&&exists(source)?pathToFileURL(source).toString():null;
      let thumbUrl=originalUrl;
      if(originalUrl&&i<18&&thumbnailCache){
        const cached=await thumbnailCache.get(source);
        if(cached&&cached!==source&&exists(cached))thumbUrl=pathToFileURL(cached).toString();
      }
      return {
        code:r.code,
        file:r.file?{...r.file,url:originalUrl,thumbUrl}:null,
        versions:r.versions.map(v=>({...v,url:exists(v.path)?pathToFileURL(v.path).toString():null})),
        missing:r.missing||!!(r.file&&!exists(r.file.path)),duplicate:r.duplicate,manual:!!r.manual
      };
    }));
  });
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
    const folder=path.join(app.getPath('downloads'),'豆包创作舱-公开版','本段上传素材');
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
  guardedHandle('ws:restore',async()=>{
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
    const response=await dialog.showSaveDialog(win,{title:'备份工作台清单（不含登录凭据）',defaultPath:'独独AI工作台-备份.json',filters:[{name:'JSON',extensions:['json']}]});
    if(response.canceled||!response.filePath)return false;
    fs.writeFileSync(response.filePath,JSON.stringify(cfg,null,2));return true;
  });
}
// Share the single browser context contract between legacy and primary import paths.
function getAccountImportEngine(id){
  account(id);
  if(importEnginesByAccount.has(id))return importEnginesByAccount.get(id);
  const engine=createImportEngine({
    getActive:()=>{
      const slot=views.get(id);
      return slot&&!slot.view.webContents.isDestroyed()?{accountId:id,webContents:slot.view.webContents}:null;
    },
    getSegment:(eid,sid)=>workspace.findSegment(eid,sid).seg,
    resolveRows:(eid,sid)=>workspace.resolveSegment(eid,sid),
    getChosenPaths:()=>workspace.data.chosenPaths,
    // A user's selected tab/segment is UI state, not an import cancellation signal.
    getCurrentSelection:()=>null,
    getTailForSegment:(eid,sid)=>tailframes.status(workspace.data,eid,sid),
    getVoiceForImages:items=>voiceBindings.plan(items),
    isForeground:accountId=>activeId===accountId&&!overlayShown,
    canStart:()=>reservedImportSlots.has(id)&&reservedImportSlots.size<=(IMPORT_LIMITS[cfg?.performanceMode]||IMPORT_LIMITS.balanced),
    onStart:ctx=>{activeImportAccounts.add(ctx.accountId);tell('perf:changed',performanceState())},
    onFinish:ctx=>{activeImportAccounts.delete(ctx.accountId);tell('perf:changed',performanceState())},
    notify:info=>{
      importStatesByAccount.set(id,{...info,accountId:id,at:Date.now()});
      taskJournal?.update({...info,accountId:id});
      tell('import:status',{...info,accountId:id});
      tell('task:updated',{...info,accountId:id});
    }
  });
  importEnginesByAccount.set(id,engine);
  return engine;
}
function activeDoubaoContext(){
  const slot=views.get(activeId);
  return slot?{accountId:activeId,webContents:slot.view.webContents}:null;
}
function createWindow(){
  win=new BrowserWindow({width:1550,height:920,minWidth:990,minHeight:610,backgroundColor:'#0c1321',title:'独独AI工作台',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('render-process-gone',(_e,details)=>log('UI renderer exited: '+details.reason));
  win.loadFile(path.join(__dirname,'index.html')).catch(log);
  win.on('resize',()=>tell('app:layout',{}));
  win.on('close',event=>{if(!isQuitting){event.preventDefault();win.hide();tell('app:toast','工作台已最小化到系统托盘；浏览器会话继续保留')}});
  win.on('closed',()=>{for(const slot of views.values())try{slot.view.webContents.close()}catch{}views.clear();win=null});
}
function showMainWindow(){
 if(!win||win.isDestroyed())createWindow();
 if(win.isMinimized())win.restore();win.show();win.focus();
}
function createTray(){
 if(tray)return;
 const iconPath=path.join(app.getAppPath(),'assets','branding','dudu-icon-256.png');
 const icon=nativeImage.createFromPath(iconPath);
 if(icon.isEmpty())throw Error('系统托盘图标不存在：'+iconPath);
 tray=new Tray(icon.resize({width:16,height:16}));tray.setToolTip('独独AI工作台');
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'显示独独AI工作台',click:showMainWindow},
  {label:'隐藏到系统托盘',click:()=>{if(win)win.hide()}},
  {type:'separator'},
  {label:'退出独独AI工作台',click:()=>{isQuitting=true;app.quit()}}
 ]));
 tray.on('click',showMainWindow);tray.on('double-click',showMainWindow);
}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>showMainWindow());
  process.on('uncaughtException',log);process.on('unhandledRejection',log);
  app.whenReady().then(async()=>{cfg=readCfg();normalizeAccountSettings();loadAssetAliases();licenseClient=new LicenseClient({root:app.getPath('userData'),safeStorage,packaged:app.isPackaged,native:(()=>{try{return require('../native/dudu_core.node')}catch{return null}})(),config:loadLicenseRuntimeConfig()});noticeService=new NoticeService({url:publicConfig.noticeUrl,cachePath:path.join(app.getPath('userData'),'notice-cache.json'),version:app.getVersion()});tutorialMedia=new TutorialMedia({dir:path.join(app.getPath('userData'),'tutorial-cache'),appPath:app.isPackaged?process.resourcesPath:app.getAppPath(),manifestUrl:publicConfig.noticeUrl});apiSettings=new ApiSettings({file:path.join(app.getPath('userData'),'api-settings.json'),safeStorage});thumbnailCache=new ThumbnailCache({root:path.join(app.getPath('userData'),'preview-cache'),createThumbnail:async(source,size)=>{const img=await nativeImage.createThumbnailFromPath(source,size);return img.isEmpty()?null:img.toPNG()}});workspace=new WorkspaceStore(path.join(app.getPath('userData'),'workspace.json'));await workspace.load(cfg);taskJournal=new TaskJournal(path.join(app.getPath('userData'),'import-task-history.json'));downloads=new DownloadManager(app.getPath('userData'),path.join(app.getPath('downloads'),'豆包创作舱-公开版','下载成品'));await downloads.load();tailframes=await new TailFrameStore(app.getPath('userData'),{tools:binaries({packaged:app.isPackaged,resourcesPath:process.resourcesPath})}).load();voiceBindings=await new VoiceBindingsStore(path.join(app.getPath('userData'),'voice-bindings.json'),{ffprobe:binaries({packaged:app.isPackaged,resourcesPath:process.resourcesPath}).ffprobe}).load();mentionRunner=createMentionRunner({getActive:activeDoubaoContext,resolveRows:(eid,sid,prompt)=>{const seg=workspace.findSegment(eid,sid).seg;const codes=detectSegmentCodes(prompt).codes;return workspace.assetIndex.resolve(codes.length?codes:seg.codes,workspace.data.chosenPaths,seg.manualPaths);},getCodes:(eid,sid)=>workspace.findSegment(eid,sid).seg.codes,getChosenPaths:()=>workspace.data.chosenPaths,notify:info=>tell('mention:status',info)});/* One import engine per account, created lazily by getAccountImportEngine; no shared global running flag. */registerHandlers();initializeUpdater();createWindow();createTray();preloadPinnedAccounts().catch(log);quotaTimer=setInterval(()=>{try{refreshQuotaStates()}catch(e){log(e)}},60*1000);quotaTimer.unref?.();setTimeout(()=>licenseClient.refresh().then(v=>tell('license:updated',v)).catch(log),1700);setTimeout(()=>thumbnailCache.prune().catch(log),18000);setTimeout(()=>tutorialMedia.prune().catch(log),19000);noticeTimer=setInterval(()=>noticeService.refresh().then(v=>tell('notice:updated',v)).catch(log),5*60*1000);noticeTimer.unref?.();setTimeout(()=>noticeService.refresh().then(v=>tell('notice:updated',v)).catch(log),1300)}).catch(err=>{log(err);dialog.showErrorBox('独独AI工作台启动失败',String(err.stack||err));app.quit()});
  app.on('before-quit',()=>{isQuitting=true;if(quotaTimer)clearInterval(quotaTimer);if(noticeTimer)clearInterval(noticeTimer)});
  app.on('window-all-closed',()=>{if(isQuitting)app.quit()});
}
