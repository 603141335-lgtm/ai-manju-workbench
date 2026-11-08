'use strict';
const fs=require('node:fs');
const {buildPlan,isAllowedDoubaoUrl,matchVisibleAttachment}=require('./mention-core');
const page=require('./mention-page');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isReadableFile=p=>{try{const s=fs.statSync(p);return s.isFile()&&s.size>0&&s.size<=25*1024*1024;}catch{return false;}};
function createMentionRunner({getActive,resolveRows,getCodes,getChosenPaths,notify=()=>{}}){
 let current=null;
 function ensure(token){
  if(token.cancelled||current!==token)throw Error('任务已取消');
  const c=getActive();
  if(!c||c.accountId!==token.accountId||c.webContents!==token.wc||!isAllowedDoubaoUrl(c.webContents.getURL())||c.webContents.isDestroyed())throw Error('账号、聊天页面已切换，操作已停止');
 }
 const evalPage=(wc,fn)=>wc.executeJavaScript(page.js(fn),true);
 async function probe(){
  const a=getActive();
  if(!a||!isAllowedDoubaoUrl(a.webContents.getURL()))return {ready:false,message:'请在当前账号打开豆包聊天页',prompt:'',attachments:[],mentions:[]};
  return evalPage(a.webContents,page.inspectPage);
 }
 async function preflight({episodeId,segmentId}){
  const a=getActive();
  if(!a||!isAllowedDoubaoUrl(a.webContents.getURL()))return {ready:false,error:'当前网页不是豆包聊天页，请先登录豆包'};
  const snapshot=await probe();
  if(!snapshot.ready)return {ready:false,error:snapshot.message};
  const rows=resolveRows(episodeId,segmentId,snapshot.prompt);
  const plan=buildPlan({prompt:snapshot.prompt,segmentCodes:getCodes(episodeId,segmentId),rows,accountId:a.accountId,conversation:a.webContents.getURL(),chosenPaths:getChosenPaths()});
  for(const row of plan.rows){
   const attached=matchVisibleAttachment(row.code,snapshot.attachments);
   row.webState=attached==='visible'?'附件可见':attached==='ambiguous'?'附件同名冲突':'尚未确认上传';
   const mentioned=matchVisibleAttachment(row.code,snapshot.mentions.map(m=>({name:m.text})))==='visible';
   row.mentionState=mentioned?'发现引用组件（仍需身份核对）':'尚未发现原生引用';
  }
  return {...plan,ready:true,promptFound:!!snapshot.prompt.trim(),attachedCount:snapshot.attachments.length,message:plan.rows.length?'已完成编号与附件预检':'没有识别到参考图编号'};
 }
 async function uploadFiles(token,paths){
  ensure(token);const wc=token.wc;
  let input=await evalPage(wc,page.uploadInputInfo);
  if(!input){
   const button=await evalPage(wc,page.uploadButtonRect);
   if(button){
    wc.sendInputEvent({type:'mouseDown',button:'left',x:button.x,y:button.y,clickCount:1});
    wc.sendInputEvent({type:'mouseUp',button:'left',x:button.x,y:button.y,clickCount:1});
    await delay(250);ensure(token);input=await evalPage(wc,page.uploadInputInfo);
   }
  }
  if(!input)return {ok:false,message:'豆包网页未暴露可用的多图片上传控件；请用原有拖拽/文件夹上传'};
  let attached=false;
  try {
   const dbg=wc.debugger;
   if(!dbg.isAttached()){dbg.attach('1.3');attached=true;}
   const root=await dbg.sendCommand('DOM.getDocument',{depth:0});
   const found=await dbg.sendCommand('DOM.querySelector',{nodeId:root.root.nodeId,selector:input.css});
   if(!found.nodeId)throw Error('上传控件发生变化');
   await dbg.sendCommand('DOM.setFileInputFiles',{nodeId:found.nodeId,files:paths});
   return {ok:true,count:paths.length,message:'文件已交给豆包网页上传控件，正在核实页面状态（不代表已上传成功）'};
  } catch(e){return {ok:false,message:'文件选择未完成：'+e.message};}
  finally{if(attached&&wc.debugger.isAttached())try{wc.debugger.detach()}catch{}}
 }
 async function tryMention(token,code){
  ensure(token);const wc=token.wc;
  const before=await evalPage(wc,page.inspectRichMentions);
  if(!(await evalPage(wc,page.focusComposer)))return {state:'unverified',message:'无法定位聊天输入框'};
  wc.insertText('@');await delay(450);ensure(token);
  const opts=await evalPage(wc,page.inspectMentionOptions);
  const matching=opts.filter(o=>{
   const escaped=code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const r=new RegExp('(?:^|[^A-Za-z0-9])'+escaped+'(?:\\.[a-z]{2,5})?(?=$|[^A-Za-z0-9-])','i');
   return r.test(o.text);
  });
  if(matching.length!==1){
   if(await evalPage(wc,page.removeTrailingAt)){
    wc.sendInputEvent({type:'keyDown',keyCode:'Backspace'});
    wc.sendInputEvent({type:'keyUp',keyCode:'Backspace'});
   }
   return {state:'unverified',message:matching.length?'出现多个同编号的 @ 菜单项':'豆包网页没有显示可确认的 @ 图片菜单项'};
  }
  const item=matching[0];
  wc.sendInputEvent({type:'mouseDown',x:item.x,y:item.y,button:'left',clickCount:1});
  wc.sendInputEvent({type:'mouseUp',x:item.x,y:item.y,button:'left',clickCount:1});
  await delay(500);ensure(token);
  const after=await evalPage(wc,page.inspectRichMentions);
  const fresh=after.length>before.length&&after.some(m=>m.text.toUpperCase().includes(code));
  return fresh?{state:'verified',message:'豆包原生引用组件已出现，名称与编号匹配'}:{state:'unverified',message:'已尝试选择 @ 图片，但网页没有提供足够证据确认绑定'};
 }
 async function execute({episodeId,segmentId}){
  if(current)throw Error('已经有一键艾特任务在执行');
  const plan=await preflight({episodeId,segmentId});
  if(!plan.ready)throw Error(plan.error||'无法预检');
  if(!plan.rows.length)throw Error('当前提示词没有参考图编号');
  if(plan.blocked)throw Error('存在缺图、重号或超过9张的情况，请先处理预检异常');
  if(!plan.promptFound)throw Error('请先把提示词粘贴到豆包网页聊天框，再点击一键艾特');
  const a=getActive(),token={cancelled:false,accountId:a.accountId,wc:a.webContents};current=token;
  const results=[];let uploaded=0,mentioned=0;
  const status=(state,message,code)=>notify({state,message,code,results:[...results]});
  try{
   status('running','正在检查当前聊天已上传图片');
   const snapshot=await probe();ensure(token);
   const todo=[];
   for(const row of plan.rows){
    if(row.mentionState.startsWith('发现')){results.push({code:row.code,state:'unverified',message:'已有引用组件，但身份尚未验证'});continue;}
    if(matchVisibleAttachment(row.code,snapshot.attachments)==='visible'){results.push({code:row.code,state:'uploaded',message:'当前聊天附件中已发现同编号文件'});continue;}
    if(!isReadableFile(row.file.path)){results.push({code:row.code,state:'error',message:'文件丢失、为空或超过25MB'});continue;}
    todo.push(row);
   }
   if(todo.length){
    status('running','自动选择 '+todo.length+' 张本地图片');
    const ur=await uploadFiles(token,todo.map(r=>r.file.path));ensure(token);
    if(!ur.ok)for(const row of todo)results.push({code:row.code,state:'manual',message:ur.message});
    else{
     uploaded+=ur.count;status('running',ur.message);await delay(900);ensure(token);
     const after=await probe();
     for(const row of todo){
      const found=matchVisibleAttachment(row.code,after.attachments);
      results.push({code:row.code,state:found==='visible'?'uploaded':'pending',message:found==='visible'?'网页附件列表已识别到文件名':'文件已提交上传控件，但尚未确认上传完成'});
     }
    }
   }
   for(const row of results){
    ensure(token);
    if(row.state!=='uploaded')continue;
    status('running','正在尝试 @ '+row.code,row.code);
    const r=await tryMention(token,row.code);row.state=r.state;row.message=r.message;
    if(r.state==='verified')mentioned++;
   }
   const summary={state:'done',message:`已提交 ${uploaded} 张上传，原生 @ 验证 ${mentioned}/${plan.rows.length} 张；未验证项请查看下方结果`,results,uploaded,verified:mentioned,total:plan.rows.length};
   status('done',summary.message);return summary;
  }catch(e){status('error',e.message);return {state:'error',message:e.message,results};}
  finally{current=null;}
 }
 function cancel(){if(!current)return false;current.cancelled=true;notify({state:'cancelled',message:'已取消一键艾特；已经上传的图片仍保留在豆包聊天框'});return true;}
 return {preflight,execute,cancel,probe};
}
module.exports={createMentionRunner};
