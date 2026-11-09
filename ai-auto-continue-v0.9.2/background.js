'use strict';
// v0.9.2: dynamic task slots and a background three-task queue scheduler.
const DASHBOARD=chrome.runtime.getURL('dashboard.html');
const HOME={chatgpt:'https://chatgpt.com/',gemini:'https://gemini.google.com/app',doubao:'https://www.doubao.com/chat/',deepseek:'https://chat.deepseek.com/'};
const INDEX='aac9:index', BINDINGS='aac9:bindings';
const SLOT=/^(chatgpt|gemini|doubao|deepseek)-[A-Z]$/;
const isAllowed=(p,url)=>{try{const h=new URL(url).hostname;return ({chatgpt:['chatgpt.com','chat.openai.com'],gemini:['gemini.google.com'],doubao:['doubao.com','www.doubao.com'],deepseek:['chat.deepseek.com']}[p]||[]).includes(h);}catch{return false;}};
const slotPlatform=s=>SLOT.test(s||'')?s.split('-')[0]:null;

chrome.action.onClicked.addListener(async()=>{
  const tabs=await chrome.tabs.query({url:DASHBOARD});
  if(tabs.length){await chrome.tabs.update(tabs[0].id,{active:true});await chrome.windows.update(tabs[0].windowId,{focused:true});}
  else await chrome.tabs.create({url:DASHBOARD});
});


const MAX_CONCURRENT=3;
let queuePumpPromise=null;
async function pumpQueuedRuns(){
 if(queuePumpPromise)return queuePumpPromise;
 queuePumpPromise=(async()=>{
  const meta=await chrome.storage.local.get([INDEX,BINDINGS]);
  const instances=(meta[INDEX]||[]).filter(slotPlatform);
  const bindings=meta[BINDINGS]||{};
  const stateKeys=instances.flatMap(i=>[`aac9:instance:${i}:run`,`aac9:instance:${i}:control`,`aac9:instance:${i}:cfg`]);
  const state=await chrome.storage.local.get(stateKeys);
  const active=instances.filter(i=>state[`aac9:instance:${i}:run`]?.status==='running'&&state[`aac9:instance:${i}:control`]?.desired==='running').length;
  let slots=Math.max(0,MAX_CONCURRENT-active);
  if(!slots)return;
  const queued=instances.map(i=>({i,run:state[`aac9:instance:${i}:run`],control:state[`aac9:instance:${i}:control`],cfg:state[`aac9:instance:${i}:cfg`]}))
    .filter(x=>x.run?.status==='queued'&&x.control?.desired==='queued')
    .sort((a,b)=>(a.run.queuedAt||a.run.updatedAt||0)-(b.run.queuedAt||b.run.updatedAt||0));
  for(const item of queued){
   if(slots<=0)break;
   const {i,run,cfg}=item;
   const tabId=Number(Object.keys(bindings).find(id=>bindings[id]===i));
   if(!Number.isInteger(tabId))continue;
   let tab;try{tab=await chrome.tabs.get(tabId);}catch{continue;}
   const platform=slotPlatform(i);
   if(!tab||!isAllowed(platform,tab.url||tab.pendingUrl||''))continue;
   const ping=await chrome.tabs.sendMessage(tabId,{type:'AAC9_PING',instanceId:i,run:{selectors:cfg?.selectors||{}}}).catch(()=>null);
   if(!ping?.ok||!ping?.hasEditor)continue;
   const phase=run.queuedPhase||'ready';
   const next={...run,status:'running',phase:run.needsNewChat?'navigating':phase,queuedAt:null,queuedPhase:null,reason:'',updatedAt:Date.now()};
   await chrome.storage.local.set({[`aac9:instance:${i}:run`]:next,[`aac9:instance:${i}:control`]:{runId:run.id,desired:'running',updatedAt:Date.now()}});
   if(run.needsNewChat){
    await chrome.storage.local.set({[`aac9:instance:${i}:run`]:{...next,needsNewChat:false}});
    await chrome.tabs.update(tabId,{url:HOME[platform]}).catch(()=>{});
   }else if(['waiting','submitting','manual_send','awaiting_images'].includes(phase)){
    const recovered=await chrome.tabs.sendMessage(tabId,{type:'AAC9_RECOVER',instanceId:i}).catch(()=>null);
    if(!recovered?.ok){
     await chrome.storage.local.set({[`aac9:instance:${i}:run`]:{...next,status:'error',reason:recovered?.error||'等待队列恢复失败，请检查原聊天窗口。',updatedAt:Date.now()},[`aac9:instance:${i}:control`]:{runId:run.id,desired:'paused',updatedAt:Date.now()}});
     continue;
    }
   }else await chrome.tabs.sendMessage(tabId,{type:'AAC9_RUN',instanceId:i}).catch(()=>{});
   slots--;
  }
 })().catch(e=>console.warn('[AAC9] background queue',e)).finally(()=>{queuePumpPromise=null;});
 return queuePumpPromise;
}

