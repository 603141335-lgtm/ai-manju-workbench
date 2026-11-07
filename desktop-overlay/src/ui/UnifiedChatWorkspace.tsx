import {useEffect,useRef,useState} from 'react';
import {host} from '../host';
import {useUnifiedChat} from '../workbench_v3/useUnifiedChat';
import {API_PROVIDER_IDS,type Member,type ChatMode} from '../workbench_v3/logic';

type Props={onClose:()=>void};
const modes:{id:ChatMode;title:string}[]=[
 {id:'normal',title:'普通聊天'},{id:'parallel',title:'同时回答'},{id:'relay',title:'顺序接力'},
 {id:'debate',title:'四方辩论（原版）'},{id:'consult',title:'多方咨询（原版）'},{id:'coding',title:'Coding（原版）'}
];
function Avatar({name,group=false}:{name:string;group?:boolean}){
 return <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-bold '+(group?'bg-violet-100 text-violet-700':'bg-indigo-100 text-indigo-700')}>{group?'群':name.slice(0,2)}</div>;
}
export function UnifiedChatWorkspace({onClose}:Props){
 const w=useUnifiedChat();
 const [search,setSearch]=useState('');
 const [modal,setModal]=useState<'create'|'group'|'member'|null>(null);
 const [createKind,setCreateKind]=useState<'private'|'group'>('group');
 const [createTitle,setCreateTitle]=useState('');
 const [picked,setPicked]=useState<string[]>([]);
 const [roles,setRoles]=useState<Record<string,string>>({});
 const [editing,setEditing]=useState<Member|null>(null);
 const [showTools,setShowTools]=useState(false);
 const [busyUi,setBusyUi]=useState(false);
 const inputRef=useRef<HTMLTextAreaElement>(null);
 const transcript=useRef<HTMLDivElement>(null);
 useEffect(()=>{transcript.current?.scrollTo({top:transcript.current.scrollHeight,behavior:'smooth'});},[w.messages.length,w.selected,w.run?.status]);
 useEffect(()=>{
  function keys(e:KeyboardEvent){
   if(e.key==='Escape')setModal(null);
   if(e.ctrlKey&&e.key==='k'){e.preventDefault();document.getElementById('unified-search')?.focus();}
   if(e.ctrlKey&&e.key==='n'){e.preventDefault();startCreate('group');}
  }
  window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
 },[]);
 function startCreate(kind:'private'|'group'){
  setModal('create');setCreateKind(kind);setCreateTitle('');setPicked([]);
 }
 function editGroup(){
  setModal('group');setPicked(w.inRoom.map(m=>m.id));
  setRoles(Object.fromEntries(w.assignments.map(a=>[a.memberId,a.role])));
 }
 async function create(){
  if(!picked.length){w.setNotice('请选择至少一位 AI 成员');return;}
  const selected=createKind==='private'?picked.slice(0,1):picked;
  const title=createTitle.trim()||(createKind==='private'?w.data.members.find(m=>m.id===selected[0])?.name+' 私聊':'新的 AI 群聊');
  try{setBusyUi(true);await w.create(title,createKind,selected);setModal(null);}
  catch(e){w.setNotice('创建失败：'+String(e));}finally{setBusyUi(false);}
 }
 async function changeGroup(){
  if(!picked.length){w.setNotice('群至少需要一位 AI');return;}
  try{setBusyUi(true);await w.setGroup(picked.map(id=>({memberId:id,role:roles[id]??''})));setModal(null);}
  catch(e){w.setNotice('群设置失败：'+String(e));}finally{setBusyUi(false);}
 }
 async function saveMember(){
  if(!editing)return;
  try{setBusyUi(true);await w.updateMember(editing);setEditing(null);setModal(null);}
  catch(e){w.setNotice('保存成员失败：'+String(e));}finally{setBusyUi(false);}
 }
 async function openWebsite(m:Member){
  try{
   if(['doubao','deepseek','kimi','qwen'].includes(m.provider))await host.domestic.openMember(m.provider);
   else w.setNotice(m.name+' 的原生网页登录请点击左下角“返回原版”，在原版的会员网页中使用。');
  }catch(e){w.setNotice('官网无法打开：'+String(e));}
 }
 const pending=w.run?.status==='waiting_manual' ? w.data.members.find(m=>m.id===w.run?.state.memberIds[w.run.state.nextIndex]):undefined;
 const pendingText=w.run?.status==='waiting_manual'?w.run.state.pendingPrompt??'':'';
 async function copy(text:string){
  try{await navigator.clipboard.writeText(text);w.setNotice('已复制完整内容');}
  catch{w.setNotice('复制失败：请手动选择文本');}
 }
 const room=w.chosen;
 const formatted=(date:number)=>new Date(date).toLocaleString('zh-CN',{hour:'2-digit',minute:'2-digit',month:'2-digit',day:'2-digit'});
 return <main aria-label="统一 AI 聊天中心" className="flex h-screen min-h-0 bg-[#f6f8fc] text-slate-800">
  <nav className="flex w-[76px] shrink-0 flex-col items-center gap-3 bg-[#162640] p-3 text-white">
   <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-sky-500 font-black shadow-md">AI</div>
   <button title="聊天消息" className="w-full rounded-xl bg-white/15 p-2 text-xs">消息</button>
   <button title="新建群聊" onClick={()=>startCreate('group')} className="w-full rounded-xl p-2 text-xs hover:bg-white/10">建群</button>
   <button title="新建私聊" onClick={()=>startCreate('private')} className="w-full rounded-xl p-2 text-xs hover:bg-white/10">好友</button>
   <button title="备份本地数据库" onClick={()=>void w.backup().catch(e=>w.setNotice(String(e)))} className="w-full rounded-xl p-2 text-xs hover:bg-white/10">备份</button>
   <div className="flex-1"/>
   <button title="返回原有会员网页及讨论模式" onClick={onClose} className="w-full rounded-xl bg-white/10 p-2 text-xs">原版</button>
  </nav>
  <aside className="flex w-[270px] shrink-0 flex-col border-r border-slate-200 bg-white">
   <div className="space-y-3 border-b border-slate-100 px-4 py-4">
    <div className="flex items-center justify-between"><strong className="text-lg">AI 消息</strong>
     <button onClick={onClose} className="rounded-lg border px-2 py-1.5 text-[11px]">返回原版</button></div>
    <input id="unified-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索会话 · Ctrl+K"
     className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"/>
    <div className="grid grid-cols-2 gap-2">
     <button onClick={()=>startCreate('private')} className="rounded-lg border px-2 py-2 text-xs">＋ 私聊</button>
     <button onClick={()=>startCreate('group')} className="rounded-lg bg-indigo-600 px-2 py-2 text-xs font-semibold text-white">＋ 建群</button>
    </div>
   </div>
   <div className="min-h-0 flex-1 overflow-auto p-2">
    {w.data.conversations.filter(c=>c.title.toLowerCase().includes(search.toLowerCase())).map(c=>
     <button key={c.id} onClick={()=>{w.setSelected(c.id);w.setNotice('');}}
      className={'mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-100 '+(w.selected===c.id?'bg-indigo-50':'')}>
      <Avatar name={c.title} group={c.kind==='group'}/>
      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{c.title}</b>
       <span className="block text-[11px] text-slate-400">{c.kind==='group'?'群聊':'私聊'} · {formatted(c.updatedAt)}</span></span>
     </button>
    )}
    {!w.data.conversations.length&&<div className="p-4 text-xs leading-6 text-slate-500">现在还没有会话。创建群聊，将 Gemini、ChatGPT、豆包等加入群组。</div>}
   </div>
   <p className="border-t p-3 text-center text-[11px] text-slate-400">Windows 本地 SQLite · 会话独立保存</p>
  </aside>
  <section className="flex min-w-0 flex-1 flex-col">
   {room?<>
    <header className="flex min-h-[76px] items-center justify-between gap-2 border-b border-slate-200 bg-white px-5">
     <div className="min-w-0"><h1 className="truncate text-lg font-bold">{room.title}</h1>
      <p className="text-xs text-slate-500">{room.kind==='group'?'AI 群聊':'AI 私聊'} · {w.inRoom.length} 位成员</p></div>
     <div className="flex flex-wrap items-center gap-2">
      <select aria-label="协作模式" value={room.mode} onChange={e=>void w.setConversation(room.title,e.target.value as ChatMode).catch(x=>w.setNotice(String(x)))}
       className="rounded-lg border bg-white px-3 py-2 text-xs" disabled={w.busy}>
       {modes.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      {room.kind==='group'&&<button onClick={editGroup} className="rounded-lg border px-3 py-2 text-xs">群成员</button>}
      <button onClick={()=>{const title=window.prompt('会话名称',room.title);if(title?.trim())void w.setConversation(title,room.mode).catch(x=>w.setNotice(String(x)));}}
       className="rounded-lg border px-3 py-2 text-xs">重命名</button>
     </div>
    </header>
    <div ref={transcript} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
     {!w.messages.length&&<div className="mx-auto mt-16 max-w-sm text-center text-slate-500">
      <div className="text-3xl">✦</div><b className="mt-3 block">开始真实的 AI 协作</b>
      <p className="mt-2 text-xs leading-6">使用 @成员 指定对象。API 成员可自动执行，会员网页步骤会要求你确认真实回复。不会出现虚构回答。</p></div>}
     {w.messages.map(m=>{
      const member=w.data.members.find(x=>x.id===m.memberId);const user=m.sender==='user';
      return <article key={m.id} className={'flex gap-3 '+(user?'justify-end':'justify-start')}>
       {!user&&<Avatar name={member?.name??'系统'}/>}
       <div className={'max-w-[86%] rounded-2xl px-4 py-3 shadow-sm '+(user?'bg-indigo-600 text-white':'border border-slate-200 bg-white')}>
        <div className={'mb-1 flex flex-wrap items-center gap-2 text-[11px] '+(user?'text-indigo-100':'text-slate-500')}>
         <b>{user?'我':member?.name??'系统'}</b><span>{formatted(m.createdAt)}</span>
         <span>{m.source==='official_api'?'真实 API 回复':m.source==='user_imported_web'?'人工确认官网回复':m.source==='user'?'我':'系统事件'}</span>
         {m.status!=='completed'&&<b>{m.status}</b>}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-6">{m.body}</div>
        <button onClick={()=>void copy(m.body)} className={'mt-2 text-[11px] '+(user?'text-indigo-100':'text-indigo-500')}>复制全文</button>
       </div>
      </article>;
     })}
     {w.run&&w.run.status!=='completed'&&<div className="mx-auto max-w-[710px] rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <div className="flex items-center gap-2"><strong>工作流状态：{w.run.status}</strong>
       <span>步骤 {Math.min(w.run.state.nextIndex+1,w.run.state.memberIds.length)} / {w.run.state.memberIds.length}</span>
       {w.run.status==='paused'&&<button onClick={()=>void w.resume()} className="rounded-lg border px-2 py-1">继续接力</button>}
      </div>
      {w.run.status==='unknown_completion'&&<p className="mt-2">结果未知：请求可能已经计费，为避免重复计费不会自动重试。请先检查提供商的真实调用记录。</p>}
      {w.run.status==='waiting_manual'&&<div className="mt-3 space-y-2">
       <b>需要 {pending?.name??'AI'} 的官网真实回复</b>
       <div className="flex flex-wrap gap-2">
        <button onClick={()=>void copy(pendingText)} className="rounded-lg bg-amber-200 px-3 py-2">复制完整任务</button>
        {pending&&<button onClick={()=>{if(API_PROVIDER_IDS.has(pending.provider))void host.domestic.openMember(pending.provider).catch(e=>w.setNotice(String(e)));else w.setNotice('请返回原版，打开 '+pending.name+' 官网窗口');}}
         className="rounded-lg border border-amber-300 px-3 py-2">打开官网</button>}
       </div>
       <details><summary className="cursor-pointer">查看本次完整交接文本</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2">{pendingText}</pre></details>
       <textarea value={w.manualText} onChange={e=>w.setManualText(e.target.value)} rows={4}
        placeholder="粘贴官网生成的完整真实回复" className="w-full rounded-lg border border-amber-300 p-2"/>
       <button disabled={w.busy} onClick={()=>void w.confirmManual()} className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white disabled:opacity-50">确认回复并继续下一步</button>
      </div>}
     </div>}
    </div>
    <footer className="border-t border-slate-200 bg-white p-4">
     {w.notice&&<div role="status" className="mb-2 max-h-28 overflow-auto rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{w.notice}</div>}
     <div className="mb-3 flex flex-wrap gap-2">{w.inRoom.map(m=>
      <button key={m.id} onClick={()=>{w.setDraft(w.draft+' @'+m.name+' ');inputRef.current?.focus();}}
       className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:border-indigo-400">@{m.name}</button>)}</div>
     <div className="flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2 focus-within:ring-indigo-200">
      <textarea ref={inputRef} value={w.draft} onChange={e=>w.setDraft(e.target.value)}
       onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();void w.send();}}}
       rows={3} placeholder="发送消息、@AI 或发布接力任务（Ctrl+Enter）"
       className="min-h-[76px] min-w-0 flex-1 resize-none bg-transparent p-2 text-sm outline-none"/>
      <button disabled={!w.draft.trim()||w.busy} onClick={()=>void w.send()}
       className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{w.busy?'执行中':'发送'}</button>
     </div>
     <p className="mt-2 text-[11px] text-slate-400">网页登录与 API 分离 · API 需要单独费用 · 未获得真实回复不会自动标记成功</p>
    </footer>
   </>:<div className="m-auto text-sm text-slate-500">请从左侧选择会话，或创建新群聊。</div>}
  </section>
  <aside className="hidden w-[288px] shrink-0 flex-col border-l border-slate-200 bg-white p-4 xl:flex">
   <h2 className="font-semibold">群成员与接入设置</h2>
   <p className="mt-1 text-xs leading-5 text-slate-500">每个成员独立配置。网页登录的 Pro/思考档位在真实官网中选择。</p>
   <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto">
    {w.inRoom.map((m,index)=><div key={m.id} className="rounded-xl border p-3">
     <div className="flex items-center gap-2"><Avatar name={m.name}/><div className="min-w-0 flex-1">
      <b className="block truncate text-sm">{index+1}. {m.name}</b>
      <span className="text-[11px] text-slate-400">{m.kind==='api'?'官方 API':m.kind==='web_native'?'网页会员':'人工成员'}</span>
     </div><button onClick={()=>{setEditing({...m});setModal('member');}} className="text-xs text-indigo-600">设置</button></div>
     <p className="mt-2 truncate text-[11px] text-slate-500">职责：{w.assignments.find(a=>a.memberId===m.id)?.role||m.role||'未设置'}</p>
     {m.kind==='api'&&API_PROVIDER_IDS.has(m.provider)&&
      <label className="mt-2 block text-[11px] text-slate-500">API Key（仅本次内存保存）
       <input type="password" autoComplete="off" value={w.keys[m.provider]??''}
        onChange={e=>w.setKeys(v=>({...v,[m.provider]:e.target.value}))}
        placeholder="填写官网 API Key" className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"/></label>}
     <div className="mt-2 flex items-center justify-between">
      <button onClick={()=>{if(API_PROVIDER_IDS.has(m.provider))void host.domestic.openMember(m.provider).catch(e=>w.setNotice(String(e)));else w.setNotice('原版会员网页请返回原版使用');}}
       className="rounded-lg border px-2 py-1 text-[11px]">官网窗口</button>
      <span className="text-[10px] text-slate-500">{m.kind==='api'&&m.modelId&&w.keys[m.provider]?'可自动调用':'网页/待配置'}</span>
     </div>
    </div>)}
   </div>
   <button onClick={()=>setShowTools(v=>!v)} className="mt-3 rounded-lg border px-3 py-2 text-xs">{showTools?'收起':'打开'} 任务工具</button>
   {showTools&&<div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
    <button onClick={()=>void copy(w.messages.map(m=>'【'+(m.sender==='user'?'我':w.data.members.find(x=>x.id===m.memberId)?.name??'系统')+'】\n'+m.body).join('\n\n'))} className="block w-full rounded-lg border bg-white p-2 text-left">复制完整会话</button>
    <button onClick={()=>void w.backup().catch(e=>w.setNotice(String(e)))} className="block w-full rounded-lg border bg-white p-2 text-left">备份 SQLite 数据库</button>
    {w.run&&<button onClick={()=>void copy(JSON.stringify(w.run?.state,null,2))} className="block w-full rounded-lg border bg-white p-2 text-left">复制工作流检查点</button>}
    {w.busy&&<button onClick={w.stop} className="block w-full rounded-lg border border-red-300 bg-white p-2 text-left text-red-600">停止后续步骤</button>}
   </div>}
  </aside>
  {modal&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
   <div role="dialog" aria-modal="true" aria-label="AI 成员与群聊配置" className="max-h-[88vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
    <div className="mb-4 flex items-center justify-between"><b className="text-lg">{modal==='create'?'新建聊天':modal==='group'?'编辑群成员':'AI 联系人设置'}</b>
     <button onClick={()=>setModal(null)} className="rounded-lg border px-3 py-1.5 text-xs">关闭</button></div>
    {modal==='create'&&<div className="mb-4 space-y-2">
     <div className="flex gap-2">{(['private','group'] as const).map(k=>
      <button key={k} onClick={()=>{setCreateKind(k);setPicked([]);}}
       className={'rounded-lg px-3 py-2 text-xs '+(createKind===k?'bg-indigo-600 text-white':'bg-slate-100')}>{k==='group'?'创建群聊':'创建私聊'}</button>)}</div>
     <label className="text-xs">名称<input value={createTitle} onChange={e=>setCreateTitle(e.target.value)} placeholder="例如：漫剧制作群"
      className="mt-1 block w-full rounded-lg border p-3 text-sm"/></label>
    </div>}
    {(modal==='create'||modal==='group')&&<div>
     <p className="mb-2 font-semibold">选择 AI 联系人</p>
     <div className="space-y-2">{w.data.members.map(m=><label key={m.id} className="flex items-center gap-3 rounded-xl border p-2 text-xs">
      <input type={modal==='create'&&createKind==='private'?'radio':'checkbox'} checked={picked.includes(m.id)}
       onChange={e=>setPicked(v=>e.target.checked?(modal==='create'&&createKind==='private'?[m.id]:[...v,m.id]):v.filter(x=>x!==m.id))}/>
      <Avatar name={m.name}/><span className="flex-1"><b className="block">{m.name}</b><span className="text-slate-400">{m.kind}</span></span>
      {modal==='group'&&picked.includes(m.id)&&<input placeholder="群内职责" value={roles[m.id]??''} onChange={e=>setRoles(v=>({...v,[m.id]:e.target.value}))}
       className="w-36 rounded-lg border p-2 text-xs"/>}
     </label>)}</div>
     <button disabled={!picked.length||busyUi} onClick={()=>void(modal==='create'?create():changeGroup())}
      className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40">保存</button>
    </div>}
    {modal==='member'&&editing&&<div className="space-y-3">
     <label className="block text-xs">昵称<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}
      className="mt-1 w-full rounded-lg border p-2"/></label>
     <label className="block text-xs">连接方式<select value={editing.kind} onChange={e=>setEditing({...editing,kind:e.target.value as Member['kind']})}
      className="mt-1 w-full rounded-lg border p-2">
      <option value="web_native">原生网页会员（人工接力）</option><option value="api">官方 API（真实自动调用）</option><option value="manual">人工成员</option>
     </select></label>
     <label className="block text-xs">官方模型 ID<input value={editing.modelId} onChange={e=>setEditing({...editing,modelId:e.target.value})}
      placeholder="从平台官方控制台复制" className="mt-1 w-full rounded-lg border p-2"/></label>
     <label className="block text-xs">默认职责<textarea rows={3} value={editing.role} onChange={e=>setEditing({...editing,role:e.target.value})}
      className="mt-1 w-full rounded-lg border p-2"/></label>
     <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">此版本自动 API 接力限豆包、DeepSeek、Kimi、千问。其他网站原生登录由旧版继续维护。不能把会员 Pro 当作 API Key。</p>
     <button disabled={busyUi} onClick={()=>void saveMember()} className="w-full rounded-lg bg-indigo-600 p-3 text-sm font-semibold text-white">保存成员</button>
    </div>}
   </div>
  </div>}
 </main>;
}