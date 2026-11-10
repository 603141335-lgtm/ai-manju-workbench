'use strict';
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {parseMultiEpisode,parseFilenameCode,detectSegmentCodes,normCode,safeName}=require('./parser');
const {firstVisible, isVisible}=require('./navigation');
const EXTS=new Set(['.png','.jpg','.jpeg','.webp','.bmp','.gif','.avif','.tif','.tiff']);
const id=()=>randomUUID();
const MAX_SEGMENTS=20000;
const unique=a=>[...new Set(a)];
const isImage=p=>typeof p==='string'&&EXTS.has(path.extname(p).toLowerCase());
const fresh=()=>({version:2,title:'我的AI漫剧项目',assetFolder:'',episodes:[],trash:[],chosenPaths:{},activeEpisodeId:null,activeSegmentId:null,showHidden:false,treeExpandedEpisodeId:null,layout:{bottomHeight:315,bottomCollapsed:false,rightWidth:450,foldActiveEpisode:false}});
function scrub(input){
  const o=fresh();if(!input||typeof input!=='object')return o;
  o.title=String(input.title||o.title).slice(0,150);
  o.assetFolder=typeof input.assetFolder==='string'?input.assetFolder:'';
  o.showHidden=!!input.showHidden;
   o.trash=Array.isArray(input.trash)?input.trash.filter(t=>t&&['episode','segment'].includes(t.kind)&&t.item&&typeof t.item==='object').slice(-150):[];
  o.treeExpandedEpisodeId=typeof input.treeExpandedEpisodeId==='string'?input.treeExpandedEpisodeId:null;
  if(input.chosenPaths&&typeof input.chosenPaths==='object')for(const [key,v] of Object.entries(input.chosenPaths)){if(typeof v==='string'&&v.length<4096)o.chosenPaths[normCode(key)]=v;}
  if(input.layout&&typeof input.layout==='object')o.layout={bottomHeight:Math.max(180,Math.min(500,Number(input.layout.bottomHeight)||245)),bottomCollapsed:!!input.layout.bottomCollapsed,rightWidth:Math.max(300,Math.min(750,Number(input.layout.rightWidth)||450)),foldActiveEpisode:!!input.layout.foldActiveEpisode};
  let budget=MAX_SEGMENTS;
  if(Array.isArray(input.episodes))for(const e of input.episodes.slice(0,1000)){
    if(budget<=0)break;
    const episode={id:String(e.id||id()),number:Number.isInteger(e.number)?e.number:null,title:String(e.title||'未命名剧集').slice(0,350),original:String(e.original||''),preamble:String(e.preamble||''),hidden:!!e.hidden,locked:!!e.locked,segments:[]};
    if(Array.isArray(e.segments))for(const s of e.segments.slice(0,Math.min(budget,900))){
      const text=String(s.text??s.prompt??'');if(text.length>300000)continue;
      episode.segments.push({id:String(s.id||id()),n:Number.isFinite(Number(s.n))?Number(s.n):episode.segments.length+1,title:String(s.title||s.name||'未命名段落').slice(0,350),text,codes:unique((Array.isArray(s.codes)?s.codes:detectSegmentCodes(text).codes).map(c=>normCode(String(c))).filter(Boolean)).slice(0,100),method:String(s.method||'栏目识别'),manual:!!s.manual,hidden:!!s.hidden,locked:!!s.locked,status:['pending','done','redo'].includes(s.status)?s.status:'pending',completedAt:typeof s.completedAt==='string'?s.completedAt:null,accountId:typeof s.accountId==='string'?s.accountId:null,selectedPaths:Array.isArray(s.selectedPaths)?unique(s.selectedPaths.filter(x=>typeof x==='string')).slice(0,100):[],manualPaths:Array.isArray(s.manualPaths)?unique(s.manualPaths.filter(x=>typeof x==='string'&&isImage(x))).slice(0,150):[],continuityBlocked:!!s.continuityBlocked});
    }
    if(episode.segments.length){budget-=episode.segments.length;o.episodes.push(episode);}
  }
  o.activeEpisodeId=o.episodes.find(e=>e.id===input.activeEpisodeId)?.id||o.episodes[0]?.id||null;
  const e=o.episodes.find(e=>e.id===o.activeEpisodeId);o.activeSegmentId=e?.segments.find(s=>s.id===input.activeSegmentId)?.id||e?.segments[0]?.id||null;
  if(!o.episodes.some(e=>e.id===o.treeExpandedEpisodeId))o.treeExpandedEpisodeId=o.activeEpisodeId;
  return o;
}
function convertLegacy(workbench){
  if(!workbench||!Array.isArray(workbench.episodes))throw Error('不是有效的旧版 AI漫剧素材工作台备份');
  const incoming=scrub({...workbench,version:2});
  if(!incoming.episodes.length)throw Error('旧项目没有可识别的剧集和分段');
  // Imported IDs must not collide with either the current workspace or other imports.
  for(const e of incoming.episodes){e.id=id();for(const s of e.segments){s.id=id();s.status='pending';s.selectedPaths=[];s.hidden=false;s.locked=false;}}
  return incoming;
}
function importV01Segments(cfg){
  if(!Array.isArray(cfg?.segments))return [];
  const usable=cfg.segments.filter(s=>String(s.prompt||'').trim()||(s.images||[]).length);
  if(!usable.length)return [];
  return [{id:id(),number:null,title:'原创作舱 v0.1 手工段落（自动迁移）',original:'',preamble:'从 v0.1 config.json 中复制的段落与图片路径，原文件未修改。',segments:usable.map((s,i)=>({id:id(),n:i+1,title:String(s.name||`第${i+1}段`),text:String(s.prompt||''),codes:detectSegmentCodes(s.prompt||'').codes,method:'v0.1 手工素材',manual:false,status:'pending',hidden:false,locked:false,completedAt:null,accountId:null,selectedPaths:[],manualPaths:Array.isArray(s.images)?s.images.filter(isImage):[]}))}];
}
class AssetIndex{
  constructor(){this.byCode=new Map();this.stats={images:0,recognized:0,unique:0,duplicates:0,unrecognized:0,errors:[],truncated:false};}
  async scan(root){
    const byCode=new Map(),stats={images:0,recognized:0,unique:0,duplicates:0,unrecognized:0,errors:[],truncated:false};
    if(!root){this.byCode=byCode;this.stats=stats;return stats;}
    let n=0;
    async function walk(dir,folders=[],depth=0){
      if(depth>18||n>50000){stats.truncated=true;return;}
      let entries;try{entries=await fsp.readdir(dir,{withFileTypes:true});}catch(e){stats.errors.push(`${dir}: ${e.message}`);return;}
      for(const ent of entries){if(n>=50000){stats.truncated=true;break;}
        if(ent.isSymbolicLink())continue;
        const full=path.join(dir,ent.name);
        if(ent.isDirectory()){await walk(full,[...folders,ent.name],depth+1);continue;}
        if(!ent.isFile()||!isImage(ent.name))continue;
        n++;stats.images++;
        const code=parseFilenameCode(ent.name,folders);if(!code){stats.unrecognized++;continue;}
        stats.recognized++;
        const arr=byCode.get(code)||[];arr.push({path:full,name:ent.name,relative:path.relative(root,full),code});byCode.set(code,arr);
      }
    }
    await walk(root);for(const arr of byCode.values())arr.sort((a,b)=>a.relative.localeCompare(b.relative,'zh-CN'));
    stats.unique=byCode.size;stats.duplicates=stats.recognized-stats.unique;
    this.byCode=byCode;this.stats=stats;return stats;
  }
  resolve(codes,chosenPaths={},manualPaths=[]){
    const rows=unique(codes.map(c=>normCode(String(c)))).map(code=>{
      const versions=this.byCode.get(code)||[];
      const file=versions.find(v=>v.path===chosenPaths[code])||versions[0]||null;
      return {code,file,versions,missing:!file,duplicate:versions.length>1};
    });
    for(const p of manualPaths.filter(isImage))if(!rows.some(r=>r.file?.path===p))rows.push({code:path.basename(p,path.extname(p)),file:{path:p,name:path.basename(p),relative:p,code:'手动'},versions:[],manual:true,missing:!fs.existsSync(p),duplicate:false});
    return rows;
  }
}
class WorkspaceStore{
  constructor(file){this.file=file;this.data=fresh();this.writeQueue=Promise.resolve();this.assetIndex=new AssetIndex();this.corruptWarning=null;}
  async load(legacyCfg){
    await fsp.mkdir(path.dirname(this.file),{recursive:true});
    if(fs.existsSync(this.file)){
      try{const raw=await fsp.readFile(this.file,'utf8');const input=JSON.parse(raw);
        // One-time upgrade checkpoint: leave the pre-v0.3 workspace byte-for-byte intact.
        if(input&&input.version===2&&!Object.prototype.hasOwnProperty.call(input,'showHidden')){const marker=this.file+'.pre-v03-backup.json';if(!fs.existsSync(marker))await fsp.writeFile(marker,raw,'utf8');}
        this.data=scrub(input);
      }catch(e){this.corruptWarning=`工作台数据损坏：${e.message}`;
        const bk=this.file+'.bak';
        if(fs.existsSync(bk)){try{this.data=scrub(JSON.parse(await fsp.readFile(bk,'utf8')));this.corruptWarning+='；已使用备份读取，请及时再备份';}catch{throw Error('工作台数据和备份均无法读取，请人工检查文件，不会覆盖原文件');}}
        else throw Error('工作台文件损坏且没有备份，不会覆盖原文件');
      }
    }else{
      this.data.episodes=importV01Segments(legacyCfg);
      if(this.data.episodes.length){this.data.activeEpisodeId=this.data.episodes[0].id;this.data.activeSegmentId=this.data.episodes[0].segments[0].id;}
      await this.save();
    }
    await this.assetIndex.scan(this.data.assetFolder);
    return this.snapshot();
  }
  async save(){
    const content=JSON.stringify(this.data,null,2);
    // Each write takes its own snapshot before queuing so later edits cannot overwrite a newer state.
    this.writeQueue=this.writeQueue.catch(()=>{}).then(async()=>{
      const tmp=this.file+'.tmp';const bak=this.file+'.bak';
      await fsp.writeFile(tmp,content,'utf8');
      if(fs.existsSync(this.file)&&!this.corruptWarning)await fsp.copyFile(this.file,bak);
      await fsp.rename(tmp,this.file);
    });
    return this.writeQueue;
  }
  snapshot(){return {workspace:this.data,assets:this.assetIndex.stats,warning:this.corruptWarning};}
  current(){const ep=this.data.episodes.find(e=>e.id===this.data.activeEpisodeId);return {ep,seg:ep?.segments.find(s=>s.id===this.data.activeSegmentId)};}
  findSegment(eid,sid){const ep=this.data.episodes.find(e=>e.id===eid);const seg=ep?.segments.find(s=>s.id===sid);if(!seg)throw Error('找不到该剧集/分段');return {ep,seg};}
  async addText(text,filename=''){
    if(typeof text!=='string'||text.length>20000000)throw Error('提示词为空或超过20MB');
    const parsed=parseMultiEpisode(text,filename);if(!parsed.length)throw Error('未识别到剧集或分段');
    if(this.data.episodes.reduce((n,e)=>n+e.segments.length,0)+parsed.reduce((n,e)=>n+e.segments.length,0)>MAX_SEGMENTS)throw Error('总分段数量超出安全上限');
    const ep=parsed.map(e=>({...e,hidden:false,locked:false,segments:e.segments.map(s=>({...s,hidden:false,locked:false,status:'pending',accountId:null,completedAt:null,selectedPaths:[],manualPaths:[]}))}));
    this.data.episodes.push(...ep);this.data.activeEpisodeId=ep[0].id;this.data.activeSegmentId=ep[0].segments[0].id;this.data.treeExpandedEpisodeId=ep[0].id;await this.save();return {addedEpisodes:ep.length,addedSegments:ep.reduce((n,e)=>n+e.segments.length,0),workspace:this.data};
  }
  async mergeLegacy(v){const converted=convertLegacy(v);const count=this.data.episodes.length;
    this.data.episodes.push(...converted.episodes);
    if(count===0){this.data.title=converted.title;this.data.assetFolder=converted.assetFolder;this.data.chosenPaths={...converted.chosenPaths};await this.assetIndex.scan(this.data.assetFolder);}
    else {for(const [k,p] of Object.entries(converted.chosenPaths))if(!(k in this.data.chosenPaths))this.data.chosenPaths[k]=p;}
    this.data.activeEpisodeId=converted.episodes[0].id;this.data.activeSegmentId=converted.episodes[0].segments[0].id;this.data.treeExpandedEpisodeId=converted.episodes[0].id;
    await this.save();return {episodes:converted.episodes.length,segments:converted.episodes.reduce((n,e)=>n+e.segments.length,0),preservedSource:true};
  }
  async select(eid,sid){const {ep,seg}=this.findSegment(eid,sid);this.data.activeEpisodeId=ep.id;this.data.activeSegmentId=seg.id;this.data.treeExpandedEpisodeId=ep.id;await this.save();}
  assertUnlocked(ep,seg){if(ep.locked||seg?.locked)throw Error('这一集或这一段已锁定；先解锁才能修改原文、参考图或制作状态');}
  keepSelectionVisible(){const {ep,seg}=this.current();if(!ep||!seg||!isVisible(ep,seg,this.data.showHidden)){const next=firstVisible(this.data.episodes,this.data.showHidden);if(next){this.data.activeEpisodeId=next.ep.id;this.data.activeSegmentId=next.seg.id;this.data.treeExpandedEpisodeId=next.ep.id;}else if(this.data.episodes.length){this.data.showHidden=true;}}}
  async setHidden(eid,sid,hidden){const {ep,seg}=sid?this.findSegment(eid,sid):{ep:this.data.episodes.find(e=>e.id===eid),seg:null};if(!ep)throw Error('剧集不存在');if(seg)seg.hidden=!!hidden;else ep.hidden=!!hidden;this.keepSelectionVisible();await this.save();return this.snapshot();}
  async setLocked(eid,sid,locked){const {ep,seg}=sid?this.findSegment(eid,sid):{ep:this.data.episodes.find(e=>e.id===eid),seg:null};if(!ep)throw Error('剧集不存在');if(seg)seg.locked=!!locked;else ep.locked=!!locked;await this.save();return this.snapshot();}
  async setShowHidden(show){this.data.showHidden=!!show;this.keepSelectionVisible();await this.save();return this.snapshot();}
  async setTreeEpisode(eid){if(!this.data.episodes.some(e=>e.id===eid))throw Error('剧集不存在');this.data.treeExpandedEpisodeId=eid;await this.save();return this.snapshot();}
  async hideDone(){let hidden=0;for(const ep of this.data.episodes){for(const seg of ep.segments){if(seg.status==='done'&&!seg.hidden){seg.hidden=true;hidden++;}}if(ep.segments.length&&ep.segments.every(s=>s.status==='done'))ep.hidden=true;}this.keepSelectionVisible();await this.save();return {hidden,state:this.snapshot()};}
  async editText(eid,sid,text){if(typeof text!=='string'||text.length>300000)throw Error('提示词超过30万字');const {ep,seg}=this.findSegment(eid,sid);this.assertUnlocked(ep,seg);seg.text=text;if(!seg.manual){const det=detectSegmentCodes(text);seg.codes=det.codes;seg.method=det.method;}await this.save();}
  async editCodes(eid,sid,codes){const {ep,seg}=this.findSegment(eid,sid);this.assertUnlocked(ep,seg);seg.codes=unique((Array.isArray(codes)?codes:String(codes).split(/[、,，\s]+/)).map(normCode).filter(Boolean)).slice(0,100);seg.manual=true;await this.save();}
  async deleteItem(eid,sid=null){
     const index=this.data.episodes.findIndex(e=>e.id===eid);
     if(index<0)throw Error('剧集不存在');
     const ep=this.data.episodes[index];
     this.assertUnlocked(ep,sid?ep.segments.find(s=>s.id===sid):null);
     let item,kind,position;
     if(sid){
       position=ep.segments.findIndex(s=>s.id===sid);
       if(position<0)throw Error('段落不存在');
       kind='segment';item=ep.segments.splice(position,1)[0];
       // Do not silently bind the next segment to an unrelated earlier clip.
       if(ep.segments[position])ep.segments[position].continuityBlocked=true;
     }else{kind='episode';position=index;item=this.data.episodes.splice(index,1)[0]}
     const entry={id:id(),kind,episodeId:eid,position,item,deletedAt:new Date().toISOString()};
     this.data.trash.push(entry);
     if(this.data.trash.length>150)this.data.trash=this.data.trash.slice(-150);
     const next=this.data.episodes.find(e=>e.id===eid&&e.segments.length)||this.data.episodes.find(e=>e.segments.length);
     this.data.activeEpisodeId=next?.id||null;
     this.data.activeSegmentId=next?.segments[0]?.id||null;
     this.data.treeExpandedEpisodeId=next?.id||null;
     await this.save();return {state:this.snapshot(),entryId:entry.id};
   }
   async restoreItem(trashId){
     const i=this.data.trash.findIndex(x=>x.id===trashId);if(i<0)throw Error('回收站中没有该条目');
     const entry=this.data.trash[i];
     if(entry.kind==='episode'){
       if(this.data.episodes.some(e=>e.id===entry.item.id))throw Error('同ID剧集已存在');
       this.data.episodes.splice(Math.min(entry.position,this.data.episodes.length),0,entry.item);
     }else{
       const ep=this.data.episodes.find(e=>e.id===entry.episodeId);
       if(!ep)throw Error('所属剧集不存在，请先恢复剧集');
       if(ep.segments.some(s=>s.id===entry.item.id))throw Error('同ID段落已存在');
       ep.segments.splice(Math.min(entry.position,ep.segments.length),0,entry.item);
       if(ep.segments[entry.position+1])ep.segments[entry.position+1].continuityBlocked=false;
     }
     this.data.trash.splice(i,1);await this.save();return this.snapshot();
   }
   async setStatus(eid,sid,status,accountId){if(!['pending','done','redo'].includes(status))throw Error('状态无效');const {ep,seg}=this.findSegment(eid,sid);this.assertUnlocked(ep,seg);seg.status=status;seg.accountId=status==='done'?accountId:null;seg.completedAt=status==='done'?new Date().toISOString():null;await this.save();}
  async setSelection(eid,sid,paths){const {seg}=this.findSegment(eid,sid);if(!Array.isArray(paths))throw Error('图片选择无效');const allowed=this.resolveSegment(eid,sid).filter(r=>r.file&&!r.missing).map(r=>r.file.path);seg.selectedPaths=unique(paths.filter(p=>typeof p==='string'&&allowed.includes(p))).slice(0,100);await this.save();}
  async chooseVersion(code,file){code=normCode(code);const versions=this.assetIndex.byCode.get(code)||[];
    if(this.data.episodes.some(e=>(e.locked||e.segments.some(s=>s.locked&&s.codes.includes(code)))&&e.segments.some(s=>s.codes.includes(code))))throw Error('有锁定的剧集或分段引用了这个编号；请先解锁');
    if(!versions.some(v=>v.path===file))throw Error('图片不属于该编号');this.data.chosenPaths[code]=file;await this.save();}
  async setFolder(folder){this.data.assetFolder=folder;await this.assetIndex.scan(folder);await this.save();return this.assetIndex.stats;}
  async setLayout(patch){const cur=this.data.layout;const lay={...cur,...patch};lay.bottomHeight=Math.max(180,Math.min(500,Math.round(Number(lay.bottomHeight)||245)));lay.rightWidth=Math.max(300,Math.min(750,Math.round(Number(lay.rightWidth)||450)));lay.bottomCollapsed=!!lay.bottomCollapsed;this.data.layout=lay;await this.save();}
  async addManualImages(eid,sid,paths){const {ep,seg}=this.findSegment(eid,sid);this.assertUnlocked(ep,seg);seg.manualPaths=unique([...seg.manualPaths,...paths.filter(isImage)]).slice(0,150);await this.save();}
  resolveSegment(eid,sid){const {seg}=this.findSegment(eid,sid);return this.assetIndex.resolve(seg.codes,this.data.chosenPaths,seg.manualPaths);}
  async exportSegment(eid,sid,target){const {ep,seg}=this.findSegment(eid,sid);const folder=path.join(target,safeName(`${ep.title}_${seg.n}_${seg.title}`,75)+'_'+new Date().toISOString().replace(/[:.]/g,'-'));await fsp.mkdir(folder,{recursive:true});await fsp.writeFile(path.join(folder,'完整提示词.txt'),seg.text,'utf8');const rows=this.resolveSegment(eid,sid);const missing=[],errors=[];let copied=0;const dir=path.join(folder,'参考图');await fsp.mkdir(dir,{recursive:true});
    for(const r of rows){if(!r.file||r.missing){missing.push(r.code);continue;}try{const ext=path.extname(r.file.path);const dest=path.join(dir,safeName(r.code,50)+ext);await fsp.copyFile(r.file.path,dest);const [a,b]=await Promise.all([fsp.stat(r.file.path),fsp.stat(dest)]);if(a.size!==b.size)throw Error('文件长度不一致');copied++;}catch(e){errors.push(r.code+': '+e.message);}}
    await fsp.writeFile(path.join(folder,'导出报告.txt'),`已复制 ${copied} 张\n缺图：${missing.join('、')||'无'}\n错误：${errors.join('; ')||'无'}`,'utf8');return {folder,copied,missing,errors};
  }
}
module.exports={AssetIndex,WorkspaceStore,fresh,scrub,convertLegacy,importV01Segments,isImage};
