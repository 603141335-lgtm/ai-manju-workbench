import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import {host} from '../host';
import {API_PROVIDER_IDS,buildRelayPrompt,selectTargets,validateCheckpoint,type Member,type WorkspaceState,type Message,type ChatMode,type RelayCheckpoint,type StoredRun,type StepOutput} from './logic';
const empty:WorkspaceState={members:[],conversations:[],assignments:[]};
const newid=()=>crypto.randomUUID();
export function useUnifiedChat(){
 const [data,setData]=useState<WorkspaceState>(empty);
 const [selected,setSelected]=useState<string|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [run,setRun]=useState<StoredRun|null>(null);
 const [draft,setDraft]=useState('');
 const [manualText,setManualText]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [keys,setKeys]=useState<Record<string,string>>({});
 const stop=useRef(false);
 const chosen=useMemo(()=>data.conversations.find(x=>x.id===selected),[data,selected]);
 const assignments=useMemo(()=>data.assignments.filter(a=>a.conversationId===selected),[data,selected]);
 const inRoom=useMemo(()=>assignments.map(a=>data.members.find(m=>m.id===a.memberId)).filter((m):m is Member=>!!m),[assignments,data.members]);
 const role=(id:string)=>assignments.find(a=>a.memberId===id)?.role||data.members.find(m=>m.id===id)?.role||'完成用户指定工作';
 const fail=(e:unknown)=>setNotice('操作失败：'+String(e));
 const refresh=useCallback(async()=>{const v=await host.workbench.state();setData(v);setSelected(old=>old&&v.conversations.some(c=>c.id===old)?old:v.conversations[0]?.id??null);},[]);
 const refreshMessages=useCallback(async(cid:string)=>setMessages(await host.workbench.messages(cid)),[]);
 useEffect(()=>{void refresh().catch(fail);return()=>{stop.current=true;};},[refresh]);
 useEffect(()=>{
  let active=true;
  if(!selected){setMessages([]);setRun(null);return;}
  void Promise.all([host.workbench.messages(selected),host.workbench.recentRun(selected)])
   .then(([m,last])=>{if(active){setMessages(m);setRun(last&&validateCheckpoint(last.state)?last:null);setManualText('');}})
   .catch(fail);
  return()=>{active=false;};
 },[selected]);
 async function saveMessage(cid:string,sender:'user'|'ai'|'system',body:string,source:'user'|'official_api'|'user_imported_web'|'system',memberId?:string,runId?:string,status='completed'){
  await host.workbench.message({id:newid(),conversationId:cid,memberId:memberId??null,sender,status,source,body,runId:runId??null});
  if(selected===cid)await refreshMessages(cid);
 }
 async function persist(id:string,cid:string,state:RelayCheckpoint){
  await host.workbench.saveRun({id,conversationId:cid,status:state.status,state});
  if(selected===cid)setRun({id,status:state.status,state,updatedAt:Date.now()});
 }
 async function execute(id:string,cid:string,initial:RelayCheckpoint):Promise<void>{
  let state:RelayCheckpoint={...initial,outputs:[...initial.outputs]};
  stop.current=false;setBusy(true);
  try{
   while(state.nextIndex<state.memberIds.length){
    if(stop.current){await persist(id,cid,{...state,status:'paused'});setNotice('已暂停，当前任务结果保留');return;}
    const member=data.members.find(m=>m.id===state.memberIds[state.nextIndex]);
    if(!member)throw Error('执行成员不存在');
    const prompt=buildRelayPrompt(state.task,member,role(member.id),state.outputs);
    const apiReady=member.kind==='api'&&API_PROVIDER_IDS.has(member.provider)&&!!member.modelId&&!!keys[member.provider];
    if(!apiReady){
      await persist(id,cid,{...state,status:'waiting_manual',pendingPrompt:prompt});
      setNotice('需要 '+member.name+' 的网页真实回复：复制任务并打开官网，再粘贴原文');
      return;
    }
    await persist(id,cid,{...state,status:'running',pendingPrompt:undefined});
    let reply:string;
    try{reply=await host.domestic.apiChat({provider:member.provider,model:member.modelId,apiKey:keys[member.provider],prompt});}
    catch(e){await persist(id,cid,{...state,status:'unknown_completion'});setNotice('API 状态未知，可能已经计费；不会自动重试。详情：'+String(e));return;}
    if(!reply.trim())throw Error('空回复不能视为完成');
    await saveMessage(cid,'ai',reply,'official_api',member.id,id);
    const output:StepOutput={memberId:member.id,provider:member.provider,role:role(member.id),body:reply,source:'official_api'};
    state={...state,nextIndex:state.nextIndex+1,outputs:[...state.outputs,output],status:'running'};
    await persist(id,cid,state);
   }
   await persist(id,cid,{...state,status:'completed'});
   setNotice('接力已完成，全部真实回复已保存');
  }catch(e){await persist(id,cid,{...state,status:'failed'}).catch(()=>{});fail(e);}
  finally{setBusy(false);await refresh().catch(fail);}
 }
 async function send(){
  if(!chosen||busy||!draft.trim())return;
  const task=draft.trim(),cid=chosen.id;
  const members=selectTargets(task,inRoom,chosen.mode);
  if(!members.length){setNotice('请先加入群成员');return;}
  if(task.length>150000){setNotice('文本超限：请分段处理，不会静默截断');return;}
  if(['debate','consult','coding'].includes(chosen.mode)){setNotice('此模式仍使用原版成熟执行器，请切回原版操作');return;}
  if(chosen.mode==='parallel'&&members.some(m=>m.kind!=='api'||!API_PROVIDER_IDS.has(m.provider)||!m.modelId||!keys[m.provider])){
    setNotice('同时回答仅支持已配置 API 的成员；网页会员请使用顺序接力或原版模式');return;
  }
  setDraft('');
  try{
   await saveMessage(cid,'user',task,'user');
   const id='run_'+newid().replace(/-/g,'');
   if(chosen.mode==='parallel'){
    setBusy(true);
    const settled=await Promise.allSettled(members.map(async m=>{
      const prompt=buildRelayPrompt(task,m,role(m.id),[]);
      const body=await host.domestic.apiChat({provider:m.provider,model:m.modelId,apiKey:keys[m.provider],prompt});
      if(!body.trim())throw Error('空回复');
      return {memberId:m.id,provider:m.provider,role:role(m.id),body,source:'official_api' as const};
    }));
    const outputs:StepOutput[]=[];
    for(let i=0;i<settled.length;i++){
     const result=settled[i];
     if(result.status==='fulfilled'){outputs.push(result.value);await saveMessage(cid,'ai',result.value.body,'official_api',result.value.memberId,id);}
     else await saveMessage(cid,'system',members[i].name+' 调用结果未知：'+String(result.reason),'system',undefined,id,'unknown_completion');
    }
    await persist(id,cid,{task,memberIds:members.map(m=>m.id),nextIndex:members.length,outputs,status:outputs.length===members.length?'completed':'unknown_completion'});
    setNotice('已收到 '+outputs.length+' 条真实回复，失败项不会重复计费调用');
    setBusy(false);return;
   }
   const state:RelayCheckpoint={task,memberIds:members.map(m=>m.id),nextIndex:0,outputs:[],status:'running'};
   await persist(id,cid,state);await execute(id,cid,state);
  }catch(e){fail(e);setBusy(false);}
 }
 async function confirmManual(){
  if(!chosen||!run||run.status!=='waiting_manual')return;
  const member=data.members.find(m=>m.id===run.state.memberIds[run.state.nextIndex]);
  if(!member||!manualText.trim()){setNotice('必须粘贴官网真实生成的完整回复');return;}
  if(manualText.length>500000){setNotice('人工回复过长，请分段，不会截断');return;}
  if(!window.confirm('确认此文本来自 '+member.name+' 官网，且是完整真实回复？'))return;
  try{
   await saveMessage(chosen.id,'ai',manualText,'user_imported_web',member.id,run.id);
   const output:StepOutput={memberId:member.id,provider:member.provider,role:role(member.id),body:manualText,source:'user_imported_web'};
   const next:RelayCheckpoint={...run.state,outputs:[...run.state.outputs,output],nextIndex:run.state.nextIndex+1,pendingPrompt:undefined,status:'running'};
   setManualText('');await persist(run.id,chosen.id,next);await execute(run.id,chosen.id,next);
  }catch(e){fail(e);}
 }
 async function create(title:string,kind:'private'|'group',memberIds:string[]){
  const cid='chat_'+newid().replace(/-/g,'');
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
 const resume=async()=>{if(chosen&&run?.status==='paused'){await execute(run.id,chosen.id,run.state);}};
 const backup=async()=>setNotice('数据备份位置：'+await host.workbench.backup());
 return {data,chosen,selected,setSelected,inRoom,assignments,messages,run,draft,setDraft,manualText,setManualText,
  busy,notice,setNotice,keys,setKeys,refresh,send,confirmManual,create,setConversation,setGroup,updateMember,execute,resume,backup,
  stop:()=>{stop.current=true;setNotice('收到暂停请求，当前 API 完成后停止继续交接。');},role};
}