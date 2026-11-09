const fs=require('fs'),vm=require('vm');
const path=require('path');
const db={
 'aac9:index':['chatgpt-A','gemini-A','doubao-A','deepseek-C'],
 'aac9:bindings':{'101':'chatgpt-A','102':'gemini-A','103':'doubao-A','104':'deepseek-C'}
};
const pages={101:{id:101,url:'https://chatgpt.com/c/a'},102:{id:102,url:'https://gemini.google.com/app'},103:{id:103,url:'https://www.doubao.com/chat/'},104:{id:104,url:'https://chat.deepseek.com/'}};
const listeners=[],messages=[];
const evt=()=>({listeners:[],addListener(fn){this.listeners.push(fn)}});
const runtimeMessage=evt(), storageChanged=evt();
const clone=x=>x===undefined?undefined:structuredClone(x);
const chrome={
 action:{onClicked:evt()},
 runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:runtimeMessage,onStartup:evt(),onInstalled:evt()},
 storage:{local:{async get(keys){if(typeof keys==='string')keys=[keys];if(!Array.isArray(keys))keys=Object.keys(keys||{});const out={};for(const k of keys)if(k in db)out[k]=clone(db[k]);return out;},async set(patch){const changes={};for(const [k,v] of Object.entries(patch)){changes[k]={oldValue:clone(db[k]),newValue:clone(v)};db[k]=clone(v);}queueMicrotask(()=>storageChanged.listeners.forEach(fn=>fn(changes,'local')));}},onChanged:storageChanged},
 tabs:{onRemoved:evt(),onUpdated:evt(),async query(){return Object.values(pages)},async get(id){if(!pages[id])throw Error('missing tab');return clone(pages[id]);},async update(id,patch){Object.assign(pages[id],patch);return clone(pages[id]);},async sendMessage(id,msg){messages.push({id,msg});if(msg.type==='AAC9_PING')return {ok:true,hasEditor:true};if(msg.type==='AAC9_RUN'||msg.type==='AAC9_RECOVER'||msg.type==='AAC9_BIND')return {ok:true};return {ok:true};}},
 windows:{async update(){}},downloads:{async download(){return 1}}
};
for(const i of db['aac9:index']){
 const status=i==='deepseek-C'?'queued':'running';
 db[`aac9:instance:${i}:run`]={id:'run-'+i,instanceId:i,platform:i.split('-')[0],tabId:Number(Object.keys(db['aac9:bindings']).find(k=>db['aac9:bindings'][k]===i)),status,phase:status==='queued'?'queued':'waiting',queuedPhase:'ready',nextEpisode:2,queuedAt:Date.now()-1000,configSnapshot:{}};
 db[`aac9:instance:${i}:control`]={runId:'run-'+i,desired:status==='queued'?'queued':'running'};
 db[`aac9:instance:${i}:cfg`]={selectors:{}};
}
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8'),{chrome,URL,Date,console,Promise,Math,Number,Object,String,Array,Set,Map,RegExp,Error});
(async()=>{
 await chrome.storage.local.set({'aac9:instance:chatgpt-A:run':{...db['aac9:instance:chatgpt-A:run'],status:'finished',phase:'ready'}});
 await new Promise(r=>setTimeout(r,100));
 const run=db['aac9:instance:deepseek-C:run'];
 if(run.status!=='running'||db['aac9:instance:deepseek-C:control'].desired!=='running')throw Error('queued task was not promoted: '+JSON.stringify(run));
 if(!messages.some(x=>x.id===104&&x.msg.type==='AAC9_RUN'))throw Error('runner was not triggered for queued task');
 const live=db['aac9:index'].filter(i=>db[`aac9:instance:${i}:run`].status==='running'&&db[`aac9:instance:${i}:control`].desired==='running').length;
 if(live!==3)throw Error('expected exactly 3 active tasks, got '+live);
 console.log('PASS: background queue promotes next task after a slot is released and keeps active tasks at 3.');
})().catch(e=>{console.error(e);process.exit(1)});
