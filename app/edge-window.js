'use strict';
const {BrowserWindow,ipcMain,app}=require('electron');
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
  const summary=()=>({profiles:edge.discoverProfiles(),records:tasks});
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
  let bounds={width:350,height:600};
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
  accountWindow.on('closed',()=>{accountWindow=null;});
  return accountWindow;
}
module.exports={setupEdgeWindow};
