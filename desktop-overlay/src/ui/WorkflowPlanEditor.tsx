import {useEffect,useState} from 'react';
import type {Member} from '../workbench_v3/logic';
import {initialPlan,MAX_PLAN_STEPS,validatePlan,type WorkflowPlan,type PlanStep} from '../workbench_v3/plan';
type Props={
 members:readonly Member[];
 roles:(memberId:string)=>string;
 current:WorkflowPlan|null;
 busy:boolean;
 onSave:(plan:WorkflowPlan)=>Promise<void>;
 onClose:()=>void;
};
export function WorkflowPlanEditor({members,roles,current,busy,onSave,onClose}:Props){
 const [plan,setPlan]=useState<WorkflowPlan>(()=>current?structuredClone(current):initialPlan(members,roles));
 const [notice,setNotice]=useState('');
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setPlan(current?structuredClone(current):initialPlan(members,roles));},[current]);
 const update=(index:number,fields:Partial<PlanStep>)=>setPlan(prev=>({...prev,steps:prev.steps.map((s,i)=>i===index?{...s,...fields}:s)}));
 const move=(index:number,to:number)=>setPlan(prev=>{
  if(to<0||to>=prev.steps.length)return prev;
  const steps=prev.steps.slice();[steps[index],steps[to]]=[steps[to],steps[index]];
  return {...prev,steps};
 });
 const errors=validatePlan(plan,members);
 const save=async()=>{
  if(errors.length || saving || busy)return;
  try{setSaving(true);await onSave(plan);onClose();}
  catch(e){setNotice('保存失败：'+String(e));}finally{setSaving(false);}
 };
 return <div role="dialog" aria-modal="true" aria-label="编辑接力流程" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4">
  <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-800 shadow-2xl">
   <div className="mb-4 flex items-center justify-between gap-2">
    <div><h2 className="text-lg font-semibold">AI 接力流程编辑器</h2><p className="text-xs text-slate-500">仅作用于当前群聊，可重复选择同一个 AI 执行多个步骤。</p></div>
    <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-xs">关闭</button>
   </div>
   <label className="mb-3 block text-xs font-semibold">流程名称
    <input value={plan.name} maxLength={120} disabled={busy||saving} onChange={e=>setPlan({...plan,name:e.target.value})}
     className="mt-1 block w-full rounded-lg border p-2 text-sm"/>
   </label>
   <div className="space-y-3">
    {plan.steps.map((step,index)=><div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
     <div className="flex flex-wrap items-center gap-2">
      <b className="text-xs">第 {index+1} 步</b>
      <label className="text-xs">AI 成员
       <select value={step.memberId} disabled={busy||saving} onChange={e=>update(index,{memberId:e.target.value,role:roles(e.target.value)})}
        className="ml-2 rounded-lg border bg-white px-2 py-1.5">
        {members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.kind==='api'?'官方 API':'网页/人工'}</option>)}
       </select>
      </label>
      <div className="ml-auto flex gap-1">
       <button type="button" aria-label="上移步骤" disabled={index===0||busy||saving} onClick={()=>move(index,index-1)} className="rounded border px-2 py-1 disabled:opacity-40">↑</button>
       <button type="button" aria-label="下移步骤" disabled={index===plan.steps.length-1||busy||saving} onClick={()=>move(index,index+1)} className="rounded border px-2 py-1 disabled:opacity-40">↓</button>
       <button type="button" disabled={plan.steps.length<=1||busy||saving} onClick={()=>setPlan(prev=>({...prev,steps:prev.steps.filter((_,i)=>i!==index)}))}
        className="rounded border border-rose-300 px-2 py-1 text-rose-700 disabled:opacity-40">删除</button>
      </div>
     </div>
     <label className="mt-2 block text-xs">本步职责
      <input value={step.role} disabled={busy||saving} maxLength={120} onChange={e=>update(index,{role:e.target.value})}
       className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"/>
     </label>
     <label className="mt-2 block text-xs">本步详细规则 / Skill
      <textarea value={step.instruction} disabled={busy||saving} maxLength={12000} rows={3} onChange={e=>update(index,{instruction:e.target.value})}
       className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"/>
     </label>
    </div>)}
   </div>
   <button type="button" disabled={busy||saving||plan.steps.length>=MAX_PLAN_STEPS||!members.length}
    onClick={()=>setPlan(prev=>({...prev,steps:[...prev.steps,{
     id:'step-'+crypto.randomUUID(),memberId:members[0].id,role:roles(members[0].id),
     instruction:'根据前面完整成果继续处理，保留所有关键内容。'
    }]}))}
    className="mt-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs text-indigo-700 disabled:opacity-40">＋ 添加接力步骤</button>
   {errors.length>0&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{errors.join('；')}</p>}
   {notice&&<p role="status" className="mt-2 text-xs text-rose-600">{notice}</p>}
   <p className="mt-3 text-xs leading-5 text-slate-500">执行前保存步骤的快照。运行中修改本群的模板不会影响已开始的任务。API 失败或结果未知时停止，不会自动重复付费调用。</p>
   <div className="mt-4 flex justify-end gap-2">
    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">取消</button>
    <button onClick={()=>void save()} disabled={busy||saving||errors.length>0}
     className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">保存当前群流程</button>
   </div>
  </div>
 </div>;
}
