import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { AIProvider, ModeRoles } from '../../shared/types';
import { host } from '../host';
import { startBridgePull } from '../bridge/pull';
import { onBridgeMessage } from '../bridge/bus';
import { sendAndWait } from '../workflow/sendAndWait';
import { providerResponseError } from '../workflow/providerResponse';
import { runWorkflow } from '../workflow';
import { workflowGraphs, preflightGraph } from '../workflow/graph';
import { abortWorkflow } from '../workflow/cancel';
import { initialPlan,snapshotSteps,stepPrompt,validatePlan,type WorkflowPlan } from './plan';
import { API_PROVIDER_IDS,buildRelayPrompt,selectTargets,validateCheckpoint,
  type Member,type WorkspaceState,type Message,type ChatMode,type RelayCheckpoint,type StoredRun,type StepOutput } from './logic';

const empty:WorkspaceState={members:[],conversations:[],assignments:[]};
const original=new Set(['chatgpt','claude','gemini','grok','meta']);
const newId=()=>crypto.randomUUID();
export function isOriginalWebProvider(value:string):value is AIProvider {
  return original.has(value);
}

type Source='user'|'official_api'|'user_imported_web'|'official_web'|'system';
type WebResponse={body:string;source:'official_api'|'official_web'};

export function useUnifiedChat(){
 const [data,setData]=useState<WorkspaceState>(empty);
 const [selected,setSelected]=useState<string|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [run,setRun]=useState<StoredRun|null>(null);
 const [plan,setPlan]=useState<WorkflowPlan|null>(null);
 const [draft,setDraft]=useState('');
 const [manualText,setManualText]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [live,setLive]=useState<string|null>(null);
 const [keys,setKeys]=useState<Record<string,string>>({});
 const stop=useRef(false);
 const selectedRef=useRef<string|null>(null);selectedRef.current=selected;
 const chosen=useMemo(()=>data.conversations.find(x=>x.id===selected),[data,selected]);
 const assignments=useMemo(()=>data.assignments.filter(a=>a.conversationId===selected),[data,selected]);
 const inRoom=useMemo(()=>assignments.map(a=>data.members.find(m=>m.id===a.memberId)).filter((m):m is Member=>!!m),[assignments,data.members]);
 const role=(id:string)=>assignments.find(a=>a.memberId===id)?.role||data.members.find(m=>m.id===id)?.role||'完成用户指定工作';
 const fail=(e:unknown)=>setNotice('操作失败：'+String(e));
 const refresh=useCallback(async()=>{
   const v=await host.workbench.state();
   setData(v);
   setSelected(old=>old&&v.conversations.some(c=>c.id===old)?old:v.conversations[0]?.id??null);
 },[]);
 const refreshMessages=useCallback(async(cid:string)=>{const result=await host.workbench.messages(cid);if(selectedRef.current===cid)setMessages(result);},[]);
 useEffect(()=>{
   let liveHook=true;
   void refresh().catch(fail);
   void startBridgePull().then(dispose=>{
     if(!liveHook)dispose();else unsubscribePull=dispose;
   }).catch(e=>{if(liveHook)fail(e);});
   let unsubscribePull:(()=>void)|undefined;
   return()=>{liveHook=false;stop.current=true;unsubscribePull?.();};
 },[refresh]);
 useEffect(()=>{
   let active=true;
   if(!selected){setMessages([]);setRun(null);setPlan(null);return;}
   void Promise.all([host.workbench.messages(selected),host.workbench.recentRun(selected),host.workbench.plan(selected)])
    .then(async ([m,last,currentPlan])=>{
      if(!active)return;
      setMessages(m);setPlan(currentPlan);
      if(last&&validateCheckpoint(last.state)&&last.status==='running'){
        const uncertain={...last.state,status:'unknown_completion' as const};
        await host.workbench.saveRun({id:last.id,conversationId:selected,status:'unknown_completion',state:uncertain});
        if(active)setRun({...last,status:'unknown_completion',state:uncertain});
      }else if(active)setRun(last&&validateCheckpoint(last.state)?last:null);
      if(active)setManualText('');
    }).catch(fail);
   return()=>{active=false;};
 },[selected]);

 async function saveMessage(cid:string,sender:'user'|'ai'|'system',body:string,source:Source,memberId?:string,runId?:string,status='completed'){
   await host.workbench.message({id:newId(),conversationId:cid,memberId:memberId??null,sender,status,source,body,runId:runId??null});
   if(selected===cid)await refreshMessages(cid);
 }
 async function persist(id:string,cid:string,state:RelayCheckpoint){
   await host.workbench.saveRun({id,conversationId:cid,status:state.status,state});
   if(selectedRef.current===cid)setRun({id,status:state.status,state,updatedAt:Date.now()});
 }

 async function checkReady(members:readonly Member[]):Promise<string|null>{
   const current=await host.connections.get();
   for(const member of members){
     if(member.kind==='api'){
       if(!API_PROVIDER_IDS.has(member.provider)||!member.modelId||!keys[member.provider]){
         return member.name+' 的 API 尚未配置模型 ID / API Key；可以切换此联系人为网页会员';
       }
     }else if(member.kind==='web_native'&&isOriginalWebProvider(member.provider)){
       const state=current.find(s=>s.provider===member.provider);
       if(state?.login!=='logged_in'||state?.webview!=='loaded'||state?.dom!=='ready'){
         return member.name+' 网页尚未就绪。请先在右侧打开真实官网登录，待显示“已登录”后再发送';
       }
     }else if(member.kind==='web_native'){
       // Unsupported site-specific automation remains a deliberate manual workflow.
       return member.name+' 尚无经过验证的网页自动发送与回传连接器。可以在官网直聊；暂不冒充自动群聊';
     }
   }
   return null;
 }

 async function invokeReal(member:Member,prompt:string):Promise<WebResponse|null>{
   setLive(member.name+' 正在通过真实平台生成回复…');
   if(member.kind==='api'&&API_PROVIDER_IDS.has(member.provider)&&member.modelId&&keys[member.provider]){
     const body=await host.domestic.apiChat({provider:member.provider,model:member.modelId,apiKey:keys[member.provider],prompt});
     if(!body?.trim())throw Error(member.name+' 的官方 API 返回空答案');
     return {body,source:'official_api'};
   }
   if(member.kind==='web_native'&&isOriginalWebProvider(member.provider)){
     const {response}=await sendAndWait(member.provider,prompt);
     const detectedError=providerResponseError(member.provider,response);
     if(detectedError)throw detectedError;
     if(!response.trim())throw Error(member.name+' 网页没有返回有效内容');
     return {body:response,source:'official_web'};
   }
   return null;
 }

 async function execute(id:string,cid:string,initial:RelayCheckpoint):Promise<void>{
   let state:RelayCheckpoint={...initial,outputs:[...initial.outputs]};
   stop.current=false;setBusy(true);
   try{
     while(state.nextIndex<state.memberIds.length){
       if(stop.current){await persist(id,cid,{...state,status:'paused'});setNotice('已暂停，当前任务结果保留');return;}
       const member=data.members.find(m=>m.id===state.memberIds[state.nextIndex]);
       if(!member)throw Error('执行成员不存在');
       const step=state.steps?.[state.nextIndex];
       const effectiveRole=step?.role||role(member.id);
       const text=step ? stepPrompt(state.task,step,state.outputs) :
         state.memberIds.length===1 ? state.task : buildRelayPrompt(state.task,member,effectiveRole,state.outputs);
       const supported=(member.kind==='api'&&API_PROVIDER_IDS.has(member.provider)&&!!member.modelId&&!!keys[member.provider])
         ||(member.kind==='web_native'&&isOriginalWebProvider(member.provider));
       if(!supported){
         await persist(id,cid,{...state,status:'waiting_manual',pendingPrompt:text});
         setNotice('当前网页暂无自动连接器：需要 '+member.name+' 官网真实回复，可人工确认交接');
         return;
       }
       await persist(id,cid,{...state,status:'running',pendingPrompt:text});
       let result:WebResponse|null;
       try{result=await invokeReal(member,text);}
       catch(e){
         await persist(id,cid,{...state,status:'unknown_completion'});
         setNotice('网页/API 任务结果未知：可能已发送，避免重复发送；请查看官网再处理。'+String(e));
         return;
       }
       if(!result)throw Error(member.name+' 尚未建立网页连接器');
       await saveMessage(cid,'ai',result.body,result.source,member.id,id);
       const output:StepOutput={memberId:member.id,provider:member.provider,role:effectiveRole,body:result.body,source:result.source};
       state={...state,nextIndex:state.nextIndex+1,outputs:[...state.outputs,output],pendingPrompt:undefined,status:'running'};
       await persist(id,cid,state);
     }
     await persist(id,cid,{...state,status:'completed'});
     setNotice('真实平台回复已保存，接力完成');
   }catch(e){await persist(id,cid,{...state,status:'failed'}).catch(()=>{});fail(e);}
   finally{setBusy(false);setLive(null);await refresh().catch(fail);}
 }

 async function executeOriginalMode(cid:string,task:string,members:Member[],mode:ChatMode,id:string):Promise<void>{
   // Original battle/debate/consult/coding/roundtable/brainstorm graphs, not duplicated simulations.
   const graphId=mode==='brainstorm'?'brainstorm':mode as 'debate'|'consult'|'coding'|'roundtable';
   const graph=workflowGraphs[graphId];
   const roleKeys=Object.keys(graph.roles);
   const distinct=members.filter((m,i,all)=>all.findIndex(x=>x.provider===m.provider)===i);
   if(distinct.length<roleKeys.length){setNotice('此模式需要 '+roleKeys.length+' 个不同的已登录原版平台，请增加群成员');return;}
   if(distinct.slice(0,roleKeys.length).some(m=>!isOriginalWebProvider(m.provider))){
     setNotice('原版工作流仅支持原有网页通信桥；请先选择 ChatGPT / Gemini / Claude / Grok 等已登录平台');return;
   }
   const roleAssignments=Object.fromEntries(roleKeys.map((key,i)=>[key,distinct[i].provider])) as unknown as ModeRoles;
   const check=await preflightGraph(graph,roleAssignments);
   if(!check.ok){setNotice('原版工作流准备失败：请先确认参与者均已登录，且同时使用不同的可用席位。'+check.unavailable.join('、'));return;}
   const received:{memberId:string;provider:string;body:string}[]=[];
   const persisted:Promise<void>[]=[];
   // Graphs may have multiple steps per provider (Coding, Roundtable, Brainstorm).
   // Every genuine response is persisted as soon as it arrives.
   const expectedSteps=Object.values(graph.nodes).filter(node=>node.kind==='step').length;
   // Use upstream's trusted RESPONSE_DONE bus events, and record only genuine completions.
   const off=onBridgeMessage(message=>{
     if(message.action!=='RESPONSE_DONE'||(message.transport!=='pull'&&message.transport!=='local'))return;
     const provider=message.provider;
     if(!provider||!distinct.some(m=>m.provider===provider))return;
     const payload=message.payload as string|{text?:unknown}|undefined;
     const body=typeof payload==='string'?payload:
       payload&&typeof payload==='object'&&typeof payload.text==='string'?payload.text:'';
     if(!body.trim()||providerResponseError(provider,body))return;
     const member=distinct.find(m=>m.provider===provider);
     if(member){
       received.push({memberId:member.id,provider,body});
       persisted.push(saveMessage(cid,'ai',body,'official_web',member.id,id));
     }
     setLive('已收到 '+received.length+' / '+expectedSteps+' 个真实网页工作流步骤…');
   });
   setBusy(true);setLive('原版 '+mode+' 工作流已启动…');
   try{
     await persist(id,cid,{task,memberIds:distinct.map(m=>m.id),nextIndex:0,outputs:[],status:'running'});
     const result=await runWorkflow({
       text:task,mode:mode==='brainstorm'?'free':mode as 'debate'|'consult'|'coding'|'roundtable',
       ...(mode==='brainstorm'?{presetId:'brainstorm' as const}:{}),
       roles:roleAssignments,activeProviders:distinct.map(m=>m.provider as AIProvider),
       locale:'zh-CN',
     });
     if(!result.ok){await persist(id,cid,{task,memberIds:distinct.map(m=>m.id),nextIndex:0,outputs:[],status:'failed'});
       setNotice('原版工作流未满足预检要求，未开始发送');return;}
     const saved=await Promise.allSettled(persisted);
     const storageFailed=saved.some(x=>x.status==='rejected');
     const outputs:StepOutput[]=received.map(m=>({
       memberId:m.memberId,provider:m.provider as StepOutput['provider'],role:role(m.memberId),body:m.body,source:'official_web'
     }));
     const allDone=!storageFailed&&expectedSteps>0&&received.length>=expectedSteps;
     await persist(id,cid,{task,memberIds:distinct.map(m=>m.id),
       nextIndex:allDone?distinct.length:0,outputs,status:allDone?'completed':'unknown_completion'});
     setNotice(allDone?'原版工作流完成，真实回复已回填':
       '真实步骤 '+received.length+' / '+expectedSteps+'，或保存失败。请检查官网和本地历史，不会假装成功');
   }catch(e){
     await persist(id,cid,{task,memberIds:distinct.map(m=>m.id),nextIndex:0,outputs:[],status:'unknown_completion'}).catch(()=>{});
     setNotice('原版工作流中断，已保留状态：'+String(e));
   }finally{off();setBusy(false);setLive(null);await refresh().catch(fail);}
 }

 async function send(){
   if(!chosen||busy||!draft.trim())return;
   const task=draft.trim(),cid=chosen.id,mode=chosen.mode;
   const members=selectTargets(task,inRoom,mode);
   if(!members.length){setNotice('请先加入群成员');return;}
   if(task.length>150000){setNotice('文本超限：请分段处理，不会静默截断');return;}
   if(run&&['running','paused','waiting_manual','unknown_completion'].includes(run.status)){
     setNotice('已有未结束的任务，请先完成、核对或终止当前任务。');return;
   }
   if(mode==='relay'&&plan){
     const issues=validatePlan(plan,inRoom);
     if(issues.length){setNotice('当前流程步骤配置无效：'+issues.join('；'));return;}
   }
   if(mode==='debate'||mode==='consult'||mode==='coding'||mode==='roundtable'||mode==='brainstorm'){
     const originalMembers=members.filter(m=>m.kind==='web_native'&&isOriginalWebProvider(m.provider));
     if(originalMembers.length<4){setNotice('该模式需要四位已登录的原版网页成员，当前可用 '+originalMembers.length+' 位');return;}
     const notReady=await checkReady(originalMembers);
     if(notReady){setNotice(notReady);return;}
     setDraft('');
     const id='run_'+newId().replace(/-/g,'');
     try{await saveMessage(cid,'user',task,'user');await executeOriginalMode(cid,task,originalMembers,mode,id);}
     catch(e){fail(e);}
     return;
   }
   const notReady=await checkReady(members);
   if(notReady){setNotice(notReady);return;}
   if(mode==='parallel'){
     const duplicate=new Set<string>();
     for(const m of members) {
       if(duplicate.has(m.provider)){setNotice('并行模式不能同时向同一网页账号发送两个请求，请调整群成员');return;}
       duplicate.add(m.provider);
     }
   }
   const charged=members.filter(m=>m.kind==='api'&&API_PROVIDER_IDS.has(m.provider)).length;
   if(charged>0&&!window.confirm('可能使用 '+charged+' 次或更多次付费 API 请求。确定执行？'))return;
   setDraft('');
   try{
     await saveMessage(cid,'user',task,'user');
     const id='run_'+newId().replace(/-/g,'');
     if(mode==='parallel'){
       setBusy(true);setLive('多个 AI 正在并行回答…');
       const settled=await Promise.allSettled(members.map(async m=>{
         const prompt=buildRelayPrompt(task,m,role(m.id),[]);
         const result=await invokeReal(m,prompt);
         if(!result)throw Error('无自动连接器');
         return {member:m,...result};
       }));
       const outputs:StepOutput[]=[];
       for(let i=0;i<settled.length;i++){
         const result=settled[i];
         if(result.status==='fulfilled'){
           outputs.push({memberId:result.value.member.id,provider:result.value.member.provider,role:role(result.value.member.id),body:result.value.body,source:result.value.source});
           await saveMessage(cid,'ai',result.value.body,result.value.source,result.value.member.id,id);
         }else await saveMessage(cid,'system',members[i].name+' 可能已发送但结果未知：'+String(result.reason),'system',undefined,id,'unknown_completion');
       }
       await persist(id,cid,{task,memberIds:members.map(m=>m.id),nextIndex:outputs.length,outputs,status:outputs.length===members.length?'completed':'unknown_completion'});
       setNotice('收到 '+outputs.length+' 条真实回复，异常步骤不会自动重复发送');
       setBusy(false);setLive(null);return;
     }
     const available=mode==='relay'&&plan&&validatePlan(plan,inRoom).length===0?plan:null;
     const selectedSteps=available?
       available.steps.filter(step=>members.some(m=>m.id===step.memberId)):snapshotSteps(members,null,role);
     if(!selectedSteps.length)throw Error('当前消息没有对应的接力步骤');
     const initial:RelayCheckpoint={task,memberIds:selectedSteps.map(s=>s.memberId),steps:selectedSteps,
       nextIndex:0,outputs:[],status:'running'};
     await persist(id,cid,initial);await execute(id,cid,initial);
   }catch(e){fail(e);setBusy(false);setLive(null);}
 }
 async function confirmManual(){
   if(!chosen||!run||!['waiting_manual','unknown_completion'].includes(run.status))return;
   const member=data.members.find(m=>m.id===run.state.memberIds[run.state.nextIndex]);
   if(!member||!manualText.trim()){setNotice('必须粘贴官网真实生成的完整回复');return;}
   if(manualText.length>500000){setNotice('人工回复过长，请分段，不会截断');return;}
   if(!window.confirm('确认此文本来自 '+member.name+' 官网，且是完整真实回复？'))return;
   try{
     await saveMessage(chosen.id,'ai',manualText,'user_imported_web',member.id,run.id);
     const output:StepOutput={memberId:member.id,provider:member.provider,
       role:run.state.steps?.[run.state.nextIndex]?.role||role(member.id),body:manualText,source:'user_imported_web'};
     const next:RelayCheckpoint={...run.state,outputs:[...run.state.outputs,output],nextIndex:run.state.nextIndex+1,pendingPrompt:undefined,status:'running'};
     setManualText('');await persist(run.id,chosen.id,next);await execute(run.id,chosen.id,next);
   }catch(e){fail(e);}
 }
 async function create(title:string,kind:'private'|'group',memberIds:string[]){
   const cid='chat_'+newId().replace(/-/g,'');
   await host.workbench.create({id:cid,title,kind,memberIds});
   await refresh();setSelected(cid);
 }
 async function setConversation(title:string,mode:ChatMode){
   if(!chosen)return;
   await host.workbench.setConversation(chosen.id,title,mode);await refresh();
 }
 async function setGroup(members:{memberId:string;role:string}[]){
   if(!chosen)return;
   await host.workbench.setMembers(chosen.id,members);await refresh();
 }
 async function updateMember(m:Member){await host.workbench.setMember(m);await refresh();}
 async function savePlan(value:WorkflowPlan){
   if(!chosen)throw Error('请先选择会话');
   const errors=validatePlan(value,inRoom);
   if(errors.length)throw Error(errors.join('；'));
   await host.workbench.setPlan(chosen.id,value);
   setPlan(structuredClone(value));
   setNotice('已保存当前群的专属接力流程');
 }
 async function cancelRun(){
   if(!chosen||!run||['completed','cancelled','failed'].includes(run.status))return;
   if(busy){stop.current=true;abortWorkflow();setNotice('停止请求已收到；当前网页请求可能已发送，不会自动重复执行');return;}
   if(!window.confirm('确定终止当前任务？已完成的真实回复将保留。'))return;
   await persist(run.id,chosen.id,{...run.state,status:'cancelled'});
   setManualText('');setNotice('当前任务已经终止');
 }
 const resume=async()=>{
   if(chosen&&run?.status==='paused')await execute(run.id,chosen.id,run.state);
 };
 const backup=async()=>setNotice('数据备份位置：'+await host.workbench.backup());
 return {data,chosen,selected,setSelected,inRoom,assignments,messages,run,draft,setDraft,manualText,setManualText,
   busy,notice,setNotice,live,keys,setKeys,refresh,send,confirmManual,create,setConversation,setGroup,updateMember,execute,resume,backup,
   plan,savePlan,initialPlan,cancelRun,
   stop:()=>{stop.current=true;abortWorkflow();setNotice('已请求停止：当前网页请求可能已经发送；不会自动重复执行');},role};
}
