function stageSettings(mode){
  const manual=(name,provider,role)=>({name,provider,role,mode:'web_manual'});
  const apiStage=(name,provider,role,model)=>{if(!model.trim())throw Error(name+' 阶段缺少 API 模型 ID');return {name,provider,role,mode:'api',model:model.trim()}};
  const a=$('model1').value,b=$('model2').value,c=$('model3').value;
  if(mode==='web')return [manual('ChatGPT','chatgpt','文案'),manual('Gemini','gemini','导演分镜'),manual('其他AI','other','审核优化')];
  if(mode==='mixed')return [apiStage('ChatGPT','openai','文案',a),manual('Gemini','gemini','导演分镜'),apiStage('其他AI','other','审核优化',c)];
  return [apiStage('ChatGPT','openai','文案',a),apiStage('Gemini','gemini','导演分镜',b),apiStage('其他AI','other','审核优化',c)];
}
const $=id=>document.getElementById(id);
let jobId=null,active=null,connection=null;
async function getConnection(){connection=await api('/api/connection');text('connection',connection.apiConfigured?'API Key 已配置 ｜ '+connection.baseUrl+' ｜ API 阶段可自动执行':'尚未配置 MAI_API_KEY；会员网页模式不受影响，API 阶段会停止并报告错误');}
$('runmode').onchange=()=>{$('apiOptions').open=$('runmode').value!=='web'};
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
  const stage=a.stage;
  text('current',a.episode?`第${a.episode}集｜${stage?stage.name+' · '+stage.role+' · '+stage.status+(stage.model?'｜模型 '+stage.model:'')+(stage.last_error?'｜'+stage.last_error:''):'待本集人工质检'}｜任务${a.job.status}`:'全部集数已完成');
  $('import').disabled=!!stage&&stage.mode!=='web_manual';
  $('reply').disabled=!!stage&&stage.mode!=='web_manual';
  const usage=await api(`/api/jobs/${jobId}/usage`);
  text('usage',usage.length?usage.map(x=>`${x.model}: 输入${x.input_tokens} / 输出${x.output_tokens} / 共${x.total_tokens} Token，${x.calls}次`).join('\n'):'暂无 API 调用记录（费用请以中转站账单为准）');
  text('prompt',a.prompt??'暂无待交接提示词');
  const ev=await api(`/api/jobs/${jobId}/events`);text('log',ev.slice(0,12).map(x=>`${x.created_at} ${x.type}`).join('\n'));
}
async function post(action,body={}){if(!jobId)throw Error('请先选择任务');await api(`/api/jobs/${jobId}/${action}`,'POST',body);await refresh()}
$('create').onclick=async()=>{try{const job=await api('/api/jobs','POST',{title:$('title').value,source:$('source').value,totalEpisodes:Number($('total').value),stages:stageSettings($('runmode').value)});jobId=job.id;await refresh()}catch(e){showErr(e)}};
$('jobs').onchange=async()=>{jobId=$('jobs').value;await refresh()};
for(const op of ['start','pause','resume','retry'])$(op).onclick=async()=>{try{await post(op)}catch(e){showErr(e)}};
$('import').onclick=async()=>{try{await post('import',{reply:$('reply').value});$('reply').value=''}catch(e){showErr(e)}};
$('approve').onclick=async()=>{try{await post('approve',{reviewer:'用户',reason:'已检查本集剧情和台词完整性',continuity:{ending:$('continuity').value}});$('continuity').value=''}catch(e){showErr(e)}};
$('export').onclick=async()=>{try{const r=await api(`/api/jobs/${jobId}/export`,'POST',{});window.alert(`已导出${r.episodes}集：\n${r.file}`)}catch(e){showErr(e)}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(active?.prompt??'');text('status','已复制提示词')}catch(e){showErr(e)}};
$('chatgpt').onclick=()=>window.open('https://chatgpt.com/','_blank','noopener');
$('gemini').onclick=()=>window.open('https://gemini.google.com/','_blank','noopener');
getConnection().catch(showErr);refresh().catch(showErr);
