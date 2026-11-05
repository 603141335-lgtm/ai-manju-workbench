'use strict';
const $=id=>document.getElementById(id);
const doc=(tag,cls,text)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a;};
const api=window.manju;
let state={project:{episodes:[],chosenPaths:{}},assetList:[],scanStats:{}},activeEpisodeId=null,editTarget=null,codesTarget=null,selectedImages=new Map(),currentFilter='';
let toastTimer=null;
function toast(message){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),5500);}
function status(message,type='info'){$('status').textContent=message;$('status').className='status '+type;}
function assetFor(code){const group=state.assetList.find(a=>a.code===code);if(!group)return null;const p=state.project.chosenPaths?.[code];return group.items.find(a=>a.path===p)||group.items[0]||null;}
function versionsOf(code){return state.assetList.find(a=>a.code===code)?.items||[];}
function chosenForSegment(seg){return seg.codes.map(c=>assetFor(c)).filter(Boolean);}
function elBtn(label,click,className='secondary'){const b=doc('button',className,label);b.addEventListener('click',click);return b;}
async function update(promise,msg){try{const result=await promise;if(result?.project){state=result;}else if(result?.data?.project){state=result.data;}if(msg)toast(msg);render();return result;}catch(e){status('操作失败：'+e.message,'error');toast('操作失败：'+e.message);return null;}}
function drawSidebar(){
 $('projectTitle').value=state.project.title; const e=state.project.episodes; const total=e.reduce((n,p)=>n+p.segments.length,0);
 $('projectStats').textContent=`${e.length} 集 · ${total} 段`; $('episodeCount').textContent=e.length+' 集';
 const box=$('episodeList');box.replaceChildren();let count=0;
 for(const episode of e){if(currentFilter&&!episode.title.toLowerCase().includes(currentFilter)&&!String(episode.number||'').includes(currentFilter))continue;count++;
  const b=doc('button','episode-item'+(episode.id===activeEpisodeId?' selected':''));
  const name=doc('div','',episode.title.length>42?episode.title.slice(0,40)+'…':episode.title);name.title=episode.title;
  const desc=doc('span','small',`${episode.segments.length} 个片段 · ${[...new Set(episode.segments.flatMap(s=>s.codes))].length} 种参考图`);
  b.append(name,desc);b.addEventListener('click',()=>{activeEpisodeId=episode.id;render();$('.main')?.scrollTo({top:0,behavior:'instant'});});box.append(b);
 }
 if(!count)box.append(doc('div','muted tiny','没有符合条件的剧集'));
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
   let current=selectedImages.get(seg.id)||new Set();
   if(e.ctrlKey||e.metaKey){if(current.has(item.id))current.delete(item.id);else current.add(item.id);}
   else if(e.shiftKey){const all=chosenForSegment(seg).map(a=>a.id);const last=gallery.dataset.lastSelected;const anchor=all.indexOf(last);const here=all.indexOf(item.id);if(anchor>=0&&here>=0){current=new Set(all.slice(Math.min(anchor,here),Math.max(anchor,here)+1));}else current=new Set([item.id]);}
   else current=new Set([item.id]);
   selectedImages.set(seg.id,current);gallery.dataset.lastSelected=item.id;refreshSelected(gallery,seg);
  });
  tile.addEventListener('dragstart',e=>{
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
function refreshSelected(gallery,seg){const set=selectedImages.get(seg.id)||new Set();gallery.querySelectorAll('.image-tile').forEach(tile=>tile.classList.toggle('selected',set.has(tile.dataset.imageId)));const btn=gallery.parentElement.querySelector('.selected-count');if(btn)btn.textContent=`已选择 ${set.size} 张`;
}
function makeSegment(episode,seg,idx){
 const card=doc('article','segment');card.dataset.segmentId=seg.id;
 const head=doc('div','segment-header');const left=doc('div');left.append(doc('div','segment-title',`${String(idx+1).padStart(2,'0')} · 第${seg.n}段｜${seg.title}`));
 const present=seg.codes.filter(c=>assetFor(c)).length;const badge=doc('span','countbadge'+(present!==seg.codes.length?' bad':''),`参考图 ${present}/${seg.codes.length}`);
 const sub=doc('div','segment-sub',`参考图 ${seg.codes.join('、')||'无'}　·　${seg.method}${seg.codes.length>9?'　⚠ 超过9张':''}`);sub.prepend(badge);left.append(sub);
 const right=doc('div','segment-actions');
 right.append(elBtn('复制提示词',()=>copyPrompt(seg),'primary'));
 right.append(elBtn('分配到账号小窗',async()=>{
  try{
   let number=window.ManjuEpisode.inferEpisode(episode);
   const key='manju-episode-number-'+episode.id;
   if(!number){
    let saved=null;
    try{saved=localStorage.getItem(key);}catch{}
    const typed=prompt('本集未识别出集数，请输入实际集数（不会修改提示词正文）',saved||'');
    if(typed===null)return;
    if(!/^\\d{1,5}$/.test(typed.trim())||Number(typed)<1)throw Error('请输入1到99999之间的集数');
    number=Number(typed.trim());
    try{localStorage.setItem(key,String(number));}catch{}
   }
   const pending={episode:number,segment:seg.n,title:seg.title,prompt:seg.text,codes:seg.codes};
   await api.prepareEdgeSegment(pending);
   toast('第'+number+'集 第'+seg.n+'段已关联；请在账号小窗选择 Edge 用户');
  }catch(e){toast('分配失败：'+e.message);}
 },'secondary'));
 right.append(elBtn('编辑文字',()=>{editTarget={episodeId:episode.id,segmentId:seg.id};$('editTitle').textContent=`编辑第 ${seg.n} 段的完整提示词`;$('editText').value=seg.text;$('editDialog').showModal();}));
 right.append(elBtn('校正编号',()=>{codesTarget={episodeId:episode.id,segmentId:seg.id};$('codesInput').value=seg.codes.join('、');$('codesDialog').showModal();}));
 head.append(left,right);card.append(head);
 const content=doc('div','content');const promptHead=doc('div','prompt-head');promptHead.append(doc('div','prompt-label','完整视频提示词 · 可直接选中复制'));content.append(promptHead);
 const prompt=doc('div','prompt-box',seg.text);content.append(prompt);card.append(content);
 const imagehead=doc('div','image-head');imagehead.append(doc('b','',`参考图片（${present} 张）`));imagehead.append(doc('span','','Ctrl+点击多选 · Shift+点击连续选 · 图片区 Ctrl+A 全选'));card.append(imagehead);
 const gallery=doc('div','gallery');gallery.tabIndex=0;gallery.dataset.lastSelected='';
 gallery.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){
   e.preventDefault();selectedImages.set(seg.id,new Set(chosenForSegment(seg).map(a=>a.id)));refreshSelected(gallery,seg);toast(`已全选本段 ${chosenForSegment(seg).length} 张图片`);
  }
 });
 for(const code of seg.codes)gallery.append(createTile(episode,seg,code,gallery));
 if(!seg.codes.length)gallery.append(doc('div','warning','本段暂未识别到参考图编号。可点击「校正编号」。'));
 card.append(gallery);
 const dragFooter=doc('div','drag-footer');const handle=doc('div','drag-handle',`☷ 按住这里拖动本段全部图片（${present} 张）`);handle.draggable=present>0;
 handle.addEventListener('dragstart',e=>{e.preventDefault();api.startNativeDrag({mode:'group',episodeId:episode.id,segmentId:seg.id});});
 const hint=doc('div','drag-hint','拖到 Edge、豆包、即梦等网页的文件上传区域');
 const selectAll=elBtn('全选本段',()=>{selectedImages.set(seg.id,new Set(chosenForSegment(seg).map(a=>a.id)));refreshSelected(gallery,seg);gallery.focus();},'secondary');
 const clear=elBtn('清空选择',()=>{selectedImages.set(seg.id,new Set());refreshSelected(gallery,seg);},'secondary');
 dragFooter.append(handle,hint,doc('span','selected-count','已选择 0 张'),selectAll,clear);card.append(dragFooter);
 if(present!==seg.codes.length)card.append(doc('div','warning','缺图：'+seg.codes.filter(c=>!assetFor(c)).join('、')+'。工具不会拿 A01 替代 A01-01。'));
 return card;
}
async function copyPrompt(seg){try{await api.copy(seg.text);toast('已复制第 '+seg.n+' 段完整提示词（无删减）');}catch(e){toast('复制失败：'+e.message);}}
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
 const result=await update(api.importText(text));$('submitImportBtn').disabled=false;
 if(result){$('importDialog').close();$('importText').value='';activeEpisodeId=result.data.project.episodes.at(-result.added)?.id||null;render();status(`成功加入 ${result.added} 集，共 ${result.segments} 个片段；完整原文已保存。`,'ok');}
}
function wire(){
 $('edgeAccountBtn').onclick=async()=>{try{await api.showEdgeAccounts();}catch(e){toast('打开账号小窗失败：'+e.message);}};
 $('sidebarToggle').onclick=()=>{
  const root=$('app');
  root.classList.toggle('sidebar-collapsed');
  try{localStorage.setItem('manju-sidebar-collapsed',root.classList.contains('sidebar-collapsed')?'1':'0');}catch{}
 };
 try{if(localStorage.getItem('manju-sidebar-collapsed')==='1')$('app').classList.add('sidebar-collapsed');}catch{}
 $('pasteBtn').onclick=$('emptyPasteBtn').onclick=()=>{$('importDialog').showModal();$('importText').focus();};
 $('submitImportBtn').onclick=importPrompt;
 $('closeImportBtn').onclick=()=>$('importDialog').close();
 $('filesBtn').onclick=async()=>{const r=await update(api.importFiles());if(r){activeEpisodeId=r.data.project.episodes.at(-r.added)?.id||activeEpisodeId;render();status(`导入 ${r.added} 集成功`,'ok');}};
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
