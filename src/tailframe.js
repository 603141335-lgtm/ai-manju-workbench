'use strict';
/** V0.9 continuity service: finalized clip of N -> immutable frame for N+1.
 * Uses a separate versioned file; never rewrites original episode/segment text or source video.
 */
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const VIDEO_EXT=new Set(['.mp4','.mov','.mkv','.webm','.avi']);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function findPredecessor(data,episodeId,segmentId){
 const ep=data.episodes.find(e=>e.id===episodeId);if(!ep)return null;
 const index=ep.segments.findIndex(s=>s.id===segmentId);
 const current=ep.segments[index];if(!current)return null;
  if(Object.prototype.hasOwnProperty.call(current,'previousSegmentId')){
   const target=ep.segments.find(s=>s.id===current.previousSegmentId);
   return target?{ep,seg:target}:null;
  }
  return index>0?{ep,seg:ep.segments[index-1]}:null;
}
function safeSegment(s){return /^[\w-]{1,160}$/.test(String(s))?String(s):createHash('sha256').update(String(s)).digest('hex').slice(0,32)}
function validVideo(p){try{const st=fs.statSync(p);return path.isAbsolute(p)&&VIDEO_EXT.has(path.extname(p).toLowerCase())&&st.isFile()&&st.size>200;}catch{return false}}
function execBin(bin,args,{timeout=60000}={}){
 return new Promise((resolve,reject)=>{
  let stdout='',stderr='';let finished=false;
  const p=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{p.kill();finish(new Error('FFmpeg执行超时'))},timeout);
  const finish=(err,value)=>{if(finished)return;finished=true;clearTimeout(timer);err?reject(err):resolve(value)};
  p.stdout.on('data',b=>{stdout+=b.toString().slice(0,100000);if(stdout.length>200000)stdout=stdout.slice(-200000)});
  p.stderr.on('data',b=>{stderr+=b.toString().slice(0,100000);if(stderr.length>200000)stderr=stderr.slice(-200000)});
  p.on('error',e=>finish(new Error(`无法启动 ${path.basename(bin)}：${e.message}`)));
  p.on('close',code=>finish(code===0?null:new Error(`${path.basename(bin)}退出(${code}): ${stderr.slice(-450)}`),{stdout,stderr}));
 });
}
function binaries({packaged=false,resourcesPath='',env=process.env}={}){
 const local=path.join(resourcesPath||'','bin');
 const bundledFfmpeg=path.join(local,process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
 const bundledProbe=path.join(local,process.platform==='win32'?'ffprobe.exe':'ffprobe');
 if(packaged&&fs.existsSync(bundledFfmpeg)&&fs.existsSync(bundledProbe))return {ffmpeg:bundledFfmpeg,ffprobe:bundledProbe};
 const userPath=env.FFMPEG_PATH;
 return {ffmpeg:userPath&&fs.existsSync(userPath)?userPath:'ffmpeg',ffprobe:env.FFPROBE_PATH&&fs.existsSync(env.FFPROBE_PATH)?env.FFPROBE_PATH:'ffprobe'};
}
async function extractLastValidFrame(video,dest,tools=binaries()){
 if(!validVideo(video))throw Error('成品视频不存在、格式不支持或文件异常');
 const probe=await execBin(tools.ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',video]);
 const duration=Number(probe.stdout.trim());if(!Number.isFinite(duration)||duration<=.08)throw Error('无法获取有效视频时长');
 await fsp.mkdir(path.dirname(dest),{recursive:true});
 const candidates=[.12,.30,.65,1.25,2].filter(x=>duration>x).map(x=>Math.max(.02,duration-x));
 if(!candidates.length)candidates.push(Math.max(0,duration/2));
 let fallback=null;
 try{
  for(const second of candidates){
   const tmp=dest+'.candidate-'+process.pid+'.png';
   try{
    await execBin(tools.ffmpeg,['-hide_banner','-loglevel','error','-y','-i',video,'-ss',second.toFixed(3),'-frames:v','1','-vf','scale=1280:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG','-f','image2',tmp],{timeout:90000});
    const st=await fsp.stat(tmp);if(st.size<500)throw Error('空白画面');
    // If metadata isn't emitted by this FFmpeg build, accept a decoded frame but mark the fallback.
    const analyzed=await execBin(tools.ffmpeg,['-hide_banner','-loglevel','info','-i',tmp,'-vf','signalstats,metadata=print:key=lavfi.signalstats.YAVG','-frames:v','1','-f','null','-'],{timeout:30000});
    const m=analyzed.stderr.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
    const luma=m?Number(m[1]):null;
    if(luma!==null&&luma<17){await fsp.unlink(tmp);continue;}
    await fsp.rename(tmp,dest);fallback={second,luma,bytes:st.size};break;
   }catch(e){await fsp.rm(tmp,{force:true}).catch(()=>{});if(e.message.includes('无法启动'))throw e;}
  }
  if(!fallback)throw Error('视频末尾候选帧全黑或无法解码，请手动选择其他成片');
  return {...fallback,duration};
 }catch(e){await fsp.rm(dest,{force:true}).catch(()=>{});throw e;}
}
class TailFrameStore{
 constructor(userData,{tools=binaries()}={}){
  this.folder=path.join(userData,'tailframes');this.file=path.join(this.folder,'bindings.json');
  this.rows={};this.versions={};this.tools=tools;this.busy=new Set();this.saveQueue=Promise.resolve();
 }
 async load(){
  await fsp.mkdir(this.folder,{recursive:true});
  if(fs.existsSync(this.file)){
   try{
    const r=JSON.parse(await fsp.readFile(this.file,'utf8'));
    if([1,2].includes(r?.version)&&r.rows&&typeof r.rows==='object'){
     this.rows=r.rows;this.versions=r.versions&&typeof r.versions==='object'?r.versions:{};
     for(const [k,v] of Object.entries(this.rows))if(!this.versions[k]?.length)this.versions[k]=[v];
    }
   }catch{await fsp.copyFile(this.file,this.file+'.invalid-'+Date.now());}
  }
  return this;
 }
 async save(){
  const bytes=JSON.stringify({version:2,rows:this.rows,versions:this.versions},null,2);
  this.saveQueue=this.saveQueue.catch(()=>{}).then(async()=>{
   const tmp=this.file+'.tmp';await fsp.writeFile(tmp,bytes);await fsp.rename(tmp,this.file);
  });
  return this.saveQueue;
 }
 key(eid,sid){return safeSegment(eid)+':'+safeSegment(sid)}
 row(epId,segId){return this.rows[this.key(epId,segId)]||null}
 status(data,episodeId,segmentId){
  const prev=findPredecessor(data,episodeId,segmentId);
  if(!prev)return {state:'first',message:'本集第一段，没有前段尾帧'};
  const key=this.key(prev.ep.id,prev.seg.id);
  if(this.busy.has(key))return {state:'extracting',sourceSegment:prev.seg.n,message:'上一段尾帧正在提取'};
  const row=this.row(prev.ep.id,prev.seg.id);
  if(!row)return {state:'none',sourceSegment:prev.seg.n,message:'上一段暂未下载可关联的视频；本段仍可使用已有参考图'};
  if(row.error)return {state:'error',message:row.error,videoPath:row.videoPath};
  if(!fs.existsSync(row.framePath))return {state:'missing',message:'已绑定的尾帧图片丢失',videoPath:row.videoPath};
  const sourceMoved=!fs.existsSync(row.videoPath);
  if(!sourceMoved){
   const st=fs.statSync(row.videoPath);
   if(st.mtimeMs!==row.sourceMtime||st.size!==row.sourceSize)
    return {state:'stale',message:'原视频被替换或修改，请重新提取尾帧',videoPath:row.videoPath};
  }
  return {state:'ready',code:'尾帧',file:{path:row.framePath,name:path.basename(row.framePath)},
   sourceSegment:prev.seg.n,sourceSegmentId:prev.seg.id,videoPath:row.videoPath,
   seekSecond:row.seekSecond,locked:!!row.locked,sourceMoved,
   message:'第'+prev.seg.n+'段尾帧已绑定为本段图1'+(sourceMoved?'（原视频已移动，尾帧仍可使用）':'')};
 }
 async setFinal(data,episodeId,segmentId,videoPath,{auto=false}={}){
  const ep=data.episodes.find(e=>e.id===episodeId),seg=ep?.segments.find(s=>s.id===segmentId);
  if(!seg)throw Error('无法找到视频对应的集或段');
  if(!validVideo(videoPath))throw Error('视频不存在、损坏或格式不支持');
  const key=this.key(episodeId,segmentId);
  if(this.busy.has(key))return {state:'busy',message:'本段已在提取另一条视频，等待队列重试'};
  this.busy.add(key);
  try{
   const st=await fsp.stat(videoPath);
   const hash=createHash('sha256').update(videoPath+'|'+st.mtimeMs+'|'+st.size).digest('hex').slice(0,14);
   const target=path.join(this.folder,safeSegment(episodeId),safeSegment(segmentId)+'-'+hash+'.png');
   const existing=(this.versions[key]||[]).find(r=>r.videoPath===videoPath&&r.sourceMtime===st.mtimeMs&&r.sourceSize===st.size&&fs.existsSync(r.framePath));
   const out=existing?{second:existing.seekSecond}:await extractLastValidFrame(videoPath,target,this.tools);
   const candidate=existing||{episodeId,segmentId,videoPath,framePath:target,
    sourceMtime:st.mtimeMs,sourceSize:st.size,seekSecond:out.second,createdAt:new Date().toISOString(),error:null,locked:!auto};
   this.versions[key]??=[];
   if(!existing)this.versions[key].push(candidate);
   const selected=this.rows[key],retained=!!(selected?.locked&&auto);
   if(!retained)this.rows[key]={...candidate,locked:!auto};
   try{
    const outDir=path.join(path.dirname(videoPath),'尾帧');await fsp.mkdir(outDir,{recursive:true});
    const friendly=path.join(outDir,path.basename(videoPath,path.extname(videoPath))+'_尾帧.png');
    if(!fs.existsSync(friendly))await fsp.copyFile(candidate.framePath,friendly);
   }catch{} // Always retain the canonical frame under userData.
   await this.save();
   return {state:retained?'candidate':'ready',message:retained?'新成片尾帧已保存，原最终版仍锁定':'第'+seg.n+'段成片尾帧已自动提取，将用于下一段图1',
    framePath:candidate.framePath,second:out.second,locked:retained};
  }catch(e){return {state:'error',message:'提取尾帧失败：'+e.message};}
  finally{this.busy.delete(key)}
 }
 async setLocked(eid,sid,locked){
  const r=this.row(eid,sid);if(!r)throw Error('本段还没有最终视频');
  r.locked=!!locked;await this.save();return {locked:r.locked};
 }
 listVersions(eid,sid){const k=this.key(eid,sid);return {current:this.rows[k]||null,versions:this.versions[k]||[]}}
 async selectVersion(eid,sid,framePath){
  const k=this.key(eid,sid),r=(this.versions[k]||[]).find(v=>v.framePath===framePath);
  if(!r||!fs.existsSync(r.framePath))throw Error('指定的尾帧版本不存在');
  this.rows[k]={...r,locked:true};await this.save();return {state:'ready',locked:true,framePath:r.framePath};
 }
}
module.exports={findPredecessor,extractLastValidFrame,TailFrameStore,binaries,validVideo};
