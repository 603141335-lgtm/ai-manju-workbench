'use strict';
const {probeVideoMode,clickVideoModeControl,callVideoMode}=require('./video-mode-page');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const acceptable=url=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='doubao.com'||u.hostname.endsWith('.doubao.com'))}catch{return false}};
function createVideoModeController({getActive,notify=()=>{},sleep=delay}={}){
 const state=new Map(),running=new Map();
 const report=(aid,stage,message,extra={})=>{const value={accountId:aid,stage,message,at:Date.now(),...extra};state.set(aid,value);notify(value);return value};
 async function ensure({accountId,automatic=false}={}){
  const active=getActive();if(!active||active.accountId!==accountId)throw Error('目标豆包账号未处于工作台当前窗口');
  const wc=active.webContents;if(wc.isDestroyed()||!acceptable(wc.getURL()))throw Error('尚未打开豆包登录页面');
  if(running.has(accountId))return running.get(accountId);
  const task=(async()=>{
   const guard=()=>{const cur=getActive();if(!cur||cur.accountId!==accountId||cur.webContents!==wc||wc.isDestroyed()||!acceptable(wc.getURL()))throw Error('豆包账号或页面已切换，停止修改视频参数')};
   const evalFn=(fn,arg)=>{guard();return wc.executeJavaScript(callVideoMode(fn,arg),true)};
   const probe=()=>evalFn(probeVideoMode,null);
   const click=async(name)=>{const res=await evalFn(clickVideoModeControl,name);await sleep(380);return res};
   report(accountId,'checking','正在检查豆包视频生成模式');
   let snap=null;
   for(let i=0;i<6;i++){snap=await probe();if(snap.ready)break;await sleep(420)}
   if(!snap?.ready){report(accountId,'login','网页尚无可用输入框，请完成登录或刷新');throw Error('豆包视频输入区尚未就绪，请检查登录及网络')}
   if(!snap.mode){
    report(accountId,'mode','正在选择「视频生成」');
    await click('open-mode');await click('choose-mode');snap=await probe();
    if(!snap.mode){report(accountId,'manual','尚未确认进入视频生成模式', {evidence:snap.evidence});throw Error('未能确认豆包已切到「视频生成」，请手动选择后重试')}
   }
   if(!snap.model){
    report(accountId,'model','正在选择 Seedance 2.0 Fast');
    await click('open-model');await click('choose-model');snap=await probe();
    if(!snap.model){report(accountId,'manual','模型尚未确认',{evidence:snap.evidence});throw Error('未确认 Seedance 2.0 Fast；当前账号可能没有该模型或页面结构已变')}
   }
   if(!snap.aspect){
    report(accountId,'aspect','正在选择 16:9');
    await click('open-settings');await click('choose-aspect');snap=await probe();
    if(!snap.aspect){report(accountId,'manual','画幅比例尚未确认',{evidence:snap.evidence});throw Error('未确认 16:9，请在豆包内手动设置后重试')}
   }
   if(!snap.duration){
    report(accountId,'duration','正在选择 15秒');
    await click('open-settings');await click('choose-duration');snap=await probe();
    if(!snap.duration){report(accountId,'manual','视频时长尚未确认',{evidence:snap.evidence});throw Error('未确认 15秒，请在豆包内手动设置后重试')}
   }
   guard();
   report(accountId,'ready','视频生成已确认 · Seedance 2.0 Fast · 16:9 · 15秒',{verified:true,evidence:snap.evidence});
   return snap;
  })().catch(e=>{if(!['manual','login'].includes(state.get(accountId)?.stage))report(accountId,automatic?'attention':'error',e.message);throw e}).finally(()=>running.delete(accountId));
  running.set(accountId,task);return task;
 }
 function getStatus(accountId){return state.get(accountId)||{accountId,stage:'idle',message:'尚未检查视频创作模式',verified:false}}
 return {ensure,getStatus};
}
module.exports={createVideoModeController,acceptable};
