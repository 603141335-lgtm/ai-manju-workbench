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
 constructor(userData,{tools=binaries()}={}){this.folder=path.join(userData,'tailframes');this.file=path.join(this.folder,'bindings.json');this.rows={};this.tools=tools;this.busy=new Set();this.saveQueue=Promise.resolve();}
 async load(){await fsp.mkdir(this.folder,{recursive:true});if(fs.existsSync(this.file)){try{const r=JSON.parse(await fsp.readFile(this.file,'utf8'));if(r?.version===1&&r.rows&&typeof r.rows==='object')this.rows=r.rows;}catch{await fsp.copyFile(this.file,this.file+'.invalid-'+Date.now());}}return this;}
 async save(){const bytes=JSON.stringify({version:1,rows:this.rows},null,2);this.saveQueue=this.saveQueue.catch(()=>{}).then(async()=>{const tmp=this.file+'.tmp';await fsp.writeFile(tmp,bytes);await fsp.rename(tmp,this.file);});return this.saveQueue;}
 row(epId,segId){return this.rows[`${safeSegment(epId)}:${safeSegment(segId)}`]||null;}
 status(data,episodeId,segmentId){
  const prev=findPredecessor(data,episodeId,segmentId);if(!prev)return {state:'first',message:'本集第一段，无上段尾帧'};
  const row=this.row(prev.ep.id,prev.seg.id);if(!row)return {state:'none',sourceSegment:prev.seg.n,message:`第${prev.seg.n}段尚未指定最终视频，可手动绑定`};
  if(this.busy.has(`${safeSegment(prev.ep.id)}:${safeSegment(prev.seg.id)}`))return {state:'extracting',message:'上一段尾帧正在提取'};
  if(row.error)return {state:'error',message:row.error,videoPath:row.videoPath};
  if(!fs.existsSync(row.framePath))return {state:'missing',message:'提取的尾帧图片已移动或丢失',videoPath:row.videoPath};
  if(!fs.existsSync(row.videoPath))return {state:'stale',message:'上一段原视频文件已移动',framePath:row.framePath};
  const st=fs.statSync(row.videoPath);if(st.mtimeMs!==row.sourceMtime||st.size!==row.sourceSize)return {state:'stale',message:'上一段成片已被修改，需重新提取',videoPath:row.videoPath};
  return {state:'ready',code:'尾帧',file:{path:row.framePath,name:path.basename(row.framePath)},sourceSegment:prev.seg.n,sourceSegmentId:prev.seg.id,videoPath:row.videoPath,seekSecond:row.seekSecond,message:`第${prev.seg.n}段尾帧已绑定为本段图1`};
 }
 async setFinal(data,episodeId,segmentId,videoPath,{auto=false}={}){
  const ep=data.episodes.find(e=>e.id===episodeId);const seg=ep?.segments.find(s=>s.id===segmentId);
  if(!seg)throw Error('无法找到视频对应的剧集和段落');
  if(!validVideo(videoPath))throw Error('请选择存在的 MP4/MOV/WEBM/MKV 成品视频');
  const key=`${safeSegment(episodeId)}:${safeSegment(segmentId)}`;
  if(auto&&this.rows[key])return {state:'kept',message:'已经有选定的最终版，下载其他视频不会自动覆盖它'};
  if(this.busy.has(key))return {state:'busy',message:'本段尾帧正在处理'};
  this.busy.add(key);
  const st=await fsp.stat(videoPath);const target=path.join(this.folder,safeSegment(episodeId),safeSegment(segmentId)+'-'+createHash('sha256').update(videoPath+'|'+st.mtimeMs+'|'+st.size).digest('hex').slice(0,14)+'.png');
  try{
   const out=await extractLastValidFrame(videoPath,target,this.tools);
   this.rows[key]={episodeId,segmentId,videoPath,framePath:target,sourceMtime:st.mtimeMs,sourceSize:st.size,seekSecond:out.second,createdAt:new Date().toISOString(),error:null};
   await this.save();return {state:'ready',message:`第${seg.n}段尾帧已提取，将用于下一段图1`,framePath:target,second:out.second};
  }catch(e){
   // Preserve previously working final video/frame if a replacement extraction fails.
   return {state:'error',message:'提取尾帧失败：'+e.message};
  }finally{this.busy.delete(key);}
 }
}
module.exports={findPredecessor,extractLastValidFrame,TailFrameStore,binaries,validVideo};
