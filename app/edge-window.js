'use strict';
const {BrowserWindow,ipcMain,app,dialog,shell}=require('electron');
const {createWatcher}=require('./edge-downloads');
const path=require('path');
const edge=require('./edge-profiles');
const ledger=require('./edge-ledger');
let accountWindow;
function setupEdgeWindow(parent){
  const dataFile=path.join(app.getPath('userData'),'edge-lite-records.json');
  const settingsFile=path.join(app.getPath('userData'),'edge-lite-window.json');
  const fs=require('fs');
  let tasks=ledger.loadLedger(dataFile);
  const save=()=>ledger.saveLedger(dataFile,tasks);
  const dlConfig=path.join(app.getPath('userData'),'edge-lite-download-config.json');
  let config={source:app.getPath('downloads'),root:path.join(app.getPath('videos'),'AI漫剧成片')};
  try{config={...config,...JSON.parse(fs.readFileSync(dlConfig,'utf8'))};}catch{}
  fs.mkdirSync(config.root,{recursive:true});
  let watcher;
  let notices=[];
  const note=e=>{notices.unshift({...e,at:new Date().toISOString()});notices=notices.slice(0,25);};
  function monitor(){
    if(watcher)watcher.stop();
    watcher=createWatcher({source:config.source,notify:note});
    watcher.start();
  }
  monitor();
  const summary=()=>({profiles:edge.discoverProfiles(),records:tasks,downloads:{...config,...watcher.get(),notices}});
  ipcMain.handle('edge-lite:get',()=>summary());
  ipcMain.handle('edge-lite:launch',async(_,id)=>{
    const known=edge.discoverProfiles().find(x=>x.id===id);
    if(!known)throw Error('该 Edge 用户不存在，请刷新列表');
    await edge.launchProfile(id);
    return summary();
  });
  ipcMain.handle('edge-lite:submit',(_,value)=>{
    const profiles=edge.discoverProfiles();
    if(!profiles.some(p=>p.id===value?.profileId))throw Error('请先选择有效的 Edge 用户');
    const item=ledger.makeRecord(value);tasks.push(item);save();return summary();
  });
  ipcMain.handle('edge-lite:undo',(_,id)=>{
    const target=tasks.find(t=>t.id===id);
    if(!target||target.status!=='submitted')throw Error('无法撤销');
    target.status='cancelled';save();return summary();
  });
  ipcMain.handle('edge-lite:reset',(_,profileId)=>{
    if(!edge.discoverProfiles().some(p=>p.id===profileId))throw Error('无效用户');
    for(const t of tasks)if(t.profileId===profileId&&t.status==='submitted')t.status='reset';
    save();return summary();
  });
  ipcMain.handle('edge-lite:choose-downloads',async()=>{
    const result=await dialog.showOpenDialog(accountWindow,{properties:['openDirectory'],title:'选择 Edge 插件实际保存视频的目录'});
    if(!result.canceled&&result.filePaths[0]){config.source=result.filePaths[0];fs.writeFileSync(dlConfig,JSON.stringify(config));monitor();}
    return summary();
  });
  ipcMain.handle('edge-lite:choose-archive',async()=>{
    const result=await dialog.showOpenDialog(accountWindow,{properties:['openDirectory','createDirectory'],title:'选择视频归档总目录'});
    if(!result.canceled&&result.filePaths[0]){config.root=result.filePaths[0];fs.writeFileSync(dlConfig,JSON.stringify(config));}
    return summary();
  });
  ipcMain.handle('edge-lite:arm-download',(_,id)=>{
    const t=tasks.find(x=>x.id===id&&x.status==='submitted');
    if(!t)throw Error('请先登记一次生成并选择对应段落');
    watcher.arm(t,config.root);return summary();
  });
  ipcMain.handle('edge-lite:cancel-download',()=>{watcher.disarm();return summary();});
  ipcMain.handle('edge-lite:open-archive',async()=>{await shell.openPath(config.root);return summary();});
  let bounds={width:380,height:740};
  try{
    const saved=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
    if(saved.width>=300&&saved.height>=360)bounds={...bounds,...saved};
  }catch{}
  accountWindow=new BrowserWindow({
    ...bounds,minWidth:300,minHeight:360,title:'漫剧 · Edge账号小窗',
    alwaysOnTop:false,autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'edge-preload.js'),
      contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  accountWindow.loadFile(path.join(__dirname,'edge-window.html'));
  accountWindow.on('close',()=>{
    try{fs.writeFileSync(settingsFile,JSON.stringify(accountWindow.getBounds()));}catch{}
  });
  accountWindow.on('closed',()=>{watcher.stop();accountWindow=null;});
  return accountWindow;
}
module.exports={setupEdgeWindow};
