'use strict';
(function(){
const N=window.Native||{version:()=> 'demo',getPrompts:()=>'',getAssets:()=> '[]',getFolder:()=> '未选择',thumb:()=>'',choosePrompts:()=>{},chooseFolder:()=>{},refreshAssets:()=>{},copyText:()=>{},saveImages:()=>{},openDoubao:()=>{},pickVideo:()=>{},playVideo:()=>{},exportBackup:()=>{},importBackup:()=>{}};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(s,def)=>{try{return JSON.parse(s)}catch(e){return def}};
const defaults=()=>({tab:'make',selected:0,status:{},notes:{},edits:{},videos:{},chosen:{},expanded:{},dark:false,limit:9,projectName:'我的AI漫剧项目',search:'',assetSearch:'',assetFilter:'全部',assetPage:0,episodeOpen:{},lastProject:''});
let ui=Object.assign(defaults(),json(localStorage.getItem('manju-v2-state'),{}));
for(const k of ['status','notes','edits','videos','chosen','expanded','episodeOpen'])if(!ui[k]||typeof ui[k]!=='object')ui[k]={};
let raw='',segments=[],episodes=[],files=[],busy=false,timer,pending=[];
function saveState(){try{localStorage.setItem('manju-v2-state',JSON.stringify(ui))}catch(e){console.warn(e)}}
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
 raw=String(t||'');const hash=signature(raw);
 if(imported&&ui.lastProject&&ui.lastProject!==hash){ui.status={};ui.notes={};ui.edits={};ui.videos={};ui.chosen={};ui.expanded={};ui.selected=0}
 ui.lastProject=hash;segments=parse(raw);episodes=[];const map=new Map();
 segments.forEach((s,i)=>{s.index=i;s.key='E'+s.ep+'N'+s.number+'I'+s.sourceIndex;if(!map.has(s.ep)){let x={num:s.ep,title:s.epTitle,items:[]};map.set(s.ep,x);episodes.push(x)}map.get(s.ep).items.push(s)});
 ui.selected=Math.max(0,Math.min(segments.length-1,Number(ui.selected)||0));saveState();render();
}
const current=()=>segments[ui.selected];
const textOf=s=>ui.edits[s.key]===undefined?s.original:ui.edits[s.key];
const codesOf=s=>refInfo(textOf(s));
const fileOptions=c=>files.filter(f=>f.code===c);
function selectedAsset(c){let list=fileOptions(c);return list.find(f=>f.name===ui.chosen[c])||list[0]||null}
const curStatus=s=>ui.status[s.key]||'待制作';
const statusClass=v=>v==='已完成'?'ok':v==='需重做'?'danger':v==='已生成'||v==='已提交'?'blue':'';
const badge=v=>'<span class="badge '+statusClass(v)+'">'+esc(v)+'</span>';
function metrics(list){let complete=0,redo=0,missing=0;for(const s of list){if(curStatus(s)==='已完成')complete++;if(curStatus(s)==='需重做')redo++;if(codesOf(s).codes.some(c=>!selectedAsset(c)))missing++}return {count:list.length,complete,redo,missing}}
const bar=m=>'<div class="progress"><div style="width:'+(m.count?Math.round(m.complete/m.count*100):0)+'%"></div></div>';
function notify(t){let e=$('toast');clearTimeout(timer);e.textContent=t;e.classList.add('show');timer=setTimeout(()=>e.classList.remove('show'),3200)}
function page(tab){ui.tab=tab;saveState();render();window.scrollTo(0,0)}
function jump(index){if(index<0||index>=segments.length)return;ui.selected=index;ui.tab='make';saveState();render();window.scrollTo(0,0)}
function stepEpisode(d){const s=current();if(!s)return;let i=episodes.findIndex(e=>e.num===s.ep);let next=episodes[i+d];if(next)jump(next.items[0].index);else notify('已经是'+(d<0?'第一':'最后一')+'集')}
function empty(){return '<div class="card empty"><div class="em">▤</div><strong>先导入制作素材</strong><p>首次导入剧本TXT/MD，并选择手机上的参考图文件夹。</p><button class="btn primary full" data-act="import">① 导入提示词</button><div style="height:9px"></div><button class="btn secondary full" data-act="folder">② 选择图片文件夹</button></div>'}
function home(){
 let m=metrics(segments),s=current();
 let html='<div class="title">今天继续创作</div><div class="subtitle">随手打开，继续上一段漫剧。</div><div class="hero wide-gap"><h2>'+esc(ui.projectName)+'</h2><p>'+(s?'上次制作：第'+s.ep+'集 · 第'+s.number+'段':'导入制作素材，立即开始')+'</p><button class="btn" data-act="'+(s?'continue':'import')+'">'+(s?'继续制作 →':'导入提示词 →')+'</button></div>';
 html+='<div class="metrics"><div class="metric"><div class="num">'+m.count+'</div><div class="lab">总段数</div></div><div class="metric"><div class="num">'+m.complete+'</div><div class="lab">已完成</div></div><div class="metric"><div class="num">'+m.redo+'</div><div class="lab">待重做</div></div></div>';
 html+='<div class="card"><div class="row"><strong>制作进度</strong><span class="small muted">'+m.complete+' / '+m.count+'</span></div><div style="height:13px"></div>'+bar(m)+'<div class="subtitle">'+episodes.length+' 集 · '+m.missing+' 段存在缺图</div></div>';
 html+='<div class="section-title">快捷入口</div><div class="grid-2"><button class="card flat" data-act="import">▤<div class="strong">导入剧本</div><div class="subtitle">TXT / MD</div></button><button class="card flat" data-act="folder">▣<div class="strong">素材文件夹</div><div class="subtitle">选择参考图</div></button><button class="card flat" data-act="episodes">☷<div class="strong">剧集管理</div><div class="subtitle">快速跳转</div></button><button class="card flat" data-act="settings">⚙<div class="strong">项目设置</div><div class="subtitle">备份与偏好</div></button></div>';
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
 let h='<div class="row"><div><div class="subtitle">'+esc(ui.projectName)+'</div><div class="title">第'+s.ep+'集 · 第'+s.number+'段</div></div>'+badge(curStatus(s))+'</div><div class="subtitle">'+esc(s.title)+'</div>';
 h+='<div class="segment-switch"><button class="btn" data-act="prev-ep" '+(!at?'disabled':'')+'>« 上一集</button><button class="btn" data-act="next-ep" '+(at===episodes.length-1?'disabled':'')+'>下一集 »</button><button class="btn" data-act="prev" '+(!pos?'disabled':'')+'>‹ 上一段</button><button class="btn" data-act="next" '+(pos===ep.items.length-1?'disabled':'')+'>下一段 ›</button></div>';
 h+='<div class="row wide-gap"><strong class="small">本集 '+(pos+1)+' / '+ep.items.length+' 段</strong><button class="btn slim ghost" data-act="directory">快速跳转段落 ▾</button></div>'+bar(metrics(ep.items));
 h+='<div class="card wide-gap"><div class="row"><strong>本段参考图</strong><span class="badge '+(miss.length?'danger':'ok')+'">'+(list.length-miss.length)+' / '+list.length+' 已匹配</span></div><div class="refs-grid">'+(list.length?list.map(refCard).join(''):'<span class="subtitle">无参考图编号</span>')+'</div>'+(miss.length?'<div class="tip danger-text">缺少：'+esc(miss.join('、'))+'</div>':'')+(c.fallback&&list.length?'<div class="tip">按整段兜底识别编号，请人工核对。</div>':'')+'</div>';
 h+='<div class="card"><div class="row"><strong>完整提示词</strong><button class="btn slim secondary" data-act="expand">'+(full?'收起 ⌃':'展开 ⌄')+'</button></div><div class="subtitle">原文 '+prompt.length+'字 · 一键复制不截断</div><div class="text-panel '+(full?'expanded':'')+'">'+esc(full?prompt:(prompt.length>430?prompt.slice(0,430)+'\n…展开查看全部内容':prompt))+'</div><div class="tool-row wide-gap"><button class="btn slim" data-act="edit">编辑</button>'+(ui.edits[s.key]!==undefined?'<button class="btn slim" data-act="restore">恢复原文</button>':'')+'<button class="btn slim" data-act="quality">质量检查</button></div></div>';
 h+='<div class="action-dock"><div class="action-stack"><button class="btn xl primary" data-act="save" '+(busy?'disabled':'')+'><span class="btn-icon">↓</span> 一键保存本段全部图片（'+list.length+'张）</button><button class="btn xl secondary" data-act="copy"><span class="btn-icon">▤</span> 一键复制完整提示词</button></div><div class="row"><button class="btn slim" data-act="doubao">↗ 打开豆包APP</button><span class="tip">图片保存到系统相册</span></div></div>';
 h+='<div class="section-title">制作管理</div><div class="card"><strong>本段制作状态</strong><div class="status-list">'+['待制作','已提交','已生成','需重做','已完成'].map(x=>'<button class="chip '+(curStatus(s)===x?'active':'')+'" data-act="status" data-value="'+x+'">'+x+'</button>').join('')+'</div><div class="divider"></div><div class="row"><strong>制作备注</strong><button class="btn slim" data-act="note">编辑</button></div><div class="subtitle">'+(ui.notes[s.key]?esc(ui.notes[s.key]).replace(/\n/g,'<br>'):'可记录口型问题、画面崩坏、重做原因')+'</div><div class="divider"></div><div class="row"><strong>本段生成视频</strong><button class="btn slim secondary" data-act="video">关联视频</button></div><div class="subtitle">'+(ui.videos[s.key]?esc(ui.videos[s.key].name):'暂未关联视频')+'</div>'+(ui.videos[s.key]?'<button class="btn slim" data-act="play">▶ 播放视频</button>':'')+'</div>';
 h+='<div class="section-title">批量准备素材</div><div class="grid-2"><button class="btn" data-act="batch" data-count="3">准备后3段</button><button class="btn" data-act="batch" data-count="5">准备后5段</button><button class="btn" data-act="episode-batch">保存本集全部图片</button><button class="btn" data-act="episodes">查看剧集目录</button></div>';
 return h;
}
