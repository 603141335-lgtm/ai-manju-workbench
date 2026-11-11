'use strict';
// Local-only preview cache. Does not alter the original images used for Doubao upload.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const fsp=fs.promises;
const IMG=/\.(png|jpe?g|webp|bmp|gif|avif|tiff?)$/i;
class ThumbnailCache{
  constructor({root,createThumbnail,maxFiles=500,size=192}={}){
    if(!root||typeof createThumbnail!=='function')throw Error('缩略图缓存配置不完整');
    this.root=root;this.createThumbnail=createThumbnail;this.maxFiles=maxFiles;this.size=size;
    this.pending=new Map();this.serial=Promise.resolve();
  }
  async get(original){
    if(typeof original!=='string'||!path.isAbsolute(original)||!IMG.test(original))return original;
    let stat;
    try{stat=await fsp.stat(original);if(!stat.isFile())return original;}catch{return original;}
    const key=crypto.createHash('sha256').update([original,stat.size,stat.mtimeMs,this.size].join('|')).digest('hex');
    const target=path.join(this.root,key+'.png');
    try{if((await fsp.stat(target)).size>0)return target;}catch{}
    if(this.pending.has(key))return this.pending.get(key);
    const job=this.serial.catch(()=>{}).then(async()=>{
      try{
        await fsp.mkdir(this.root,{recursive:true});
        const png=await this.createThumbnail(original,{width:this.size,height:this.size});
        if(!Buffer.isBuffer(png)||png.length<32||png.length>5*1024*1024)return original;
        const temp=target+'.'+process.pid+'.tmp';
        await fsp.writeFile(temp,png);
        await fsp.rename(temp,target);
        return target;
      }catch{return original;}
    });
    this.serial=job.then(()=>{});
    this.pending.set(key,job);
    try{return await job;}finally{this.pending.delete(key);}
  }
  async prune(){
    let files;
    try{files=(await fsp.readdir(this.root)).filter(x=>/^[a-f0-9]{64}\.png$/.test(x));}catch{return 0;}
    if(files.length<=this.maxFiles)return 0;
    const entries=await Promise.all(files.map(async name=>{
      try{return {name,mtime:(await fsp.stat(path.join(this.root,name))).mtimeMs};}catch{return null;}
    }));
    entries.sort((a,b)=>(b?.mtime||0)-(a?.mtime||0));
    let removed=0;
    for(const file of entries.slice(this.maxFiles)){
      if(!file)continue;
      await fsp.unlink(path.join(this.root,file.name)).then(()=>removed++).catch(()=>{});
    }
    return removed;
  }
}
module.exports={ThumbnailCache};
