'use strict';
const $=id=>document.getElementById(id);
const doc=(tag,cls,text)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a;};
const api=window.manju;
let state={project:{episodes:[],chosenPaths:{}},assetList:[],scanStats:{}},activeEpisodeId=null,editTarget=null,codesTarget=null,selectedImages=new Map(),currentFilter='';
let toastTimer=null;
let currentGroupId=null,expandedGroups=new Set(),expandedDocs=new Set(),docAction=null;
const segmentPanelSize=()=>Math.max(220,Math.min(1100,Number(localStorage.getItem('manju-pane-size')||340)));
function clearTextSelection(){try{window.getSelection()?.removeAllRanges();}catch{}}
function clearOtherImageSelections(keep=null){
 for(const id of [...selectedImages.keys()])if(id!==keep)selectedImages.delete(id);
 document.querySelectorAll('.segment .gallery').forEach(g=>{
  if(g.dataset.segmentId!==keep){g.querySelectorAll('.image-tile.selected').forEach(t=>t.classList.remove('selected'));
    const n=g.closest('.segment')?.querySelector('.selected-count');if(n)n.textContent='已选择 0 张';}
 });
}
function selectTextIn(block){
 clearOtherImageSelections();clearTextSelection();
 const range=document.createRange();range.selectNodeContents(block);
 const selection=window.getSelection();selection.addRange(range);block.focus({preventScroll:true});
}
function selectImagesIn(seg,gallery){
 clearTextSelection();clearOtherImageSelections(seg.id);
 selectedImages.set(seg.id,new Set(chosenForSegment(seg).map(a=>a.id)));
 refreshSelected(gallery,seg);gallery.focus({preventScroll:true});
}


