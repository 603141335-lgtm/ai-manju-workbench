'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const api={
 getState:()=>ipcRenderer.invoke('workspace:state'),
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
api.showEdgeAccounts=()=>ipcRenderer.invoke('edge-lite:show');
api.prepareEdgeSegment=v=>ipcRenderer.invoke('edge-lite:prepare-segment',v);
contextBridge.exposeInMainWorld('manju',api);
