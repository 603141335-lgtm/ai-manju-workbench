'use strict';
const api=window.edgeLite,$=id=>document.getElementById(id);
let state={profiles:[],records:[]},selected=null,lastPendingKey=null;
const say=(msg,error=false)=>{const el=$('message');el.textContent=msg;el.className=error?'danger':''};
const used=id=>state.records.filter(t=>t.profileId===id&&t.status==='submitted').length;
function render(){
 if(state.pendingSegment?.key&&state.pendingSegment.key!==lastPendingKey){
   lastPendingKey=state.pendingSegment.key;
   $('episode').value=state.pendingSegment.episode;
   $('segment').value=state.pendingSegment.segment;
   say('提示词文档已选中：第'+state.pendingSegment.episode+'集 第'+state.pendingSegment.segment+'段');
 }
 const list=$('profiles');list.replaceChildren();
 if(!state.profiles.length){const p=document.createElement('p');p.className='muted small';p.textContent='未找到 Edge 用户资料。请先在 Edge 中添加用户。';list.append(p);}
 for(const p of state.profiles){
  const b=document.createElement('button');b.className='profile'+(selected===p.id?' active':'');
  const name=document.createElement('span');name.textContent=p.name+' ('+p.id+')';
  const count=document.createElement('span');count.className='tag';count.textContent=used(p.id)+'/2';
  b.append(name,count);b.onclick=()=>{selected=p.id;act(()=>api.selectProfile(p.id),'已选择 Edge 用户：'+p.name);};list.append(b);
 }
 const linked=state.pendingSegment;
 $('linkedSegment').textContent=linked
   ? '第'+linked.episode+'集 · 第'+linked.segment+'段'+(linked.title?'｜'+linked.title:'')
   : '请先在提示词文档点击“分配到账号小窗”';
 $('linkedProfile').textContent=linked?.profileId?'已关联 Edge 用户：'+linked.profileId:'请选择下方的 Edge 用户';
 $('copyPrompt').disabled=$('copyAndOpen').disabled=!linked;
 const link=state.connection||{};
 const connection=link.profiles?.[selected];
 const last=connection?.lastSeen?Date.parse(connection.lastSeen):0;
 const live=last&&Date.now()-last<45000;
 const job=connection?.job;
 const labels={queued:'正在等待Edge网页',needs_input:'需点选豆包输入框',filled:'已自动填入',failed:'填入失败',replaced:'已被新任务替代'};
 $('relayStatus').textContent=link.server?.ready?
   (connection?.paired?(live?'连接器在线':'已配对，等待浏览器打开')+
     (job?' · '+(labels[job.status]||job.status)+'（第'+job.episode+'集第'+job.segment+'段）':''))
     :'未配对扩展：复制密钥并在对应Edge用户的扩展中连接')
   :'本机连接服务不可用，请检查端口18741是否被占用';
 $('pairEdge').disabled=!selected;
 $('sendPrompt').disabled=!selected||!linked;
 const profile=state.profiles.find(p=>p.id===selected);
 $('picked').textContent=profile?.name||'未选择账号';
 $('counter').textContent=(selected?used(selected):0)+'/2';
 $('open').disabled=$('submit').disabled=$('reset').disabled=!profile;
  // A task is explicitly selected before monitoring a single new video download.
  const dl=state.downloads||{};
  const paths=$('downloadPaths');
  paths.textContent='下载：'+(dl.source||'未设置')+'\n归档：'+(dl.root||'未设置');
  paths.style.whiteSpace='pre-wrap';
  const armed=dl.armed,news=dl.notices?.[0];
  $('downloadState').textContent=armed
    ? '等待：第'+armed.task.episode+'集 第'+armed.task.segment+'段（下载后自动检查）'
    : news?.kind==='archived'?'已归档：'+news.target
    : news?.kind==='ambiguous'?'发现多个下载，已停止自动命名，请手动核对'
    : news?.kind==='expired'?'已超时，源文件未移动'
    : dl.lastError||'当前未等待下载';
  const dlSelect=$('downloadTask'),previous=dlSelect.value;
  dlSelect.replaceChildren();
  for(const t of state.records.filter(t=>t.profileId===selected&&t.status==='submitted').slice().reverse()){
    const option=document.createElement('option');
    option.value=t.id;
    option.textContent='第'+t.episode+'集 第'+t.segment+'段 · '+t.createdAt.slice(11,16);
    dlSelect.append(option);
  }
  if([...dlSelect.options].some(x=>x.value===previous))dlSelect.value=previous;
  $('armDownload').disabled=!!armed||!dlSelect.options.length;
  $('cancelDownload').disabled=!armed;
  const recent=$('recent');recent.replaceChildren();
 for(const t of state.records.filter(t=>t.profileId===selected&&t.status==='submitted').slice(-8).reverse()){
  const line=document.createElement('div');line.className='row';
  const name=document.createElement('span');name.textContent=`第${t.episode}集 第${t.segment}段`;
  const undo=document.createElement('button');undo.textContent='撤销';
  undo.onclick=()=>act(()=>api.undo(t.id),'已撤销本条登记');
  line.append(name,undo);recent.append(line);
 }
}
async function act(fn,message){
 try{state=await fn();say(message);render();}catch(e){say(e.message||String(e),true);}
}
async function refresh(){
 try{
  state=await api.get();
  if(!selected||!state.profiles.some(p=>p.id===selected)){
    selected=state.connection?.selectedProfile||
      state.profiles[0]?.id||null;
  }
  if(selected&&state.connection?.selectedProfile!==selected)
    state=await api.selectProfile(selected);
  render();
 }catch(e){say('账号读取失败：'+e.message,true);}
}
$('pairEdge').onclick=()=>{
 if(!selected){say('请先选择 Edge 用户',true);return;}
 act(()=>api.copyPairToken(selected),'已复制此Edge用户连接密钥，请粘贴到该用户的“AI漫剧连接器”扩展');
};
$('sendPrompt').onclick=()=>{
 if(!selected){say('请先选择 Edge 用户',true);return;}
 act(()=>api.sendPrompt(selected),'提示词已发往该Edge用户；请切到豆包页面等待自动填入');
};
$('copyPrompt').onclick=()=>act(()=>api.copyPrompt(),'已复制完整提示词；可以在 Edge 手动粘贴');
$('copyAndOpen').onclick=()=>{
 if(!selected){say('请先选择 Edge 用户',true);return;}
 act(()=>api.copyAndOpen(selected),'已复制完整提示词，并打开所选 Edge 用户；请在豆包粘贴');
};
$('refresh').onclick=refresh;
$('chooseDownloads').onclick=()=>act(()=>api.chooseDownloads(),'下载目录已设置');
$('chooseArchive').onclick=()=>act(()=>api.chooseArchive(),'归档目录已设置');
$('armDownload').onclick=()=>act(()=>api.armDownload($('downloadTask').value),'已准备接收这段视频');
$('cancelDownload').onclick=()=>act(()=>api.cancelDownload(),'已取消等待');
$('openArchive').onclick=()=>act(()=>api.openArchive(),'已打开归档目录');
setInterval(async()=>{try{state=await api.get();render();}catch{}},3000);
$('open').onclick=async()=>{
 if(!selected)return;
 try{await api.launch(selected);say('已请求打开 Edge 用户窗口');}catch(e){say(e.message,true);}
};
$('submit').onclick=()=>{
 const episode=Number($('episode').value),segment=Number($('segment').value);
 act(()=>api.submit({profileId:selected,episode,segment}),'已登记一次提交');
};
$('reset').onclick=()=>{
 if(selected&&confirm('确定将当前用户的手动计数归零吗？历史记录会保留。'))
  act(()=>api.reset(selected),'本账号计数已归零');
};
refresh();
