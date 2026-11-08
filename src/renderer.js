'use strict';
const $=id=>document.getElementById(id), B=window.bridge;
let cfg=null,ws=null,imageRows=[],selected=new Set(),expandGroups=new Set(),focus=false,promptTimer=null,toastTimer=null,renderSeq=0,lastAnchor=-1,lastOriginal='',saveSequence=0,treeOpen=false,downloadsState={root:'',history:[]},extensionState={candidate:null,loaded:null};
const enc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getAccount=()=>cfg?.accounts?.find(a=>a.id===cfg.activeAccountId)||cfg?.accounts?.[0];
const getGroup=()=>cfg?.groups?.find(g=>g.id===getAccount()?.groupId);
const getEp=()=>ws?.workspace?.episodes?.find(e=>e.id===ws.workspace.activeEpisodeId)||null;
const getSeg=()=>getEp()?.segments?.find(s=>s.id===ws.workspace.activeSegmentId)||null;
const statusText=s=>({pending:'待制作',done:'已完成',redo:'待重做'}[s]||'待制作');
function toast(m){const box=$('toast');box.textContent=String(m);box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),3200)}
function error(e){console.error(e);toast('操作失败：'+(e?.message||e))}
async function safe(fn){try{return await fn()}catch(e){error(e);return null}}
function modal(d){B.setOverlay(true);d.showModal();d.addEventListener('close',()=>B.setOverlay(false),{once:true})}
function ask(title,initial=''){
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='inputDialog';
    const box=document.createElement('div');box.className='dialogbody';const h=document.createElement('h2');h.textContent=title;
    const input=document.createElement('input');input.value=initial;input.maxLength=150;
    const buttons=document.createElement('div');buttons.className='dialogActions';const no=document.createElement('button');no.className='ghost';no.textContent='取消';const yes=document.createElement('button');yes.className='primary';yes.textContent='确定';buttons.append(no,yes);box.append(h,input,buttons);d.append(box);document.body.append(d);
    const end=result=>{d.close();d.remove();B.setOverlay(false);resolve(result)};
    no.onclick=()=>end(null);yes.onclick=()=>end(input.value.trim());input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();end(input.value.trim())}};d.addEventListener('cancel',e=>{e.preventDefault();end(null)});modal(d);input.focus();input.select();
  });
}
async function confirmAction(title,message){return new Promise(resolve=>{
  const d=document.createElement('dialog'),box=document.createElement('div');box.className='dialogbody';const heading=document.createElement('h2');heading.textContent=title;const p=document.createElement('p');p.textContent=message;const btns=document.createElement('div');btns.className='dialogActions';const no=document.createElement('button');no.textContent='取消';no.className='ghost';const yes=document.createElement('button');yes.textContent='确认';yes.className='primary';btns.append(no,yes);box.append(heading,p,btns);d.append(box);document.body.append(d);
  const end=x=>{d.close();d.remove();B.setOverlay(false);resolve(x)};no.onclick=()=>end(false);yes.onclick=()=>end(true);d.addEventListener('cancel',e=>{e.preventDefault();end(false)});modal(d);
})}
async function refreshCfg(){cfg=await B.getCfg();renderGroups();refreshHeader()}
function renderGroups(){if(!cfg)return;
  const list=$('groupList');list.innerHTML=cfg.groups.map(g=>{
    const items=cfg.accounts.filter(a=>a.groupId===g.id);const open=expandGroups.has(g.id);const done=items.filter(a=>a.done>=cfg.target).length;
    return `<div class="group ${open?'expanded':''}" data-group="${enc(g.id)}"><div class="groupHead" tabindex="0"><span class="groupName">${open?'▾':'▸'} ${enc(g.name)} <span class="tiny">${done}/${items.length}</span></span><span class="groupButtons"><button data-action="edge-config" data-gid="${enc(g.id)}" class="groupBtn" title="选择Edge配置">E</button><button data-action="rename-group" data-gid="${enc(g.id)}" class="groupBtn" title="重命名分组">✎</button><button data-action="add-account" data-gid="${enc(g.id)}" class="groupBtn" title="增加豆包账号">＋</button></span></div><div class="groupAccounts">${items.map(a=>`<button class="account ${a.id===cfg.activeAccountId?'active':''}" data-id="${enc(a.id)}" title="点击切换账号"><span class="accountName"><span class="dot">●</span> ${enc(a.name)}</span><span class="accountCount">${a.done}/${cfg.target}</span><span class="tiny" data-action="rename-account" data-id="${enc(a.id)}" title="修改名称或移除">⋯</span></button>`).join('')}</div></div>`;
  }).join('');$('targetCount').value=cfg.target;}
