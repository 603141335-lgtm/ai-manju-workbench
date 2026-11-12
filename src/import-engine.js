'use strict';
/** One-click import controller: current workspace segment -> Doubao web composer.
 * Reuses tested independent extension's reference parsing and File/DataTransfer method.
 */
const fs=require('node:fs');
const path=require('node:path');
const {parseCodes,composeText,referenceSlots}=require('./import-core');
const {isAllowedDoubaoUrl,codeInName}=require('./mention-core');
const oldPage=require('./mention-page');
const inlinePage=require('./inline-mention-page');
const page=require('./import-page');
const voicePage=require('./voice-page');
const {audioLine}=require('./voice-bindings');
const {extractReferenceLabels,labelFor}=require('./reference-labels');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const EXTS=new Map([['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp']]);
function createPlan({prompt='',rows=[],chosenPaths={},limit=9,tail=null,labels={}}={}){
 const parsed=parseCodes(prompt);const codes=parsed.codes;
 const byCode=new Map(rows.filter(x=>x.code).map(x=>[String(x.code).toUpperCase(),x]));
 const items=codes.map(code=>{
  const row=byCode.get(code),file=row?.file;
  const versions=(row?.versions||[]).filter(x=>x.path);
  const conflict=versions.length>1&&!chosenPaths[code];
  let status='ready',message='本地文件已匹配';
  if(!file||row.missing){status='missing';message='缺少本地图片';}
  else if(conflict){status='conflict';message='同编号多个版本，请先在右侧素材库指定';}
  else if(!EXTS.has(path.extname(file.path||'').toLowerCase())){status='unsupported';message='暂不支持自动上传此文件格式（建议 PNG/JPG/WebP）';}
  else try{const s=fs.statSync(file.path);if(!s.isFile()||s.size<1||s.size>25*1024*1024){status='unsupported';message='图片为空、不是文件或超过25MB';}}
  catch{status='missing';message='本地路径不存在或已移动';}
  return {code,label:labels[code]||'',status,message,file:file?{path:file.path,name:path.basename(file.path)}:null,versions:versions.length};
 });
 if(tail?.state==='ready'&&tail.file){
  if(items.some(x=>x.file?.path===tail.file.path))items.splice(items.findIndex(x=>x.file.path===tail.file.path),1);
  items.unshift({code:'尾帧',kind:'tail',status:'ready',message:tail.message,file:{path:tail.file.path,name:tail.file.name},versions:1});
 }
 return {codes,items,tailStatus:tail||{state:'none'},source:parsed.origin,limit,blocked:items.length===0||items.length>limit||items.some(x=>x.status!=='ready')||['error','stale','missing'].includes(tail?.state),overLimit:items.length>limit,originalChars:prompt.length};
}
function createImportEngine({getActive,getSegment,resolveRows,getChosenPaths=()=>({}),getCurrentSelection=()=>null,getTailForSegment=()=>null,getVoiceForImages=()=>({items:[],blocked:false,errors:[],totalSeconds:0}),notify=()=>{},pause=sleep,uploadTimeoutMs=25000,intervalMs=450}={}){
 let running=null;
 const emit=(state,message,ctx,extra={})=>notify({state,message,rows:ctx?.rows?.map(x=>({...x}))||[],...extra});
 function currentActive(){const a=getActive();if(!a||!a.webContents||a.webContents.isDestroyed?.()||!isAllowedDoubaoUrl(a.webContents.getURL()))throw Error('请先在工作台内打开并登录豆包聊天网页');return a;}
 function ensure(ctx){if(ctx.cancelled||running!==ctx)throw Error('任务已取消');const a=currentActive();if(a.accountId!==ctx.accountId||a.webContents!==ctx.wc||a.webContents.getURL()!==ctx.url)throw Error('账号或聊天已切换，任务安全停止');const selection=getCurrentSelection();if(selection&&(selection.episodeId!==ctx.episodeId||selection.segmentId!==ctx.segmentId))throw Error('当前制作段落已切换，任务安全停止');}
 async function evalFn(wc,fn,arg){return wc.executeJavaScript(page.call(fn,arg),true)}
 async function probe(wc){return evalFn(wc,page.probe,null)}
 function sameFilename(a,b){return String(a||'').trim().toLowerCase().split(/[\\/]/).pop()===String(b||'').trim().toLowerCase().split(/[\\/]/).pop()}
 function nameMatches(names,file){return names.filter(x=>sameFilename(x,file)).length===1}
 function newThumbCount(before,after){return after.thumbs.filter(t=>!before.thumbs.includes(t)).length}
 function getDraft({episodeId,segmentId,previewText=null}){
  const seg=getSegment(episodeId,segmentId);
  if(!seg||!String(seg.text||'').trim())throw Error('请先在当前段填写完整提示词');
  const original=typeof previewText==='string'?previewText:seg.text;
  if(original.length>300000)throw Error('提示词过长');
  const parsedLabels=extractReferenceLabels(original);
  const rows=resolveRows(episodeId,segmentId),tail=getTailForSegment(episodeId,segmentId);
  const plan=createPlan({prompt:original,rows,chosenPaths:getChosenPaths(),tail,labels:parsedLabels.labels});
  plan.labels=parsedLabels.labels;plan.labelConflicts=parsedLabels.conflicts;
  // Only bind inside the author's own reference-number descriptions.
  const located=referenceSlots(original);
  const slotByCode=new Map(located.slots.map(x=>[x.code,x]));
  plan.referenceErrors=[];
  for(const item of plan.items){
    if(item.kind==='tail'){item.refAnchor='上一段尾帧参考：';continue;}
    const entry=slotByCode.get(item.code);
    if(!entry||located.ambiguous.includes(item.code)){
      plan.referenceErrors.push(item.code+' 原参考图说明无法唯一定位，已停止以防止艾特错位');
    }else item.refAnchor=entry.anchor;
  }
  if(plan.referenceErrors.length)plan.blocked=true;
  if(parsedLabels.conflicts.length){plan.blocked=true;plan.labelErrors=parsedLabels.conflicts.map(x=>x.code+' 人物名称冲突：'+x.first+'/'+x.second);}
  const voices=getVoiceForImages(plan.items);
  plan.voicePlan={...voices,items:voices.items.map(v=>({...v,characterName:labelFor(v.code,parsedLabels.labels,v.label)}))};
  if(plan.voicePlan.blocked){plan.blocked=true;plan.voiceErrors=plan.voicePlan.errors;}
  plan.previewText=composeText(original,plan.items,0,plan.voicePlan.items);
  plan.previewReady=true;
  return plan;
 }
 async function getPlan({episodeId,segmentId}){
  const a=currentActive(),seg=getSegment(episodeId,segmentId),plan=getDraft({episodeId,segmentId});
  const snap=await probe(a.webContents);
  if(!snap.ready)return {...plan,ready:false,error:'豆包网页暂未找到可用的聊天输入框'};
  const trimmed=(snap.prompt||'').trim(),unchanged=seg.text.trim(),draft=plan.previewText.trim();
  return {...plan,ready:true,currentDraftChars:(snap.prompt||'').length,differentDraft:!!trimmed&&trimmed!==unchanged&&trimmed!==draft,accountId:a.accountId,conversation:a.webContents.getURL()};
 }
 async function syncText({episodeId,segmentId,replaceDraft=false}={}){
  if(running)throw Error('导入任务正在执行，不能同时改写草稿');
  const a=currentActive(),plan=getDraft({episodeId,segmentId});
  if(plan.blocked)throw Error('参考图/声音绑定有异常，请先核对');
  const before=await probe(a.webContents);
  if(before.mentions?.length)return {ok:false,message:'当前聊天已有蓝色原生 @ 标签，为防丢失，文字同步已暂停；请勿覆盖现有草稿'};
  const result=await evalFn(a.webContents,page.setPrompt,{text:plan.previewText,allowedExisting:getSegment(episodeId,segmentId).text,replace:replaceDraft||!before.prompt?.trim()});
  return {...result,draft:plan.previewText};
 }
 async function waitUpload(ctx,item,before){
  const deadline=Date.now()+uploadTimeoutMs;let stable=0,last=null;
  while(Date.now()<deadline){ensure(ctx);await pause(intervalMs);ensure(ctx);
   const now=await probe(ctx.wc);last=now;if(!now.ready)continue;
   const present=nameMatches(now.names,item.file.name)&&!now.busy;
   if(present)stable++;else stable=0;
   if(stable>=2)return {state:'uploaded',message:'网页连续两次显示同名附件，未发现上传进度'};
  }
  const count=last?newThumbCount(before,last):0;
  return {state:'uncertain',message:count>0?`检测到 ${count} 张新缩略图，但附件文件名无法核对，需要人工确认`:'上传控件已接收文件，但豆包没有确认附件，已停止后续上传'};
 }
 // Verify a single native multi-file change against the real web attachment state.
 async function waitBatch(ctx,items,before){
  let stable=0,last=null;
  const deadline=Date.now()+uploadTimeoutMs+items.length*2500;
  while(Date.now()<deadline){
   ensure(ctx);await pause(intervalMs);ensure(ctx);
   last=await probe(ctx.wc);if(!last?.ready)continue;
   const matching=items.every(row=>nameMatches(last.names,row.file.name));
   // Filename confirmation must also be stable and the site must not still be uploading.
   if(matching&&!last.busy){stable++;if(stable>=2){
    const observed=last.names.filter(name=>items.some(x=>sameFilename(x.file.name,name)));
    const orderMatches=observed.length===items.length&&observed.every((name,i)=>sameFilename(name,items[i].file.name));
    return {state:orderMatches?'uploaded':'needs-review',message:orderMatches?'全部附件及顺序已连续两次核对':'图片文件名齐全，但页面附件显示顺序需要核对'};
   }}else stable=0;
  }
  const added=last?newThumbCount(before,last):0;
  return {state:added>=items.length?'needs-review':'uncertain',message:added>=items.length?'附件数量已增加，但文件名或顺序无法核对；请在豆包聊天框核对整批图片后确认':'网页未确认全部附件，暂停批量操作以免错位'};
 }
 async function attemptBatch(ctx,items,before){
  // Bound message size to avoid stressing Chromium/Electron IPC; huge images use fallback.
  const files=[];let total=0;
  for(const row of items){
   const st=await fs.promises.stat(row.file.path);total+=st.size;
   if(total>55*1024*1024)return {state:'unsupported',message:'图片总大小超过55MB，切换逐张上传'};
   files.push({name:row.file.name,mime:EXTS.get(path.extname(row.file.path).toLowerCase()),base64:(await fs.promises.readFile(row.file.path)).toString('base64'),modified:st.mtimeMs});
  }
  ensure(ctx);
  let chosen=await evalFn(ctx.wc,page.selectImageBatch,{files});
  if(!chosen.ok&&/未.*多选|不支持.*多选/.test(chosen.message||'')){
   await evalFn(ctx.wc,page.openUploadMenu,null);await pause(350);ensure(ctx);
   chosen=await evalFn(ctx.wc,page.selectImageBatch,{files});
  }
  if(!chosen.ok)return {state:chosen.unsupported?'unsupported':'error',message:chosen.message};
  emit('running',`整批${items.length}张文件已选中，正在等待豆包网页实际上传`,ctx);
  const verified=await waitBatch(ctx,items,before);
  return verified;
 }
 async function tryNative(ctx,item,index,customAnchor=null){
  ensure(ctx);const wc=ctx.wc;
  // The anchor must be the exact text emitted by composeText. The page
  // refuses ambiguous matches instead of falling back to the editor end.
  const anchor=customAnchor||item.refAnchor;
  if(!anchor)return {state:'mapping',message:'找不到原始参考图编号对应的唯一说明行'};
  const params={anchor,code:item.code,filename:item.file.name,index:index+1,scope:(customAnchor||item.kind==='tail')?'all':'reference'};
  const before=await evalFn(wc,inlinePage.inspectInlineReference,params);
  if(before.verified)return {state:'native',message:'已存在正确的内联原生 @ 标签'};
  const caret=await evalFn(wc,inlinePage.focusReferenceSlot,params);
  if(!caret.ok)return {state:'mapping',message:caret.message};
  // A leading space is needed for TipTap's mention suggestion trigger.
  // Both edits go through Electron's real text input channel.
  await wc.insertText(' ');await wc.insertText('@');
  await pause(500);ensure(ctx);
  const opts=await wc.executeJavaScript(oldPage.js(oldPage.inspectMentionOptions),true);
  // Always match the actual full filename, never A01 as A01-01.
  const matching=opts.filter(o=>{
    const t=(o.text||'').toLowerCase(),name=item.file.name.toLowerCase();
    const at=t.indexOf(name);
    return at>=0&&!(at>0&&/[a-z0-9-]/.test(t[at-1]))&&!(at+name.length<t.length&&/[a-z0-9.-]/.test(t[at+name.length]));
  });
  if(matching.length!==1){
   await evalFn(wc,inlinePage.clearPendingInlineAt,params);
   return {state:'mapping',message:matching.length?'同名图片出现多个 @ 候选，已暂停':'豆包没有提供可识别的 @ 图片候选，原参考图说明保留纯文字'};
  }
  const opt=matching[0],evt={x:opt.x,y:opt.y,button:'left',clickCount:1};
  wc.sendInputEvent({type:'mouseDown',...evt});wc.sendInputEvent({type:'mouseUp',...evt});
  await pause(650);ensure(ctx);
  const after=await evalFn(wc,inlinePage.inspectInlineReference,params);
  if(after.verified)return {state:'native',message:'已验证 '+item.code+' 的蓝色原生 @ 标签位于原参考图说明行'};
  await evalFn(wc,inlinePage.clearPendingInlineAt,params);
  return {state:'mapping',message:after.message+'；不会把末尾其他 @ 误判为成功'};
 }

 async function importVoices(ctx,voiceRows){
  if(!voiceRows.length)return [];
  const files=[];for(const item of voiceRows){
   const data=await fs.promises.readFile(item.path);
   if(data.length>15*1024*1024)throw Error(item.code+' 音频超过15MB');
   files.push({name:item.filename,mime:path.extname(item.path).toLowerCase()==='.mp3'?'audio/mpeg':'audio/wav',base64:data.toString('base64')});
  }
  const state=async()=>evalFn(ctx.wc,voicePage.probeAudio,null);
  // The website may expose a single-only file input. Upload one by one inside
  // the SAME user-triggered workflow, but never call an unrelated input.
  const upload=async(group)=>{
   ensure(ctx);const before=await state();let selected=await evalFn(ctx.wc,voicePage.selectAudioBatch,{files:group});
   if(!selected.ok&&selected.unsupported){const menu=await evalFn(ctx.wc,voicePage.openAudioUploadMenu,null);if(menu.ok){await pause(250);ensure(ctx);selected=await evalFn(ctx.wc,voicePage.selectAudioBatch,{files:group});}}
   if(!selected.ok)throw Error('音频上传未启动：'+selected.message+'。已上传的图片保留，原始提示词未改写');
   emit('running',`已向豆包提交 ${group.length} 段音频，等待网页确认（不能视为成功）`,ctx,{voiceState:'selected'});
   let last=null,stable=0,deadline=Date.now()+25000+group.length*2500;
   while(Date.now()<deadline){await pause(500);ensure(ctx);last=await state();
    if(last?.ready&&!last.busy&&group.every(x=>last.names.filter(n=>sameFilename(n,x.name)).length===1)){
     if(++stable>=2)return group.length;
    }else stable=0;
   }
   throw Error('豆包未确认音频附件 '+group.map(x=>x.name).join('、')+'；已停止。不要把本地绑定误认为网页版上传成功');
  };
  try{await upload(files)}catch(e){
   if(files.length>1&&/仅支持单文件|切换至兼容模式/.test(e.message)){
    for(const file of files)await upload([file]);
   }else throw e;
  }
  emit('running',`网页已确认 ${files.length} 段音频附件`,ctx,{audioConfirmed:files.length});
  return voiceRows;
 }

 async function execute({episodeId,segmentId,replaceDraft=false,attemptNative=true}={}){
  if(running)throw Error('另一个一键导入任务正在执行');
  let pre=await getPlan({episodeId,segmentId});
  if(!pre.ready)throw Error(pre.error||'网页不可用');
  if(pre.tailStatus?.state==='extracting'){
      for(let count=0;count<30;count++){await sleep(500);const next=getDraft({episodeId,segmentId});if(next.tailStatus?.state!=='extracting')break;}
      pre=await getPlan({episodeId,segmentId});
      if(pre.tailStatus?.state==='extracting')throw Error('上一段视频尾帧仍在提取中，请等候提取完成后重试，避免遗漏图1');
    }
   if(pre.blocked)throw Error(pre.referenceErrors?.length?'原文参考图定位异常：'+pre.referenceErrors.join('；'):pre.voiceErrors?.length?'声音绑定异常：'+pre.voiceErrors.join('；'):pre.overLimit?'参考图加上上一段尾帧超过9张，请先核对':'存在缺图、重号、格式问题或尾帧异常，先在右侧修正');
  const a=currentActive(),seg=getSegment(episodeId,segmentId),ctx={episodeId,segmentId,accountId:a.accountId,wc:a.webContents,url:a.webContents.getURL(),cancelled:false,rows:pre.items.map(x=>({code:x.code,state:'matched',message:'本地参考图已匹配'}))};
  const before=await probe(ctx.wc);
  if(before.prompt?.trim()&&before.prompt.trim()!==seg.text.trim()&&before.prompt.trim()!==pre.previewText.trim()&&!replaceDraft)throw Error('豆包聊天框有不同草稿，须先确认是否覆盖');
  if(before.mentions?.length)throw Error('聊天框已有原生 @ 引用，请使用新对话或先手动清理，以免覆盖');
  // Existing attachments can shift numbering. Only continue if their filename
  // explicitly identifies an image in the current plan; no blind renumbering.
  for(const filename of before.names){if(!pre.items.some(x=>sameFilename(x.file.name,filename)))throw Error('聊天框已有其他附件，无法保证图号顺序，请先清空附件');}
  if(before.thumbs.length>before.names.length&&before.thumbs.length)throw Error('当前聊天框有无法识别名称的图片，请先清空附件，防止图号错位');
  if(before.names.some((name,i)=>!pre.items[i]||!sameFilename(name,pre.items[i].file.name)))throw Error('当前聊天附件顺序和本段参考图顺序不同，请先清空或另开聊天，避免图1、图2错位');
  running=ctx;const finished=[];let manualConfirmed=0,autoConfirmed=0,textFilled=false;
  try{
   // One bulk editor transaction FIRST. This keeps text synced even when
   // media upload or inline @ later encounters a site-specific failure.
   const early=await evalFn(ctx.wc,page.setPrompt,{text:pre.previewText,allowedExisting:seg.text,replace:replaceDraft||!before.prompt?.trim()});
   ensure(ctx);
   if(!early.ok)throw Error('发送稿同步失败：'+early.message+'；本次没有开始上传图片/音频');
   textFilled=true;
   emit('running','✓ 完整发送稿已一次写入豆包，开始上传图片和音频',ctx,{textFilled:true,draft:pre.previewText});
   let previous=await probe(ctx.wc);
   let batchCompleted=false;
   if(pre.items.length>1&&before.names.length===0&&before.thumbs.length===0){
    emit('running',`尝试一次性提交${pre.items.length}张参考图`,ctx);
    const batch=await attemptBatch(ctx,pre.items,before);
    ensure(ctx);
    if(batch.state==='uploaded'){
     for(let i=0;i<pre.items.length;i++){ctx.rows[i].state='uploaded';ctx.rows[i].message='整批上传，已核验文件名及附件顺序';finished.push(pre.items[i]);}
     autoConfirmed=pre.items.length;batchCompleted=true;previous=await probe(ctx.wc);
     emit('running',batch.message,ctx);
    }else if(batch.state==='needs-review'){
     for(let i=0;i<pre.items.length;i++){ctx.rows[i].state='needs-review';ctx.rows[i].message='批量上传待核对附件顺序';}
     emit('review',`请核对豆包聊天框的${pre.items.length}张缩略图：${pre.items.map(x=>x.code).join('、')}，按这一顺序排列后点击“确认当前图片”`,ctx,{batch:true});
     const decision=new Promise(resolve=>{ctx.approve=resolve;});const approved=await decision;ctx.approve=null;ensure(ctx);
     if(!approved)throw Error('批量图片核对已取消；为避免错位未写入提示词');
     for(let i=0;i<pre.items.length;i++){ctx.rows[i].state='manual-confirmed';ctx.rows[i].message='整批图片顺序经用户人工核对';finished.push(pre.items[i]);}
     manualConfirmed=pre.items.length;batchCompleted=true;previous=await probe(ctx.wc);
    }else if(batch.state==='uncertain'||batch.state==='error'){
     throw Error(`批量上传已暂停：${batch.message}；为避免重复请先清理当前聊天附件再重试`);
    }else emit('running',`当前网页不支持批量上传，使用逐张兼容模式：${batch.message}`,ctx);
   }
   if(!batchCompleted){
   for(let idx=0;idx<pre.items.length;idx++){
    ensure(ctx);const x=pre.items[idx],r=ctx.rows[idx];
    if(nameMatches(previous.names,x.file.name)){
     r.state='uploaded';r.message='当前聊天已经有同名附件（请核对图片版本）';finished.push(x);autoConfirmed++;emit('running',`已识别已有附件 ${x.code}`,ctx);continue;
    }
    const stat=fs.statSync(x.file.path),data=fs.readFileSync(x.file.path);
    const mime=EXTS.get(path.extname(x.file.path).toLowerCase());
    // Never expose arbitrary filesystem paths or credentials to the remote page.
    let selected=await evalFn(ctx.wc,page.selectImageFile,{name:x.file.name,mime,base64:data.toString('base64'),modified:stat.mtimeMs});
    ensure(ctx);
    if(!selected.ok&&/未提供图片上传控件/.test(selected.message)){
     await evalFn(ctx.wc,page.openUploadMenu,null);await pause(450);ensure(ctx);
     selected=await evalFn(ctx.wc,page.selectImageFile,{name:x.file.name,mime,base64:data.toString('base64'),modified:stat.mtimeMs});
    }
    if(!selected.ok){r.state='error';r.message=selected.message;throw Error(x.code+' 无法选择上传文件：'+selected.message);}
    r.state='selected';r.message='已交给网页上传控件，正在等待附件';emit('running',`正在等待 ${x.code} 上传到豆包`,ctx);
    const actual=await waitUpload(ctx,x,previous);r.state=actual.state;r.message=actual.message;emit('running',`${x.code}: ${actual.message}`,ctx);
    if(actual.state==='uncertain'&&actual.message.includes('新缩略图')){
     r.state='needs-review';r.message='网页出现新缩略图，但无法核对文件名。请核对豆包聊天框中最新图片是 '+x.code+' 后点击「确认当前图片」。';
     const decision=new Promise(resolve=>{ctx.approve=resolve;});
     emit('review',r.message,ctx,{code:x.code});
     const approved=await decision;ctx.approve=null;
     ensure(ctx);
     if(!approved)throw Error('你取消了本张图片人工核对；未继续批量上传');
     r.state='manual-confirmed';r.message='用户人工核对了本张图和顺序；不属于软件自动验证';manualConfirmed++;
     emit('running',`${x.code} 已人工确认，继续下一张`,ctx);
    }else if(actual.state!=='uploaded')throw Error(`暂停在 ${x.code}：${actual.message}`);
    else autoConfirmed++;
    finished.push(x);previous=await probe(ctx.wc);
   }
   }
   ensure(ctx);
   const voiceRows=await importVoices(ctx,pre.voicePlan?.items||[]);
   ensure(ctx);
   // The bulk text was written and verified before uploading. Do not rewrite
   // it now: overwriting here would destroy native @ components and duplicate work.
   emit('running','图片和音频上传阶段结束，发送稿已同步；开始插入顶部原生 @',ctx,{textFilled:true});
   let natives=0;
   for(let i=0;i<ctx.rows.length;i++){
    if(!attemptNative){ctx.rows[i].state='mapping';ctx.rows[i].message='已附图号对应表（未尝试原生 @）';continue;}
    ensure(ctx);const r=ctx.rows[i],native=await tryNative(ctx,finished[i],i);
    r.state=native.state;r.message=native.message;if(native.state==='native')natives++;
    emit('running',`${r.code}: ${native.message}`,ctx,{textFilled:true,nativeVerified:natives});
   }
   let nativeAudio=0;
   for(let i=0;i<voiceRows.length;i++){
    const voice=voiceRows[i],anchor=audioLine(voice,i);
    ensure(ctx);
    if(attemptNative){const result=await tryNative(ctx,{code:voice.code,file:{name:voice.filename}},i,anchor);if(result.state==='native')nativeAudio++;emit('running',`音频${i+1}：${result.message}`,ctx,{nativeAudioVerified:nativeAudio});}
   }
   const end={state:'done',message:`图片 ${autoConfirmed} 张自动确认、${manualConfirmed} 张人工确认｜音频 ${voiceRows.length} 段已核验上传｜图片原生@ ${natives}/${pre.items.length}｜音频原生@ ${nativeAudio}/${voiceRows.length}；未验证项只保留明确对应说明`,rows:ctx.rows,uploaded:finished.length,autoConfirmed,manualConfirmed,textFilled:true,nativeVerified:natives,nativeAudioVerified:nativeAudio,audioConfirmed:voiceRows.length,total:pre.items.length};
   emit('done',end.message,ctx,end);return end;
  }catch(e){const end={state:'error',message:e.message,rows:ctx.rows,uploaded:finished.length,textFilled,total:pre.items.length};emit('error',e.message,ctx,end);return end;}
  finally{running=null;}
 }
 function cancel(){if(!running)return false;running.cancelled=true;if(running.approve){running.approve(false);running.approve=null;}emit('cancelled','已请求停止；已提交到豆包的图片不会自动删除',running);return true;}
 function confirm(approved){if(!running?.approve)return false;const answer=running.approve;running.approve=null;answer(approved===true);return true;}
 return {getPlan,getDraft,syncText,execute,cancel,confirm};
}
module.exports={createPlan,createImportEngine,EXTS};
