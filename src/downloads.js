'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {safeName}=require('./parser');
const goodName=(s,max=52)=>safeName(String(s||'未命名'),max).replace(/[. ]+$/,'')||'未命名';
const VIDEO=new Set(['.mp4','.mov','.webm','.mkv','.avi']);
const IMAGE=new Set(['.png','.jpg','.jpeg','.webp','.gif','.avif','.bmp']);
function fileCategory(filename){const e=path.extname(String(filename||'')).toLowerCase();return VIDEO.has(e)?'视频':IMAGE.has(e)?'图片':'文件'}
function fileExtension(name){const ext=path.extname(String(name||'')).toLowerCase();return /^\.[a-z0-9]{1,9}$/.test(ext)?ext:'.bin'}
function downloadDirectory(root,context){return path.join(root,goodName(context.project||'我的漫剧',68),goodName(context.episode||'未分集',60),goodName(context.segment||'未分段',60),goodName(context.account||'未命名账号',48))}
function nextAvailable(dir,context,original,isUsed=()=>false){const ext=fileExtension(original),cat=fileCategory(original);const stem=`${goodName(context.episodeNumber||'未分集',15)}_${goodName(context.segmentNumber||'未分段',15)}_${goodName(context.account||'账号',20)}_${cat}`;let n=1;
  while(n<=99999){const name=`${stem}${String(n).padStart(2,'0')}${ext}`;const full=path.join(dir,name);if(!fs.existsSync(full)&&!isUsed(full))return full;n++}throw Error('目录中的文件序号已用完');}
function siteHost(raw){try{const url=new URL(raw);return ['https:','http:','blob:'].includes(url.protocol)?url.hostname||'网页资源':'网页资源'}catch{return '网页资源'}}
function inspectManifest(base){if(typeof base!=='string'||!path.isAbsolute(base))throw Error('请选择已解压的扩展文件夹');const stat=fs.statSync(base);if(!stat.isDirectory())throw Error('扩展路径不是文件夹');const manifestPath=path.join(base,'manifest.json');if(!fs.existsSync(manifestPath))throw Error('未找到 manifest.json，请选择扩展源码所在的文件夹');if(fs.statSync(manifestPath).size>128000)throw Error('扩展 manifest 过大');const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const permissions=[...(Array.isArray(manifest.permissions)?manifest.permissions:[]),...(Array.isArray(manifest.optional_permissions)?manifest.optional_permissions:[])].map(String).slice(0,100);
  const hosts=[...(Array.isArray(manifest.host_permissions)?manifest.host_permissions:[]),...(Array.isArray(manifest.optional_host_permissions)?manifest.optional_host_permissions:[])].map(String).slice(0,100);
  const warnings=[];for(const p of permissions)if(['webRequest','webRequestBlocking','proxy','cookies','debugger','nativeMessaging','management','scripting','declarativeNetRequest','downloads'].includes(p))warnings.push('请求权限：'+p);
  if(hosts.some(h=>h==='<all_urls>'||h==='*://*/*'))warnings.push('扩展声明可访问全部网站');
  if(manifest.background?.service_worker)warnings.push('MV3 Service Worker 的 Electron 兼容性待验证');
  if(manifest.manifest_version!==3&&manifest.manifest_version!==2)throw Error('不支持的扩展清单版本');
  return {path:base,name:String(manifest.name||'未命名扩展').slice(0,100),version:String(manifest.version||''),manifestVersion:manifest.manifest_version,permissions,hosts,warnings,mode:'user-selected-unpacked'};
}
class DownloadManager{
  constructor(userDataPath,defaultRoot){this.settingsFile=path.join(userDataPath,'download-settings.json');this.root=defaultRoot;this.history=[];this.reserved=new Set();this.writeQueue=Promise.resolve();this.lastError=null;}
  async load(){try{if(fs.existsSync(this.settingsFile)){const o=JSON.parse(await fs.promises.readFile(this.settingsFile,'utf8'));if(typeof o.root==='string'&&path.isAbsolute(o.root))this.root=o.root;this.history=Array.isArray(o.history)?o.history.slice(0,300).map(r=>({...r,status:r.status==='progressing'?'interrupted':r.status})):[]}}catch(e){const dest=this.settingsFile+'.bad-'+Date.now();if(fs.existsSync(this.settingsFile))fs.copyFileSync(this.settingsFile,dest);this.history=[];}return this.snapshot()}
  snapshot(){return {root:this.root,history:this.history.slice(0,60),writeError:this.lastError};}
  async save(){const snapshot=JSON.stringify({version:1,root:this.root,history:this.history.slice(0,300)},null,2);this.writeQueue=this.writeQueue.catch(()=>{}).then(async()=>{await fs.promises.mkdir(path.dirname(this.settingsFile),{recursive:true});const tmp=this.settingsFile+'.tmp';await fs.promises.writeFile(tmp,snapshot,'utf8');await fs.promises.rename(tmp,this.settingsFile)});return this.writeQueue}
  async chooseRoot(root){if(typeof root!=='string'||!path.isAbsolute(root))throw Error('无效的下载目录');await fs.promises.mkdir(root,{recursive:true});this.root=root;await this.save();}
  begin(original,context,url){const dir=downloadDirectory(this.root,context);fs.mkdirSync(dir,{recursive:true});const dest=nextAvailable(dir,context,original,p=>this.reserved.has(p));this.reserved.add(dest);
    const record={id:randomUUID(),file:path.basename(dest),path:dest,account:context.account||'',episode:context.episode||'',segment:context.segment||'',episodeId:context.episodeId||'',segmentId:context.segmentId||'',source:siteHost(url),type:fileCategory(original),status:'progressing',createdAt:new Date().toISOString(),receivedBytes:0,totalBytes:0};this.history.unshift(record);this.history=this.history.slice(0,300);this.save().catch(e=>{this.lastError=e.message});return record;}
  update(id,state,receivedBytes=0,totalBytes=0){const r=this.history.find(x=>x.id===id);if(!r)return null;if(typeof receivedBytes==='number')r.receivedBytes=Math.max(0,receivedBytes);if(typeof totalBytes==='number')r.totalBytes=Math.max(0,totalBytes);if(state)r.status=state;if(['completed','cancelled','interrupted'].includes(state))this.reserved.delete(r.path);this.save().catch(e=>{this.lastError=e.message});return r;}
}
module.exports={DownloadManager,downloadDirectory,nextAvailable,fileCategory,fileExtension,siteHost,inspectManifest};
