'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const api={
 getState:()=>ipcRenderer.invoke('workspace:state'),
 chooseFolder:()=>ipcRenderer.invoke('workspace:choose-folder'),
 rescan:()=>ipcRenderer.invoke('workspace:rescan'),
 importText:(s,groupId=null)=>ipcRenderer.invoke('workspace:import-text',{text:s,groupId}),
 importFiles:()=>ipcRenderer.invoke('workspace:import-files'),
 removeEpisode:id=>ipcRenderer.invoke('workspace:remove-episode',id),
 createGroup:payload=>ipcRenderer.invoke('workspace:create-group',payload),
 renameGroup:payload=>ipcRenderer.invoke('workspace:rename-group',payload),
 removeGroup:id=>ipcRenderer.invoke('workspace:remove-group',id),
 createDocument:payload=>ipcRenderer.invoke('workspace:create-document',payload),
 renameDocument:payload=>ipcRenderer.invoke('workspace:rename-document',payload),
 moveDocument:payload=>ipcRenderer.invoke('workspace:move-document',payload),
 rename:s=>ipcRenderer.invoke('workspace:rename',s),
 editSegment:payload=>ipcRenderer.invoke('workspace:edit-segment',payload),
 chooseVersion:payload=>ipcRenderer.invoke('workspace:choose-version',payload),
 copy:s=>ipcRenderer.invoke('workspace:copy',s),
 backup:()=>ipcRenderer.invoke('workspace:backup'),
 restore:()=>ipcRenderer.invoke('workspace:restore'),
 exportEpisode:id=>ipcRenderer.invoke('workspace:export-episode',id),
 dragTester:()=>ipcRenderer.invoke('workspace:drag-tester'),
 // Guaranteed direct invoke in a user-initiated dragstart handler.
 startNativeDrag:payload=>ipcRenderer.send('workspace:native-drag-start',payload),
 onDragError:cb=>ipcRenderer.on('workspace:drag-error',(_e,msg)=>cb(msg))
};
contextBridge.exposeInMainWorld('manju',api);