let openMenuAnchor=null;
function closeTreeMenu(){
 const menu=$('treeMenu');menu.classList.add('hidden');menu.replaceChildren();
 if(openMenuAnchor)openMenuAnchor.setAttribute('aria-expanded','false');
 openMenuAnchor=null;
}
function showTreeMenu(anchor,items){
 const menu=$('treeMenu');
 if(openMenuAnchor===anchor&&!menu.classList.contains('hidden')){closeTreeMenu();return;}
 closeTreeMenu();openMenuAnchor=anchor;
 anchor.setAttribute('aria-expanded','true');
 for(const [label,callback,danger] of items){
  const b=doc('button',danger?'menu-danger':'',label);
  b.type='button';b.setAttribute('role','menuitem');
  b.addEventListener('click',()=>{
   closeTreeMenu();callback();
  });
  menu.append(b);
 }
 menu.classList.remove('hidden');
 const rect=anchor.getBoundingClientRect(),width=215,height=items.length*37+12;
 menu.style.left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width+14))+'px';
 menu.style.top=Math.max(8,Math.min(window.innerHeight-height-8,rect.bottom+4))+'px';
}
function rootOptions(){return [
 ['＋ 新建大标题',()=>openDocDialog('root')],
 ['＋ 新建根目录文档',()=>{currentGroupId=null;openDocDialog('document');}]
];}
function groupOptions(g){
 return [
 ['＋ 新建大标题',()=>openDocDialog('root')],
 ...(g.parentId?[]:[['＋ 在此创建小标题',()=>{currentGroupId=g.id;openDocDialog('sub');}]]),
 ['＋ 在此创建文档',()=>{currentGroupId=g.id;openDocDialog('document');}],
 ['重命名标题',()=>openDocDialog('rename-group',g.id,g.title)],
 ['删除标题（保留文档）',()=>deleteGroup(g),true]
 ];
}
async function deleteGroup(g){
 if(!confirm('删除标题「'+g.title+'」？旗下文档仍然保留，会移到上一级目录。'))return;
 const result=await update(api.removeGroup(g.id),'标题已删除，文档已保留');
 if(result&&currentGroupId===g.id){currentGroupId=g.parentId||null;drawSidebar();}
}
function documentOptions(ep){
 const own=state.project.groups?.find(g=>g.id===ep.groupId);
 return [
 ['＋ 新建大标题',()=>openDocDialog('root')],
 ['＋ 同级新建文档',()=>{currentGroupId=ep.groupId||null;openDocDialog('document');}],
 ...(own&&!own.parentId?[['＋ 在所属标题下建小标题',()=>{currentGroupId=own.id;openDocDialog('sub');}]]:[]),
 ['重命名文档',()=>openDocDialog('rename-document',ep.id,ep.title)],
 ['移动到其他标题',()=>moveCurrentDocument(ep.id)],
 ['展开／折叠分镜段落',()=>{if(expandedDocs.has(ep.id))expandedDocs.delete(ep.id);else expandedDocs.add(ep.id);drawSidebar();}]
 ];
}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function storedNumber(key,fallback){
 try{const n=Number(localStorage.getItem(key));return Number.isFinite(n)&&n>0?n:fallback;}
 catch{return fallback;}
}
function applySidebarWidth(width){
 const n=clamp(Math.round(width),185,Math.min(520,Math.max(185,window.innerWidth-350)));
 document.querySelector('.sidebar').style.flexBasis=n+'px';
 $('sidebarResize').setAttribute('aria-valuenow',String(n));
 try{localStorage.setItem('manju-sidebar-width',String(n));}catch{}
 return n;
}
function resizeFromPointer(handle,axis,getStart,onMove){
 handle.addEventListener('pointerdown',e=>{
  if(e.button!==undefined&&e.button!==0)return;
  e.preventDefault();closeTreeMenu();
  const start=e[axis],init=getStart();
  const move=event=>onMove(init+event[axis]-start);
  const end=()=>{
   window.removeEventListener('pointermove',move);
   window.removeEventListener('pointerup',end);
   window.removeEventListener('pointercancel',end);
   document.body.classList.remove('dragging-split');
  };
  document.body.classList.add('dragging-split');
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',end);
  window.addEventListener('pointercancel',end);
 });
}
// Both sections are one unit: height and width change together. Text and image data stay intact.
function setAllPanelHeight(height){
 const n=clamp(Math.round(height),220,1100);
 for(const area of document.querySelectorAll('.segment-workarea'))area.style.height=n+'px';
 try{localStorage.setItem('manju-pane-size',String(n));}catch{}
 return n;
}
function setAllPanelWidth(width){
 const available=Math.max(1,document.querySelector('#segmentsContainer')?.clientWidth||
    document.querySelector('.main')?.clientWidth||window.innerWidth-200);
 const n=clamp(Math.round(width),Math.min(320,available),available);
 const minPercent=Math.min(100,Math.round(320/available*100));
 const percent=clamp(Math.round(n/available*100),minPercent,100);
 for(const card of document.querySelectorAll('.segment'))card.style.width=percent+'%';
 try{localStorage.setItem('manju-panel-width-percent',String(percent));}catch{}
 return percent;
}
function unifiedResizeHandle(handle,card,area){
 handle.addEventListener('pointerdown',e=>{
  if(e.button!==undefined&&e.button!==0)return;
  e.preventDefault();e.stopPropagation();closeTreeMenu();
  const startX=e.clientX,startY=e.clientY;
  const startWidth=card.getBoundingClientRect().width||document.querySelector('.main')?.clientWidth||900;
  const startHeight=area.getBoundingClientRect().height||segmentPanelSize();
  const move=event=>{
   if(event.clientX!==startX)setAllPanelWidth(startWidth+event.clientX-startX);
   if(event.clientY!==startY)setAllPanelHeight(startHeight+event.clientY-startY);
  };
  const end=()=>{
   window.removeEventListener('pointermove',move);
   window.removeEventListener('pointerup',end);
   window.removeEventListener('pointercancel',end);
   document.body.classList.remove('dragging-split');
  };
  document.body.classList.add('dragging-split');
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',end);
  window.addEventListener('pointercancel',end);
 });
 handle.addEventListener('keydown',e=>{
  if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(e.key))return;
  e.preventDefault();
  if(e.key==='ArrowDown'||e.key==='ArrowUp')
   setAllPanelHeight((area.getBoundingClientRect().height||segmentPanelSize())+(e.key==='ArrowDown'?20:-20));
  else setAllPanelWidth((card.getBoundingClientRect().width||640)+(e.key==='ArrowRight'?20:-20));
 });
}
async function moveCurrentDocument(id=activeEpisodeId){
 const ep=state.project.episodes.find(x=>x.id===id);if(!ep)return;
 const groups=state.project.groups||[];
 const names=['根目录',...groups.map(g=>(g.parentId?'　↳ ':'')+g.title)];
 const response=prompt('输入目标目录的序号（原文不变）：\n'+names.map((name,i)=>i+'．'+name).join('\n'),'0');
 if(response===null)return;
 if(!/^\d+$/.test(response)||Number(response)>=names.length){toast('请输入有效目录序号');return;}
 const groupId=Number(response)===0?null:groups[Number(response)-1].id;
 const result=await update(api.moveDocument({id:ep.id,groupId}),'文档已移动');
 if(result){currentGroupId=groupId;render();}
}

