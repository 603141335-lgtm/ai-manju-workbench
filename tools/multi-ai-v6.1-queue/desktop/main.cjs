const {app,BrowserWindow,shell}=require('electron');
const path=require('node:path');
let running,win;
const official=new Set(['chatgpt.com','gemini.google.com','claude.ai','www.doubao.com']);
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
if(!app.requestSingleInstanceLock())app.quit();
app.whenReady().then(async()=>{
 const {startServer}=await import('../src/server.mjs');
 running=await startServer({root:path.join(app.getPath('userData'),'queue-data'),port:0});
 win=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:640,title:'Multi-AI Chat Desktop v6.1 任务中心',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:'&&official.has(u.hostname))shell.openExternal(u.toString())}catch{}return {action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(running.url+'/'))event.preventDefault()});
 await win.loadURL(running.url);
}).catch(err=>{console.error('任务中心启动失败',err);app.quit()});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(running){running.server.close();running.engine.close();running=undefined}});
