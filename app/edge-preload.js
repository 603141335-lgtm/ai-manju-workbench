'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('edgeLite',{
  get:()=>ipcRenderer.invoke('edge-lite:get'),
  launch:id=>ipcRenderer.invoke('edge-lite:launch',id),
  submit:v=>ipcRenderer.invoke('edge-lite:submit',v),
  undo:id=>ipcRenderer.invoke('edge-lite:undo',id),
  reset:id=>ipcRenderer.invoke('edge-lite:reset',id)
});
