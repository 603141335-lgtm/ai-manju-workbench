// M2: Backwards-compatible per-conversation workflow plans and recovery fixes.
// Apply strictly after the tested v3 M1 overlay.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const overlay=path.resolve(process.argv[3]||'desktop-overlay');
const updated=new Map();
function replace(rel,from,to){
 const file=path.join(root,rel);
 const text=(updated.get(rel)??fs.readFileSync(file,'utf8')).replace(/\r\n/g,'\n');
 if(!text.includes(from))throw new Error('上游文件不匹配：'+rel+' :: '+from.slice(0,100));
 if(text.includes(to))throw new Error('重复执行补丁：'+rel);
 updated.set(rel,text.replace(from,to));
}
const rust='src-tauri/src/workbench_v3.rs';
replace(rust, 'CREATE TABLE IF NOT EXISTS workbench_runs(\n',
 `CREATE TABLE IF NOT EXISTS conversation_plans(
 conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
 definition_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workbench_runs(
`);
replace(rust, '#[tauri::command]\npub fn wb_backup(',
`#[tauri::command]
pub fn wb_plan(app:AppHandle,webview:tauri::Webview,conversation_id:String)->Result<Option<serde_json::Value>,String>{
 secure(&webview)?;
 if !id(&conversation_id){return Err("无效的群聊 ID".into());}
 let c=db(&app)?;
 let raw:Option<String>=c.query_row("SELECT definition_json FROM conversation_plans WHERE conversation_id=?1",
  [&conversation_id],|r|r.get(0)).optional().map_err(error)?;
 raw.map(|v|serde_json::from_str(&v).map_err(|_|"群接力配置损坏".to_string())).transpose()
}
#[tauri::command]
pub fn wb_set_plan(app:AppHandle,webview:tauri::Webview,conversation_id:String,plan:serde_json::Value)->Result<(),String>{
 secure(&webview)?;
 if !id(&conversation_id){return Err("群聊 ID 无效".into());}
 if plan.get("version").and_then(|x|x.as_u64())!=Some(1){return Err("不支持的流程版本".into());}
 let name=plan.get("name").and_then(|v|v.as_str()).ok_or("流程名称缺失")?;
 if !checked(name,120){return Err("流程名称无效".into());}
 let steps=plan.get("steps").and_then(|v|v.as_array()).ok_or("流程步骤无效")?;
 if steps.is_empty()||steps.len()>12{return Err("流程必须包含 1–12 个步骤".into());}
 let c=db(&app)?;
 let count:i64=c.query_row("SELECT COUNT(*) FROM conversations WHERE id=?1",[&conversation_id],|r|r.get(0)).map_err(error)?;
 if count!=1{return Err("会话不存在".into());}
 let mut ids=std::collections::HashSet::new();
 for (index,s) in steps.iter().enumerate(){
  let sid=s.get("id").and_then(|v|v.as_str()).ok_or("步骤 ID 缺失")?;
  let member=s.get("memberId").and_then(|v|v.as_str()).ok_or("步骤 AI 缺失")?;
  let role=s.get("role").and_then(|v|v.as_str()).ok_or("步骤职责缺失")?;
  let instr=s.get("instruction").and_then(|v|v.as_str()).ok_or("步骤指令缺失")?;
  if !id(sid)||!ids.insert(sid)||!id(member)||!checked(role,120)||!checked(instr,12000){
    return Err(format!("第 {} 步的字段无效",index+1));
  }
  let assigned:i64=c.query_row("SELECT COUNT(*) FROM conversation_members WHERE conversation_id=?1 AND member_id=?2",
    params![conversation_id,member],|r|r.get(0)).map_err(error)?;
  if assigned!=1{return Err(format!("第 {} 步的成员不在此群聊",index+1));}
 }
 let json=serde_json::to_string(&plan).map_err(|_|"流程配置序列化失败")?;
 if json.len()>170_000{return Err("流程内容过长".into());}
 c.execute("INSERT INTO conversation_plans(conversation_id,definition_json,updated_at) VALUES(?1,?2,?3)
  ON CONFLICT(conversation_id) DO UPDATE SET definition_json=excluded.definition_json,updated_at=excluded.updated_at",
  params![conversation_id,json,now()]).map_err(error)?;Ok(())
}
#[tauri::command]
pub fn wb_backup(`);
replace('src-tauri/src/lib.rs',
 '            workbench_v3::wb_backup,',
 '            workbench_v3::wb_backup,\n            workbench_v3::wb_plan,\n            workbench_v3::wb_set_plan,');
replace('src-tauri/capabilities/default.json',
 '    "allow-wb-backup"',
 '    "allow-wb-backup",\n    "allow-wb-plan",\n    "allow-wb-set-plan"');
replace('src/host/index.ts',
 "import type { WorkspaceState,Message,Member,RelayCheckpoint,StoredRun,ChatMode } from '../workbench_v3/logic';",
 "import type { WorkspaceState,Message,Member,RelayCheckpoint,StoredRun,ChatMode } from '../workbench_v3/logic';\nimport type { WorkflowPlan } from '../workbench_v3/plan';");
