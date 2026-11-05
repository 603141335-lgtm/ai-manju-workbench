'use strict';
// Safe local watcher: never modifies an existing video or guesses which of several new files belongs to a task.
const fs=require('fs');
const path=require('path');
const {fileName}=require('./edge-ledger');
const VIDEO=new Set(['.mp4','.mov','.webm']);
const PARTIAL=/\.(?:crdownload|part|partial|download|tmp)$/i;
function videosIn(folder){
  if(!folder||!fs.existsSync(folder))return [];
  return fs.readdirSync(folder,{withFileTypes:true}).filter(d=>d.isFile()&&VIDEO.has(path.extname(d.name).toLowerCase()))
    .map(d=>{const p=path.join(folder,d.name);try{const s=fs.statSync(p);return {path:p,name:d.name,size:s.size,mtimeMs:s.mtimeMs};}catch{return null;}})
    .filter(Boolean);
}
function partialDownloads(folder,startedAt){
  if(!fs.existsSync(folder))return [];
  return fs.readdirSync(folder,{withFileTypes:true}).filter(d=>d.isFile()&&PARTIAL.test(d.name)).filter(d=>{
    try{return fs.statSync(path.join(folder,d.name)).mtimeMs>=startedAt-5000;}catch{return false;}
  }).map(d=>d.name);
}
function nextAvailableFile(folder,task,ext){
  for(let n=1;n<10000;n++){
    const candidate=path.join(folder,fileName(task,n,ext));
    if(!fs.existsSync(candidate))return candidate;
  }
  throw Error('版本号已超限');
}
function transferExclusive(source,target){
  // Prefer hard-link+unlink on the same volume (fast, atomic exclusive creation).
  // On other volumes, copy exclusively, verify byte size, and only then delete source.
  let linked=false,copied=false;
  try{fs.linkSync(source,target);linked=true;}
  catch(e){
    if(e.code==='EEXIST')throw e;
    try{fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);copied=true;}
    catch(copyError){throw copyError;}
  }
  try{
    const src=fs.statSync(source),dst=fs.statSync(target);
    if(!src.isFile()||src.size<1||src.size!==dst.size)throw Error('目标文件校验失败，源文件已保留');
    fs.unlinkSync(source);
  }catch(e){
    // If source deletion failed, discard only the destination created in this operation,
    // never a pre-existing file.
    try{if(linked||copied)fs.unlinkSync(target);}catch{}
    throw e;
  }
}
function archiveFile(source,task,root){
  if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('归档根目录无效');
  const ext=path.extname(source).toLowerCase();
  if(!VIDEO.has(ext))throw Error('不支持的视频格式');
  const real=fs.realpathSync(source),st=fs.statSync(real);
  if(!st.isFile()||st.size<1)throw Error('文件尚未完成');
  // fileName validates episode and segment before creating destination.
  fileName(task,1,ext);
  const folder=path.join(root,'第'+task.episode+'集','成片');
  fs.mkdirSync(folder,{recursive:true});
  for(let version=1;version<10000;version++){
    const dest=path.join(folder,fileName(task,version,ext));
    try{transferExclusive(real,dest);return dest;}
    catch(e){if(e.code==='EEXIST')continue;throw e;}
  }
  throw Error('版本号已超限');
}
function createWatcher({source,notify=()=>{},pollMs=1800}){
  let armed=null,interval=null,working=false,lastError='';
  const seen=new Set(videosIn(source).map(x=>x.path));
  const progress=new Map();
  function get(){return {armed:armed?{task:armed.task,expiresAt:armed.expiresAt}:null,lastError};}
  function arm(task,root){
    if(armed)throw Error('已有待处理下载，请先完成或取消');
    if(!source||!fs.existsSync(source)||!fs.statSync(source).isDirectory())throw Error('下载目录不存在');
    if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('归档目录不存在');
    fileName(task); // validate task numbers before monitoring
    videosIn(source).forEach(x=>seen.add(x.path));
    progress.clear();lastError='';
    armed={task,root,startedAt:Date.now(),expiresAt:Date.now()+30*60*1000};
    notify({kind:'armed',task});
  }
  function disarm(){armed=null;progress.clear();}
  function tick(){
    if(working)return;
    working=true;
    try{
      const files=videosIn(source);
      if(!armed){files.forEach(f=>seen.add(f.path));return;}
      if(Date.now()>armed.expiresAt){
        lastError='下载等待超时，原文件未移动';notify({kind:'expired'});disarm();return;
      }
      const candidates=files.filter(f=>!seen.has(f.path));
      // Any other in-progress download could later become another video: wait instead of guessing.
      if(partialDownloads(source,armed.startedAt).length)return;
      if(candidates.length>1){
        lastError='发现多个新视频，无法确认哪一个属于所选段落';
        notify({kind:'ambiguous',files:candidates.map(f=>f.name)});disarm();return;
      }
      if(!candidates.length)return;
      const f=candidates[0],prev=progress.get(f.path);
      const stable=prev&&prev.size===f.size&&prev.mtimeMs===f.mtimeMs?prev.stable+1:0;
      progress.set(f.path,{size:f.size,mtimeMs:f.mtimeMs,stable});
      if(f.size<1||stable<2||Date.now()-f.mtimeMs<2500)return;
      const target=archiveFile(f.path,armed.task,armed.root);
      seen.add(f.path);
      notify({kind:'archived',task:armed.task,target});
      disarm();
    }catch(e){
      lastError=String(e.message||e);
      notify({kind:'error',message:lastError});
      disarm();
    }finally{working=false;}
  }
  function start(){if(!interval)interval=setInterval(tick,pollMs);}
  function stop(){if(interval)clearInterval(interval);interval=null;}
  return {arm,disarm,start,stop,tick,get};
}
module.exports={videosIn,partialDownloads,nextAvailableFile,archiveFile,createWatcher};