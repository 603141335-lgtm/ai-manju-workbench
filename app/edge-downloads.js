'use strict';
// Conservative local download watcher. Never guesses attribution among multiple downloads.
const fs=require('fs'); const path=require('path');
const {fileName}=require('./edge-ledger');
const VIDEO=new Set(['.mp4','.mov','.webm']);
function videosIn(folder){
 if(!folder||!fs.existsSync(folder))return [];
 return fs.readdirSync(folder,{withFileTypes:true})
   .filter(d=>d.isFile()&&VIDEO.has(path.extname(d.name).toLowerCase()))
   .map(d=>{const p=path.join(folder,d.name);try{const s=fs.statSync(p);return {path:p,name:d.name,size:s.size,mtimeMs:s.mtimeMs};}catch{return null;}})
   .filter(Boolean);
}
function nextAvailableFile(folder,task,ext){
 for(let n=1;n<10000;n++){const target=path.join(folder,fileName(task,n,ext));if(!fs.existsSync(target))return target;}
 throw Error('版本号已超限');
}
function moveFile(source,target){
 try{fs.renameSync(source,target);return;}
 catch(e){if(e.code!=='EXDEV')throw e;}
 // Across volumes: copy exclusively and remove source only after a successful copy.
 fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
 const a=fs.statSync(source),b=fs.statSync(target);
 if(a.size!==b.size){fs.rmSync(target,{force:true});throw Error('复制文件大小不一致');}
 fs.unlinkSync(source);
}
function archiveFile(source,task,root){
 if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('归档根目录无效');
 const ext=path.extname(source).toLowerCase();
 if(!VIDEO.has(ext))throw Error('不支持的文件格式');
 const real=fs.realpathSync(source),st=fs.statSync(real);
 if(!st.isFile()||!st.size)throw Error('文件尚未完成');
 const destDir=path.join(root,`第${task.episode}集`,'成片');
 fs.mkdirSync(destDir,{recursive:true});
 const dest=nextAvailableFile(destDir,task,ext);
 moveFile(real,dest);
 return dest;
}
function createWatcher({source,notify,pollMs=1800}){
 let armed=null,interval=null,processing=false,lastError='';
 const seen=new Set(videosIn(source).map(x=>x.path));
 const progress=new Map();
 function get(){return {armed:armed?{task:armed.task,expiresAt:armed.expiresAt}:null,lastError};}
 function arm(task,root){
  if(armed)throw Error('已有待处理下载，请先完成或取消');
  if(!source||!fs.existsSync(source))throw Error('下载目录不存在');
  if(!root||!fs.existsSync(root))throw Error('归档目录不存在');
  // Existing files are ignored even if modified after arm.
  videosIn(source).forEach(x=>seen.add(x.path));
  progress.clear();lastError='';
  armed={task,root,expiresAt:Date.now()+30*60*1000};
  notify({kind:'armed',task});
 }
 function disarm(){armed=null;progress.clear();}
 function tick(){
  if(processing)return;processing=true;
  try{
   const files=videosIn(source);
   if(!armed){files.forEach(f=>seen.add(f.path));return;}
   if(Date.now()>armed.expiresAt){lastError='下载等待超时，未移动文件';notify({kind:'expired'});disarm();return;}
   const candidates=files.filter(f=>!seen.has(f.path));
   // At most one newly created video is eligible; ambiguity blocks all moves.
   if(candidates.length>1){lastError='检测到多个新视频，无法确定归属，请手动整理';notify({kind:'ambiguous',files:candidates.map(f=>f.name)});disarm();return;}
   if(candidates.length===0)return;
   const f=candidates[0],prev=progress.get(f.path);
   const pending=fs.existsSync(f.path+'.crdownload')||fs.existsSync(f.path+'.tmp');
   if(pending){progress.set(f.path,{size:f.size,mtimeMs:f.mtimeMs,stable:0});return;}
   const stable=prev&&prev.size===f.size&&prev.mtimeMs===f.mtimeMs?prev.stable+1:0;
   progress.set(f.path,{size:f.size,mtimeMs:f.mtimeMs,stable});
   if(stable<2||Date.now()-f.mtimeMs<2200)return;
   const task=armed.task,root=armed.root;
   const target=archiveFile(f.path,task,root);
   seen.add(f.path);notify({kind:'archived',task,target});disarm();
  }catch(e){lastError=String(e.message||e);notify({kind:'error',message:lastError});disarm();}
  finally{processing=false;}
 }
 function start(){if(!interval)interval=setInterval(tick,pollMs);}
 function stop(){if(interval)clearInterval(interval);interval=null;}
 return {arm,disarm,start,stop,tick,get};
}
module.exports={videosIn,nextAvailableFile,archiveFile,createWatcher};