function refreshHeader(){if(!cfg)return;const reached=cfg.accounts.filter(a=>a.done>=cfg.target).length;
  $('topCenter').textContent=`${cfg.groups.length} 个浏览器组 · ${cfg.accounts.length} 个独立账号位 · ${reached} 个达到手动目标`;
  $('addressText').textContent=`doubao.com / ${getAccount()?.name||'当前账号'}`;
  $('bottomSummary').textContent=`${getAccount()?.name||'—'} · 每号目标 ${cfg.target} 条 · ${ws?.workspace?.episodes?.length||0} 集`;
}
async function switchAccount(id){await flushPrompt();const x=await safe(()=>B.selectAccount(id));if(!x)return;cfg.activeAccountId=id;const group=getGroup();if(group)expandGroups.add(group.id);renderGroups();refreshHeader();$('webStatus').textContent='正在进入独立的豆包登录会话…';await refreshExtension();bounds();}
async function nextAccount(){const all=cfg.groups.flatMap(g=>cfg.accounts.filter(a=>a.groupId===g.id));if(!all.length)return;const cur=all.findIndex(a=>a.id===cfg.activeAccountId), rotated=[...all.slice(cur+1),...all.slice(0,cur+1)];await switchAccount(rotated.find(a=>a.done<cfg.target)?.id||all[(cur+1)%all.length].id)}
function bounds(){requestAnimationFrame(()=>{const rect=$('webHost').getBoundingClientRect();if(rect.width>=100&&rect.height>=100)B.bounds({x:rect.left,y:rect.top,width:rect.width,height:rect.height})})}
function applyLayout(){const v=ws?.workspace?.layout;if(!v)return;const root=document.documentElement;root.style.setProperty('--rightw',v.rightWidth+'px');root.style.setProperty('--bottomh',v.bottomHeight+'px');$('timeline').style.display=v.bottomCollapsed?'none':'';$('bottomResizer').style.display=v.bottomCollapsed?'none':'';$('btnToggleBottom').textContent=v.bottomCollapsed?'展开底栏':'收起底栏';bounds()}
function renderWorkspaceShell(){if(!ws)return;const data=ws.workspace,ep=getEp(),seg=getSeg();
  $('projectName').textContent=data.title;const total=data.episodes.reduce((n,e)=>n+e.segments.length,0);
  $('projectStats').textContent=`${data.episodes.length} 集 · ${total} 段 · 参考图 ${ws.assets?.recognized||0} 张识别成功`;
  $('timelineInfo').textContent=ep?`${ep.title}　·　${ep.segments.length} 段　·　当前第${seg?.n||'—'}段`:'请导入 TXT/MD、多集原文或旧工作台项目';
  const allowedEpisodes=data.episodes.filter(e=>data.showHidden||(!e.hidden&&e.segments.some(s=>!s.hidden)));
  const select=$('rightEpisode');select.innerHTML=allowedEpisodes.map((e,i)=>`<option value="${enc(e.id)}">${enc(e.title||`第${i+1}集`)}</option>`).join('')||'<option value="">尚无剧集</option>';select.value=ep?.id||'';
  const allowedSegments=ep?.segments.filter(s=>data.showHidden||(!ep.hidden&&!s.hidden))||[];
  const opt=$('rightSegment');opt.innerHTML=allowedSegments.map((s,i)=>`<option value="${enc(s.id)}">第${s.n}段｜${enc(s.title||'未命名')}</option>`).join('')||'<option value="">尚无分段</option>';opt.value=seg?.id||'';
  $('statusSelect').value=seg?.status||'pending';$('statusSelect').disabled=!seg||!!ep?.locked||!!seg?.locked;
  const index=allowedEpisodes.findIndex(e=>e.id===ep?.id);
  $('btnPrevEp').disabled=index<=0;$('btnNextEp').disabled=index<0||index>=allowedEpisodes.length-1;
  $('btnPrevSeg').disabled=!seg;$('btnNextSeg').disabled=!seg;
  $('segmentStrip').innerHTML=allowedSegments.map((s,i)=>`<div class="segmentCard ${s.id===seg?.id?'active':''} ${s.hidden?'hiddenItem':''} ${(ep?.locked||s.locked)?'lockedItem':''}" data-sid="${enc(s.id)}" role="button" tabindex="0" title="${enc(s.title)}"><div class="segCardTop"><strong>第${s.n}段</strong><span class="segCardOps"><button class="miniEye" data-seg-action="hide" data-sid="${enc(s.id)}" aria-label="${s.hidden?'恢复':'隐藏'}第${s.n}段" title="${s.hidden?'恢复':'隐藏'}本段">${s.hidden?'◉':'◌'}</button><button class="miniLock" data-seg-action="lock" data-sid="${enc(s.id)}" aria-label="${s.locked?'解锁':'锁定'}第${s.n}段" title="${s.locked?'解锁':'锁定'}本段">${s.locked?'🔒':'♧'}</button></span></div><div class="segCardCompact"><span class="segState ${s.status}">${statusText(s.status)}</span><span>参考图 ${s.codes.length} 张</span></div></div>`).join('')||'<div class="emptySeg">无可显示分段。点击「显示已隐藏」可恢复。</div>';
  const active=$('segmentStrip').querySelector('.segmentCard.active');if(active)active.scrollIntoView({block:'nearest',inline:'nearest'});
  const frozen=!!(ep?.locked||seg?.locked);
  $('promptText').disabled=!seg||frozen;$('btnCopyText').disabled=!seg;$('btnPull').disabled=!seg;$('btnEditCodes').disabled=!seg||frozen;
  $('btnAddImages').disabled=!seg||frozen;$('btnPullImages').disabled=!seg;$('btnExportImages').disabled=!seg;
  $('btnAllImages').disabled=!seg;$('btnClearImages').disabled=!seg;
  const text=seg?.text||''; $('promptText').value=text;lastOriginal=text;showWords();$('promptSaveStatus').textContent=seg?(frozen?'🔒 已锁定 · 原文只读，仍可复制和导出':'完整原文 · 修改自动保存'):'请先导入剧集';
  $('btnEpisodeTree').textContent=ep?`▣ ${ep.number!=null?`第${ep.number}集`:ep.title.slice(0,12)} ▾`:'▣ 选择剧集 ▾';
  $('btnEpisodeTree').disabled=!ep;
  const finished=ep?.segments.filter(s=>s.status==='done').length||0;
  $('episodeMiniStat').textContent=ep?`${ep.segments.length}段 · 已完成${finished} · 待制作${ep.segments.filter(s=>s.status==='pending').length}`:'暂无剧集';
  $('btnShowHidden').textContent=data.showHidden?'✓ 显示已隐藏':'显示已隐藏';
  for(const key of ['btnHideEpisode','btnLockEpisode','btnHideSegment','btnLockSegment'])$(key).disabled=!ep||!seg;
  $('btnHideEpisode').textContent=ep?.hidden?'◉':'◌';$('btnHideEpisode').title=ep?.hidden?'显示本集':'隐藏本集';
  $('btnLockEpisode').textContent=ep?.locked?'🔒':'♧';$('btnLockEpisode').title=ep?.locked?'解锁本集':'锁定本集';
  $('btnHideSegment').textContent=seg?.hidden?'恢复本段':'隐藏本段';
  $('btnLockSegment').textContent=seg?.locked?'解锁本段':'锁定本段';
  renderEpisodeTree();
  selected=new Set(seg?.selectedPaths||[]);lastAnchor=-1;refreshHeader();
}
function renderEpisodeTree(){if(!ws)return;const data=ws.workspace;
  const target=data.treeExpandedEpisodeId||data.activeEpisodeId;
  const episodes=data.episodes.filter(ep=>data.showHidden||(!ep.hidden&&ep.segments.some(s=>!s.hidden)));
  $('episodeTreeList').innerHTML=episodes.map((ep,i)=>{
    const opened=ep.id===target,segments=ep.segments.filter(s=>data.showHidden||(!ep.hidden&&!s.hidden));
    const done=ep.segments.filter(s=>s.status==='done').length;
    return `<div class="treeEpisode" data-tree-eid="${enc(ep.id)}"><div class="treeEpisodeHead"><button class="treeName ${ep.id===data.activeEpisodeId?'current':''}" data-tree-action="expand" data-eid="${enc(ep.id)}">${opened?'▾':'▸'} ${enc(ep.title||`第${i+1}集`)} ${ep.locked?'🔒':''}${ep.hidden?'（已隐藏）':''}</button><span class="treeBadge">${done}/${ep.segments.length} 完成</span><button class="treeMini" data-tree-action="hide-ep" data-eid="${enc(ep.id)}" title="${ep.hidden?'恢复本集':'隐藏本集'}">${ep.hidden?'显示':'隐藏'}</button><button class="treeMini" data-tree-action="lock-ep" data-eid="${enc(ep.id)}" title="${ep.locked?'解锁本集':'锁定本集'}">${ep.locked?'解锁':'🔒'}</button></div>${opened?`<div class="treeSegments">${segments.map(s=>`<button data-tree-action="segment" data-eid="${enc(ep.id)}" data-sid="${enc(s.id)}" class="${s.id===data.activeSegmentId&&ep.id===data.activeEpisodeId?'selected':''} ${s.hidden?'hiddenItem':''} ${s.locked?'lockedItem':''}" title="${enc(s.title)}">第${s.n}段 · ${enc(s.title.slice(0,17))} ${s.hidden?'（隐藏）':''}</button>`).join('')||'<span class="tiny">本集暂无可显示段落</span>'}</div>`:''}</div>`;
  }).join('')||'<div class="emptySeg" style="padding:12px">暂无可显示剧集。点击「显示已隐藏」恢复。</div>';
}
function toggleTree(open){treeOpen=!!open;$('episodeTreePanel').hidden=!treeOpen;$('timeline').classList.toggle('tree-open',treeOpen);$('btnEpisodeTree').setAttribute('aria-expanded',String(treeOpen));if(treeOpen)renderEpisodeTree();bounds()}
async function mutateWorkspace(action){await flushPrompt();const result=await action();if(!result)return;ws=result.state||result;renderWorkspaceShell();await renderImages();bounds()}
async function refreshDownloads(){downloadsState=await B.downloadState();renderDownloads()}
function renderDownloads(){if(!downloadsState)return;$('downloadPath').textContent=downloadsState.root||'未设置下载目录';$('downloadPath').title=downloadsState.root||'';
  const records=downloadsState.history||[];$('downloadStatus').textContent=records.filter(x=>x.status==='completed').length+' 项已完成';
  $('downloadHistory').innerHTML=records.slice(0,7).map(x=>`<button class="downloadItem" data-dl-id="${enc(x.id)}" title="${enc(x.path)}"><span class="fileInfo">${enc(x.file)}</span><span class="downloadState ${enc(x.status)}">${({completed:'完成',progressing:'下载中',cancelled:'取消',interrupted:'中断'}[x.status]||x.status)}</span></button>`).join('')||'暂无下载记录；请在豆包网页使用正常下载入口';
}
async function refreshExtension(){extensionState=await B.extensionStatus();renderExtension()}
function renderExtension(){const c=extensionState?.candidate,l=extensionState?.loaded;const lines=[];
  if(c){lines.push(`${c.name} v${c.version}`);lines.push(`权限：${c.permissions.join('、')||'无'}`);lines.push(`可访问：${c.hosts.join('、')||'未声明'}`);if(c.warnings.length)lines.push('注意：'+c.warnings.join('；'));}
  if(l)lines.push(`当前账号已载入 ${l.name}，功能尚未通过兼容性验证`);if(!c)lines.push('尚未选择扩展。原 Edge 插件不会自动迁入。');
  $('extensionInfo').textContent=lines.join('\n');$('btnExtTest').disabled=!c;$('btnExtUnload').disabled=!l;
}
function showWords(){$('wordCount').textContent=$('promptText').value.length+' 字'}
async function renderImages(){const ep=getEp(),seg=getSeg(),seq=++renderSeq;
  imageRows=[];if(ep&&seg){try{imageRows=await B.wsImages(ep.id,seg.id)}catch(e){if(seq===renderSeq)error(e);return}}
  if(seq!==renderSeq)return;
  const present=imageRows.filter(r=>r.file&&!r.missing).length,missing=imageRows.filter(r=>r.missing),dups=imageRows.filter(r=>r.duplicate);
  $('imgCount').textContent=`${present}/${imageRows.length} 张`;
  const safePaths=new Set(imageRows.filter(r=>r.file&&!r.missing).map(r=>r.file.path));selected=new Set([...selected].filter(p=>safePaths.has(p)));
  $('imageGrid').innerHTML=imageRows.map((r,i)=>{
    const p=r.file?.path,has=p&&!r.missing,cho=has&&selected.has(p);
    const vers=r.versions.length>1?`<select class="versionSelect" data-code="${enc(r.code)}" title="多个版本，选择正确原图">${r.versions.map(v=>`<option value="${enc(v.path)}" ${v.path===p?'selected':''}>${enc(v.relative)}</option>`).join('')}</select>`:'';
    return `<div class="imageCard ${cho?'selected':''} ${!has?'missing':''}" data-path="${enc(p||'')}" data-index="${i}" draggable="${has?'true':'false'}" title="${enc(r.file?.relative||r.code+'（缺图）')}"><div class="thumb">${has&&r.file.url?`<img alt="${enc(r.code)}" src="${enc(r.file.url)}" loading="lazy">`:'缺图'}</div><label>${enc(r.code)}</label>${cho?'<span class="check">✓</span>':''}${vers}</div>`;
  }).join('')||'<div class="emptySeg" style="padding:22px 0">本段暂无图片编号；可用「补充图片」。</div>';
  const warn=[];if(missing.length)warn.push(`缺少 ${missing.length} 张：${missing.map(x=>x.code).join('、')}`);if(dups.length)warn.push(`${dups.length} 个编号有多个版本，请核对`);if(imageRows.length>9)warn.push(`本段 ${imageRows.length} 张超过常用9图限制，软件不会删图`);
  $('imageWarning').hidden=!warn.length;$('imageWarning').textContent=warn.join('；');selectionLabels();
}
function selectionLabels(){$('selectionCount').textContent=`已选择 ${selected.size} 张`;const all=imageRows.filter(r=>r.file&&!r.missing).length;$('dragHandle').textContent=`☷ 按住这里拖动 ${selected.size||all} 张${selected.size?'选中':'本段'}图片到豆包`;$('dragHandle').setAttribute('aria-disabled',(!all).toString())}
async function persistSelection(){const e=getEp(),s=getSeg();if(!e||!s)return;const paths=[...selected];s.selectedPaths=paths;await B.wsSetSelection(e.id,s.id,paths)}
function refreshCards(){document.querySelectorAll('.imageCard').forEach(el=>{const value=selected.has(el.dataset.path);el.classList.toggle('selected',value);const check=el.querySelector('.check');if(value&&!check)el.insertAdjacentHTML('beforeend','<span class="check">✓</span>');else if(!value&&check)check.remove()});selectionLabels()}
async function flushPrompt(){const e=getEp(),s=getSeg();if(!e||!s)return;if(e.locked||s.locked){$('promptText').value=lastOriginal;return;}clearTimeout(promptTimer);const value=$('promptText').value;if(value===lastOriginal)return;const stamp=++saveSequence;
  s.text=value;const returned=await safe(()=>B.wsEditText(e.id,s.id,value));if(returned){lastOriginal=value;ws=returned;if(stamp===saveSequence)$('promptSaveStatus').textContent='✓ 已保存（原文完整）'}
}
async function reloadWorkspace(){const v=await B.wsState();ws=v;renderWorkspaceShell();applyLayout();await renderImages();if(v.warning)toast(v.warning)}
async function chooseSegment(epId,segId){if(!epId||!segId)return;await flushPrompt();const v=await safe(()=>B.wsSelect(epId,segId));if(!v)return;ws=v;renderWorkspaceShell();await renderImages();bounds();}
async function chooseEpisode(epId){const ep=ws?.workspace.episodes.find(e=>e.id===epId);const first=ep?.segments.find(s=>ws.workspace.showHidden||(!ep.hidden&&!s.hidden));if(first)await chooseSegment(ep.id,first.id)}
async function moveEpisode(dir){const v=(ws?.workspace.episodes||[]).filter(e=>ws.workspace.showHidden||(!e.hidden&&e.segments.some(s=>!s.hidden))),i=v.findIndex(e=>e.id===getEp()?.id);const e=v[i+dir];if(e)await chooseEpisode(e.id);else toast('已到剧集边界')}
async function moveSegment(dir){const ep=getEp(),seg=getSeg();if(!ep||!seg)return;const data=ws.workspace;const flat=data.episodes.flatMap(e=>e.segments.filter(s=>data.showHidden||(!e.hidden&&!s.hidden)).map(s=>({ep:e,seg:s})));const i=flat.findIndex(x=>x.ep.id===ep.id&&x.seg.id===seg.id);const dest=flat[i+dir];if(dest)await chooseSegment(dest.ep.id,dest.seg.id);else toast('已到剧集边界')}
async function autoPull(){await flushPrompt();await reloadWorkspace();toast('已从本地项目拉取完整提示词及本段编号参考图')}
function dragFiles(ev,override){const ep=getEp(),seg=getSeg();if(!ep||!seg)return;const paths=override|| (selected.size?[...selected]:imageRows.filter(r=>r.file&&!r.missing).map(r=>r.file.path));if(!paths.length){toast('本段没有可用图片，请先扫描素材目录');ev.preventDefault();return}
  ev.preventDefault();B.wsStartDrag({episodeId:ep.id,segmentId:seg.id,paths});
}
function dialogClose(d){d.close();B.setOverlay(false)}
function setupResize(handle,name){let begin=null;handle.addEventListener('pointerdown',e=>{if(focus)return;const style=getComputedStyle(document.documentElement),varName=name==='left'?'--leftw':name==='right'?'--rightw':'--bottomh';begin={x:e.clientX,y:e.clientY,start:parseInt(style.getPropertyValue(varName))|| (name==='left'?245:name==='right'?450:210)};handle.setPointerCapture(e.pointerId);handle.classList.add('dragging');e.preventDefault()});handle.addEventListener('pointermove',e=>{if(!begin||!handle.hasPointerCapture(e.pointerId))return;const diff=name==='bottom'?begin.y-e.clientY:(name==='left'?e.clientX-begin.x:begin.x-e.clientX);const min=name==='left'?175:name==='right'?300:185,max=name==='left'?380:name==='right'?750:500;const next=Math.max(min,Math.min(max,begin.start+diff));document.documentElement.style.setProperty(name==='left'?'--leftw':name==='right'?'--rightw':'--bottomh',next+'px');bounds()});handle.addEventListener('pointerup',async e=>{if(!begin)return;const root=getComputedStyle(document.documentElement);const next=name==='bottom'?{bottomHeight:parseInt(root.getPropertyValue('--bottomh'))}:name==='right'?{rightWidth:parseInt(root.getPropertyValue('--rightw'))}:null;begin=null;handle.classList.remove('dragging');try{handle.releasePointerCapture(e.pointerId)}catch{}if(next)await safe(()=>B.wsLayout(next));bounds()})}
function initAccounts(){const list=$('groupList');list.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(button){event.stopPropagation();const {action,gid,id}=button.dataset;
    if(action==='add-account'){const name=await ask('新增账号名称',`豆包 ${String(cfg.accounts.length+1).padStart(2,'0')}`);if(name)await safe(async()=>{cfg=await B.addAccount(gid,name);renderGroups();refreshHeader()})}
    if(action==='rename-group'){const g=cfg.groups.find(g=>g.id===gid),name=await ask('修改分组名称',g.name);if(name)await safe(async()=>{cfg=await B.renameGroup(gid,name);renderGroups()})}
    if(action==='edge-config'){const g=cfg.groups.find(g=>g.id===gid),name=await ask('Edge 配置文件：Default 或 Profile 1 等',g.edgeProfile);if(name)await safe(async()=>{cfg=await B.setEdge(gid,name);toast('备用 Edge 配置已保存')})}
    if(action==='rename-account'){const a=cfg.accounts.find(a=>a.id===id),name=await ask('账号名称（输入 - 移除账号位）',a.name);if(name==='-'&&await confirmAction('移除账号位？','仅从目录移除，不删除系统中的登录信息；请先确认当前账号。'))await safe(async()=>{cfg=await B.removeAccount(id);renderGroups();refreshHeader()});else if(name&&name!=='-')await safe(async()=>{cfg=await B.renameAccount(id,name);renderGroups()})}
    return;
  }
  const a=event.target.closest('.account');if(a){await switchAccount(a.dataset.id);return}
  const group=event.target.closest('.groupHead');if(group){const key=group.closest('[data-group]').dataset.group;expandGroups.has(key)?expandGroups.delete(key):expandGroups.add(key);renderGroups()}
});
  $('btnAddGroup').onclick=()=>safe(async()=>{const name=await ask('新增浏览器组',`浏览器组 ${cfg.groups.length+1}`);if(!name)return;cfg=await B.addGroup(name);expandGroups.add(cfg.groups.at(-1).id);renderGroups();refreshHeader()});
  $('targetCount').onchange=()=>safe(async()=>{cfg=await B.setTarget($('targetCount').value);renderGroups();refreshHeader()});
  $('btnNext').onclick=()=>safe(nextAccount);
  $('btnMarkDone').onclick=()=>safe(async()=>{cfg=await B.progress(cfg.activeAccountId,1);renderGroups();refreshHeader();toast('当前账号手动完成计数 +1')});
  $('btnUndoDone').onclick=()=>safe(async()=>{cfg=await B.progress(cfg.activeAccountId,-1);renderGroups();refreshHeader()});
  $('btnReset').onclick=()=>safe(async()=>{if(await confirmAction('重置全部账号计数？','只重置本地手动视频计数，不改变豆包平台额度。')){cfg=await B.resetProgress();renderGroups();refreshHeader()}});
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.onclick=()=>safe(()=>B.nav(btn.dataset.nav)));
  $('btnEdge').onclick=()=>safe(async()=>{await B.openEdge(getGroup().id);toast('已打开备用 Edge：不会复用本软件的独立账号登录状态')});
  $('btnMaxBrowser').onclick=()=>{focus=!focus;$('layout').classList.toggle('focus',focus);$('btnMaxBrowser').textContent=focus?'退出专注':'专注';bounds()};
  $('btnBackup').onclick=()=>safe(async()=>{if(await B.backup())toast('账号清单备份成功（不包含登录凭证）')});
  $('btnData').onclick=()=>safe(()=>B.openData());
}
function initWorkspace(){
  $('rightEpisode').onchange=e=>safe(()=>chooseEpisode(e.target.value));
  $('btnEpisodeTree').onclick=()=>toggleTree(!treeOpen);
  $('episodeTreeList').onclick=e=>safe(async()=>{const btn=e.target.closest('[data-tree-action]');if(!btn)return;const {treeAction,eid,sid}=btn.dataset;if(treeAction==='expand'){await mutateWorkspace(()=>B.wsTreeEpisode(eid));}else if(treeAction==='segment'){toggleTree(false);await chooseSegment(eid,sid);}else if(treeAction==='hide-ep'){const ep=ws.workspace.episodes.find(x=>x.id===eid);await mutateWorkspace(()=>B.wsHidden(eid,null,!ep.hidden));}else if(treeAction==='lock-ep'){const ep=ws.workspace.episodes.find(x=>x.id===eid);await mutateWorkspace(()=>B.wsLocked(eid,null,!ep.locked));}});
  $('btnShowHidden').onclick=()=>safe(()=>mutateWorkspace(()=>B.wsShowHidden(!ws.workspace.showHidden)));
  $('btnHideDone').onclick=()=>safe(async()=>{const result=await B.wsHideDone();ws=result.state;renderWorkspaceShell();await renderImages();toast(`已隐藏 ${result.hidden} 个完成段，可点“显示已隐藏”查看`);bounds()});
  $('btnHideEpisode').onclick=()=>safe(async()=>{const e=getEp();if(e)await mutateWorkspace(()=>B.wsHidden(e.id,null,!e.hidden))});
  $('btnLockEpisode').onclick=()=>safe(async()=>{const e=getEp();if(e)await mutateWorkspace(()=>B.wsLocked(e.id,null,!e.locked))});
  $('btnHideSegment').onclick=()=>safe(async()=>{const e=getEp(),s=getSeg();if(s)await mutateWorkspace(()=>B.wsHidden(e.id,s.id,!s.hidden))});
  $('btnLockSegment').onclick=()=>safe(async()=>{const e=getEp(),s=getSeg();if(s)await mutateWorkspace(()=>B.wsLocked(e.id,s.id,!s.locked))});
  $('rightSegment').onchange=e=>safe(()=>chooseSegment(getEp().id,e.target.value));
  $('segmentStrip').onclick=e=>safe(async()=>{const op=e.target.closest('[data-seg-action]');if(op){const e=getEp(),s=e?.segments.find(x=>x.id===op.dataset.sid);if(!s)return;if(op.dataset.segAction==='hide')await mutateWorkspace(()=>B.wsHidden(e.id,s.id,!s.hidden));else await mutateWorkspace(()=>B.wsLocked(e.id,s.id,!s.locked));return;}const item=e.target.closest('.segmentCard[data-sid]');if(item&&getEp())await chooseSegment(getEp().id,item.dataset.sid)});
  $('segmentStrip').onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('segmentCard')){e.preventDefault();e.target.click()}};
  $('btnPrevEp').onclick=()=>safe(()=>moveEpisode(-1));$('btnNextEp').onclick=()=>safe(()=>moveEpisode(1));
  $('btnPrevSeg').onclick=()=>safe(()=>moveSegment(-1));$('btnNextSeg').onclick=()=>safe(()=>moveSegment(1));
  $('statusSelect').onchange=e=>safe(async()=>{await flushPrompt();const ep=getEp(),seg=getSeg();if(!seg)return;ws=await B.wsSetStatus(ep.id,seg.id,e.target.value,cfg.activeAccountId);renderWorkspaceShell();await renderImages();toast('制作状态：'+statusText(e.target.value))});
  $('promptText').oninput=()=>{showWords();$('promptSaveStatus').textContent='正在保存…';clearTimeout(promptTimer);promptTimer=setTimeout(()=>safe(flushPrompt),500)};
  $('btnCopyText').onclick=()=>safe(async()=>{await flushPrompt();const text=getSeg()?.text||'';if(!text)return toast('当前段还没有提示词');await B.copyText(text);toast(`已复制本段完整提示词（${text.length} 字）`)});
  $('btnPull').onclick=()=>safe(autoPull);$('btnPullImages').onclick=()=>safe(async()=>{await flushPrompt();await B.wsRescan();await reloadWorkspace();toast('已重扫图片目录并更新本段参考图')});
  $('btnAddImages').onclick=()=>safe(async()=>{await flushPrompt();const ep=getEp(),seg=getSeg();if(!seg)return;const r=await B.wsManualImages(ep.id,seg.id);if(!r.cancelled){await reloadWorkspace();toast('已加入补充图片路径')}});
  $('btnEditCodes').onclick=()=>safe(async()=>{await flushPrompt();const e=getEp(),s=getSeg();if(!s)return;const codes=await ask('校正本段需要参考图（用顿号分隔）',s.codes.join('、'));if(codes===null)return;ws=await B.wsEditCodes(e.id,s.id,codes);renderWorkspaceShell();await renderImages();toast('参考图编号已手动保存，完整提示词原文未修改')});
  $('imageGrid').onclick=e=>safe(async()=>{if(e.target.closest('select'))return;const card=e.target.closest('.imageCard');if(!card||!card.dataset.path)return;const p=card.dataset.path,i=Number(card.dataset.index);
    if(e.shiftKey&&lastAnchor>=0){const rows=imageRows.slice(Math.min(lastAnchor,i),Math.max(lastAnchor,i)+1);for(const row of rows)if(row.file&&!row.missing)selected.add(row.file.path)}
    else if(e.ctrlKey||e.metaKey){selected.has(p)?selected.delete(p):selected.add(p)}
    else selected=new Set([p]);lastAnchor=i;refreshCards();await persistSelection();
  });
  $('imageGrid').onchange=e=>safe(async()=>{const combo=e.target.closest('select.versionSelect');if(!combo)return;await flushPrompt();await B.wsChooseVersion(combo.dataset.code,combo.value);await reloadWorkspace();toast('已选择该编号对应的图片版本')});
  $('imageGrid').addEventListener('dragstart',e=>{const card=e.target.closest('.imageCard');if(!card||!card.dataset.path)return;const path=card.dataset.path;dragFiles(e,selected.has(path)?[...selected]:[path])});
  $('dragHandle').addEventListener('dragstart',e=>dragFiles(e));
  $('btnAllImages').onclick=()=>safe(async()=>{selected=new Set(imageRows.filter(r=>r.file&&!r.missing).map(r=>r.file.path));refreshCards();await persistSelection()});
  $('btnClearImages').onclick=()=>safe(async()=>{selected.clear();refreshCards();await persistSelection()});
  $('btnExportImages').onclick=()=>safe(async()=>{await flushPrompt();const e=getEp(),s=getSeg();if(!s)return;const result=await B.wsExport(e.id,s.id);toast(`已打开备用上传文件夹：${result.copied} 张，缺失 ${result.missing.length} 张。请在豆包网页里手动选择图片。`)});
  $('btnCopyImage').onclick=()=>safe(async()=>{const path=[...selected][0]||imageRows.find(r=>r.file&&!r.missing)?.file.path;if(!path)return toast('还没有可复制的参考图');await B.copyImage(path);toast('已复制单张图片，在豆包输入区按 Ctrl+V')});
  $('btnRevealImage').onclick=()=>safe(async()=>{const path=[...selected][0]||imageRows.find(r=>r.file&&!r.missing)?.file.path;if(!path)return toast('请先选择图片');await B.revealImage(path)});
  $('btnToggleBottom').onclick=()=>safe(async()=>{const collapsed=!ws.workspace.layout.bottomCollapsed;await B.wsLayout({bottomCollapsed:collapsed});ws.workspace.layout.bottomCollapsed=collapsed;applyLayout()});
  $('btnChooseFolder').onclick=()=>safe(async()=>{const result=await B.wsFolder();if(result.cancelled)return;await reloadWorkspace();toast(`素材目录已扫描：${result.recognized} 张编号图，重复 ${result.duplicates} 张`)});
  $('btnImportFiles').onclick=()=>safe(async()=>{const r=await B.wsImportFiles();if(r.cancelled)return;await reloadWorkspace();toast(`导入 ${r.addedEpisodes} 集、${r.addedSegments} 段${r.errors.length?'；异常：'+r.errors.join('；'):''}`)});
  $('btnImportOld').onclick=()=>safe(async()=>{const r=await B.wsImportOld();if(r.cancelled)return;await reloadWorkspace();toast(`已只读迁入旧工作台：${r.episodes} 集、${r.segments} 段；原项目没有修改`)});
  $('btnPaste').onclick=()=>modal($('pasteDialog'));$('btnAutoSplit').onclick=()=>{modal($('pasteDialog'));$('pasteText').placeholder='粘贴完整多集提示词；系统会自动识别第X集 / 第X段标题并拆分，保留全部原文与编号。';};
  $('closePaste').onclick=()=>dialogClose($('pasteDialog'));
  $('submitPaste').onclick=()=>safe(async()=>{const text=$('pasteText').value;if(!text.trim())return toast('请输入完整提示词');const r=await B.wsImportText(text,'手动粘贴.txt');dialogClose($('pasteDialog'));$('pasteText').value='';await reloadWorkspace();toast(`已加入 ${r.addedEpisodes} 集、${r.addedSegments} 段`)});

  $('btnMoreTools').onclick=()=>modal($('toolsDialog'));$('closeTools').onclick=()=>dialogClose($('toolsDialog'));
  $('btnRescan').onclick=()=>safe(async()=>{const stats=await B.wsRescan();await reloadWorkspace();$('assetStats').textContent=JSON.stringify(stats,null,2);toast('已更新素材索引')});
  $('btnProjectBackup').onclick=()=>safe(async()=>{await flushPrompt();const r=await B.wsBackup();if(!r.cancelled)toast('漫剧项目已备份（不含真实图片、登录信息）')});
  $('btnProjectRestore').onclick=()=>safe(async()=>{if(!await confirmAction('恢复项目？','这将替换当前 v0.2 漫剧项目，会自动保留一份恢复前快照；豆包账号登录信息不受影响。'))return;const r=await B.wsRestore();if(r.cancelled)return;await reloadWorkspace();toast('项目恢复完成，原账号环境保持不变')});
  $('btnExportSegment').onclick=()=>safe(async()=>{const ep=getEp(),seg=getSeg();if(!seg)return toast('没有当前段落');const r=await B.wsExport(ep.id,seg.id);toast(`已导出本段：${r.copied} 张图，${r.missing.length} 张缺图`)});
  $('btnProjectName').onclick=()=>safe(async()=>{const name=await ask('修改当前项目名称',ws.workspace.title);if(!name)return;ws=await B.wsRename(name);renderWorkspaceShell();toast('项目名称已保存')});
  $('btnShowPaths').onclick=()=>{$('assetStats').textContent=JSON.stringify(ws.assets,null,2)};
  $('btnDownloadRefresh').onclick=()=>safe(refreshDownloads);
  $('downloadHistory').onclick=e=>safe(async()=>{const el=e.target.closest('[data-dl-id]');if(el)await B.downloadReveal(el.dataset.dlId)});
  $('btnDownloadFolder').onclick=()=>safe(()=>B.downloadOpen());
  $('btnDownloadChoose').onclick=()=>safe(async()=>{const r=await B.downloadChoose();if(!r.cancelled){downloadsState=r;renderDownloads();toast('新下载位置已保存，不会移动或删除原有文件')}});
  $('btnExtInspect').onclick=()=>safe(async()=>{const r=await B.extensionInspect();if(r.cancelled)return;await refreshExtension();toast('扩展文件权限清单已读取；请审查后再决定是否测试载入')});
  $('btnExtTest').onclick=()=>safe(async()=>{const r=await B.extensionLoad();if(!r.cancelled){await refreshExtension();toast('扩展已载入本账号，但无水印功能尚未验证')}});
  $('btnExtUnload').onclick=()=>safe(async()=>{await B.extensionUnload();await refreshExtension();toast('已卸载当前账号测试扩展')});
  $('btnEdgeDownload').onclick=()=>safe(async()=>{await B.openEdge(getGroup().id);toast('已打开 Edge 的对应配置文件；扩展是否可用取决于你的 Edge 安装状态')});
}

