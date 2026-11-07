'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const api={
 getState:()=>ipcRenderer.invoke('workspace:state'),
 getUpdateStatus:()=>ipcRenderer.invoke('workspace:update-status'),
 checkUpdates:()=>ipcRenderer.invoke('workspace:check-updates'),
 installUpdate:()=>ipcRenderer.invoke('workspace:install-update'),
 onUpdateStatus:cb=>ipcRenderer.on('workspace:update-status',(_event,value)=>cb(value)),
 chooseFolder:()=>ipcRenderer.invoke('workspace:choose-folder'),
 rescan:()=>ipcRenderer.invoke('workspace:rescan'),
 importText:s=>ipcRenderer.invoke('workspace:import-text',s),
 importFiles:()=>ipcRenderer.invoke('workspace:import-files'),
 removeEpisode:id=>ipcRenderer.invoke('workspace:remove-episode',id),
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
