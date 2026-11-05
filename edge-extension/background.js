'use strict';
const ENDPOINT='http://127.0.0.1:18741';
async function request(path,body){
 const {token}=await chrome.storage.local.get('token');
 if(!/^[a-f0-9]{48}$/.test(token||''))return {ok:false,error:'请先在扩展里粘贴当前Edge用户的连接密钥'};
 try{
  const r=await fetch(ENDPOINT+path,{method:body?'POST':'GET',
   headers:{'X-Manju-Token':token,...(body?{'Content-Type':'application/json'}:{})},
   body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const j=await r.json();
  return r.ok?j:{ok:false,error:j.error||'连接失败'};
 }catch{return {ok:false,error:'连接不到本机工作台，请先打开Windows工作台'};}
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 (async()=>{
  if(msg?.type==='test')return request('/poll');
  if(msg?.type==='poll'){
   if(!sender?.tab?.id||!sender.tab.active)return {ok:true,job:null};
   const focused=await chrome.windows.get(sender.tab.windowId).catch(()=>null);
   if(!focused?.focused)return {ok:true,job:null};
   const active=await chrome.tabs.query({active:true,windowId:sender.tab.windowId});
   if(!active.some(tab=>tab.id===sender.tab.id))return {ok:true,job:null};
   return request('/poll');
  }
  if(msg?.type==='ack'){
   return request('/ack',{id:msg.id,status:msg.status,detail:msg.detail||''});
  }
  return {ok:false,error:'未知请求'};
 })().then(sendResponse,e=>sendResponse({ok:false,error:String(e.message||e)}));
 return true;
});