function toast(message){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),5500);}
function status(message,type='info'){$('status').textContent=message;$('status').className='status '+type;}
function assetFor(code){const group=state.assetList.find(a=>a.code===code);if(!group)return null;const p=state.project.chosenPaths?.[code];return group.items.find(a=>a.path===p)||group.items[0]||null;}
function versionsOf(code){return state.assetList.find(a=>a.code===code)?.items||[];}
function chosenForSegment(seg){return seg.codes.map(c=>assetFor(c)).filter(Boolean);}
function elBtn(label,click,className='secondary'){const b=doc('button',className,label);b.addEventListener('click',click);return b;}
async function update(promise,msg){try{const result=await promise;if(result?.project){state=result;}else if(result?.data?.project){state=result.data;}if(msg)toast(msg);render();return result;}catch(e){status('操作失败：'+e.message,'error');toast('操作失败：'+e.message);return null;}}
function drawSidebar(){
 const episodes=state.project.episodes||[],groups=state.project.groups||[];
 const total=episodes.reduce((n,e)=>n+e.segments.length,0);
 $('projectTitle').value=state.project.title;
 $('projectStats').textContent=episodes.length+' 份文档 · '+total+' 段';
 $('episodeCount').textContent=episodes.length+' 份';
 const selected=groups.find(g=>g.id===currentGroupId);
 $('currentGroupHint').textContent='当前位置：'+(selected?selected.title:'根目录');
 const tree=$('episodeList');tree.replaceChildren();
 const query=currentFilter;
 function matchesEpisode(ep){
  return !query||ep.title.toLowerCase().includes(query)||
    String(ep.number??'').includes(query)||
    ep.segments.some(s=>String(s.title).toLowerCase().includes(query));
 }
 function section(label){const el=doc('div','tree-section-label',label);tree.append(el);}
 function renderDocument(ep,depth){
  const row=doc('div','doc-tree-row doc-depth-'+depth+(ep.id===activeEpisodeId?' selected':''));
  row.setAttribute('role','treeitem');
  const caret=elBtn(expandedDocs.has(ep.id)?'▾':'▸',()=>{
    if(expandedDocs.has(ep.id))expandedDocs.delete(ep.id);else expandedDocs.add(ep.id);
    drawSidebar();
  },'tree-caret');
  row.append(caret);
  const item=elBtn('▤ '+ep.title,()=>{
    activeEpisodeId=ep.id;currentGroupId=ep.groupId||null;
    clearOtherImageSelections();clearTextSelection();
    render();document.querySelector('.main')?.scrollTo({top:0,behavior:'instant'});
  },'tree-doc-title');
  item.title=ep.title;row.append(item);
  const edit=elBtn('···',()=>showTreeMenu(edit,documentOptions(ep)),'tree-ellipsis');
  edit.title='文档选项';edit.setAttribute('aria-haspopup','menu');edit.setAttribute('aria-expanded','false');row.append(edit);tree.append(row);
  if(expandedDocs.has(ep.id)){
   for(const seg of ep.segments){
    const leaf=elBtn('↳ 第'+seg.n+'段 '+(seg.title||''),()=>{
      activeEpisodeId=ep.id;currentGroupId=ep.groupId||null;
      clearOtherImageSelections();render();
      requestAnimationFrame(()=>document.querySelector('[data-segment-id="'+seg.id+'"]')?.scrollIntoView({block:'start',behavior:'smooth'}));
    },'tree-segment doc-depth-'+(depth+1));
    leaf.title='跳转到第'+seg.n+'段';tree.append(leaf);
   }
  }
 }
 function renderGroup(g,depth=0){
  const children=groups.filter(x=>x.parentId===g.id);
  const docs=episodes.filter(x=>x.groupId===g.id&&matchesEpisode(x));
  const matched=!query||g.title.toLowerCase().includes(query)||
    docs.length||children.some(c=>c.title.toLowerCase().includes(query)||
      episodes.some(ep=>ep.groupId===c.id&&matchesEpisode(ep)));
  if(!matched)return;
  const expanded=!expandedGroups.has(g.id)||!!query;
  const row=doc('div','doc-tree-row doc-depth-'+depth+(currentGroupId===g.id?' group-selected':''));
  row.setAttribute('role','treeitem');
  row.append(elBtn(expanded?'▾':'▸',()=>{
    if(expandedGroups.has(g.id))expandedGroups.delete(g.id);else expandedGroups.add(g.id);
    drawSidebar();
  },'tree-caret'));
  const title=elBtn((depth===0?'▣ ':'▤ ')+g.title,()=>{
    currentGroupId=g.id;drawSidebar();
  },'tree-group-title'+(depth===0?' root':' sub'));
  title.title=g.title;row.append(title);
  const rename=elBtn('···',()=>showTreeMenu(rename,groupOptions(g)),'tree-ellipsis');
  rename.title='标题选项';rename.setAttribute('aria-haspopup','menu');rename.setAttribute('aria-expanded','false');row.append(rename);tree.append(row);
  if(expanded){
    for(const child of children)renderGroup(child,depth+1);
    for(const ep of docs)renderDocument(ep,depth+1);
  }
 }
 for(const group of groups.filter(g=>!g.parentId))renderGroup(group);
 const ungrouped=episodes.filter(ep=>!ep.groupId&&matchesEpisode(ep));
 if(ungrouped.length){section('未分类文档');for(const ep of ungrouped)renderDocument(ep,0);}
 if(!tree.children.length)tree.append(doc('div','muted tiny','还没有文档。先创建标题或导入提示词。'));
}
function openDocDialog(action,id=null,title=''){
 docAction={action,id};
 $('docDialogTitle').textContent={
  root:'新建大标题',sub:'新建小标题',document:'新建文档',
  'rename-group':'重命名标题','rename-document':'重命名文档'
 }[action]||'文档';
 $('docNameInput').value=title;
 $('docDialogDelete').classList.toggle('hidden',action!=='rename-group');
 $('docDialogHelp').textContent=action==='document'?'文档创建后可继续编辑提示词、导入参考图。':
    '大标题、小标题只用于管理目录，不会改变已有提示词。';
 $('docDialog').showModal();$('docNameInput').focus();$('docNameInput').select();
}
async function saveDocDialog(){
 if(!docAction)return;
 const name=$('docNameInput').value.trim();
 if(!name){toast('请输入标题名称');return;}
 const {action,id}=docAction;
 let result;
 if(action==='root')result=await update(api.createGroup({title:name,parentId:null}),'大标题已创建');
 else if(action==='sub'){
  const group=(state.project.groups||[]).find(g=>g.id===currentGroupId);
  if(!group){toast('先在左侧选择大标题');return;}
  result=await update(api.createGroup({title:name,parentId:group.parentId||group.id}),'小标题已创建');
 }else if(action==='document'){
  result=await update(api.createDocument({title:name,groupId:currentGroupId}),'新文档已创建');
  if(result?.episode){activeEpisodeId=result.episode.id;render();}
 }else if(action==='rename-group')result=await update(api.renameGroup({id,title:name}),'标题已修改');
 else if(action==='rename-document')result=await update(api.renameDocument({id,title:name}),'文档名称已修改');
 if(result){
  if(result.group&&['root','sub'].includes(action)){
    currentGroupId=result.group.id;
    for(const g of state.project.groups||[]){
      if(g.id===currentGroupId||g.id===(result.group.parentId||''))expandedGroups.delete(g.id);
    }
    drawSidebar();
  }
  $('docDialog').close();docAction=null;
 }
}
function drawFolder(){
 const f=state.project.assetFolder;
 $('folderLabel').textContent=f||'尚未设置参考图总文件夹';
 const s=state.scanStats||{};
 $('scanDetail').textContent=f?`共 ${s.images||0} 张图片 · ${s.recognized||0} 张有编号 · ${s.unique||0} 种编号 · ${s.unrecognized||0} 张未识别 · ${s.duplicates||0} 张重复编号`:'扫描只建立索引，不移动或压缩图片';
}
function showReport(){let r=state.scanStats||{};let body=`扫描文件：${r.total||0}\n图片：${r.images||0}\n已识别：${r.recognized||0}\n不同编号：${r.unique||0}\n额外重复：${r.duplicates||0}\n未识别：${r.unrecognized||0}`;
 if(r.unrecognizedFiles?.length)body+='\n\n未识别图片清单：\n'+r.unrecognizedFiles.join('\n');
 if(r.errors?.length)body+='\n\n扫描错误：\n'+r.errors.join('\n');
 if(r.overflow)body+='\n扫描超过50000个文件，请拆分目录';
 $('scanReport').textContent=body;$('scanReport').classList.toggle('hidden');
}
function createTile(episode,seg,code,gallery){
 const item=assetFor(code),versions=versionsOf(code);
 const tile=doc('div','image-tile'+(!item?' missing':'')); tile.tabIndex=0;
 if(item){
  tile.dataset.imageId=item.id;
  tile.draggable=true;
  const im=doc('img');im.src=item.thumb;im.loading='lazy';im.draggable=false;im.alt=code;im.addEventListener('error',()=>{im.style.display='none';});tile.append(im);
  const set=selectedImages.get(seg.id)||new Set();if(set.has(item.id))tile.classList.add('selected');
  tile.addEventListener('click',e=>{
   if(e.target.tagName==='SELECT')return;
   clearTextSelection();clearOtherImageSelections(seg.id);
   let current=selectedImages.get(seg.id)||new Set();
   if(e.ctrlKey||e.metaKey){if(current.has(item.id))current.delete(item.id);else current.add(item.id);}
   else if(e.shiftKey){const all=chosenForSegment(seg).map(a=>a.id);const last=gallery.dataset.lastSelected;const anchor=all.indexOf(last);const here=all.indexOf(item.id);if(anchor>=0&&here>=0){current=new Set(all.slice(Math.min(anchor,here),Math.max(anchor,here)+1));}else current=new Set([item.id]);}
   else current=new Set([item.id]);
   selectedImages.set(seg.id,current);gallery.dataset.lastSelected=item.id;refreshSelected(gallery,seg);
  });
  tile.addEventListener('dragstart',e=>{
   clearTextSelection();clearOtherImageSelections(seg.id);
   const selected=selectedImages.get(seg.id)||new Set();
   // Dragging an unselected thumbnail means only this one image.
   // Dragging a selected thumbnail means all selected images.
   const ids=selected.has(item.id)?[...selected]:[item.id];
   if(!selected.has(item.id)){selectedImages.set(seg.id,new Set(ids));refreshSelected(gallery,seg);}
   e.preventDefault();api.startNativeDrag({mode:'selected',episodeId:episode.id,segmentId:seg.id,imageIds:ids});
  });
  tile.append(doc('span','tick','✓'));
 }else tile.append(doc('div','image-fallback','!'));
 tile.append(doc('div','image-name',code));
 const filename=doc('div','filename',item?item.name:'缺失参考图');filename.title=item?.relative||'请确认目录与编号';tile.append(filename);
 if(versions.length>1){const sel=doc('select');for(const opt of versions){const o=doc('option','',opt.relative);o.value=opt.id;if(item&&item.id===opt.id)o.selected=true;sel.append(o);}sel.title='同编号多张图：选择使用哪一张';sel.addEventListener('click',e=>e.stopPropagation());sel.addEventListener('change',async(e)=>{await update(api.chooseVersion({code,assetId:e.target.value}),`已切换 ${code} 图片版本`);});tile.append(sel);}
 return tile;
}
function refreshSelected(gallery,seg){const set=selectedImages.get(seg.id)||new Set();gallery.querySelectorAll('.image-tile').forEach(tile=>tile.classList.toggle('selected',set.has(tile.dataset.imageId)));const btn=gallery.closest('.segment')?.querySelector('.selected-count');if(btn)btn.textContent=`已选择 ${set.size} 张`;
}
function makeSegment(episode,seg,idx){
 const card=doc('article','segment');card.dataset.segmentId=seg.id;
 const widthPercent=clamp(storedNumber('manju-panel-width-percent',100),25,100);
 card.style.width=widthPercent+'%';
 const head=doc('div','segment-header');const left=doc('div');left.append(doc('div','segment-title',`${String(idx+1).padStart(2,'0')} · 第${seg.n}段｜${seg.title}`));
 const present=seg.codes.filter(c=>assetFor(c)).length;const badge=doc('span','countbadge'+(present!==seg.codes.length?' bad':''),`参考图 ${present}/${seg.codes.length}`);
 const sub=doc('div','segment-sub',`参考图 ${seg.codes.join('、')||'无'}　·　${seg.method}${seg.codes.length>9?'　⚠ 超过9张':''}`);sub.prepend(badge);left.append(sub);
 const right=doc('div','segment-actions');
 right.append(elBtn('复制提示词',()=>copyPrompt(seg),'primary'));
 const collapseBtn=elBtn('收起本段',()=>{
  const collapsed=card.classList.toggle('is-collapsed');
  collapseBtn.textContent=collapsed?'展开本段':'收起本段';
 },'secondary');right.append(collapseBtn);
 right.append(elBtn('编辑文字',()=>{editTarget={episodeId:episode.id,segmentId:seg.id};$('editTitle').textContent=`编辑第 ${seg.n} 段的完整提示词`;$('editText').value=seg.text;$('editDialog').showModal();}));
 right.append(elBtn('校正编号',()=>{codesTarget={episodeId:episode.id,segmentId:seg.id};$('codesInput').value=seg.codes.join('、');$('codesDialog').showModal();}));
 head.append(left,right);card.append(head);
 const workarea=doc('div','segment-workarea');
 workarea.style.height=segmentPanelSize()+'px';
 // Fixed 50/50 layout: resize both text and pictures together, never alter their ratio.
 card.append(workarea);
 const content=doc('div','content');
 const promptHead=doc('div','prompt-head');
 promptHead.append(doc('div','prompt-label','完整提示词 · 在小窗内滚动，复制不删减'));
 const prompt=doc('div','prompt-box',seg.text);
 prompt.tabIndex=0;prompt.addEventListener('pointerdown',()=>clearOtherImageSelections());
 prompt.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){
   e.preventDefault();selectTextIn(prompt);
  }
 });
 promptHead.append(elBtn('全选文字',()=>selectTextIn(prompt),'secondary text-select'));
 content.append(promptHead,prompt);workarea.append(content);
 const divider=doc('div','pane-divider fixed-divider');
 divider.setAttribute('aria-hidden','true');
 divider.title='提示词和参考图同步缩放：拖动右下角的整体缩放手柄';
 workarea.append(divider);
 const imagePane=doc('div','image-pane');workarea.append(imagePane);
 const imagehead=doc('div','image-head');imagehead.append(doc('b','',`参考图片（${present} 张）`));imagehead.append(doc('span','','Ctrl多选 · Shift连选 · Ctrl+A全选'));imagePane.append(imagehead);
 const gallery=doc('div','gallery');gallery.tabIndex=0;gallery.dataset.segmentId=seg.id;gallery.dataset.lastSelected='';gallery.addEventListener('pointerdown',()=>clearTextSelection());
 gallery.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){
   e.preventDefault();selectImagesIn(seg,gallery);toast(`已全选本段 ${chosenForSegment(seg).length} 张图片`);
  }
 });
 for(const code of seg.codes)gallery.append(createTile(episode,seg,code,gallery));
 if(!seg.codes.length)gallery.append(doc('div','warning','本段暂未识别到参考图编号。可点击「校正编号」。'));
 imagePane.append(gallery);
 const unifiedHandle=doc('div','unified-resize-handle','◢');
 unifiedHandle.title='拖动右下角：同时改变提示词和参考图区的整体宽度、高度';
 unifiedHandle.tabIndex=0;unifiedHandle.setAttribute('role','separator');
 unifiedHandle.setAttribute('aria-label','整体放大或缩小提示词与参考图');
 workarea.append(unifiedHandle);
 unifiedResizeHandle(unifiedHandle,card,workarea);
 const dragFooter=doc('div','drag-footer');const handle=doc('div','drag-handle',`☷ 按住这里拖动本段全部图片（${present} 张）`);handle.draggable=present>0;
 handle.addEventListener('dragstart',e=>{e.preventDefault();api.startNativeDrag({mode:'group',episodeId:episode.id,segmentId:seg.id});});
 const hint=doc('div','drag-hint','拖到 Edge、豆包、即梦等网页的文件上传区域');
 const selectAll=elBtn('全选本段图片',()=>selectImagesIn(seg,gallery),'secondary');
 const clear=elBtn('清空图片选择',()=>{selectedImages.delete(seg.id);refreshSelected(gallery,seg);},'secondary');
 dragFooter.append(handle,hint,doc('span','selected-count','已选择 0 张'),selectAll,clear);card.append(dragFooter);
 if(present!==seg.codes.length)card.append(doc('div','warning','缺图：'+seg.codes.filter(c=>!assetFor(c)).join('、')+'。工具不会拿 A01 替代 A01-01。'));
 return card;
}
async function copyPrompt(seg){try{clearTextSelection();clearOtherImageSelections();await api.copy(seg.text);toast('已复制第 '+seg.n+' 段完整提示词（无删减）');}catch(e){toast('复制失败：'+e.message);}}
function drawEpisode(){const ep=state.project.episodes.find(e=>e.id===activeEpisodeId);
 $('empty').classList.toggle('hidden',!!ep);$('episodeView').classList.toggle('hidden',!ep);
 if(!ep){$('toolbarTitle');$('workspaceTitle').textContent='选择一个剧集开始制作';return;}
 $('workspaceTitle').textContent=ep.title; $('episodeTitle').textContent=ep.title;
 const total=[...new Set(ep.segments.flatMap(s=>s.codes))];const miss=total.filter(c=>!assetFor(c));
 $('episodeMeta').textContent=`${ep.segments.length} 个片段 · 共引用 ${total.length} 种编号 · 当前缺少 ${miss.length} 种`;
 const pre=$('episodePreamble');pre.textContent=ep.preamble?'整集前言 / 制作说明（未自动附加到每段复制内容）：\n\n'+ep.preamble:'';pre.classList.toggle('hidden',!ep.preamble);
 const container=$('segmentsContainer');container.replaceChildren();for(let i=0;i<ep.segments.length;i++)container.append(makeSegment(ep,ep.segments[i],i));
}
function render(){if(!activeEpisodeId&&state.project.episodes.length)activeEpisodeId=state.project.episodes[0].id;
 if(activeEpisodeId&&!state.project.episodes.some(e=>e.id===activeEpisodeId))activeEpisodeId=state.project.episodes[0]?.id||null;
 drawSidebar();drawFolder();drawEpisode();}