// Doubao browser attachment automation. Do not mark as successful without a
// platform-owned native @ token; never edit the original episode prompt.
let mentionBusy=false;
function mentionStatusView(r){
 const label=$('mentionNote'),box=$('mentionDetails'),progress=$('mentionProgress');
 if(!r)return;
 label.textContent=r.message||r.error||'预检完成';
 const rows=r.rows||r.results||[];
 if(rows.length){
  box.hidden=false;
  box.innerHTML=rows.map(x=>{const state=x.state||'pending',txt=x.reason||x.message||x.webState||'待检查';
   return `<div class="mentionItem"><strong>${enc(x.code)}</strong><span class="mentionState ${enc(state)}">${enc(state==='ready'?'已匹配':state==='verified'?'已验证引用':state==='missing'?'缺图':state==='conflict'?'图片重名':state==='uploaded'?'网页上传确认':state==='attachment-visible'?'附件可见待确认':state==='file-selected'?'文件已选择':state==='matched'?'本地已匹配':state==='pending'?'网页未确认':state==='manual'?'需手动上传':state==='error'?'失败':state==='unsupported'?'格式不支持':'待确认')}</span><small title="${enc(txt)}">${enc(txt)}</small></div>`;
  }).join('');
 }
 if(r.state==='running'){progress.hidden=false;progress.textContent=r.message||'执行中…'}
 if(['done','error','cancelled'].includes(r.state)){progress.hidden=false;progress.textContent=r.message||'执行结束'}
}
async function runMention(checkOnly=false){
 if(mentionBusy)return;
 const ep=getEp(),seg=getSeg();if(!ep||!seg){toast('请先选择集和段');return}
 await flushPrompt();
 const btn=$('btnMention');btn.disabled=true;
 try{
  const plan=await B.mentionPreflight(ep.id,seg.id);
  mentionStatusView(plan);
  if(!plan.ready){toast(plan.error||'网页预检失败');return}
  if(!plan.rows?.length){toast('未识别到需要参考图编号');return}
  if(plan.blocked){toast('存在缺图、重名、格式问题或超过9张，先检查下方异常');return}
  if(checkOnly){toast('预检通过，点击「一键上传并艾特」开始');return}
  mentionBusy=true;$('btnMentionCancel').hidden=false;
  mentionStatusView({state:'running',message:'正在从本地参考图库选图并检查豆包网页…'});
  const out=await B.mentionExecute(ep.id,seg.id);
  mentionStatusView(out);toast(out.message||'一键艾特处理结束');
 }catch(e){mentionStatusView({state:'error',message:e.message});toast(e.message)}
 finally{mentionBusy=false;btn.disabled=false;$('btnMentionCancel').hidden=true}
}
function initMention(){
 $('btnMention').onclick=()=>runMention(false);
 $('btnMentionCheck').onclick=()=>runMention(true);
 $('btnMentionCancel').onclick=()=>B.mentionCancel();
 B.onMentionStatus(mentionStatusView);
}

