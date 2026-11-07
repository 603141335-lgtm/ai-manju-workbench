const {app,BrowserWindow,shell,Tray,Menu,nativeImage}=require('electron');
const path=require('node:path');
let running,win,tray,quitting=false,shutdownStarted=false;
const official=new Set(['chatgpt.com','gemini.google.com','claude.ai','www.doubao.com']);
const trayImage=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAzUlEQVR4nO1XwRGDQAhcGSswHSXlmHK0nKSj2ELyyNxMPAVB78BH9qcs7IqICgSjkYLX/vUuIfIcL6zOaqCUsMYIeYlztWmLUNsEcQEvE4tb4A0CfK8+IWmGd6DVkB5DNzu+3aciXEDRgbwgd87KVRmQkvOYhas24IG/AdGANMF5zMJVG+CSuYIWbkIDxGxC4Pt6PvcMeGDXKragyiq24NAq9sCux9CCrXzVDBw1IYEA+bu9FpLmeWbAswu/WsQFPMQXBmqbWKsd/nMajg+FcFjcSdhN+wAAAABJRU5ErkJggg==');
function showWindow(){if(!win)return;win.show();if(win.isMinimized())win.restore();win.focus()}
app.on('second-instance',showWindow);
if(!app.requestSingleInstanceLock())app.quit();
app.whenReady().then(async()=>{
 const {startServer}=await import('../src/server.mjs');
 running=await startServer({root:path.join(app.getPath('userData'),'queue-data'),port:0});
 win=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:640,title:'Multi-AI Chat Desktop v6.1 任务中心',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:'&&official.has(u.hostname))shell.openExternal(u.toString())}catch{}return {action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(running.url+'/'))event.preventDefault()});
 win.on('close',(event)=>{if(!quitting){event.preventDefault();win.hide()}});
 tray=new Tray(trayImage);
 tray.setToolTip('Multi-AI 后台任务中心：关闭窗口后仍在运行');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'打开任务中心',click:showWindow},{type:'separator'},{label:'退出程序（停止后台任务）',click:()=>{quitting=true;app.quit()}}]));
 tray.on('double-click',showWindow);
 await win.loadURL(running.url);
}).catch(err=>{console.error('任务中心启动失败',err);quitting=true;app.quit()});
app.on('window-all-closed',()=>{}); // Tray mode intentionally continues running.
app.on('before-quit',event=>{
 if(!shutdownStarted && running){
   event.preventDefault();
   shutdownStarted=true;quitting=true;
   running.close().catch(err=>console.error('停止后台任务失败',err)).finally(()=>{running=null;app.quit()});
 }
});