replace('src/host/index.ts',
 "    backup: ():Promise<string>=>invoke('wb_backup'),",
 "    backup: ():Promise<string>=>invoke('wb_backup'),\n    plan: (conversationId:string):Promise<WorkflowPlan|null>=>invoke('wb_plan',{conversationId}),\n    setPlan: (conversationId:string,plan:WorkflowPlan):Promise<void>=>invoke('wb_set_plan',{conversationId,plan}),");
replace('src/workbench_v3/logic.ts',
 "export type ProviderId =",
 "import type {PlanStep} from './plan';\nexport type ProviderId =");
replace('src/workbench_v3/logic.ts',
 "  pendingPrompt?: string; status: RunStatus;",
 "  pendingPrompt?: string; status: RunStatus; steps?: PlanStep[];");
const hook='src/workbench_v3/useUnifiedChat.ts';
replace(hook,
 "import {API_PROVIDER_IDS,buildRelayPrompt,selectTargets,validateCheckpoint,type Member,type WorkspaceState,type Message,type ChatMode,type RelayCheckpoint,type StoredRun,type StepOutput} from './logic';",
 "import {API_PROVIDER_IDS,buildRelayPrompt,selectTargets,validateCheckpoint,type Member,type WorkspaceState,type Message,type ChatMode,type RelayCheckpoint,type StoredRun,type StepOutput} from './logic';\nimport {initialPlan,snapshotSteps,stepPrompt,validatePlan,type WorkflowPlan} from './plan';");
replace(hook,
 " const [run,setRun]=useState<StoredRun|null>(null);",
 " const [run,setRun]=useState<StoredRun|null>(null);\n const [plan,setPlan]=useState<WorkflowPlan|null>(null);");
replace(hook,
 " const stop=useRef(false);",
 " const stop=useRef(false);\n const selectedRef=useRef<string|null>(null);selectedRef.current=selected;");
replace(hook,
 " const refreshMessages=useCallback(async(cid:string)=>setMessages(await host.workbench.messages(cid)),[]);",
 " const refreshMessages=useCallback(async(cid:string)=>{const result=await host.workbench.messages(cid);if(selectedRef.current===cid)setMessages(result);},[]);");
replace(hook,
 "  if(!selected){setMessages([]);setRun(null);return;}\n  void Promise.all([host.workbench.messages(selected),host.workbench.recentRun(selected)])\n   .then(([m,last])=>{if(active){setMessages(m);setRun(last&&validateCheckpoint(last.state)?last:null);setManualText('');}})",
 `  if(!selected){setMessages([]);setRun(null);setPlan(null);return;}
  void Promise.all([host.workbench.messages(selected),host.workbench.recentRun(selected),host.workbench.plan(selected)])
   .then(async ([m,last,currentPlan])=>{
    if(!active)return;
    setMessages(m);
    setPlan(currentPlan);
    if(last && validateCheckpoint(last.state) && last.status==='running'){
      // Process was interrupted. A request may have reached the provider and been charged.
      // Never retry blindly when the remote completion status cannot be established.
      const uncertain={...last.state,status:'unknown_completion' as const};
      await host.workbench.saveRun({id:last.id,conversationId:selected,status:'unknown_completion',state:uncertain});
      if(active)setRun({...last,status:'unknown_completion',state:uncertain});
    }else if(active)setRun(last&&validateCheckpoint(last.state)?last:null);
    if(active)setManualText('');
   })`);
replace(hook,
 "  if(selected===cid)setRun({id,status:state.status,state,updatedAt:Date.now()});",
 "  if(selectedRef.current===cid)setRun({id,status:state.status,state,updatedAt:Date.now()});");
replace(hook,
 "    const prompt=buildRelayPrompt(state.task,member,role(member.id),state.outputs);",
 "    const step=state.steps?.[state.nextIndex];\n    const effectiveRole=step?.role||role(member.id);\n    const prompt=step?stepPrompt(state.task,step,state.outputs):buildRelayPrompt(state.task,member,effectiveRole,state.outputs);");
replace(hook,
 "    const output:StepOutput={memberId:member.id,provider:member.provider,role:role(member.id),body:reply,source:'official_api'};",
 "    const output:StepOutput={memberId:member.id,provider:member.provider,role:effectiveRole,body:reply,source:'official_api'};");
replace(hook,
 "   const state:RelayCheckpoint={task,memberIds:members.map(m=>m.id),nextIndex:0,outputs:[],status:'running'};",
 `   const available=plan&&validatePlan(plan,inRoom).length===0?plan:null;
   const customSteps=chosen.mode==='relay'&&available
     ?available.steps.filter(s=>members.some(m=>m.id===s.memberId))
     :snapshotSteps(members,null,role);
   if(!customSteps.length)throw Error('当前消息没有对应的可执行接力步骤');
   const state:RelayCheckpoint={task,memberIds:customSteps.map(s=>s.memberId),steps:customSteps,
     nextIndex:0,outputs:[],status:'running'};`);
