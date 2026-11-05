'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('edgeLite',{
  get:()=>ipcRenderer.invoke('edge-lite:get'),
  selectProfile:id=>ipcRenderer.invoke('edge-lite:select-profile',id),
  copyPairToken:id=>ipcRenderer.invoke('edge-lite:copy-pair-token',id),
  sendPrompt:id=>ipcRenderer.invoke('edge-lite:send-prompt',id),
  copyPrompt:()=>ipcRenderer.invoke('edge-lite:copy-prompt'),
  copyAndOpen:id=>ipcRenderer.invoke('edge-lite:copy-and-open',id),
  launch:id=>ipcRenderer.invoke('edge-lite:launch',id),
  submit:v=>ipcRenderer.invoke('edge-lite:submit',v),
  undo:id=>ipcRenderer.invoke('edge-lite:undo',id),
  reset:id=>ipcRenderer.invoke('edge-lite:reset',id),
  chooseDownloads:()=>ipcRenderer.invoke('edge-lite:choose-downloads'),
  chooseArchive:()=>ipcRenderer.invoke('edge-lite:choose-archive'),
  armDownload:id=>ipcRenderer.invoke('edge-lite:arm-download',id),
  cancelDownload:()=>ipcRenderer.invoke('edge-lite:cancel-download'),
  openArchive:()=>ipcRenderer.invoke('edge-lite:open-archive')
});
