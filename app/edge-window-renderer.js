'use strict';
const api=window.edgeLite,$=id=>document.getElementById(id);
let state={profiles:[],records:[]},selected=null;
const say=(msg,error=false)=>{const el=$('message');el.textContent=msg;el.className=error?'danger':''};
const used=id=>state.records.filter(t=>t.profileId===id&&t.status==='submitted').length;
function render(){
 const list=$('profiles');list.replaceChildren();
 if(!state.profiles.length){const p=document.createElement('p');p.className='muted small';p.textContent='未找到 Edge 用户资料。请先在 Edge 中添加用户。';list.append(p);}
 for(const p of state.profiles){
  const b=document.createElement('button');b.className='profile'+(selected===p.id?' active':'');
  const name=document.createElement('span');name.textContent=p.name+' ('+p.id+')';
  const count=document.createElement('span');count.className='tag';count.textContent=used(p.id)+'/2';
  b.append(name,count);b.onclick=()=>{selected=p.id;render();};list.append(b);
 }
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
 await act(()=>api.get(),'账号列表已刷新');
 if(!selected||!state.profiles.some(p=>p.id===selected)){selected=state.profiles[0]?.id||null;render();}
}
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
