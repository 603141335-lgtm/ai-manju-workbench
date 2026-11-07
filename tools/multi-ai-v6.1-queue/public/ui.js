const $=id=>document.getElementById(id);
let jobId=null,active=null;
async function api(url,method='GET',body){const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const x=await res.json();if(!res.ok)throw Error(x.error??'操作失败');return x}
function text(id,s){$(id).textContent=s}
function showErr(e){text('status','错误：'+e.message);window.alert(e.message)}
async function refresh(){
  const jobs=await api('/api/jobs');const select=$('jobs');select.replaceChildren();for(const j of jobs){const opt=document.createElement('option');opt.value=j.id;opt.textContent=`${j.title} · ${j.status}`;opt.selected=j.id===jobId;select.append(opt)}
  if(!jobId)return;
  const job=await api(`/api/jobs/${jobId}`);active=await api(`/api/jobs/${jobId}/current`);
  text('status',`${job.title}｜${job.status}｜${job.episodes.filter(x=>x.status==='completed').length}/${job.total_episodes}集`);
  const ep=$('episodes');ep.replaceChildren();for(const e of job.episodes){const div=document.createElement('div');div.className='ep';const left=document.createElement('span'),right=document.createElement('span');left.textContent=`第${String(e.number).padStart(2,'0')}集`;right.className='state';right.textContent=e.status;div.append(left,right);ep.append(div)}
  const a=active;
  text('current',a.episode?`第${a.episode}集｜${a.stage?a.stage.name+' · '+a.stage.role+' · '+a.stage.status:'待本集人工质检'}｜任务${a.job.status}`:'全部集数已完成');
  text('prompt',a.prompt??'暂无待交接提示词');
  const ev=await api(`/api/jobs/${jobId}/events`);text('log',ev.slice(0,12).map(x=>`${x.created_at} ${x.type}`).join('\n'));
}
async function post(action,body={}){if(!jobId)throw Error('请先选择任务');await api(`/api/jobs/${jobId}/${action}`,'POST',body);await refresh()}
$('create').onclick=async()=>{try{const job=await api('/api/jobs','POST',{title:$('title').value,source:$('source').value,totalEpisodes:Number($('total').value)});jobId=job.id;await refresh()}catch(e){showErr(e)}};
$('jobs').onchange=async()=>{jobId=$('jobs').value;await refresh()};
for(const op of ['start','pause','resume','retry'])$(op).onclick=async()=>{try{await post(op)}catch(e){showErr(e)}};
$('import').onclick=async()=>{try{await post('import',{reply:$('reply').value});$('reply').value=''}catch(e){showErr(e)}};
$('approve').onclick=async()=>{try{await post('approve',{reviewer:'用户',reason:'已检查本集剧情和台词完整性',continuity:{ending:$('continuity').value}});$('continuity').value=''}catch(e){showErr(e)}};
$('export').onclick=async()=>{try{const r=await api(`/api/jobs/${jobId}/export`,'POST',{});window.alert(`已导出${r.episodes}集：\n${r.file}`)}catch(e){showErr(e)}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(active?.prompt??'');text('status','已复制提示词')}catch(e){showErr(e)}};
$('chatgpt').onclick=()=>window.open('https://chatgpt.com/','_blank','noopener');
$('gemini').onclick=()=>window.open('https://gemini.google.com/','_blank','noopener');
refresh().catch(showErr);