replace(hook,
 "  if(!chosen||!run||run.status!=='waiting_manual')return;",
 "  if(!chosen||!run||!['waiting_manual','unknown_completion'].includes(run.status))return;");
replace(hook,
 "   const output:StepOutput={memberId:member.id,provider:member.provider,role:role(member.id),body:manualText,source:'user_imported_web'};",
 "   const output:StepOutput={memberId:member.id,provider:member.provider,role:run.state.steps?.[run.state.nextIndex]?.role||role(member.id),body:manualText,source:'user_imported_web'};");
replace(hook,
 " const resume=async()=>{if(chosen&&run?.status==='paused'){await execute(run.id,chosen.id,run.state);}};",
 ` async function savePlan(value:WorkflowPlan){
  if(!chosen)throw Error('请先选择会话');
  const errors=validatePlan(value,inRoom);
  if(errors.length)throw Error(errors.join('；'));
  await host.workbench.setPlan(chosen.id,value);
  setPlan(structuredClone(value));
  setNotice('已保存当前群的专属接力流程。运行中的旧任务不会改变。');
 }
 const resume=async()=>{if(chosen&&run?.status==='paused'){await execute(run.id,chosen.id,run.state);}};`);
replace(hook,
 "  busy,notice,setNotice,keys,setKeys,refresh,send,confirmManual,create,setConversation,setGroup,updateMember,execute,resume,backup,",
 "  busy,notice,setNotice,keys,setKeys,refresh,send,confirmManual,create,setConversation,setGroup,updateMember,execute,resume,backup,plan,savePlan,initialPlan,");
const ui='src/ui/UnifiedChatWorkspace.tsx';
replace(ui,
 "import {useUnifiedChat} from '../workbench_v3/useUnifiedChat';",
 "import {useUnifiedChat} from '../workbench_v3/useUnifiedChat';\nimport {WorkflowPlanEditor} from './WorkflowPlanEditor';");
replace(ui,
 " const [modal,setModal]=useState<'create'|'group'|'member'|null>(null);",
 " const [modal,setModal]=useState<'create'|'group'|'member'|'plan'|null>(null);");
replace(ui,
 "      {room.kind==='group'&&<button onClick={editGroup} className=\"rounded-lg border px-3 py-2 text-xs\">群成员</button>}",
 "      {room.kind==='group'&&<button onClick={editGroup} className=\"rounded-lg border px-3 py-2 text-xs\">群成员</button>}\n      {room.mode==='relay'&&<button onClick={()=>setModal('plan')} className=\"rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700\">编辑接力流程</button>}");
replace(ui,
 "     {w.run&&w.run.status!=='completed'&&<div className=",
 "     {w.run&&w.run.status!=='completed'&&<div className=");
replace(ui,
 "      {w.run.status==='unknown_completion'&&<p className=\"mt-2\">结果未知：请求可能已经计费，为避免重复计费不会自动重试。请先检查提供商的真实调用记录。</p>}",
 "      {w.run.status==='unknown_completion'&&<p className=\"mt-2\">结果未知：请求可能已经计费。不会自动重试。请在官网核对真实结果，若已完成可粘贴并确认继续。</p>}");
replace(ui,
 "      {w.run.status==='waiting_manual'&&<div className=\"mt-3 space-y-2\">",
 "      {['waiting_manual','unknown_completion'].includes(w.run.status)&&<div className=\"mt-3 space-y-2\">");
replace(ui,
 "  {modal&&<div className=\"fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4\">",
 `  {modal==='plan'&&<WorkflowPlanEditor current={w.plan} members={w.inRoom} roles={w.role} busy={w.busy}
    onSave={w.savePlan} onClose={()=>setModal(null)}/>}
  {modal&&modal!=='plan'&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">`);
const add=['src/workbench_v3/plan.ts','src/ui/WorkflowPlanEditor.tsx'];
for(const rel of add){
 const src=path.join(overlay,rel);
 if(!fs.existsSync(src)||fs.existsSync(path.join(root,rel)))throw Error('新文件缺失或已存在：'+rel);
}
// Fail-before-write for all expected source anchors.
for(const [rel,text] of updated)fs.writeFileSync(path.join(root,rel),text,'utf8');
for(const rel of add){const dest=path.join(root,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(overlay,rel),dest);}
for(const name of ['wb_plan','wb_set_plan']){
 const dest=path.join(root,'src-tauri/permissions/autogenerated/'+name+'.toml');
 fs.writeFileSync(dest,'[[permission]]\nidentifier = "allow-'+name.replaceAll('_','-')+'"\ndescription = "Control webview per-group workflow configuration"\ncommands.allow = ["'+name+'"]\n');
}
console.log('v3-M2: saved group workflow plans, runtime snapshots, interruption reconciliation and UI editor integrated');
