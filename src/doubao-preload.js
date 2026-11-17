'use strict';
const {ipcRenderer}=require('electron');
const PAGE_HOSTS=new Set(['www.doubao.com','www.dola.com']);
window.addEventListener('message',event=>{
  const message=event.data;
  if(event.source!==window||!message||message.type!=='__DF_nativeDownloadRequest')return;
  let page;try{page=new URL(window.location.href)}catch{return}
  if(event.origin!==page.origin||page.protocol!=='https:'||!PAGE_HOSTS.has(page.hostname))return;
  const requestId=String(message.requestId||('df_'+Date.now())).slice(0,120);
  ipcRenderer.invoke('extension:download',{url:message.url,filename:message.filename,requestId})
    .then(result=>window.postMessage({type:'__DF_nativeDownloadResult',requestId,success:result?.success===true,error:result?.error||null},page.origin))
    .catch(error=>window.postMessage({type:'__DF_nativeDownloadResult',requestId,success:false,error:String(error?.message||error)},page.origin));
});
