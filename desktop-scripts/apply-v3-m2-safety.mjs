// Safety gate for paid API workflows and explicit abandonment of pending runs.
// Apply after v3-M2 main overlay. Preserve original WebView login and API boundaries.
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
function patch(rel,from,to){
 const p=path.join(root,rel);
 const s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
 if(!s.includes(from))throw Error('补丁检查失败：'+rel+' '+from.slice(0,80));
 fs.writeFileSync(p,s.replace(from,to),'utf8');
}
const h='src/workbench_v3/useUnifiedChat.ts';
patch(h,
 "  if(!chosen||busy||!draft.trim())return;",
 `  if(!chosen||busy||!draft.trim())return;
  if(run && ['running','paused','waiting_manual','unknown_completion'].includes(run.status)){
   setNotice('已有未结束的任务。请先完成、核对或终止当前接力流程。');
   return;
  }`);
patch(h,
 "  if(task.length>150000){setNotice('文本超限：请分段处理，不会静默截断');return;}",
 `  if(task.length>150000){setNotice('文本超限：请分段处理，不会静默截断');return;}
  if(chosen.mode==='relay' && plan){
   const issues=validatePlan(plan,inRoom);
   if(issues.length){setNotice('本群的接力步骤配置已失效，请先打开编辑器修复：'+issues.join('；'));return;}
  }`);
patch(h,
 "  setDraft('');\n  try{\n   await saveMessage",
 `  const estimatedCalls=chosen.mode==='relay' && plan && validatePlan(plan,inRoom).length===0
    ?plan.steps.filter(step=>members.some(m=>m.id===step.memberId))
       .filter(step=>{const m=inRoom.find(x=>x.id===step.memberId);return m?.kind==='api'&&API_PROVIDER_IDS.has(m.provider)&&!!m.modelId&&!!keys[m.provider];}).length
    :members.filter(m=>m.kind==='api'&&API_PROVIDER_IDS.has(m.provider)&&!!m.modelId&&!!keys[m.provider]).length;
  if(estimatedCalls>0&&!window.confirm(
   '此任务可能调用 '+estimatedCalls+' 次付费官方 API；实际费用以各平台控制台为准。确定执行？'
  ))return;
  setDraft('');
  try{
   await saveMessage`);
patch(h,
 " const resume=async()=>{if(chosen&&run?.status==='paused'){await execute(run.id,chosen.id,run.state);}};",
 ` async function cancelRun(){
  if(!chosen||!run||['completed','cancelled','failed'].includes(run.status))return;
  if(busy){stop.current=true;setNotice('停止请求已收到，当前 API 请求可能仍在进行并产生费用。');return;}
  if(!window.confirm('确定终止当前接力？已经完成的真实回复和历史会保留，但剩余步骤不再调用。'))return;
  await persist(run.id,chosen.id,{...run.state,status:'cancelled'});
  setManualText('');
  setNotice('当前接力已经终止，可发布新任务。');
 }
 const resume=async()=>{if(chosen&&run?.status==='paused'){await execute(run.id,chosen.id,run.state);}};`);
patch(h,
 "  stop:()=>{stop.current=true;setNotice('收到暂停请求，当前 API 完成后停止继续交接。');},role};",
 "  stop:()=>{stop.current=true;setNotice('收到暂停请求，当前 API 完成后停止继续交接。');},cancelRun,role};");
const ui='src/ui/UnifiedChatWorkspace.tsx';
patch(ui,
 `       {w.run.status==='paused'&&<button onClick={()=>void w.resume()} className="rounded-lg border px-2 py-1">继续接力</button>}`,
 `       {w.run.status==='paused'&&<button onClick={()=>void w.resume()} className="rounded-lg border px-2 py-1">继续接力</button>}
       {!['cancelled','failed'].includes(w.run.status)&&<button onClick={()=>void w.cancelRun().catch(e=>w.setNotice(String(e)))} className="ml-auto rounded-lg border border-rose-300 px-2 py-1 text-rose-700">终止任务</button>}`);
console.log('v3 M2 safety gates integrated');
