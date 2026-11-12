'use strict';
// Public information only. This module never reads Doubao cookies, prompts, accounts or image directories.
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const {DEFAULT_SLIDES,WATERMARK}=require('./tutorial-content');
const MAX_BYTES=64*1024;
const txt=(value,max=500)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const DEFAULT_WECHAT='du4du44';
const DEFAULT_BACKUP_WECHAT='du6du66';
const DEFAULT_QR_EXPIRES='2026-11-19T23:59:59+08:00';
const DEFAULT_BENEFITS=['和创作者交流分镜、提示词与制作经验','关注 AI 漫剧新工具和行业动态','工作台版本更新与教程消息'];
function validExpires(v){const x=txt(v,42);return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?x:'';}
function notExpired(value,at=Date.now()){return !!value&&Number.isFinite(Date.parse(value))&&Date.parse(value)>at;}

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
  const tutorial=r.tutorial&&typeof r.tutorial==='object'&&!Array.isArray(r.tutorial)?r.tutorial:{};
  return {
    schemaVersion:2,
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
      title:txt(community.title,100)||'AI 漫剧创作交流群',
      description:txt(community.description,400)||'创作交流、工具更新与制作经验分享',
      wechat:txt(community.wechat,80)||DEFAULT_WECHAT,
      backupWechat:txt(community.backupWechat,80)||DEFAULT_BACKUP_WECHAT,
      qqUrl:safeHttps(community.qqUrl),
      qrUrl:safeHttps(community.qrUrl),
      qrExpiresAt:validExpires(community.qrExpiresAt)||(!community.qrUrl?DEFAULT_QR_EXPIRES:''),
      enabled:community.enabled!==false,
      startup:community.startup!==false,
      headline:txt(community.headline,100)||'加入 AI 漫剧创作交流群',
      subtitle:txt(community.subtitle,220)||'交流创作经验 · 关注最新工具与漫剧资讯',
      benefits:Array.isArray(community.benefits)?community.benefits.map(x=>txt(x,90)).filter(Boolean).slice(0,4):DEFAULT_BENEFITS,
    },
    tutorial:{
      version:txt(tutorial.version,40)||'1',
      title:txt(tutorial.title,90)||'独独AI工作台｜12步新手教程',
      slides:Array.isArray(tutorial.slides)&&tutorial.slides.length?tutorial.slides.slice(0,24).map(slide=>({
        id:txt(slide?.id,30),title:txt(slide?.title,90),description:txt(slide?.description,400),
        imageUrl:safeHttps(slide?.imageUrl),sha256:/^[a-f0-9]{64}$/i.test(slide?.sha256||'')?String(slide.sha256).toLowerCase():'',
        target:txt(slide?.target,70)
      })).filter(slide=>/^[a-z0-9-]{1,30}$/i.test(slide.id)&&slide.title):DEFAULT_SLIDES.map(s=>({...s})),
      watermark:{...WATERMARK}
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
      ...this.data,
      community:{...this.data.community,qrActive:this.data.community.enabled&&notExpired(this.data.community.qrExpiresAt)},
      source:this.source,checkedAt:this.checkedAt,currentVersion:this.version,
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
module.exports={NoticeService,normalize,safeHttps,compareVersion,fetchJSON,notExpired,DEFAULT_QR_EXPIRES,DEFAULT_WECHAT,DEFAULT_BACKUP_WECHAT};
