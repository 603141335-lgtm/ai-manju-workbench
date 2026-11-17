'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {buildPlan,isAllowedDoubaoUrl,matchVisibleAttachment,codeInName}=require('./mention-core');
const page=require('./mention-page');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isReadableFile=p=>{try{const s=fs.statSync(p);return s.isFile()&&s.size>0&&s.size<=25*1024*1024;}catch{return false;}};
const LIMITS={chooserMs:3500,uploadMs:45000,mentionMs:3000,pollMs:500};
const pathKey=p=>path.resolve(String(p||'')).toLowerCase();
function exactlyOne(code,items){return matchVisibleAttachment(code,items)==='visible';}
/** Only confirmed native mention nodes may produce 'verified'; plain @ text is never evidence. */
function confirmedNativeCode(code,items){return (items||[]).filter(x=>x.marked&&codeInName(x.text).includes(code)).length===1;}
function createMentionRunner({getActive,resolveRows,getCodes,getChosenPaths,notify=()=>{},clock=delay,limits={}}){
 const opts={...LIMITS,...limits};
 let current=null;
 const sleep=clock;
 function ensure(t){
  if(t.cancelled||current!==t)throw Error('任务已取消');
  const c=getActive();
  if(!c||c.accountId!==t.accountId||c.webContents!==t.wc||c.webContents.isDestroyed()||!isAllowedDoubaoUrl(c.webContents.getURL())||c.webContents.getURL()!==t.url)throw Error('账号或聊天页面已切换，已安全停止');
 }
 const evalPage=(wc,fn)=>wc.executeJavaScript(page.js(fn),true);
 async function probe(){
  const a=getActive();if(!a||!isAllowedDoubaoUrl(a.webContents.getURL()))return {ready:false,message:'请打开豆包当前聊天页',prompt:'',attachments:[],mentions:[]};
  return evalPage(a.webContents,page.inspectPage);
 }
 async function preflight({episodeId,segmentId}){
  const a=getActive();if(!a||!isAllowedDoubaoUrl(a.webContents.getURL()))return {ready:false,error:'请先登录豆包，打开真实聊天页'};
  const snap=await probe();if(!snap.ready)return {ready:false,error:snap.message};
  const rows=resolveRows(episodeId,segmentId,snap.prompt);
  const plan=buildPlan({prompt:snap.prompt,segmentCodes:getCodes(episodeId,segmentId),rows,accountId:a.accountId,conversation:a.webContents.getURL(),chosenPaths:getChosenPaths()});
  for(const row of plan.rows){
   const found=matchVisibleAttachment(row.code,snap.attachments);
   row.webState=found==='visible'?'可见同编号附件（尚需确认上传完成）':found==='ambiguous'?'附件同名冲突':'聊天框未确认上传';
   row.mentionState=confirmedNativeCode(row.code,snap.mentions)?'发现已标记的原生引用': '未验证原生引用';
  }
  return {...plan,ready:true,promptFound:!!snap.prompt.trim(),attachedCount:snap.attachments.length,message:plan.rows.length?'已完成编号匹配预检':'没有检测到参考图编号'};
 }
 function click(wc,action){
  const p={x:action.x,y:action.y,button:'left',clickCount:1};
  wc.sendInputEvent({type:'mouseDown',...p});wc.sendInputEvent({type:'mouseUp',...p});
 }
 async function waitFor(t,predicate,ms){
  const stop=Date.now()+ms;
  while(Date.now()<stop){ensure(t);const result=await predicate();if(result)return result;await sleep(Math.min(opts.pollMs,Math.max(1,stop-Date.now())));}
  return null;
 }
 /**
  * Intercept the exact input opened by clicking Doubao's *visible* upload button.
  * Page.fileChooserOpened exposes backendNodeId, avoiding the v0.7 error of
  * selecting an unrelated hidden/obsolete file input by generic CSS selector.
  * The function only establishes that the page received the file selection.
  */
 async function selectFiles(t,files){
  ensure(t);const wc=t.wc,dbg=wc.debugger;
  if(!dbg||typeof dbg.attach!=='function')return {ok:false,reason:'当前 Electron 不支持文件选择控制'};
  let owned=false,intercept=false,listener;
  try{
   if(!dbg.isAttached()){dbg.attach('1.3');owned=true;}
   await dbg.sendCommand('Page.enable');
   await dbg.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});intercept=true;
   let chooserEvent=null;
   listener=(_event,method,params)=>{if(method==='Page.fileChooserOpened'&&params?.backendNodeId)chooserEvent=params};
   dbg.on('message',listener);
   let action=await evalPage(wc,page.uploadAction);
   // Upload command can be behind a visible "+" menu.
   if(action?.kind==='open-menu'){
    click(wc,action);await sleep(300);ensure(t);
    action=await evalPage(wc,page.uploadAction);
   }
   if(action?.kind==='upload'){
    click(wc,action);
    await waitFor(t,()=>chooserEvent,opts.chooserMs);
   }
   if(chooserEvent?.backendNodeId){
    const selected=chooserEvent.mode==='selectSingle'?files.slice(0,1):files;
    await dbg.sendCommand('DOM.setFileInputFiles',{backendNodeId:chooserEvent.backendNodeId,files:selected});
    return {ok:true,selected:selected.length,method:'fileChooserOpened',message:'豆包文件选择控件已收到文件，等待真实附件'};
   }
   // Safe fallback: only one image-accepting file input in DOM; never the first generic input.
   const candidate=await evalPage(wc,page.candidateFileInput);
   if(!candidate)return {ok:false,reason:'未发现明确的豆包图片上传文件选择入口'};
   const root=await dbg.sendCommand('DOM.getDocument',{depth:0});
   const found=await dbg.sendCommand('DOM.querySelector',{nodeId:root.root.nodeId,selector:candidate.selector});
   if(!found.nodeId)return {ok:false,reason:'上传控件已发生变化'};
   const selected=candidate.multiple?files:files.slice(0,1);
   await dbg.sendCommand('DOM.setFileInputFiles',{nodeId:found.nodeId,files:selected});
   return {ok:true,selected:selected.length,method:'unique-image-input',message:'唯一图片选择控件已接收文件，等待豆包确认'};
  }catch(e){return {ok:false,reason:'网页上传入口操作失败：'+e.message};}
  finally{
   if(listener&&typeof dbg.off==='function')dbg.off('message',listener);
   else if(listener&&typeof dbg.removeListener==='function')dbg.removeListener('message',listener);
   if(intercept)try{await dbg.sendCommand('Page.setInterceptFileChooserDialog',{enabled:false})}catch{}
   if(owned&&dbg.isAttached())try{dbg.detach()}catch{}
  }
 }
 async function waitUploaded(t,codes){
  const stable=new Map(),confirmed=new Set();let final=null;
  const deadline=Date.now()+opts.uploadMs;
  while(Date.now()<deadline){
   ensure(t);const snap=await probe();ensure(t);final=snap;
   for(const code of codes){
    const found=matchVisibleAttachment(code,snap.attachments);
    const n=found==='visible'&&!snap.busy?(stable.get(code)||0)+1:0;
    stable.set(code,n);if(n>=2)confirmed.add(code);
   }
   if(confirmed.size===codes.length)break;
   await sleep(opts.pollMs);
  }
  return {confirmed,final};
 }
 async function tryMention(t,code){
  ensure(t);const wc=t.wc,before=await evalPage(wc,page.inspectRichMentions);
  if(confirmedNativeCode(code,before))return {state:'verified',message:'编辑器里已有同编号原生引用，已跳过'};
  if(!(await evalPage(wc,page.focusComposer)))return {state:'unverified',message:'无法确定豆包编辑器焦点'};
  wc.insertText('@');
  const found=await waitFor(t,async()=>{
   const options=await evalPage(wc,page.inspectMentionOptions);
   const matches=options.filter(x=>codeInName(x.text).includes(code));
   return matches.length===1?{option:matches[0]}:matches.length>1?{ambiguous:true}:null;
  },opts.mentionMs);
  if(!found||found.ambiguous){
   if(await evalPage(wc,page.trailingAt)){
    wc.sendInputEvent({type:'keyDown',keyCode:'Backspace'});wc.sendInputEvent({type:'keyUp',keyCode:'Backspace'});
   }
   return {state:'unverified',message:found?.ambiguous?'@ 列表存在同编号候选，未自动选择':'没有出现可精确匹配的豆包原生 @ 图片菜单'};
  }
  click(wc,found.option);await sleep(450);ensure(t);
  const after=await evalPage(wc,page.inspectRichMentions);
  if(confirmedNativeCode(code,after)&&(!confirmedNativeCode(code,before)))return {state:'verified',message:'原生 @ 引用标记已出现且编号吻合'};
  return {state:'unverified',message:'已尝试点击菜单，但未观察到明确的原生引用标记'};
 }
 async function execute({episodeId,segmentId}){
  if(current)throw Error('有一键艾特任务仍在执行');
  const plan=await preflight({episodeId,segmentId});
  if(!plan.ready)throw Error(plan.error||'预检失败');
  if(!plan.rows.length)throw Error('当前提示词没有参考图编号');
  if(plan.blocked)throw Error('存在缺图、重复版本、格式问题或超出9张，请先处理');
  if(!plan.promptFound)throw Error('请先把提示词粘贴到豆包聊天框');
  const a=getActive(),t={accountId:a.accountId,wc:a.webContents,url:a.webContents.getURL(),cancelled:false};current=t;
  const records=plan.rows.map(row=>({code:row.code,state:'matched',message:'本地匹配成功'}));
  let selected=0,verifiedUpload=0,verifiedMention=0;
  function status(state,message,code){notify({state,message,code,results:records.map(x=>({...x})),selected,uploaded:verifiedUpload,verified:verifiedMention,total:plan.rows.length});}
  try{
   status('running','正在检查当前聊天附件');
   let snap=await probe();ensure(t);
   const pending=[];
   for(let i=0;i<plan.rows.length;i++){
    const src=plan.rows[i],dest=records[i];
    if(confirmedNativeCode(src.code,snap.mentions)){
     dest.state='verified';dest.message='已存在可识别的原生引用';verifiedMention++;continue;
    }
    if(exactlyOne(src.code,snap.attachments)&&!snap.busy){
     dest.state='attachment-visible';dest.message='附件名字已出现在当前聊天，待稳定确认';
    }else{
     if(!isReadableFile(src.file.path)){dest.state='error';dest.message='文件不可读取、为空或超过25 MB';continue;}
     pending.push(src);
    }
   }
   if(pending.length){
    status('running','正在操作豆包真实上传文件选择器');
    let cursor=0;
    while(cursor<pending.length){
     ensure(t);
     const remaining=pending.slice(cursor);
     const response=await selectFiles(t,remaining.map(x=>x.file.path));ensure(t);
     if(!response.ok){
      for(const src of remaining){const r=records.find(x=>x.code===src.code);r.state='manual';r.message=response.reason+'；可用工作台原有文件夹方式手动上传';}
      break;
     }
     if(!response.selected||response.selected>remaining.length)throw Error('文件选择器返回异常数量');
     const thisBatch=remaining.slice(0,response.selected);
     selected+=response.selected;
     for(const src of thisBatch){
      const r=records.find(x=>x.code===src.code);r.state='file-selected';r.message=response.message;
     }
     cursor+=response.selected;
     status('running',`文件已选择 ${selected} 张；等待豆包网页确认`);
     // A single-file chooser is supported by repeating upload through the UI,
     // but only once the previous file has appeared. One click in workbench
     // still handles the full segment, without uploading items concurrently.
     if(response.selected===1 && cursor<pending.length){
      const observed=await waitUploaded(t,[thisBatch[0].code]);ensure(t);
      const row=records.find(x=>x.code===thisBatch[0].code);
      if(!observed.confirmed.has(thisBatch[0].code)){
       row.state='pending';row.message='单图上传未获网页确认，为避免重复操作，剩余图片已暂停';
       for(const src of pending.slice(cursor)){
        const r=records.find(x=>x.code===src.code);r.state='manual';r.message='前一张未上传确认，本次未继续选择';
       }
       break;
      }
      row.state='uploaded';row.message='单张图片上传已获网页确认';verifiedUpload++;
     }
    }
   }
   const waitCodes=records.filter(x=>x.state==='file-selected'||x.state==='attachment-visible').map(x=>x.code);
   if(waitCodes.length){
    const observed=await waitUploaded(t,waitCodes);ensure(t);
    for(const record of records){
     if(!waitCodes.includes(record.code))continue;
     if(observed.confirmed.has(record.code)){
      record.state='uploaded';record.message='网页中连续确认同名附件，且无上传进度';verifiedUpload++;
     }else{
      record.state='pending';record.message='未观察到已完成且身份匹配的网页附件；请手动检查是否上传成功';
     }
    }
   }
   // Only allow @ on files that the current chat has visibly accepted.
   for(const record of records){
    ensure(t);if(record.state!=='uploaded'&&record.state!=='verified')continue;
    if(record.state==='verified')continue;
    status('running','正在尝试原生 @ '+record.code,record.code);
    const r=await tryMention(t,record.code);
    record.state=r.state;record.message=r.message;
    if(r.state==='verified')verifiedMention++;
   }
   const all=verifiedMention===records.length;
   const result={state:'done',message:all?`全部 ${verifiedMention} 张 @ 已验证；请检查后手动发送`:`文件选择 ${selected} 张｜网页确认上传 ${verifiedUpload} 张｜原生 @ 已验证 ${verifiedMention}/${records.length}；未验证不算成功`,results:records,selected,uploaded:verifiedUpload,verified:verifiedMention,total:records.length};
   status('done',result.message);return result;
  }catch(e){status('error',e.message);return {state:'error',message:e.message,results:records,selected,uploaded:verifiedUpload,verified:verifiedMention,total:records.length};}
  finally{current=null;}
 }
 function cancel(){if(!current)return false;current.cancelled=true;notify({state:'cancelled',message:'任务已取消；已经上传到豆包的附件不自动删除'});return true;}
 return {preflight,execute,cancel,probe};
}
module.exports={createMentionRunner,confirmedNativeCode,LIMITS};
