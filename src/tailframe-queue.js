'use strict';
/** Serialize FFmpeg jobs; isolate failures and never lose completed downloads. */
class TailFrameQueue{
 constructor({tailframes,workspace,notify=()=>{},onRecord=()=>{}}={}){
  this.tailframes=tailframes;this.workspace=workspace;this.notify=notify;this.onRecord=onRecord;
  this.items=[];this.processing=false;this.queuedIds=new Set();
 }
 enqueue(record){
  if(!record||record.type!=='视频'||!record.episodeId||!record.segmentId||record.status!=='completed')return false;
  if(this.queuedIds.has(record.id))return false;
  this.queuedIds.add(record.id);this.items.push(record);this.drain().catch(e=>this.notify({state:'error',message:e.message}));
  return true;
 }
 async drain(){
  if(this.processing)return;this.processing=true;
  try{
   while(this.items.length){
    const record=this.items.shift();
    try{
     this.onRecord(record.id,'extracting');
     this.notify({state:'extracting',recordId:record.id,episodeId:record.episodeId,segmentId:record.segmentId,message:'正在提取 '+record.file+' 的尾帧'});
     let result=await this.tailframes.setFinal(this.workspace.data,record.episodeId,record.segmentId,record.path,{auto:true});
     if(result.state==='busy'){
      await new Promise(r=>setTimeout(r,900));
      result=await this.tailframes.setFinal(this.workspace.data,record.episodeId,record.segmentId,record.path,{auto:true});
     }
     const status=['ready','candidate'].includes(result.state)?result.state:'error';
     this.onRecord(record.id,status,result.message);
     this.notify({state:status,recordId:record.id,episodeId:record.episodeId,segmentId:record.segmentId,...result});
    }catch(e){
     this.onRecord(record.id,'error',e.message);
     this.notify({state:'error',recordId:record.id,episodeId:record.episodeId,segmentId:record.segmentId,message:'尾帧提取失败：'+e.message});
    }finally{this.queuedIds.delete(record.id)}
   }
  }finally{this.processing=false}
 }
}
module.exports={TailFrameQueue};