async function resolveBinding(tabId, url){
  const store=await chrome.storage.local.get(BINDINGS), b=store[BINDINGS]||{};
  const instanceId=b[String(tabId)];
  if(!slotPlatform(instanceId) || !isAllowed(slotPlatform(instanceId),url||'')) return null;
  return instanceId;
}
async function imageForRunner(id){
 if(typeof id!=='string'||!/^img-[\w-]+$/.test(id))throw Error('无效图片标识');
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('AAC8_ImageBlobs',1);req.onsuccess=()=>resolve(req.result);req.onupgradeneeded=()=>req.result.createObjectStore('images',{keyPath:'id'});req.onerror=()=>reject(req.error);});
 const record=await new Promise((resolve,reject)=>{const txn=db.transaction('images','readonly');const req=txn.objectStore('images').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);txn.oncomplete=()=>db.close();});
 if(!record?.blob)throw Error('找不到关联图片；请检查本地数据库');
 const bytes=new Uint8Array(await record.blob.arrayBuffer());if(bytes.length>4*1024*1024)throw Error('图片超过4MB限制');
 let str='';for(let i=0;i<bytes.length;i+=16384)str+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return {ok:true,base64:btoa(str),name:record.name,mime:record.mime};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(msg?.type==='AAC9_PUMP_QUEUE'){
    pumpQueuedRuns().then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:String(e)}));return true;
  }
  if(msg?.type==='AAC9_HELLO'){
    const tid=sender.tab?.id;
    if(tid==null){reply({tabId:null,instanceId:null});return false;}
    resolveBinding(tid,sender.tab.url).then(instanceId=>reply({tabId:tid,instanceId})).catch(()=>reply({tabId:tid,instanceId:null}));return true;
  }
  if(msg?.type==='AAC9_GET_IMAGE'){
    const tid=sender.tab?.id;
    if(tid==null){reply({ok:false,error:'无效网页'});return false;}
    resolveBinding(tid,sender.tab.url).then(instanceId=>{
      if(!instanceId||instanceId!==msg.instanceId)throw Error('图片请求不属于当前绑定任务');
      return imageForRunner(msg.id);
    }).then(reply).catch(e=>reply({ok:false,error:String(e.message||e)}));return true;
  }
  if(msg?.type==='AAC9_NEW_CHAT'){
    const tid=sender.tab?.id;
    resolveBinding(tid,sender.tab?.url).then(async inst=>{
      if(!inst||inst!==msg.instanceId||slotPlatform(inst)!==msg.platform)throw Error('聊天切换绑定不匹配');
      await chrome.tabs.update(tid,{url:HOME[msg.platform]});reply({ok:true});
    }).catch(e=>reply({ok:false,error:String(e.message||e)}));return true;
  }
  if(msg?.type==='AAC9_DOWNLOAD'){
    const name=String(msg.filename||'AI自动续聊/内容.txt').replace(/[\\:*?"<>|\x00-\x1f]/g,'_');
    const uri='data:text/plain;charset=utf-8,'+encodeURIComponent(String(msg.content||''));
    chrome.downloads.download({url:uri,filename:name,saveAs:false,conflictAction:'uniquify'}).then(id=>reply({ok:true,id})).catch(e=>reply({ok:false,error:String(e)}));return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(Object.keys(changes).some(k=>k.endsWith(':run')||k.endsWith(':control')||k==='aac9:index'||k==='aac9:bindings'))pumpQueuedRuns();
});
if(chrome.runtime.onStartup)chrome.runtime.onStartup.addListener(()=>pumpQueuedRuns());
if(chrome.runtime.onInstalled)chrome.runtime.onInstalled.addListener(()=>pumpQueuedRuns());
if(chrome.tabs.onUpdated)chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{if(changeInfo.status==='complete')pumpQueuedRuns();});

chrome.tabs.onRemoved.addListener(async tabId=>{
  try{
    const d=await chrome.storage.local.get(BINDINGS),binding=d[BINDINGS]||{},instanceId=binding[String(tabId)];
    if(!slotPlatform(instanceId))return;
    delete binding[String(tabId)];
    const runKey=`aac9:instance:${instanceId}:run`,controlKey=`aac9:instance:${instanceId}:control`;
    const state=await chrome.storage.local.get([runKey,controlKey]);const r=state[runKey];
    const changes={[BINDINGS]:binding};
    if(r?.tabId===tabId && r.status!=='finished'){
      changes[runKey]={...r,status:'paused',reason:'绑定的聊天标签页已关闭；请在控制台重新绑定后继续。',updatedAt:Date.now()};
      changes[controlKey]={runId:r.id,desired:'paused',updatedAt:Date.now()};
    }
    await chrome.storage.local.set(changes);
  }catch(e){console.warn('[AAC9] tab closed',e);}
});
