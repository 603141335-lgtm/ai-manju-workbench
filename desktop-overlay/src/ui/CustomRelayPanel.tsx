import { useMemo, useState } from 'react';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import {
  createRelay, deleteRelayTemplate, loadRelayTemplates, saveRelayTemplate,
  validateRelay, MAX_STEPS,
  type RelayStep, type RelayWorkflow,
} from '../workflow/customRelay';

type Props={
  active?: RelayWorkflow;
  providers: readonly AIProvider[];
  disabled: boolean;
  onActivate: (value:RelayWorkflow)=>void;
  onDeactivate:()=>void;
};
export function CustomRelayPanel({active,providers,disabled,onActivate,onDeactivate}:Props){
  const [expanded,setExpanded]=useState(false);
  const [draft,setDraft]=useState<RelayWorkflow>(()=>active??createRelay(providers[0]??'gemini'));
  const [templates,setTemplates]=useState(loadRelayTemplates);
  const [notice,setNotice]=useState('');
  const errors=useMemo(()=>validateRelay(draft),[draft]);
  const update=(i:number,patch:Partial<RelayStep>)=>setDraft(prev=>({
    ...prev,steps:prev.steps.map((s,index)=>index===i?{...s,...patch}:s),
  }));
  const move=(i:number,to:number)=>setDraft(prev=>{
    if(to<0||to>=prev.steps.length)return prev;
    const next=prev.steps.slice();
    [next[i],next[to]]=[next[to],next[i]];
    next[0]={...next[0],source:'original'};
    return {...prev,steps:next};
  });
  const add=()=>setDraft(prev=>{
    if(prev.steps.length>=MAX_STEPS)return prev;
    const index=prev.steps.length;
    return {...prev,steps:[...prev.steps,{
      id:'s'+Date.now().toString(36)+index,
      provider:providers[index%Math.max(providers.length,1)]??'gemini',
      role:'新步骤',instruction:'根据用户任务与前序成果继续处理，保持所有重要信息。',
      source:'all',confirm:false,
    }]};
  });
  const save=()=>{
    try{saveRelayTemplate(draft);setTemplates(loadRelayTemplates());setNotice('已保存本地流程模板');}
    catch(error){setNotice('保存失败：'+String(error));}
  };
  const activate=()=>{
    if(errors.length)return;
    onActivate(structuredClone(draft));
    setNotice('已启用。请在下方消息框输入任务并发送。');
    setExpanded(false);
  };
  return (
    <section className="relay-panel mt-2 rounded-xl border border-sky-200 bg-white/95 p-3 text-zinc-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" aria-label="自定义 AI 接力">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">🔄 自定义 AI 接力</strong>
        <button type="button" disabled={disabled} onClick={()=>{if(active&&!expanded)setDraft(structuredClone(active));setExpanded(v=>!v);}}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {expanded?'收起步骤':'编辑步骤'}
        </button>
        {active ? <><span className="text-xs text-emerald-700 dark:text-emerald-400">已启用：{active.name} · {active.steps.length} 步</span>
        <button type="button" disabled={disabled} onClick={onDeactivate} className="rounded-lg border px-2 py-1.5 text-xs">退出接力</button></>
        : <span className="text-xs text-slate-500">当前使用原有聊天/辩论模式</span>}
      </div>
      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs">流程名称
              <input aria-label="流程名称" value={draft.name} disabled={disabled} onChange={e=>setDraft({...draft,name:e.target.value})}
                className="ml-2 rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-600"/>
            </label>
            <label className="text-xs">已保存模板
              <select aria-label="选择流程模板" value="" disabled={disabled} className="ml-2 rounded-md border bg-transparent px-2 py-1.5"
                onChange={e=>{const selected=templates.find(t=>t.id===e.target.value);if(selected)setDraft(structuredClone(selected));}}>
                <option value="">选择模板</option>
                {templates.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button type="button" className="rounded-md border px-2 py-1.5 text-xs" disabled={disabled}
              onClick={()=>setDraft(createRelay(providers[0]??'gemini'))}>新建流程</button>
          </div>
          {draft.steps.map((step,index)=>(
            <fieldset key={step.id} disabled={disabled} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">步骤 {index+1}</span>
                <label className="text-xs">执行 AI
                  <select value={step.provider} aria-label={'步骤 '+(index+1)+' 模型'} onChange={e=>update(index,{provider:e.target.value as AIProvider})}
                    className="ml-1 rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600">
                    {providers.map(p=><option key={p} value={p}>{AI_PROVIDERS[p].name}</option>)}
                  </select>
                </label>
                <label className="text-xs">读取内容
                  <select value={step.source} aria-label={'步骤 '+(index+1)+' 输入来源'} disabled={index===0}
                    onChange={e=>update(index,{source:e.target.value as RelayStep['source']})}
                    className="ml-1 rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600">
                    <option value="original">原始任务</option>
                    {index>0 && <><option value="previous">原任务＋上一步</option><option value="all">原任务＋全部前序</option></>}
                  </select>
                </label>
                <button type="button" className="rounded-md border px-2 text-xs" disabled={index===0} onClick={()=>move(index,index-1)} aria-label="上移步骤">↑</button>
                <button type="button" className="rounded-md border px-2 text-xs" disabled={index===draft.steps.length-1} onClick={()=>move(index,index+1)} aria-label="下移步骤">↓</button>
                <button type="button" className="rounded-md border border-rose-300 px-2 text-xs text-rose-600" disabled={draft.steps.length<=2}
                  onClick={()=>setDraft(prev=>({...prev,steps:prev.steps.filter((_,i)=>i!==index).map((s,i)=>i===0?{...s,source:'original'}:s)}))}>删除</button>
              </div>
              <label className="block text-xs">本步职责
                <input value={step.role} aria-label={'步骤 '+(index+1)+' 职责'} maxLength={100} onChange={e=>update(index,{role:e.target.value})}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-transparent p-2 dark:border-slate-600"/>
              </label>
              <label className="block text-xs">执行指令
                <textarea value={step.instruction} aria-label={'步骤 '+(index+1)+' 指令'} maxLength={12000} rows={3}
                  onChange={e=>update(index,{instruction:e.target.value})}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-transparent p-2 dark:border-slate-600"/>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={step.confirm} onChange={e=>update(index,{confirm:e.target.checked})}/>
                执行该步骤前先由我确认
              </label>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={disabled||draft.steps.length>=MAX_STEPS} onClick={add} className="rounded-md border px-3 py-1.5 text-xs">＋添加步骤</button>
            <button type="button" disabled={disabled||!!errors.length} onClick={save} className="rounded-md border px-3 py-1.5 text-xs">保存模板</button>
            <button type="button" disabled={disabled||!!errors.length} onClick={activate} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">启用接力</button>
            <button type="button" disabled={disabled} onClick={()=>{deleteRelayTemplate(draft.id);setTemplates(loadRelayTemplates());setNotice('模板已删除');}}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-xs text-rose-600">删除模板</button>
          </div>
          {!!errors.length && <p role="alert" className="text-xs text-rose-600">{errors.join('；')}</p>}
          {notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
          <p className="text-xs text-slate-500">优先沿用原软件已登录的网页会话。每个 AI 的网页模型档位由该官网自身控制；本软件不会假装切换 Pro。自动接力受平台允许的自动调用能力限制。</p>
        </div>
      )}
    </section>
  );
}
