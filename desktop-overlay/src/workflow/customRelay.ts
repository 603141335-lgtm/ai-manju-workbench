import type { AIProvider } from '../../shared/types';
import type { WorkflowGraph, PromptArg } from './graph/types';

export type SourceMode = 'original' | 'previous' | 'all';
export interface RelayStep {
  id: string;
  provider: AIProvider;
  role: string;
  instruction: string;
  source: SourceMode;
  confirm: boolean;
}
export interface RelayWorkflow {
  id: string;
  name: string;
  steps: RelayStep[];
}
const TEMPLATES = 'multi_ai_desktop_relay_templates_v23';
const ACTIVE = 'multi_ai_desktop_relay_active_v23';
export const MAX_STEPS = 12;
const LIMIT = 150000;
export const supported = ['chatgpt','claude','gemini','grok','meta'] as const;

export function createRelay(provider: AIProvider = 'gemini'): RelayWorkflow {
  return {
    id: 'relay-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
    name: 'AI 漫剧制作接力',
    steps: [
      {id:'s1',provider,role:'编剧',instruction:'根据原任务写出完整剧本，不遗漏剧情和台词。',source:'original',confirm:false},
      {id:'s2',provider:'chatgpt',role:'分镜导演',instruction:'保留剧情信息，将上一阶段剧本改为可制作的分镜提示词。',source:'all',confirm:false},
    ],
  };
}
export function validateRelay(w: RelayWorkflow): string[] {
  const e: string[] = [];
  if (!w || !w.id || !w.name?.trim()) e.push('流程名称或 ID 无效');
  if (!Array.isArray(w?.steps) || w.steps.length < 2 || w.steps.length > MAX_STEPS) return [...e,'步骤必须为 2–12 个'];
  const seen=new Set<string>();
  w.steps.forEach((s,i)=>{
    if (!s || !s.id || seen.has(s.id)) e.push('步骤 ID 重复或缺失');
    seen.add(s?.id);
    if (!supported.includes(s?.provider as typeof supported[number])) e.push('第 '+(i+1)+' 步的 AI 暂无网页适配器');
    if (!s?.role?.trim() || !s?.instruction?.trim()) e.push('第 '+(i+1)+' 步缺少职责或指令');
    if (s?.instruction?.length > 12000) e.push('单步指令超过 12000 字符');
    if (i===0 && s?.source !== 'original') e.push('第一步只能读取原始任务');
  });
  return e;
}
export function loadRelayTemplates(): RelayWorkflow[] {
  try {
    const raw=JSON.parse(localStorage.getItem(TEMPLATES) || '[]') as RelayWorkflow[];
    return Array.isArray(raw) ? raw.filter(w=>validateRelay(w).length===0) : [];
  } catch { return []; }
}
export function saveRelayTemplate(w: RelayWorkflow): void {
  const errors=validateRelay(w);
  if(errors.length) throw new Error(errors.join('；'));
  const list=loadRelayTemplates().filter(item=>item.id!==w.id);
  localStorage.setItem(TEMPLATES,JSON.stringify([w,...list].slice(0,30)));
}
export function deleteRelayTemplate(id:string):void {
  localStorage.setItem(TEMPLATES, JSON.stringify(loadRelayTemplates().filter(w=>w.id!==id)));
}
export function loadActiveRelay(): RelayWorkflow | undefined {
  try { const w=JSON.parse(localStorage.getItem(ACTIVE)||'null') as RelayWorkflow;
    return w && validateRelay(w).length===0 ? w : undefined;
  } catch { return undefined; }
}
export function saveActiveRelay(w?:RelayWorkflow):void {
  if(w) localStorage.setItem(ACTIVE,JSON.stringify(w)); else localStorage.removeItem(ACTIVE);
}
export function compileRelay(w:RelayWorkflow):WorkflowGraph {
  const errors=validateRelay(w);if(errors.length)throw new Error(errors.join('；'));
  const roles:WorkflowGraph['roles']={};
  const nodes:WorkflowGraph['nodes']={};
  const edges:WorkflowGraph['edges']=[];
  w.steps.forEach((step,index)=>{
    const id='relay_step_'+index;
    const previous=w.steps.slice(0,index);
    const allRefs=previous.map((_,i):PromptArg=>({kind:'output',node:'relay_step_'+i}));
    const refs=index===0?[]:step.source==='previous'?[allRefs[allRefs.length-1]]:step.source==='all'?allRefs:[];
    roles[id]={defaultProvider:step.provider,uiLabel:step.role};
    nodes[id]={
      kind:'step',provider:{type:'role',role:id},
      role:step.role,label:'第 '+(index+1)+' 步 · '+step.role,
      prompt:{builder:'custom.relay',args:[
        {kind:'literal',value:step.role},
        {kind:'literal',value:step.instruction},
        {kind:'input',name:'question'},
        ...refs,
      ]},
      output:'relay_result_'+index,policy:'serialRunStep',
      ...(step.confirm?{checkpoint:{policy:'draft-confirm' as const}}:{}),
    };
    if(index)edges.push({from:'relay_step_'+(index-1),to:id});
  });
  return {schemaVersion:1,id:'custom-relay',mode:'free',start:'relay_step_0',roles,preflight:{kind:'serial',requiredRoles:Object.keys(roles)},nodes,edges,onComplete:{status:''}};
}
export function buildRelayPrompt(args:(string|number|unknown[]|undefined)[]):string {
  const role=String(args[0]??'');
  const instruction=String(args[1]??'');
  const original=String(args[2]??'');
  const results=args.slice(3).map((v,i)=>'【前序成果 '+(i+1)+'】\n'+String(v??'')).join('\n\n');
  const prompt='你正在参与多 AI 顺序接力。\n【本步职责】'+role+'\n【本步指令】'+instruction+
    '\n【用户原始任务】\n'+original+(results?'\n'+results:'')+
    '\n保留所有有用信息，按本步职责产出完整结果。';
  if(prompt.length>LIMIT)throw new Error('任务超过 150000 字符：请分批执行，不能静默截断');
  return prompt;
}
