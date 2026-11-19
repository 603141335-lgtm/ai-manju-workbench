'use strict';
/* Only task metadata, never prompts, media, file paths or Doubao credentials. */
const fs=require('node:fs'),path=require('node:path');
const TERMINAL=new Set(['done','error','cancelled','interrupted']);
class TaskJournal{
 constructor(file){this.file=file;this.entries=[];this.timer=null;this.writeQueue=Promise.resolve();this.lastError='';this.load()}
 load(){
  try{
   const body=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(!Array.isArray(body))return;
   this.entries=body.filter(x=>x&&typeof x.accountId==='string').slice(-100).map(x=>({
    ...x,state:TERMINAL.has(x.state)?x.state:'interrupted',
    message:TERMINAL.has(x.state)?String(x.message||'').slice(0,240):'上次退出时任务尚未确认完成；请检查豆包网页后手动继续，软件不会重复上传'
   }));
  }catch{}
 }
 update(info){
  if(!info?.accountId)return;
  const entry={accountId:String(info.accountId).slice(0,90),
   episodeId:String(info.episodeId||'').slice(0,90),segmentId:String(info.segmentId||'').slice(0,90),
   state:String(info.state||'idle').slice(0,30),
   taskId:String(info.taskId||'').slice(0,100),phase:String(info.phase||info.state||'idle').slice(0,30),
   requiresAttention:!!info.requiresAttention,
   message:String(info.message||'').slice(0,240),at:Date.now()};
  this.entries=this.entries.filter(x=>x.accountId!==entry.accountId);
  this.entries.push(entry);this.entries=this.entries.slice(-100);
  if(!this.timer)this.timer=setTimeout(()=>this.flush().catch(e=>{this.lastError=e.message}),500);
 }
 list(){return this.entries.map(x=>({...x}))}
 async flush(){
  if(this.timer){clearTimeout(this.timer);this.timer=null}
  const content=JSON.stringify(this.entries);
  this.writeQueue=this.writeQueue.catch(()=>{}).then(async()=>{
   await fs.promises.mkdir(path.dirname(this.file),{recursive:true});
   const tmp=this.file+'.tmp';
   await fs.promises.writeFile(tmp,content,'utf8');
   await fs.promises.rename(tmp,this.file);
   this.lastError='';
  });
  return this.writeQueue.catch(e=>{this.lastError=e.message;throw e});
 }
}
module.exports={TaskJournal};
