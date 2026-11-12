'use strict';
/* Public tutorial images only. Never accesses Doubao profiles or user projects.
 * Cache is limited, individual blobs <=2MB, no SVG/script/redirect execution.
 */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const {safeHttps}=require('./notice-service');
const MAX_IMAGE=2*1024*1024;
function imageType(bytes){
 if(bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if(bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return '';
}
function getRemoteBytes(url,manifestUrl){
 const safe=safeHttps(url),base=safeHttps(manifestUrl);
 if(!safe||!base||new URL(safe).hostname!==new URL(base).hostname)throw Error('教程图片必须来自官方内容服务器');
 return new Promise((resolve,reject)=>{
  const req=https.get(safe,{headers:{Accept:'image/png,image/jpeg,image/webp','User-Agent':'DuduAI-Guide/1.1'}},res=>{
   if(res.statusCode!==200){res.resume();return reject(Error('教程图片服务器状态 '+res.statusCode))}
   let len=0;const chunks=[];
   res.on('data',b=>{len+=b.length;if(len>MAX_IMAGE){req.destroy(Error('教程图片超过2MB'));return}chunks.push(b)});
   res.once('error',reject);
   res.on('end',()=>{const out=Buffer.concat(chunks);if(!imageType(out))reject(Error('教程图片格式无效'));else resolve(out)});
  });
  req.setTimeout(8000,()=>req.destroy(Error('教程图片超时')));
  req.once('error',reject);
 });
}
class TutorialMedia{
 constructor({dir,appPath,manifestUrl}){
  this.dir=dir;this.appPath=appPath;this.manifestUrl=manifestUrl;this.active=new Map();
 }
 async read(slide){
  const id=String(slide?.id||'');
  if(!/^[a-z0-9-]{1,30}$/i.test(id))throw Error('教程编号无效');
  const remote=slide.imageUrl,hash=slide.sha256;
  if(remote&&/^[0-9a-f]{64}$/.test(hash)){
   const file=path.join(this.dir,hash+'.img');
   try{
    let buf;
    if(fs.existsSync(file))buf=await fs.promises.readFile(file);
    else{
     if(!this.active.has(hash))this.active.set(hash,getRemoteBytes(remote,this.manifestUrl).finally(()=>this.active.delete(hash)));
     buf=await this.active.get(hash);
     if(crypto.createHash('sha256').update(buf).digest('hex')!==hash)throw Error('教程图片 SHA256 校验失败');
     await fs.promises.mkdir(this.dir,{recursive:true});
     const tmp=file+'.tmp';await fs.promises.writeFile(tmp,buf);await fs.promises.rename(tmp,file);
    }
    const mime=imageType(buf);
    if(buf.length<=MAX_IMAGE&&mime&&crypto.createHash('sha256').update(buf).digest('hex')===hash)
      return {dataUrl:'data:'+mime+';base64,'+buf.toString('base64'),source:fs.existsSync(file)?'cache':'online'};
   }catch(err){ /* Offline or invalid remote content => local bundled guide, never render unsafe bytes. */ }
  }
  // A real screenshot of this app with demo data, generated in CI; no browser credentials.
  const local=path.join(this.appPath,'assets','tutorial','step-'+id+'.webp');
  try{
   const buf=await fs.promises.readFile(local);
   if(buf.length>MAX_IMAGE||imageType(buf)!=='image/webp')throw Error('本地教程图片格式无效');
   return {dataUrl:'data:image/webp;base64,'+buf.toString('base64'),source:'bundled'};
  }catch{return {dataUrl:'',source:'missing'}}
 }
 async prune(){
  try{
   const names=(await fs.promises.readdir(this.dir)).filter(n=>/^[a-f0-9]{64}\.img$/.test(n));
   const files=await Promise.all(names.map(async n=>({name:n,path:path.join(this.dir,n),stat:await fs.promises.stat(path.join(this.dir,n))})));
   files.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);
   let bytes=0;
   for(const file of files){bytes+=file.stat.size;if(bytes>40*1024*1024)await fs.promises.unlink(file.path).catch(()=>{})}
  }catch{}
 }
}
module.exports={TutorialMedia,imageType,getRemoteBytes,MAX_IMAGE};
