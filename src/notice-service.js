'use strict';
// Public information only. This module never reads Doubao cookies, prompts, accounts or image directories.
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const MAX_BYTES=64*1024;
const txt=(value,max=500)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
function safeHttps(value){
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return '';
    if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/i.test(url.hostname))return '';
    return url.toString();
  }catch{return '';}
}
function compareVersion(a,b){
  const parse=v=>String(v||'').replace(/^v/i,'').split('-')[0].split('.').slice(0,4).map(n=>/^\d+$/.test(n)?Number(n):0);
  const aa=parse(a),bb=parse(b);
  for(let i=0;i<4;i++){if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0)?1:-1}
  return 0;
}
function normalize(raw){
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const release=r.release&&typeof r.release==='object'?r.release:{};
  const notice=r.notice&&typeof r.notice==='object'?r.notice:{};
  const community=r.community&&typeof r.community==='object'?r.community:{};
  return {
    schemaVersion:1,
    release:{
      version:txt(release.version,32),
      title:txt(release.title,100),
      notes:txt(release.notes,1200),
      url:safeHttps(release.url),
    },
    notice:{
      id:txt(notice.id,80),
      title:txt(notice.title,100),
      body:txt(notice.body,1200),
      showHint:notice.showHint===true
    },
    community:{
      title:txt(community.title,100),
      description:txt(community.description,400),
      wechat:txt(community.wechat,80),
      qqUrl:safeHttps(community.qqUrl),
      qrUrl:safeHttps(community.qrUrl)
    },
    updatedAt:txt(r.updatedAt,50)
  };
}
function fetchJSON(url,timeoutMs=6000){
  return new Promise((resolve,reject)=>{
    const ok=safeHttps(url);if(!ok)return reject(Error('公告地址必须为安全的 HTTPS 链接'));
    const req=https.get(ok,{headers:{'Accept':'application/json','User-Agent':'DoubaoCreativeHub-Public'}},res=>{
      if(res.statusCode!==200){res.resume();return reject(Error('服务器状态 '+res.statusCode))}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){req.destroy(Error('公告文件不能超过64KB'));return;}chunks.push(chunk)});
      res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch(e){reject(Error('公告 JSON 无效'))}});
      res.on('error',reject);
    });
    req.setTimeout(timeoutMs,()=>req.destroy(Error('公告请求超时')));
    req.on('error',reject);
  });
}
class NoticeService{
  constructor({url='',cachePath='',version='0.0.0'}={}){
    this.url=safeHttps(url);this.cachePath=cachePath;this.version=version;
    this.data=normalize({});this.source='unconfigured';this.checkedAt='';
    this.loadCache();
  }
  loadCache(){
    if(!this.cachePath)return;
    try{
      const st=fs.statSync(this.cachePath);
      if(st.size>MAX_BYTES*2)return;
      this.data=normalize(JSON.parse(fs.readFileSync(this.cachePath,'utf8')));
      this.source='cache';
    }catch{}
  }
  snapshot(){
    return {
      ...this.data,source:this.source,checkedAt:this.checkedAt,currentVersion:this.version,
      hasUpdate:!!(this.data.release.url&&compareVersion(this.data.release.version,this.version)>0),
      configured:!!this.url
    };
  }
  async refresh(){
    if(!this.url)return this.snapshot();
    try{
      this.data=normalize(await fetchJSON(this.url));
      this.source='online';this.checkedAt=new Date().toISOString();
      if(this.cachePath){
        await fs.promises.mkdir(path.dirname(this.cachePath),{recursive:true});
        const temp=this.cachePath+'.tmp';
        await fs.promises.writeFile(temp,JSON.stringify(this.data),'utf8');
        await fs.promises.rename(temp,this.cachePath);
      }
    }catch(e){
      this.source=this.source==='online'||this.source==='cache'?'cache':'offline';
    }
    return this.snapshot();
  }
}
module.exports={NoticeService,normalize,safeHttps,compareVersion,fetchJSON};