function initGlobal(){const help=$('helpDialog');$('btnHelp').onclick=()=>modal(help);$('closeHelp').onclick=$('closeHelpBottom').onclick=()=>dialogClose(help);
  for(const id of ['helpDialog','pasteDialog','toolsDialog'])$(id).addEventListener('cancel',e=>{e.preventDefault();dialogClose($(id))});
  setupResize($('leftResizer'),'left');setupResize($('rightResizer'),'right');setupResize($('bottomResizer'),'bottom');
  new ResizeObserver(bounds).observe($('webHost'));window.addEventListener('resize',bounds);
  B.onStatus(x=>{if(x.id===cfg?.activeAccountId)$('webStatus').textContent=x.status});B.onToast(toast);B.onLayout(bounds);B.onDownloadChange(x=>{downloadsState=x;renderDownloads()});
  window.addEventListener('beforeunload',()=>{if(promptTimer){const e=getEp(),s=getSeg();if(s){s.text=$('promptText').value;B.wsEditText(e.id,s.id,s.text)}}});
  document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='PageDown'){e.preventDefault();safe(nextAccount)}if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();safe(()=>moveSegment(1))}if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();safe(()=>moveSegment(-1))}if(e.key==='Escape'&&focus){focus=false;$('layout').classList.remove('focus');$('btnMaxBrowser').textContent='专注';bounds()}});
}
async function main(){if(!B){$('webStatus').textContent='此页面仅能在 Electron Windows 桌面程序中操作真实豆包';return}
  try{
    cfg=await B.getCfg();ws=await B.wsState();expandGroups=new Set(cfg.groups.map(g=>g.id));
    renderGroups();renderWorkspaceShell();applyLayout();await renderImages();refreshHeader();
    initAccounts();initWorkspace();initGlobal();initMention();await refreshDownloads();await refreshExtension();
    if(cfg.activeAccountId)await switchAccount(cfg.activeAccountId);setTimeout(bounds,250);
    if(ws.warning)toast(ws.warning);
  }catch(e){error(e);$('webStatus').textContent='初始化失败：'+e.message+'。打开数据目录检查 diagnostic.log'}
}
main();


if(B){
 B.onUpdateStatus(v=>{
  if(v?.message)toast(v.message);
  $('btnInstallUpdate').hidden=v?.state!=='ready';
});
$('btnCheckUpdate').onclick=()=>safe(async()=>{
  const result=await B.checkUpdate();
  if(result?.message)toast(result.message);
});
$('btnInstallUpdate').onclick=()=>safe(async()=>{
  if(confirm('退出工作台并安装新版？未保存的提示词请先保存。'))await B.installUpdate();
});
}
