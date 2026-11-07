'use strict';
(function(){
const N=window.Native||{version:()=> 'demo',getPrompts:()=>'',getAssets:()=> '[]',getFolder:()=> '未选择',thumb:()=>'',choosePrompts:()=>{},chooseFolder:()=>{},refreshAssets:()=>{},copyText:()=>{},saveImages:()=>{},openDoubao:()=>{},pickVideo:()=>{},playVideo:()=>{},exportBackup:()=>{},importBackup:()=>{}};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(s,def)=>{try{return JSON.parse(s)}catch(e){return def}};
const defaults=()=>({tab:'make',selected:0,status:{},notes:{},edits:{},videos:{},chosen:{},expanded:{},dark:false,limit:9,projectName:'我的AI漫剧项目',search:'',assetSearch:'',assetFilter:'全部',assetPage:0,episodeOpen:{},lastProject:''});
const initialOwner=typeof N.getCloudOwner==='function'?N.getCloudOwner():'';
let ui=initialOwner?defaults():Object.assign(defaults(),json(localStorage.getItem('manju-v2-state'),{}));
// A cloud workspace must never appear before a fresh authenticated session check.
for(const k of ['status','notes','edits','videos','chosen','expanded','episodeOpen'])if(!ui[k]||typeof ui[k]!=='object')ui[k]={};
let raw='',segments=[],episodes=[],files=[],busy=false,timer,pending=[];
function saveState(){try{const owner=typeof N.getCloudOwner==='function'?N.getCloudOwner():'';localStorage.setItem(owner?'manju-v2-state:'+owner:'manju-v2-state',JSON.stringify(ui))}catch(e){console.warn(e)}}
function cnNum(s){if(/^\d+$/.test(s))return Number(s);const d={零:0,〇:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(s==='十')return 10;let n=0;if(s.includes('百')){let p=s.split('百');n+=(d[p[0]]||1)*100;s=p[1]}if(s.includes('十')){let p=s.split('十');n+=(p[0]?d[p[0]]:1)*10;s=p[1]}return n+(d[s]||0)}
function norm(v){const s=String(v).normalize('NFKC').toUpperCase().replace(/\s+/g,'').replace(/[－_]/g,'-');const m=s.match(/^(AG|BL|[ABCDEK])-?(\d{1,4})(?:-(\d{1,3}))?$/);return m?m[1]+m[2].padStart(2,'0')+(m[3]?'-'+m[3].padStart(2,'0'):''):s}
function extract(t){const re=/(^|[^A-Za-z0-9])((?:AG|BL|[ABCDEK])\s*[-_ ]?\s*\d{1,4}(?:\s*[-_－]\s*\d{1,3})?)(?![A-Za-z0-9]|[-_－]\d)/gi,out=[],set=new Set();for(const m of String(t||'').normalize('NFKC').matchAll(re)){let c=norm(m[2]);if(!set.has(c)){set.add(c);out.push(c)}}return out}
function refInfo(t){
 let list=[],on=false,blank=0;const ref=/(?:需要参考图|使用参考图|参考图编号|本段参考图|本镜参考图|参考图片|参考图清单|引用图片|参考素材)/i;
 for(const line of String(t||'').split(/\r?\n/)){
   const c=line.trim().replace(/^(?:#{1,6}\s*|[>•*\-]+\s*|\d+[.．、)）]\s*)+/,'').replace(/[\x2a\x60]/g,'').trim();
   const m=c.match(ref);
   if(m&&m.index<=16){on=true;blank=0;list.push(c.slice(m.index+m[0].length));continue}
   if(!on)continue;
   if(!c){if(++blank>2)on=false;continue}
   blank=0;
   if(/^(连续性参考|连续性|场景与站位|场景|站位|时间|画风|限制|音效|声音|分镜|镜头设计|镜头语言|运镜|动作设计|台词|对白|备注|质量检查|尾帧|首帧)\s*[:：]/.test(c)){on=false;continue}
   if(extract(c).length){list.push(c);continue}
   if(!/^(编号|人物图|场景图|组合图|道具图|图片)$/.test(c))on=false
 }
 const picked=extract(list.join('\n'));return {codes:picked.length?picked:extract(t),fallback:!picked.length};
}
function parse(t){
 const lines=String(t||'').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').match(/[^\n]*\n|[^\n]+$/g)||[];
 const er=/^\s*(?:#{1,6}\s*)?(?:《[^》]+》\s*)?第\s*([0-9一二三四五六七八九十百零〇]+)\s*集\s*(?:[｜|:：—\-、].*)?$/;
 const sr=/^\s*(?:#{1,6}\s*)?第\s*([0-9一二三四五六七八九十百零〇]+)\s*(?:段|镜头|镜|视频段|片段)\s*(?:[｜|:：—\-、.．].*)?$/;
 let ep=1,epTitle='第1集',number=0,title='',body=[],index=0;const out=[];
 function flush(){if(body.length){out.push({ep,epTitle,number:number||index+1,title:title||'第'+number+'段',original:body.join(''),sourceIndex:index++});body=[]}}
 for(const l of lines){const t=l.trim(),e=t.match(er),s=t.match(sr);if(e){flush();ep=cnNum(e[1]);epTitle=t.replace(/^#{1,6}\s*/,'');index=0;continue}if(s){flush();number=cnNum(s[1]);title=t.replace(/^#{1,6}\s*/,'');body=[l];continue}if(body.length)body.push(l)}
 flush();if(!out.length&&String(t||'').trim())out.push({ep:1,epTitle:'第1集',number:1,title:'完整提示词',original:t,sourceIndex:0});
 return out
}
function signature(t){let h=2166136261,s=String(t).slice(0,15000)+String(t).length;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return ''+(h>>>0)}
function setPrompts(t,imported){
 desktopProject=null;
 raw=String(t||'');const hash=signature(raw);
 if(imported&&ui.lastProject&&ui.lastProject!==hash){ui.status={};ui.notes={};ui.edits={};ui.videos={};ui.chosen={};ui.expanded={};ui.selected=0}
 ui.lastProject=hash;segments=parse(raw);episodes=[];const map=new Map();
 segments.forEach((s,i)=>{s.index=i;s.key='E'+s.ep+'N'+s.number+'I'+s.sourceIndex;if(!map.has(s.ep)){let x={num:s.ep,title:s.epTitle,items:[]};map.set(s.ep,x);episodes.push(x)}map.get(s.ep).items.push(s)});
 ui.selected=Math.max(0,Math.min(segments.length-1,Number(ui.selected)||0));saveState();render();
}
let desktopProject=null;
function setDesktopProject(project,imported){
 const converted=window.ManjuCompat.convert(project);
 const owner=typeof N.getCloudOwner==='function'?N.getCloudOwner():'';
 if(project.cloudAuthoritative&&owner){ui=Object.assign(defaults(),json(localStorage.getItem('manju-v2-state:'+owner),{}));for(const k of ['status','notes','edits','videos','chosen','expanded','episodeOpen'])if(!ui[k]||typeof ui[k]!=='object')ui[k]={};}
 const hash=signature(JSON.stringify(converted.original.episodes.map(e=>[e.id,e.number,e.segments.map(x=>[x.id,x.n])])));
 const previousId=segments[ui.selected]?.desktopId||'';
 const sameProject=ui.lastProject===hash;
 if(imported&&ui.lastProject!==hash){
  ui.status={};ui.notes={};ui.edits={};ui.videos={};ui.chosen={};ui.expanded={};ui.selected=0;
 }
 ui.lastProject=hash;desktopProject=converted.original;
 ui.projectName=converted.title;
 segments=converted.segments;episodes=converted.episodes;raw='';
 if(project.cloudAuthoritative){
   ui.status={...converted.statuses};
   try{
     const uid=N.getCloudOwner?N.getCloudOwner():'';
     const all=JSON.parse(localStorage.getItem('manju_cloud_status_queue')||'{}');
     for(const [id,entry] of Object.entries(all[uid]||{}))ui.status['desktop_'+id]=entry.status;
   }catch(e){console.warn('云端待同步状态读取失败',e)}
 }else ui.status={...converted.statuses,...ui.status};
 ui.chosen=project.cloudAuthoritative?{}:{...converted.versions,...ui.chosen};
 const matched=previousId?segments.findIndex(x=>x.desktopId===previousId):-1;
 ui.selected=matched>=0?matched:(imported&&!sameProject?converted.activeIndex:Math.max(0,Math.min(ui.selected,segments.length-1)));
 saveState();render();
}
const current=()=>segments[ui.selected];
const textOf=s=>ui.edits[s.key]===undefined?s.original:ui.edits[s.key];
const codesOf=s=>{
 if(ui.edits[s.key]!==undefined)return refInfo(ui.edits[s.key]);
 if(Array.isArray(s.desktopCodes))return {codes:s.desktopCodes,fallback:false};
 return refInfo(textOf(s));
};
const fileOptions=c=>files.filter(f=>f.code===c);
function selectedAsset(c){let list=fileOptions(c);return list.find(f=>f.name===ui.chosen[c])||list[0]||null}
const curStatus=s=>ui.status[s.key]||'待制作';
const statusClass=v=>v==='已完成'?'ok':v==='需重做'?'danger':v==='已生成'||v==='已提交'?'blue':'';
const badge=v=>'<span class="badge '+statusClass(v)+'">'+esc(v)+'</span>';
function metrics(list){let complete=0,redo=0,missing=0;for(const s of list){if(curStatus(s)==='已完成')complete++;if(curStatus(s)==='需重做')redo++;if(codesOf(s).codes.some(c=>!selectedAsset(c)))missing++}return {count:list.length,complete,redo,missing}}
const bar=m=>'<div class="progress"><div style="width:'+(m.count?Math.round(m.complete/m.count*100):0)+'%"></div></div>';
function notify(t){let e=$('toast');clearTimeout(timer);e.textContent=t;e.classList.add('show');timer=setTimeout(()=>e.classList.remove('show'),3200)}
function page(tab){ui.tab=tab;saveState();render();window.scrollTo(0,0)}
function jump(index){if(index<0||index>=segments.length)return;ui.selected=index;ui.tab='make';saveState();render();window.scrollTo(0,0);if(window.ManjuCloud)window.ManjuCloud.ensureReferences(codesOf(current()).codes).catch(e=>notify('参考图下载异常：'+e.message))}
function stepEpisode(d){const s=current();if(!s)return;let i=episodes.findIndex(e=>e.num===s.ep);let next=episodes[i+d];if(next)jump(next.items[0].index);else notify('已经是'+(d<0?'第一':'最后一')+'集')}
function empty(){return '<div class="card empty"><div class="em">▤</div><strong>先导入制作素材</strong><p>首次导入剧本TXT/MD，并选择手机上的参考图文件夹。</p><button class="btn primary full" data-act="import">① 导入提示词</button><div style="height:9px"></div><button class="btn secondary full" data-act="folder">② 选择图片文件夹</button></div>'}
function home(){
 let m=metrics(segments),s=current();
 let html='<div class="title">今天继续创作</div><div class="subtitle">随手打开，继续上一段漫剧。</div><div class="hero wide-gap"><h2>'+esc(ui.projectName)+'</h2><p>'+(s?'上次制作：第'+s.ep+'集 · 第'+s.number+'段':'导入制作素材，立即开始')+'</p><button class="btn" data-act="'+(s?'continue':'import')+'">'+(s?'继续制作 →':'导入提示词 →')+'</button></div>';
 html+='<div class="metrics"><div class="metric"><div class="num">'+m.count+'</div><div class="lab">总段数</div></div><div class="metric"><div class="num">'+m.complete+'</div><div class="lab">已完成</div></div><div class="metric"><div class="num">'+m.redo+'</div><div class="lab">待重做</div></div></div>';
 html+='<div class="card"><div class="row"><strong>制作进度</strong><span class="small muted">'+m.complete+' / '+m.count+'</span></div><div style="height:13px"></div>'+bar(m)+'<div class="subtitle">'+episodes.length+' 集 · '+m.missing+' 段存在缺图</div></div>';
 html+='<div class="section-title">快捷入口</div><div class="grid-2"><button class="card flat" data-act="import-desktop">▤<div class="strong">导入电脑项目</div><div class="subtitle">创作舱 v0.3 JSON</div></button><button class="card flat" data-act="folder">▣<div class="strong">素材文件夹</div><div class="subtitle">选择参考图</div></button><button class="card flat" data-act="episodes">☷<div class="strong">剧集管理</div><div class="subtitle">快速跳转</div></button><button class="card flat" data-act="settings">⚙<div class="strong">项目设置</div><div class="subtitle">备份与偏好</div></button></div>';
 return html;
}
function listEpisodes(){
 if(!segments.length)return '<div class="title">剧集管理</div>'+empty();
 let h='<div class="title">剧集管理</div><div class="subtitle">直接点击段落即可进入制作中心。</div><div class="card flat wide-gap"><input class="input" id="episodeSearch" placeholder="搜索集数与段落" value="'+esc(ui.search)+'"></div>';
 const q=ui.search.toLowerCase().trim();
 for(const ep of episodes){
  if(q&&!(''+ep.num).includes(q)&&!ep.title.toLowerCase().includes(q)&&!ep.items.some(s=>s.title.toLowerCase().includes(q)))continue;
  const m=metrics(ep.items),expanded=ui.episodeOpen[ep.num]||!!q||current()&&current().ep===ep.num;
  h+='<div class="card episode-card"><div class="row"><div><div class="episode-title">'+esc(ep.title)+'</div><div class="episode-meta">'+m.count+'段 · '+m.complete+'已完成 · '+m.missing+'段缺图</div></div><button class="btn slim secondary" data-act="episode-toggle" data-num="'+ep.num+'">'+(expanded?'收起':'展开')+'</button></div>'+bar(m);
  if(expanded)for(const s of ep.items){
   if(q&&!(''+ep.num).includes(q)&&!ep.title.toLowerCase().includes(q)&&!s.title.toLowerCase().includes(q))continue;
   h+='<button class="segment-item '+(s.index===ui.selected?'current':'')+'" data-act="jump" data-index="'+s.index+'" style="width:100%;border:0;text-align:left"><div class="seg-text"><strong>'+esc(s.title)+'</strong><span class="muted">'+codesOf(s).codes.length+'张参考图</span></div>'+badge(curStatus(s))+'<span>›</span></button>'
  }h+='</div>';
 }
 return h;
}
function refCard(c){
 const fs=fileOptions(c),f=selectedAsset(c);
 return '<div class="ref-card"><button class="ref-thumb '+(f?'':'missing')+'" data-act="'+(f?(fs.length>1?'versions':'preview'):'missing')+'" data-code="'+esc(c)+'" data-id="'+(f?f.id:'')+'">'+(f?'<img class="lazy-img" data-image="'+f.id+'" alt="'+esc(c)+'">':'缺图')+(fs.length>1?'<span class="ref-dup">'+fs.length+'版本</span>':'')+'</button><div class="ref-code '+(f?'':'danger-text')+'">'+esc(c)+'</div></div>';
}
function studio(){
 const s=current();if(!s)return '<div class="title">制作中心</div><div class="subtitle">所有常用操作都在这个页面。</div>'+empty();
 const c=codesOf(s),list=c.codes,miss=list.filter(x=>!selectedAsset(x)),ep=episodes.find(x=>x.num===s.ep),pos=ep.items.findIndex(x=>x.index===s.index);
 const at=episodes.indexOf(ep),full=!!ui.expanded[s.key],prompt=textOf(s);
 let h='<div class="row"><div><div class="subtitle">'+esc(ui.projectName)+'</div><div class="title">第'+s.ep+'集 · 第'+s.number+'段</div></div>'+badge(curStatus(s))+'</div><div class="subtitle">'+esc(s.title)+(s.locked?' · 🔒 电脑版已锁定':'')+(s.hidden?' · 电脑版已隐藏':'')+'</div>';
 h+='<div class="segment-switch"><button class="btn" data-act="prev-ep" '+(!at?'disabled':'')+'>« 上一集</button><button class="btn" data-act="next-ep" '+(at===episodes.length-1?'disabled':'')+'>下一集 »</button><button class="btn" data-act="prev" '+(!pos?'disabled':'')+'>‹ 上一段</button><button class="btn" data-act="next" '+(pos===ep.items.length-1?'disabled':'')+'>下一段 ›</button></div>';
 h+='<div class="row wide-gap"><strong class="small">本集 '+(pos+1)+' / '+ep.items.length+' 段</strong><button class="btn slim ghost" data-act="directory">快速跳转段落 ▾</button></div>'+bar(metrics(ep.items));
 h+='<div class="card wide-gap"><div class="row"><strong>本段参考图</strong><span class="badge '+(miss.length?'danger':'ok')+'">'+(list.length-miss.length)+' / '+list.length+' 已匹配</span></div><div class="refs-grid">'+(list.length?list.map(refCard).join(''):'<span class="subtitle">无参考图编号</span>')+'</div>'+(miss.length?'<div class="tip danger-text">缺少：'+esc(miss.join('、'))+'</div>':'')+(c.fallback&&list.length?'<div class="tip">按整段兜底识别编号，请人工核对。</div>':'')+'</div>';
 h+='<div class="card"><div class="row"><strong>完整提示词</strong><button class="btn slim secondary" data-act="expand">'+(full?'收起 ⌃':'展开 ⌄')+'</button></div><div class="subtitle">原文 '+prompt.length+'字 · 一键复制不截断</div><div class="text-panel '+(full?'expanded':'')+'">'+esc(full?prompt:(prompt.length>430?prompt.slice(0,430)+'\n…展开查看全部内容':prompt))+'</div><div class="tool-row wide-gap"><button class="btn slim" data-act="edit" '+(s.locked?'disabled':'')+'>编辑</button>'+(ui.edits[s.key]!==undefined?'<button class="btn slim" data-act="restore">恢复原文</button>':'')+'<button class="btn slim" data-act="quality">质量检查</button></div></div>';
 h+='<div class="row wide-gap"><button class="btn slim" data-act="draft">✎ 临时编辑提示词（自动匹配图片）</button>'+(ui.edits[s.key]!==undefined?'<button class="btn slim" data-act="restore">恢复电脑正式原文</button>':'')+'</div>';
 h+='<div class="action-dock"><div class="action-stack"><button class="btn xl primary" data-act="save" '+(busy?'disabled':'')+'><span class="btn-icon">↓</span> 一键保存本段全部图片（'+list.length+'张）</button><button class="btn xl secondary" data-act="copy"><span class="btn-icon">▤</span> 一键复制完整提示词</button></div><div class="row"><button class="btn slim" data-act="doubao">↗ 打开豆包APP</button><span class="tip">图片保存到系统相册</span></div></div>';
 h+='<div class="section-title">制作进度</div><div class="card"><strong>当前段状态</strong><div class="status-list">'+['待制作','需重做','已完成'].map(x=>'<button class="chip '+(curStatus(s)===x?'active':'')+'" data-act="status" data-value="'+x+'" '+(s.locked?'disabled':'')+'>'+x+'</button>').join('')+'</div><div class="tip">使用同一个邮箱账号后，完成状态可回传电脑版。提示词和参考图由电脑维护。</div><button class="btn slim secondary wide-gap" data-act="cloud-open">☁ 云同步 / 回传进度</button></div>';
 return h;
}

function library(){
 let h='<div class="title">参考图素材库</div><div class="subtitle">与电脑共用参考图编号目录，图片按段落需要下载。</div>';
 const catalog=window.ManjuCloud?.catalog?.()||[];
 if(catalog.length){
   const cached=new Set(files.map(f=>f.code));
   const pending=catalog.filter(item=>!cached.has(norm(item.code)));
   h+='<div class="card"><div class="row"><strong>云端参考图库</strong><span class="badge blue">'+cached.size+'/'+catalog.length+' 已缓存</span></div><div class="subtitle">已同步全部编号，当前段所需的图片会自动下载；也可点击编号单独缓存。</div>'+
      '<div class="chip-list wide-gap">'+pending.slice(0,60).map(a=>'<button class="chip" data-act="fetch-code" data-code="'+esc(norm(a.code))+'">'+esc(norm(a.code))+' ↓</button>').join('')+'</div></div>';
 }
 h+='<div class="card flat wide-gap"><div class="row"><strong>'+files.length+' 张参考图</strong><button class="btn slim secondary" data-act="rescan">重新扫描</button></div><div class="subtitle">来源：'+esc(N.getFolder())+'</div><button class="btn slim wide-gap" data-act="folder">更换图片文件夹</button></div>';
 h+='<input id="assetSearch" class="input" placeholder="搜索编号或文件名，例如 A15" value="'+esc(ui.assetSearch)+'"><div class="chip-list wide-gap">'+['全部','A','AG','B','BL','C','D','E'].map(x=>'<button class="chip '+(ui.assetFilter===x?'active':'')+'" data-act="filter" data-value="'+x+'">'+x+'</button>').join('')+'</div>';
 const q=ui.assetSearch.trim().toUpperCase();
 let list=files.filter(f=>{let k=ui.assetFilter;return (k==='全部'||(k==='A'?/^A(?!G)/.test(f.code):k==='B'?/^B(?!L)/.test(f.code):f.code.startsWith(k)))&&(!q||f.code.includes(q)||f.name.toUpperCase().includes(q))});
 let visible=list.slice(0,48*(1+ui.assetPage));h+='<div class="tip" style="margin:12px 0">匹配 '+list.length+' 张，显示 '+visible.length+' 张。点击图片可放大。</div><div class="list-grid">';
 for(const f of visible)h+='<button class="asset-tile" data-act="preview" data-id="'+f.id+'"><img class="lazy-img" data-image="'+f.id+'" alt="'+esc(f.code)+'"><div class="asset-name">'+esc(f.name)+'</div><div class="asset-code">'+esc(f.code)+'</div></button>';
 h+='</div>';
 if(list.length>visible.length)h+='<button class="btn full wide-gap" data-act="more">显示更多</button>';
 if(!list.length)h+='<div class="empty">'+(files.length?'没有匹配的图片':'请先选择手机参考图文件夹')+'</div>';
 return h;
}
function settings(){
 let h='<div class="title">工作台设置</div><div class="subtitle">本地项目、制作偏好和数据备份。</div><div class="card wide-gap"><div class="row"><strong>☁ 电脑手机同步</strong><button class="btn primary" data-act="cloud-open">账号登录 / 同步</button></div><div class="subtitle">获取电脑版提示词和参考图；制作完回传状态。其他功能不需要同步。</div></div>';
 h+='<div class="card wide-gap"><div class="section-title" style="margin:0 0 12px">项目管理</div><div class="setting-row"><span class="label">项目名称</span><button class="btn slim" data-act="project-name">修改</button></div><div class="subtitle">'+esc(ui.projectName)+'</div><div class="divider"></div><div class="setting-row"><span class="label">导入豆包创作舱 v0.3 项目 JSON</span><button class="btn slim primary" data-act="import-desktop">导入</button></div><div class="setting-row"><span class="label">导入剧本 TXT / MD</span><button class="btn slim secondary" data-act="import">导入</button></div><div class="setting-row"><span class="label">选择参考图文件夹</span><button class="btn slim secondary" data-act="folder">选择</button></div><div class="setting-row"><span class="label">重新扫描图片编号</span><button class="btn slim" data-act="rescan">扫描</button></div></div>';
 h+='<div class="card"><div class="section-title" style="margin:0 0 12px">制作偏好</div><div class="setting-row"><span class="label">参考图数量上限</span><select class="select" id="limit" style="max-width:105px">'+[4,7,9,12].map(n=>'<option value="'+n+'" '+(Number(ui.limit)===n?'selected':'')+'>'+n+'张</option>').join('')+'</select></div><div class="tip">用于本地检测；实际豆包上传数量以官方APP界面为准。</div><div class="divider"></div><div class="setting-row"><span class="label">深色模式</span><button class="btn slim '+(ui.dark?'primary':'secondary')+'" data-act="dark">'+(ui.dark?'已开启':'开启')+'</button></div></div>';
 h+='<div class="card"><div class="section-title" style="margin:0 0 10px">本地备份与换手机</div><div class="subtitle">备份保存剧本原文、修改稿、备注、段落状态和视频记录。不包含图片或视频本体。</div><div class="grid-2 wide-gap"><button class="btn secondary" data-act="backup-out">导出项目备份</button><button class="btn" data-act="backup-in">恢复项目备份</button></div><div class="divider"></div><div class="tip">云端同步仅包含剧集、提示词、参考图与完成状态；客户端数据按账号隔离。真实账号测试通过前属于候选版。</div></div>';
 h+='<div class="card"><div class="row"><strong>关于</strong><span class="badge blue">v'+esc(N.version())+'</span></div><div class="subtitle">真正安装在手机的离线安卓APP；图片从手机授权文件夹读取并复制到系统相册；豆包视频仍由豆包APP生成。</div></div>';
 return h;
}
function lazy(){
 const imgs=document.querySelectorAll('img.lazy-img');
 for(const img of imgs){
   if(img.dataset.done)continue;
   img.dataset.done='yes';
   if(window.IntersectionObserver){
     if(!window.imageObserver)window.imageObserver=new IntersectionObserver(entries=>{
       for(const e of entries)if(e.isIntersecting){const x=e.target;window.imageObserver.unobserve(x);if(document.contains(x))try{x.src=N.thumb(Number(x.dataset.image),280)||''}catch(err){}}
     },{rootMargin:'200px'});
     window.imageObserver.observe(img);
   }else try{img.src=N.thumb(Number(img.dataset.image),280)||''}catch(err){}
 }
}
function render(){
 document.querySelector('.app').dataset.theme=ui.dark?'dark':'light';
 document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===ui.tab));
 $('page').innerHTML=ui.tab==='home'?home():ui.tab==='episodes'?listEpisodes():ui.tab==='assets'?library():ui.tab==='settings'?settings():studio();
 lazy();
}
function modal(html){$('modalPanel').innerHTML=html;$('modal').classList.remove('hidden');$('modal').setAttribute('aria-hidden','false')}
function close(){ $('modal').classList.add('hidden');$('modal').setAttribute('aria-hidden','true');$('modalPanel').innerHTML=''}
function preview(id){
 const f=files.find(a=>a.id===id);if(!f)return;
 let src='';try{src=N.thumb(id,1350)||''}catch(e){}
 modal('<div class="modal-title">'+esc(f.code)+'</div>'+(src?'<img class="modal-image" src="'+src+'">':'<div class="empty">无法预览此图片</div>')+'<div class="subtitle">'+esc(f.name)+'</div><button class="btn full wide-gap" data-act="close">关闭</button>');
}
function versions(code){
 const list=fileOptions(code);if(!list.length)return notify(code+'未匹配到任何参考图');
 const chosen=selectedAsset(code);
 let h='<div class="modal-title">'+esc(code)+' · 选择参考图版本</div><div class="subtitle">同编号存在多张图片。设置后本项目其他段落将使用这个版本。</div>';
 for(const f of list)h+='<button class="choice '+(chosen&&f.id===chosen.id?'active':'')+'" data-act="choose-version" data-id="'+f.id+'" data-code="'+esc(code)+'">'+(chosen&&f.id===chosen.id?'✓ ':'')+esc(f.name)+'</button>';
 modal(h+'<button class="btn full wide-gap" data-act="close">取消</button>');
}
function directory(){
 const s=current();if(!s)return;const ep=episodes.find(e=>e.num===s.ep);
 let h='<div class="modal-title">第'+s.ep+'集 · 选择段落</div>';
 for(const t of ep.items)h+='<button class="choice '+(t.index===s.index?'active':'')+'" data-act="jump" data-index="'+t.index+'">'+esc(t.title)+'<span class="badge" style="float:right">'+esc(curStatus(t))+'</span></button>';
 modal(h);
}
function draft(s){
 const value=textOf(s),prev=codesOf(s).codes;
 const img=c=>'<span class="chip">'+esc(c)+(selectedAsset(c)?' ✓':' ⚠')+'</span>';
 modal('<div class="modal-title">第'+s.ep+'集 第'+s.number+'段 · 临时提示词草稿</div>'+
  '<p class="tip">草稿只保存在本机，不覆盖电脑版正式原文。输入“需要参考图：A02、A15”后会自动识别和显示匹配结果。</p>'+
  '<textarea id="draftText" class="textarea" style="height:40svh">'+esc(value)+'</textarea>'+
  '<div class="tip wide-gap">即时匹配参考图：</div><div id="draftCodes" class="chip-list">'+prev.map(img).join('')+'</div>'+
  '<div class="grid-2 wide-gap"><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="save-draft">保存本段草稿</button></div>');
 $('draftText').addEventListener('input',ev=>{
  const codes=refInfo(ev.target.value).codes;
  $('draftCodes').innerHTML=codes.length?codes.map(img).join(''):'<span class="tip">暂无匹配编号</span>';
 });
}
function edit(kind){
 const s=current();if(!s)return;
 const title=kind==='prompt'?'编辑完整提示词':kind==='note'?'制作备注':'项目名称';
 const value=kind==='prompt'?textOf(s):kind==='note'?(ui.notes[s.key]||''):ui.projectName;
 let field=kind==='project'?'<input class="input" id="modalInput" value="'+esc(value)+'">':'<textarea class="textarea" id="modalInput" style="height:'+(kind==='prompt'?'44':'27')+'svh">'+esc(value)+'</textarea>';
 modal('<div class="modal-title">'+title+'</div><div class="tip">提示词修改仅影响当前段，原始版本可恢复。</div><div class="wide-gap">'+field+'</div><div class="grid-2 wide-gap"><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="apply-edit" data-kind="'+kind+'">保存</button></div>');
}
function quality(){
 const s=current();if(!s)return;const t=textOf(s),list=codesOf(s).codes;
 let checks=[['参考图匹配完整',list.length>0&&list.every(c=>selectedAsset(c))],['参考图数量符合设置上限',list.length<=ui.limit],['明确场景与人物站位',/场景|站位/.test(t)],['包含运镜或分镜时间',/运镜|镜头|分镜|\d+\s*[-—]\s*\d+\s*秒/.test(t)],['有人物台词或口型说明',/台词|对白|口型|说：|说:/.test(t)],['包含禁止背景音乐和字幕',/禁止.{0,4}背景音乐/.test(t)&&/禁止.{0,4}字幕/.test(t)]];
 let h='<div class="modal-title">提示词质量检查</div><div class="tip">规则检查只提示疑点，不自动改写任何剧情。</div>';
 for(const c of checks)h+='<div class="quality-item"><span style="color:var(--'+(c[1]?'green':'orange')+')">'+(c[1]?'✓':'!')+'</span>　'+c[0]+'</div>';
 modal(h+'<button class="btn full wide-gap" data-act="close">完成</button>');
}
function tasks(items){
 const output=[],warnings=[];
 for(const s of items){
   let list=codesOf(s).codes,miss=list.filter(c=>!selectedAsset(c));
   if(miss.length){warnings.push('第'+s.ep+'集 第'+s.number+'段缺少 '+miss.join('、'));continue}
   if(list.length>ui.limit){warnings.push('第'+s.ep+'集 第'+s.number+'段超过'+ui.limit+'张上限');continue}
   if(list.length)output.push({episode:String(s.ep),segment:String(s.number),ids:list.map(c=>selectedAsset(c).id)});
 }return {output,warnings}
}
function saveTasks(list){close();if(!list.length)return notify('没有可保存的图片');busy=true;render();notify('正在准备 '+list.length+' 段图片…');N.saveImages(JSON.stringify({tasks:list}))}
function startSave(items){
 if(busy)return;let t=tasks(items);
 if(t.warnings.length){
   pending=t.output;
   modal('<div class="modal-title">发现参考图问题</div><div class="tip">以下段落未加入保存任务：</div><div class="text-panel expanded wide-gap">'+esc(t.warnings.join('\n'))+'</div><div class="grid-2 wide-gap"><button class="btn" data-act="close">取消</button><button class="btn primary" data-act="save-partial" '+(!pending.length?'disabled':'')+'>保存可用部分</button></div>');
 }else saveTasks(t.output);
}
function receive(m){
 if(!m||!m.type)return;
 if(m.type==='cloudProbe'){if(window.ManjuCloud)window.ManjuCloud.reportProbe(m.message);else notify(m.message);return;}
 if(m.type==='inviteRegister'){if(window.ManjuCloud)window.ManjuCloud.registrationResult(!!m.ok,m.message);return;}
 if(m.type==='inviteRegisterError'){if(window.ManjuCloud)window.ManjuCloud.reportRegistrationError(m.message);return;}
 if(m.type==='desktopWorkspace'){try{setDesktopProject(m.workspace,true);notify('已导入电脑版项目：'+episodes.length+'集 '+segments.length+'段')}catch(e){notify(e.message)}}
 else if(m.type==='assets'){files=json(N.getAssets(),[]);render();notify(m.message)}
 else if(m.type==='prompts'){ui.projectName=(m.filename||'AI漫剧项目').replace(/\.(txt|md)$/i,'').slice(0,100);setPrompts(m.text,true);notify('导入成功：'+segments.length+'段')}
 else if(m.type==='saved'){busy=false;render();notify('保存'+m.copied+'张，跳过重复'+m.skipped+'张，失败'+m.failed+'张')}
 else if(m.type==='copied')notify(m.message)
 else if(m.type==='video'){ui.videos[m.key]={uri:m.uri,name:m.filename};saveState();render();notify('视频已关联到当前段')}
 else if(m.type==='backup'){
   try{
     let o=m.payload;
     if(o.format!=='manju-mobile-v2')throw Error('格式不匹配');
     ui=Object.assign(defaults(),o.state||{});
     for(const k of ['status','notes','edits','videos','chosen','expanded','episodeOpen'])if(!ui[k])ui[k]={};
     if(o.desktopWorkspace){setDesktopProject(o.desktopWorkspace,false)}else if(typeof o.raw==='string'){N.restorePrompts(o.raw);setPrompts(o.raw,false)}
     saveState();render();notify('已恢复本地制作记录');
   }catch(e){notify('备份恢复失败：'+e.message)}
 }else notify(m.message||'操作已完成')
}
window.receiveNative=receive;
function action(ev){
 const b=ev.target.closest('[data-act]');if(!b)return;
 const a=b.dataset.act,s=current();
 if(a==='close'){close();return}
 if(a==='cloud-open'){if(window.ManjuCloud)window.ManjuCloud.open();else notify('云端组件未加载');return}if(a==='import'){N.choosePrompts();return}if(a==='import-desktop'){N.chooseDesktopWorkspace();return}if(a==='folder'){close();N.chooseFolder();return}if(a==='rescan'){N.refreshAssets();return}
 if(a==='continue'){page('make');return}if(a==='episodes'){close();page('episodes');return}if(a==='settings'){page('settings');return}
 if(a==='jump'){let i=Number(b.dataset.index);close();jump(i);return}
 if(a==='episode-toggle'){let k=b.dataset.num;ui.episodeOpen[k]=!ui.episodeOpen[k];saveState();render();return}
 if(a==='prev-ep'){stepEpisode(-1);return}if(a==='next-ep'){stepEpisode(1);return}
 if(a==='prev'||a==='next'){if(s){let ep=episodes.find(x=>x.num===s.ep),i=ep.items.findIndex(x=>x.index===s.index),j=i+(a==='prev'?-1:1);if(j>=0&&j<ep.items.length)jump(ep.items[j].index)}return}
 if(a==='directory'){directory();return}
 if(a==='expand'){ui.expanded[s.key]=!ui.expanded[s.key];saveState();render();return}
 if(a==='preview'){preview(Number(b.dataset.id));return}
 if(a==='versions'){versions(b.dataset.code);return}
 if(a==='choose-version'){let f=files.find(f=>f.id===Number(b.dataset.id));if(f)ui.chosen[b.dataset.code]=f.name;saveState();close();render();return}
 if(a==='missing'){notify('缺少参考图 '+b.dataset.code+'，请检查素材文件夹');return}
 if(a==='copy'){N.copyText(textOf(s));return}
 if(a==='save'){startSave([s]);return}
 if(a==='batch'){let ep=episodes.find(x=>x.num===s.ep),p=ep.items.findIndex(x=>x.index===s.index);startSave(ep.items.slice(p,p+Number(b.dataset.count)));return}
 if(a==='episode-batch'){startSave(episodes.find(x=>x.num===s.ep).items);return}
 if(a==='save-partial'){saveTasks(pending);return}
 if(a==='doubao'){N.openDoubao();return}
 if(a==='status'){if(s.locked)return notify('电脑版已锁定此段，无法修改状态');ui.status[s.key]=b.dataset.value;if(window.ManjuCloud)window.ManjuCloud.queueStatus(s.key,b.dataset.value);saveState();render();notify('已设为 '+b.dataset.value+'，联网后可回传');return}
 if(a==='draft'){draft(s);return}
 if(a==='save-draft'){ui.edits[s.key]=$('draftText').value;saveState();close();render();notify('草稿已保存，参考图已重新匹配');return}
 if(a==='note'){edit('note');return}if(a==='edit'){if(s.locked)return notify('此段已锁定，暂不能编辑');edit('prompt');return}if(a==='project-name'){edit('project');return}
 if(a==='apply-edit'){
   if(s&&s.locked&&b.dataset.kind==='prompt')return notify('此段已锁定，不能编辑');
   let value=$('modalInput').value,kind=b.dataset.kind;
   if(kind==='note')ui.notes[s.key]=value;
   if(kind==='prompt')ui.edits[s.key]=value;
   if(kind==='project')ui.projectName=value.trim()||'我的AI漫剧项目';
   saveState();close();render();notify('修改已保存');return
 }
 if(a==='restore'){if(s.locked)return notify('此段已锁定，暂不能恢复原稿');delete ui.edits[s.key];saveState();render();notify('已恢复原版提示词');return}
 if(a==='quality'){quality();return}
 if(a==='video'){N.pickVideo(s.key);return}
 if(a==='play'){if(ui.videos[s.key])N.playVideo(ui.videos[s.key].uri);return}
 if(a==='fetch-code'){if(window.ManjuCloud)window.ManjuCloud.ensureReferences([b.dataset.code]).then(x=>notify(x.errors.length?x.errors.join('；'):'已安排下载 '+b.dataset.code));return}
 if(a==='filter'){ui.assetFilter=b.dataset.value;ui.assetPage=0;saveState();render();return}
 if(a==='more'){ui.assetPage++;saveState();render();return}
 if(a==='dark'){ui.dark=!ui.dark;saveState();render();return}
 if(a==='backup-out'){N.exportBackup(JSON.stringify({format:'manju-mobile-v2',raw:raw,desktopWorkspace:desktopProject,state:ui,exportedAt:new Date().toISOString()}));return}
 if(a==='backup-in'){N.importBackup();return}
}
$('page').addEventListener('click',action);
$('modal').addEventListener('click',action);
$('page').addEventListener('input',ev=>{
 let id=ev.target.id;if(id!=='assetSearch'&&id!=='episodeSearch')return;
 let pos=ev.target.selectionStart,key=id==='assetSearch'?'assetSearch':'search';
 ui[key]=ev.target.value;if(key==='assetSearch')ui.assetPage=0;
 saveState();render();let el=$(id);if(el){el.focus();el.setSelectionRange(pos,pos)}
});
$('page').addEventListener('change',ev=>{if(ev.target.id==='limit'){ui.limit=Number(ev.target.value);saveState();notify('图片上限设为'+ui.limit+'张')}});
$('bottomNav').addEventListener('click',ev=>{const b=ev.target.closest('[data-tab]');if(b)page(b.dataset.tab)});
$('settingsBtn').addEventListener('click',()=>page('settings'));
window.backFromAndroid=function(){if(!$('modal').classList.contains('hidden'))close();else if(ui.tab!=='make')page('make');else notify('当前已在制作中心')};
try{raw=N.getPrompts()||'';files=json(N.getAssets(),[])}catch(e){console.warn(e)}
let desktopSource='';try{if(N.getDesktopWorkspace)desktopSource=N.getDesktopWorkspace()||''}catch(e){console.warn(e)}
if(initialOwner){segments=[];episodes=[];raw='';render();}else if(desktopSource){try{setDesktopProject(json(desktopSource,null),false)}catch(e){console.warn(e);setPrompts(raw,false)}}else setPrompts(raw,false);
window.__manjuTest={norm,extract,refInfo,parse,setDesktopProject,getSegments:()=>segments,getEpisodes:()=>episodes,getStatus:()=>ui.status};
})();
