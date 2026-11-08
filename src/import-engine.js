'use strict';
/** One-click import controller: current workspace segment -> Doubao web composer.
 * Reuses tested independent extension's reference parsing and File/DataTransfer method.
 */
const fs=require('node:fs');
const path=require('node:path');
const {parseCodes,composeText}=require('./import-core');
const {isAllowedDoubaoUrl,codeInName}=require('./mention-core');
const oldPage=require('./mention-page');
const page=require('./import-page');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const EXTS=new Map([['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp']]);
function createPlan({prompt='',rows=[],chosenPaths={},limit=9,tail=null}={}){
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
  return {code,status,message,file:file?{path:file.path,name:path.basename(file.path)}:null,versions:versions.length};
 });
 if(tail?.state==='ready'&&tail.file){
  if(items.some(x=>x.file?.path===tail.file.path))items.splice(items.findIndex(x=>x.file.path===tail.file.path),1);
  items.unshift({code:'尾帧',kind:'tail',status:'ready',message:tail.message,file:{path:tail.file.path,name:tail.file.name},versions:1});
 }
 return {codes,items,tailStatus:tail||{state:'none'},source:parsed.origin,limit,blocked:items.length===0||items.length>limit||items.some(x=>x.status!=='ready')||['error','stale','missing','extracting'].includes(tail?.state),overLimit:items.length>limit,originalChars:prompt.length};
}
function createImportEngine({getActive,getSegment,resolveRows,getChosenPaths=()=>({}),getCurrentSelection=()=>null,getTailForSegment=()=>null,notify=()=>{},pause=sleep,uploadTimeoutMs=25000,intervalMs=450}={}){
 let running=null;
 const emit=(state,message,ctx,extra={})=>notify({state,message,rows:ctx?.rows?.map(x=>({...x}))||[],...extra});
 function currentActive(){const a=getActive();if(!a||!a.webContents||a.webContents.isDestroyed?.()||!isAllowedDoubaoUrl(a.webContents.getURL()))throw Error('请先在工作台内打开并登录豆包聊天网页');return a;}
 function ensure(ctx){if(ctx.cancelled||running!==ctx)throw Error('任务已取消');const a=currentActive();if(a.accountId!==ctx.accountId||a.webContents!==ctx.wc||a.webContents.getURL()!==ctx.url)throw Error('账号或聊天已切换，任务安全停止');const selection=getCurrentSelection();if(selection&&(selection.episodeId!==ctx.episodeId||selection.segmentId!==ctx.segmentId))throw Error('当前制作段落已切换，任务安全停止');}
 async function evalFn(wc,fn,arg){return wc.executeJavaScript(page.call(fn,arg),true)}
 async function probe(wc){return evalFn(wc,page.probe,null)}
 function sameFilename(a,b){return String(a||'').trim().toLowerCase().split(/[\\/]/).pop()===String(b||'').trim().toLowerCase().split(/[\\/]/).pop()}
 function nameMatches(names,file){return names.filter(x=>sameFilename(x,file)).length===1}
 function newThumbCount(before,after){return after.thumbs.filter(t=>!before.thumbs.includes(t)).length}
 async function getPlan({episodeId,segmentId}){
  const a=currentActive();const seg=getSegment(episodeId,segmentId);
  if(!seg||!String(seg.text||'').trim())throw Error('请先在当前段填写完整提示词');
  const rows=resolveRows(episodeId,segmentId);const tail=getTailForSegment(episodeId,segmentId);const plan=createPlan({prompt:seg.text,rows,chosenPaths:getChosenPaths(),tail});
  const snap=await probe(a.webContents);if(!snap.ready)return {...plan,ready:false,error:'豆包网页暂未找到可用的聊天输入框'};
  return {...plan,ready:true,currentDraftChars:(snap.prompt||'').length,differentDraft:!!snap.prompt?.trim()&&snap.prompt.trim()!==seg.text.trim(),accountId:a.accountId,conversation:a.webContents.getURL()};
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
 async function tryNative(ctx,code){
  ensure(ctx);const wc=ctx.wc;
  const before=await wc.executeJavaScript(oldPage.js(oldPage.inspectRichMentions),true);
  if(before.some(x=>x.marked&&codeInName(x.text).includes(code)))return {state:'native',message:'网页已有可核对的原生 @ 引用'};
  if(!(await wc.executeJavaScript(oldPage.js(oldPage.focusComposer),true)))return {state:'mapping',message:'未找到可用 @ 编辑器，保留图号表'};
  wc.insertText('@');await pause(500);ensure(ctx);
  const opts=await wc.executeJavaScript(oldPage.js(oldPage.inspectMentionOptions),true);
  const same=opts.filter(o=>codeInName(o.text).includes(code));
  if(same.length!==1){
   if(await wc.executeJavaScript(oldPage.js(oldPage.trailingAt),true)){
    wc.sendInputEvent({type:'keyDown',keyCode:'Backspace'});wc.sendInputEvent({type:'keyUp',keyCode:'Backspace'});
   }
   return {state:'mapping',message:same.length?'同编号 @ 候选冲突，未自动点选':'该聊天模式没有可核对的原生图片 @ 菜单，已保留图号表'};
  }
  const opt=same[0],evt={x:opt.x,y:opt.y,button:'left',clickCount:1};wc.sendInputEvent({type:'mouseDown',...evt});wc.sendInputEvent({type:'mouseUp',...evt});
  await pause(500);ensure(ctx);
  const after=await wc.executeJavaScript(oldPage.js(oldPage.inspectRichMentions),true);
  if(after.some(x=>x.marked&&codeInName(x.text).includes(code)))return {state:'native',message:'已在编辑器中检测到真实 @ 引用组件'};
  return {state:'mapping',message:'点击 @ 后未观察到原生引用组件，请以图号表为准'};
 }
 async function execute({episodeId,segmentId,replaceDraft=false,attemptNative=true}={}){
  if(running)throw Error('另一个一键导入任务正在执行');
  const pre=await getPlan({episodeId,segmentId});
  if(!pre.ready)throw Error(pre.error||'网页不可用');
  if(pre.blocked)throw Error(pre.overLimit?'参考图加上上一段尾帧超过9张，请先核对': '存在缺图、重号、格式问题或尾帧异常，先在右侧修正');
  const a=currentActive(),seg=getSegment(episodeId,segmentId),ctx={episodeId,segmentId,accountId:a.accountId,wc:a.webContents,url:a.webContents.getURL(),cancelled:false,rows:pre.items.map(x=>({code:x.code,state:'matched',message:'本地参考图已匹配'}))};
  const before=await probe(ctx.wc);
  if(before.prompt?.trim()&&before.prompt.trim()!==seg.text.trim()&&!replaceDraft)throw Error('豆包聊天框有不同草稿，须先确认是否覆盖');
  if(before.mentions?.length)throw Error('聊天框已有原生 @ 引用，请使用新对话或先手动清理，以免覆盖');
  // Existing attachments can shift numbering. Only continue if their filename
  // explicitly identifies an image in the current plan; no blind renumbering.
  for(const filename of before.names){if(!pre.items.some(x=>sameFilename(x.file.name,filename)))throw Error('聊天框已有其他附件，无法保证图号顺序，请先清空附件');}
  if(before.thumbs.length>before.names.length&&before.thumbs.length)throw Error('当前聊天框有无法识别名称的图片，请先清空附件，防止图号错位');
  if(before.names.some((name,i)=>!pre.items[i]||!sameFilename(name,pre.items[i].file.name)))throw Error('当前聊天附件顺序和本段参考图顺序不同，请先清空或另开聊天，避免图1、图2错位');
  running=ctx;const finished=[];let manualConfirmed=0,autoConfirmed=0;
  try{
   emit('running','开始上传本段 '+pre.items.length+' 张参考图',ctx);
   let previous=before;
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
   // User's original segment is never modified. Mapping is appended to the
   // draft only after every file is confirmed in the current Doubao chat.
   const composed=composeText(seg.text,finished.map(x=>({code:x.code,file:x.file})));
   const result=await evalFn(ctx.wc,page.setPrompt,{text:composed,allowedExisting:seg.text,replace:replaceDraft||!before.prompt?.trim()});
   ensure(ctx);
   if(!result.ok)throw Error(result.message+'；图片已上传，原始段落未修改');
   emit('running','全部图片已确认、完整提示词和图号表已经写入；尝试原生 @',ctx,{textFilled:true});
   let natives=0;
   for(let i=0;i<ctx.rows.length;i++){
    if(!attemptNative){ctx.rows[i].state='mapping';ctx.rows[i].message='已附图号对应表（未尝试原生 @）';continue;}
    ensure(ctx);const r=ctx.rows[i],native=await tryNative(ctx,r.code);
    r.state=native.state;r.message=native.message;if(native.state==='native')natives++;
    emit('running',`${r.code}: ${native.message}`,ctx,{textFilled:true,nativeVerified:natives});
   }
   const end={state:'done',message:`网页自动核验 ${autoConfirmed} 张、人工确认 ${manualConfirmed} 张｜提示词已填写｜原生@核验 ${natives}/${pre.items.length}；其余使用图号对应表`,rows:ctx.rows,uploaded:finished.length,autoConfirmed,manualConfirmed,textFilled:true,nativeVerified:natives,total:pre.items.length};
   emit('done',end.message,ctx,end);return end;
  }catch(e){const end={state:'error',message:e.message,rows:ctx.rows,uploaded:finished.length,textFilled:false,total:pre.items.length};emit('error',e.message,ctx,end);return end;}
  finally{running=null;}
 }
 function cancel(){if(!running)return false;running.cancelled=true;if(running.approve){running.approve(false);running.approve=null;}emit('cancelled','已请求停止；已提交到豆包的图片不会自动删除',running);return true;}
 function confirm(approved){if(!running?.approve)return false;const answer=running.approve;running.approve=null;answer(approved===true);return true;}
 return {getPlan,execute,cancel,confirm};
}
module.exports={createPlan,createImportEngine,EXTS};