async function importPrompt(){const text=$('importText').value;if(!text.trim()){toast('请先粘贴整集提示词');return;}
 $('submitImportBtn').disabled=true;
 const result=await update(api.importText(text,currentGroupId));$('submitImportBtn').disabled=false;
 if(result){$('importDialog').close();$('importText').value='';activeEpisodeId=result.data.project.episodes.at(-result.added)?.id||null;render();status(`成功加入 ${result.added} 集，共 ${result.segments} 个片段；完整原文已保存。`,'ok');}
}
function wire(){
 // Resize like normal desktop panes by dragging visible boundaries, not a toolbar slider.
 applySidebarWidth(storedNumber('manju-sidebar-width',264));
 resizeFromPointer($('sidebarResize'),'clientX',
  ()=>parseFloat(document.querySelector('.sidebar').style.flexBasis)||264,
  v=>applySidebarWidth(v));
 $('sidebarResize').addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   e.preventDefault();
   applySidebarWidth((parseFloat(document.querySelector('.sidebar').style.flexBasis)||264)+(e.key==='ArrowRight'?16:-16));
  }
 });
 $('rootMenuBtn').onclick=()=>showTreeMenu($('rootMenuBtn'),rootOptions());
 document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('#treeMenu')&&!e.target.closest('.tree-ellipsis')&&!e.target.closest('#rootMenuBtn'))closeTreeMenu();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTreeMenu();});
 window.addEventListener('resize',()=>{
  applySidebarWidth(parseFloat(document.querySelector('.sidebar').style.flexBasis)||264);
  closeTreeMenu();
 });
 $('docDialogClose').onclick=$('docDialogCancel').onclick=()=>$('docDialog').close();
 $('docDialogSave').onclick=saveDocDialog;
 $('docDialogDelete').onclick=async()=>{
  if(!docAction||docAction.action!=='rename-group')return;
  const id=docAction.id;
  const title=(state.project.groups||[]).find(g=>g.id===id)?.title||'当前标题';
  if(!confirm('删除标题「'+title+'」？标题下的文档会自动移到上级，文字和图片都不会删除。'))return;
  const removed=await update(api.removeGroup(id),'标题已删除，文档已保留');
  if(removed){currentGroupId=null;docAction=null;$('docDialog').close();drawSidebar();}
 };
 $('docNameInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveDocDialog();}};
 $('renameDocBtn').onclick=()=>{
  const ep=state.project.episodes.find(e=>e.id===activeEpisodeId);
  if(ep)openDocDialog('rename-document',ep.id,ep.title);
 };
 $('moveDocBtn').onclick=()=>moveCurrentDocument();
 $('pasteBtn').onclick=$('emptyPasteBtn').onclick=()=>{$('importDialog').showModal();$('importText').focus();};
 $('submitImportBtn').onclick=importPrompt;
 $('closeImportBtn').onclick=()=>$('importDialog').close();
 $('filesBtn').onclick=async()=>{const r=await update(api.importFiles(currentGroupId));if(r){activeEpisodeId=r.data.project.episodes.at(-r.added)?.id||activeEpisodeId;render();status(`导入 ${r.added} 集成功`,'ok');}};
 $('chooseFolderBtn').onclick=async()=>{const r=await update(api.chooseFolder());if(r)status(`素材库读取完毕：${r.scanStats.images} 张图片，其中 ${r.scanStats.recognized} 张提取到编号。`,'ok');};
 $('rescanBtn').onclick=async()=>{const r=await update(api.rescan());if(r)status(`扫描完成：${r.scanStats.recognized} 张编号图片、${r.scanStats.unique} 种编号。`,'ok');};
 $('testBtn').onclick=async()=>{await update(api.dragTester(),'已经打开本机拖拽验证窗口');};
 $('backupBtn').onclick=async()=>{const r=await update(api.backup());if(r)toast('项目已备份至：'+r);};
 $('restoreBtn').onclick=async()=>{if(!confirm('恢复备份将覆盖当前项目。确定继续吗？'))return;const r=await update(api.restore());if(r){activeEpisodeId=null;render();toast('备份已恢复');}};
 $('scanInfoBtn').onclick=showReport;
 $('renameBtn').onclick=async()=>{await update(api.rename($('projectTitle').value),'项目名称已保存');};
 $('projectTitle').addEventListener('keydown',e=>{if(e.key==='Enter')$('renameBtn').click();});
 $('filterEpisodes').addEventListener('input',e=>{currentFilter=e.target.value.trim().toLowerCase();drawSidebar();});
 $('exportBtn').onclick=async()=>{const r=await update(api.exportEpisode(activeEpisodeId));if(r)status(`已导出本集：${r.images} 张参考图，缺少 ${r.missing} 处，失败 ${r.errors.length} 处；结果已打开。`,r.errors.length?'error':'ok');};
 $('removeBtn').onclick=async()=>{const e=state.project.episodes.find(x=>x.id===activeEpisodeId);if(!e)return;if(!confirm('确定从项目中删除「'+e.title+'」吗？这不会删除原始图片。'))return;await update(api.removeEpisode(e.id),'已从项目中删除剧集');};
 $('closeEditBtn').onclick=()=>$('editDialog').close();
 $('saveEditBtn').onclick=async()=>{if(!editTarget)return;const r=await update(api.editSegment({...editTarget,text:$('editText').value}));if(r){$('editDialog').close();toast('本段文字已保存，参考图已重新识别');}};
 $('closeCodesBtn').onclick=()=>$('codesDialog').close();
 $('saveCodesBtn').onclick=async()=>{if(!codesTarget)return;const r=await update(api.editSegment({...codesTarget,manual:true,codes:$('codesInput').value}));if(r){$('codesDialog').close();toast('参考图编号已校正，文字原文未修改');}};
 api.onDragError(msg=>{status('原生拖拽失败：'+msg,'error');toast(msg);});
}
wire();api.getState().then(v=>{state=v;render();if(!state.project.assetFolder)status('请先设置一次参考图总文件夹，然后导入整集提示词。');}).catch(e=>status('读取工作台失败：'+e.message,'error'));
