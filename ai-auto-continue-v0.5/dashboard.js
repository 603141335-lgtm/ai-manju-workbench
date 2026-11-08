'use strict';
const $ = id => document.getElementById(id);
const num = (v, lo, hi, fallback) => Math.min(hi,Math.max(lo,Number(v) || fallback));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const urls = {chatgpt:'https://chatgpt.com/',gemini:'https://gemini.google.com/app',doubao:'https://www.doubao.com/chat/',deepseek:'https://chat.deepseek.com/'};
const labels = {chatgpt:'ChatGPT',gemini:'Google Gemini',doubao:'豆包',deepseek:'DeepSeek'};
let lastState = null;
let selectedEpisode = null;
let manualMode = false;
let demoInProgress = false;
let draftTimer = null;
let skillLibrary=[];
let selectedSkillId='';
let rounds=[
  '严格按照选定的Skill，完整拆解这段小说剧情，保留全部重要情节。',
  '根据上一轮的剧情内容，整理人物、场景和道具资产。',
  '继续根据上述内容，生成完整的导演分镜和视频提示词。'
];
function selectPlatform(v,open=false){
  if(!urls[v])return;
  $('platform').value=v;
  document.querySelectorAll('.platform-btn').forEach(b=>b.classList.toggle('active',b.dataset.platform===v));
  if(open)openSite();
  saveDraftSoon();
}
function selectMode(v){
  $('mode').value=v==='rounds'?'rounds':'episodes';
  $('episodesPanel').hidden=$('mode').value==='rounds';
  $('roundsPanel').hidden=$('mode').value!=='rounds';
  document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===$('mode').value));
  saveDraftSoon();
}
function renderRounds(){
  const target=$('roundList');target.replaceChildren();
  rounds.forEach((str,i)=>{
    const box=document.createElement('div');box.className='round-item';
    const top=document.createElement('div');top.className='round-top';
    const title=document.createElement('b');title.textContent=`第 ${i+1} 轮`;
    const del=document.createElement('button');del.type='button';del.textContent='删除';del.disabled=rounds.length===1;
    del.addEventListener('click',()=>{if(rounds.length<=1)return;rounds.splice(i,1);renderRounds();saveDraftSoon();});
    top.append(title,del);
    const ta=document.createElement('textarea');ta.className='round-text';ta.rows=3;ta.value=str;ta.placeholder='填写这轮需要自动发送给AI的完整指令';
    ta.addEventListener('input',()=>{rounds[i]=ta.value;saveDraftSoon();});
    box.append(top,ta);target.append(box);
  });
  $('roundCount').textContent=`共 ${rounds.length} 轮（最多10轮）`;
  $('addRound').disabled=rounds.length>=10;
}
function renderSkillLibrary(){
  const sel=$('skillChoice');sel.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent='不使用Skill（手动填写）';sel.append(empty);
  for(const item of skillLibrary){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;sel.append(o)}
  sel.value=skillLibrary.some(x=>x.id===selectedSkillId)?selectedSkillId:'';
}
async function chooseSkill(id){
  selectedSkillId=id;
  const entry=skillLibrary.find(x=>x.id===id);
  $('skill').value=entry?.content||'';
  $('fileInfo').textContent=entry?`已选择：${entry.name} · 自动发送时使用此版本`:'可以直接粘贴规则，或点击“保存当前规则”加入文件库';
  updateSkillCount();await chrome.storage.local.set({manjuSelectedSkill:selectedSkillId});saveDraftSoon();
}
async function saveSkillToLibrary(name,content){
  if(!String(content||'').trim())throw Error('Skill内容为空。');
  const key=`skill-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  skillLibrary.push({id:key,name:String(name).slice(0,100),content,at:Date.now()});
  selectedSkillId=key;
  await chrome.storage.local.set({manjuSkills:skillLibrary,manjuSelectedSkill:key});
  renderSkillLibrary();await chooseSkill(key);
}


const draftFields = ['projectName','skill','firstPrompt','nextPrompt','total','autoDownload','quietSeconds','timeoutMinutes','editorSelector','replySelector','sendSelector','chatMode','includePrevious'];
const configFromForm = () => ({
  projectName:$('projectName').value.trim() || '我的小说', platform:$('platform').value,
  mode:$('mode').value,rounds:rounds.slice(),chatMode:$('chatMode').value,includePrevious:$('includePrevious').checked,skillId:selectedSkillId,
  platformLabel:labels[$('platform').value], skill:$('skill').value,
  firstPrompt:$('firstPrompt').value, nextPrompt:$('nextPrompt').value,
  total:$('mode').value==='rounds'?rounds.length:num($('total').value,1,300,30), autoDownload:$('autoDownload').checked,
  quietSeconds:num($('quietSeconds').value,4,60,7), timeoutMinutes:num($('timeoutMinutes').value,1,120,8),
  selectors:{editor:$('editorSelector').value.trim(),reply:$('replySelector').value.trim(),send:$('sendSelector').value.trim()}
});
function fillForm(cfg) {
  if(!cfg) return;
  ['projectName','skill','firstPrompt','nextPrompt','total','quietSeconds','timeoutMinutes'].forEach(k=>{if(cfg[k]!==undefined) $(k).value=cfg[k]});
  selectPlatform(cfg.platform||'chatgpt');
  if(Array.isArray(cfg.rounds)&&cfg.rounds.length)rounds=cfg.rounds.slice(0,10);
  renderRounds();
  $('chatMode').value=cfg.chatMode==='new'?'new':'same';
  $('includePrevious').checked=cfg.includePrevious!==false;
  selectMode(cfg.mode||'episodes');
  $('autoDownload').checked=!!cfg.autoDownload;
  ['editor','reply','send'].forEach(k=>$(k+'Selector').value=cfg.selectors?.[k]||'');
  updateSkillCount();
}
function updateSkillCount(){ $('skillLength').textContent=$('skill').value.length.toLocaleString('zh-CN')+' 字'; }
function notice(message,error=false){const n=$('notice');n.hidden=false;n.classList.toggle('error',error);n.textContent=message;}
function clearNotice(){$('notice').hidden=true;}
function addLog(logs, runId, msg, severity='info'){
  logs.push({at:Date.now(),runId,message:msg,severity});return logs.slice(-200);
}
const getState=()=>chrome.storage.local.get(['manjuConfig','manjuRun','manjuControl','manjuEpisodes','manjuLogs','manjuSkills','manjuSelectedSkill']);
const put=items=>chrome.storage.local.set(items);

async function targetTab(platform, openIfMissing=false, preferredId=null){
  if(preferredId!=null){
    try{
      const t=await chrome.tabs.get(preferredId);
      if(t?.url?.startsWith(urls[platform].split('/').slice(0,3).join('/')))return t;
    }catch{}
  }
  const tabs=await chrome.tabs.query({});
  const candidate=tabs.filter(t=>t.url?.startsWith(urls[platform].split('/').slice(0,3).join('/')) ||
    (platform==='chatgpt'&&t.url?.startsWith('https://chat.openai.com/')) ||
    (platform==='doubao'&&t.url?.startsWith('https://doubao.com/')));
  if(candidate.length) return candidate.find(t=>t.active) || candidate[candidate.length-1];
  if(openIfMissing) return await chrome.tabs.create({url:urls[platform],active:true});
  return null;
}
async function ping(tab,cfg){
  try {return await chrome.tabs.sendMessage(tab.id,{type:'MANJU_PING',run:{selectors:cfg.selectors}})}
  catch {
    // Inject on demand when a tab predates the extension installation or a
    // content script did not attach after navigation. Only supported sites.
    try {
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['runner.js']});
      await sleep(500);
      return await chrome.tabs.sendMessage(tab.id,{type:'MANJU_PING',run:{selectors:cfg.selectors}});
    } catch {return null;}
  }
}
async function diagnose(){
  const cfg=configFromForm();
  const out=$('diagResult');out.hidden=false;out.classList.remove('bad');
  const tab=await targetTab(cfg.platform,false);
  if(!tab){out.classList.add('bad');out.textContent=`找不到${labels[cfg.platform]}聊天标签页。请先点击“打开AI网页”，手动登录后点“检测连接”。`;return}
  const diag=await ping(tab,cfg);
  if(!diag){out.classList.add('bad');out.textContent=`未能连接网页：${String(tab.url||'未知网址')}\n可能正在加载、登录跳转或网站无法访问。请手动确认网站能打开并发送一条测试消息，然后刷新页面重试。`;return}
  const status=diag.hasEditor && diag.hasSend;
  out.classList.toggle('bad',!status);
  out.textContent=`${labels[cfg.platform]} 连接：${diag.hasEditor?'✓ 输入框可识别':'✗ 输入框未识别'}；${diag.hasSend?'✓ 发送按钮就绪':'! 发送按钮目前不可用（空输入时可能正常）'}\n页面：${diag.url}\n输入框：${diag.editorKind||'未找到'}；已输入 ${diag.editorChars} 字；回复区域 ${diag.replyCount} 条。\n${diag.hasEditor?'可以先运行1集短文本验证；发送之后若仍失败，请截图AI聊天页的输入框和发送按钮。':'请确认不是登录页、验证页或网页未完全加载。'}`;
}
async function openSite(){
  const cfg=configFromForm();
  try {
    const t=await targetTab(cfg.platform,true);
    await chrome.tabs.update(t.id,{active:true});
    await chrome.windows.update(t.windowId,{focused:true});
    notice(`已切换到 ${labels[cfg.platform]} 标签页。请先手动验证网页能够正常聊天，再回到这里点击“检测连接”或“开始自动续聊”。`);
  } catch(err) {
    notice(`无法打开${labels[cfg.platform]}：${err.message||err}。请直接在Edge地址栏输入 ${urls[cfg.platform]} 并确认网络及登录正常。`,true);
  }
}
async function start(){
  clearNotice();
  const cfg=configFromForm();
  if(cfg.mode==='rounds') {
    if(!cfg.rounds.length||cfg.rounds.some(v=>!String(v).trim())) return notice('请先填写全部轮次指令，不能有空白轮。',true);
    if(cfg.chatMode==='new' && !confirm('每一轮会打开新的聊天，会重新发送Skill，并附带上一轮输出（最多16000字）。新聊天不自动拥有旧聊天记忆。确认使用吗？'))return;
  } else if(!cfg.firstPrompt.trim() || (cfg.total>1&&!cfg.nextPrompt.trim())) return notice('请先填写首次指令和续写指令。',true);
  const existing=await getState();
  if (existing.manjuRun?.status==='running' && existing.manjuControl?.desired==='running')
    return notice('当前已经有任务在运行。请先暂停并确认网页当前回复结束，避免重复发送。',true);
  if (cfg.mode==='rounds' && !confirm(`已配置${cfg.rounds.length}轮指令（${cfg.chatMode==='new'?'每轮新聊天':'同一聊天'}），将依次自动发送并保存。确认开始吗？`))return;
  if(existing.manjuRun && (existing.manjuRun.nextEpisode>1 || Object.keys(existing.manjuEpisodes||{}).length)){
    if(!confirm('开始新任务会清空本工具当前的剧集记录。请先导出备份。确定开始新任务吗？'))return;
  }
  const tab=await targetTab(cfg.platform,false);
  if(!tab){await openSite();return notice('已尝试打开AI网页。请先手动登录并确认能正常发消息，再点“检测连接”。');}
  const ready=await ping(tab,cfg);
  if(!ready){return notice('AI网页还没有连接到扩展。请确认网页已正常打开、刷新后点击“检测连接”；如果ChatGPT无法加载，先检查网络和登录。',true)}
  if(!ready.hasEditor){return notice('已经找到AI网页，但没有识别到可用输入框。请先登录、打开一个对话，或在“高级设置”配置输入框CSS。',true)}
  const run={id:String(Date.now()),platform:cfg.platform,tabId:tab.id,nextEpisode:1,status:'running',phase:'ready',reason:'',updatedAt:Date.now()};
  await put({manjuConfig:cfg,manjuRun:run,manjuControl:{runId:run.id,desired:'running',updatedAt:Date.now()},manjuEpisodes:{},manjuLogs:addLog([],run.id,`已绑定 ${labels[cfg.platform]} 网页，准备执行${cfg.total}${cfg.mode==='rounds'?'轮':'集'}。`)});
  notice(`已开始！正在 ${labels[cfg.platform]} 中生成第1集。浏览器可最小化，但请保持AI聊天标签页开启，并避免手动切换这次任务使用的对话。`);
  try{await chrome.tabs.sendMessage(tab.id,{type:'MANJU_RUN'});}catch(e){notice('任务已保存，但无法唤醒网页。请刷新目标AI聊天网页后，再点击“继续”。',true)}
  await refresh();
}
async function pause(){
  const s=await getState(),r=s.manjuRun;
  if(!r)return;
  await put({manjuControl:{runId:r.id,desired:'paused',updatedAt:Date.now()}});
  notice('暂停请求已发送。如果AI正在回答，会先保存这集再停止；不会继续发送下一集。');
  await refresh();
}
async function resume(){
  clearNotice();
  let s=await getState(),r=s.manjuRun;
  if(!r)return;
  if(r.status==='finished')return notice('当前项目已完成。',false);
  const cfg=s.manjuConfig;
  const tab=await targetTab(cfg.platform,false,r.tabId);
  if(!tab)return notice('找不到目标AI聊天标签页，请先打开该AI网页、登录并切换到原聊天，再点击继续。',true);
  const ready=await ping(tab,cfg);
  if(!ready || !ready.hasEditor) return notice('没有检测到有效AI输入框。请打开AI聊天网页刷新后再试。',true);
  if(r.phase==='waiting' && r.tabId !== tab.id && !/没有检测到可用的发送按钮|内容未自动提交/.test(r.reason||'')) {
    if(!confirm('当前任务可能已经发送过这一集。换了聊天标签页后继续监听可能无法识别旧回复。建议先核对网页，确定继续吗？')) return;
  }
  // 兼容 v0.1 遗留的“已填入但未发送”错误；此时绝不能继续等待一条不存在的回复。
  const legacyNotSent = r.status==='error' && r.sentAt == null && (/没有检测到可用的发送按钮|内容未自动提交|发送控件未就绪|文字已填入/.test(r.reason||'') || r.phase==='ready');
  if (r.phase==='submitting') return notice('上一条发送结果不明确，请先核对网页，确认未发送后使用“重试当前集”，或用“手动存档”保存已有回复。',true);
  const needsFreshChat=r.phase==='navigating';
  if (needsFreshChat && cfg.mode==='rounds' && cfg.chatMode==='new' && !confirm('上次切换新聊天时中断。现在会重新打开一个空白聊天，再继续发送；确认吗？'))return;
  const freshAfterManual=cfg.mode==='rounds' && cfg.chatMode==='new' && r.phase==='ready' && r.nextEpisode>1;
  if (freshAfterManual && !confirm('下一轮将进入新聊天，并重新发送Skill和上一轮上下文。确认继续吗？'))return;
  r={...r,tabId:tab.id,status:'running',phase:legacyNotSent?'ready':r.phase,reason:'',updatedAt:Date.now()};
  await put({manjuRun:r,manjuControl:{runId:r.id,desired:'running',updatedAt:Date.now()}});
  if ((needsFreshChat || freshAfterManual) && cfg.mode==='rounds' && cfg.chatMode==='new') {
    await put({manjuRun:{...r,phase:'navigating'}});
    await chrome.tabs.update(tab.id,{url:urls[cfg.platform]});
  } else {
    await chrome.tabs.sendMessage(tab.id,{type:'MANJU_RUN'}).catch(()=>{});
  }
  notice(`正在从第${r.nextEpisode}集恢复。已完成的内容不会重新生成。`);
  await refresh();
}
async function retry(){
  const s=await getState(),r=s.manjuRun;
  if(!r || r.status==='finished')return;
  if(!confirm(`确定重新发送第${r.nextEpisode}集吗？\n如果AI网页已经收到过这条指令，可能会出现重复回答。请先核对聊天窗口。`))return;
  const cfg=s.manjuConfig;
  const t=await targetTab(cfg.platform,false,r.tabId);
  if(!t){return notice('请先打开对应AI聊天网页。',true)}
  const ready=await ping(t,cfg);
  if(!ready?.hasEditor)return notice('网页输入框未就绪，请先登录并刷新AI网页。',true);
  const run={...r,tabId:t.id,status:'running',phase:'ready',reason:'',baseline:null,sentAt:null};
  await put({manjuRun:run,manjuControl:{runId:r.id,desired:'running',updatedAt:Date.now()},manjuLogs:addLog(s.manjuLogs||[],r.id,`手动要求重试第${r.nextEpisode}集。`,'warn')});
  await chrome.tabs.sendMessage(t.id,{type:'MANJU_RUN'}).catch(()=>{});
  await refresh();
}
async function skip(){
  const s=await getState(),r=s.manjuRun,cfg=s.manjuConfig;
  if(!r||r.status==='finished')return;
  if(s.manjuControl?.desired==='running')return notice('请先暂停任务并确认当前集不再自动写入，然后才能跳过。',true);
  if(!confirm(`确定跳过第${r.nextEpisode}集吗？跳过可能导致后续剧情缺少关键内容。`))return;
  const episodes={...s.manjuEpisodes,[String(r.nextEpisode)]:{episode:r.nextEpisode,content:'',status:'skipped',at:Date.now(),platform:cfg.platform}};
  const next=r.nextEpisode+1;
  await put({manjuEpisodes:episodes,manjuRun:{...r,nextEpisode:next,phase:'ready',status:next>cfg.total?'finished':'paused'},manjuLogs:addLog(s.manjuLogs||[],r.id,`已人工跳过第${r.nextEpisode}集。`,'warn')});
  await refresh();
}
function downloadText(file,content,mime='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function exportBackup(){
  const s=await getState();
  const backup={type:'MANJU_BACKUP_V1',exportedAt:new Date().toISOString(),config:s.manjuConfig||configFromForm(),run:s.manjuRun||null,episodes:s.manjuEpisodes||{},logs:s.manjuLogs||[],skills:s.manjuSkills||[],selectedSkill:s.manjuSelectedSkill||''};
  downloadText(`AI自动续聊备份_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2),'application/json;charset=utf-8');
  notice('完整备份已导出。包括已保存剧集、任务配置和日志，请妥善保管。');
}
async function exportAll(){
  const s=await getState(),eps=Object.values(s.manjuEpisodes||{}).filter(x=>x.status==='done').sort((a,b)=>a.episode-b.episode);
  if(!eps.length)return notice('还没有已完成的剧集可导出。',true);
  downloadText(`${(s.manjuConfig?.projectName||'AI漫剧').replace(/[\\/:*?"<>|]/g,'_')}_全部${eps.length}集.txt`,eps.map(e=>`第${e.episode}集\n\n${e.content}`).join('\n\n'+ '─'.repeat(45)+'\n\n'));
}
async function importBackup(file){
  try{
    const data=JSON.parse(await file.text());
    if(data.type!=='MANJU_BACKUP_V1'||!data.episodes||typeof data.episodes!=='object'||!data.config) throw Error('不是本工具导出的有效备份文件。');
    if(!confirm('导入会替换本地当前任务与已存档内容。确定导入吗？'))return;
    const original=data.run;
    const run=original ? {...original,status:original.status==='finished'?'finished':'paused',reason:'从备份恢复，请先打开原聊天网页，核对后点击继续。',tabId:null} : null;
    skillLibrary=Array.isArray(data.skills)?data.skills:skillLibrary;
    selectedSkillId=data.selectedSkill||'';
    await put({manjuConfig:data.config,manjuRun:run,manjuControl:{runId:run?.id||'',desired:'paused',updatedAt:Date.now()},manjuEpisodes:data.episodes,manjuLogs:Array.isArray(data.logs)?data.logs.slice(-200):[],manjuSkills:skillLibrary,manjuSelectedSkill:selectedSkillId});
    renderSkillLibrary();
    fillForm(data.config);notice('导入成功！已恢复已保存内容。运行状态保持暂停，需要你在AI网页打开原聊天后手动继续。');await refresh();
  }catch(e){notice('导入失败：'+e.message,true)}
}
async function zipEntries(buffer){
  const dv=new DataView(buffer);const u8=new Uint8Array(buffer);let end=-1;
  for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65558);i--){if(dv.getUint32(i,true)===0x06054b50){end=i;break}}
  if(end<0)throw Error('ZIP 文件结构不完整。');
  let p=dv.getUint32(end+16,true),n=dv.getUint16(end+10,true),items=[];
  const dec=new TextDecoder('utf-8');
  for(let i=0;i<n && i<300;i++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const method=dv.getUint16(p+10,true),size=dv.getUint32(p+20,true),len=dv.getUint16(p+28,true),ex=dv.getUint16(p+30,true),comment=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true),name=dec.decode(u8.slice(p+46,p+46+len));
    p+=46+len+ex+comment;
    if(!/\.(md|markdown|txt)$/i.test(name)||size>2_000_000||/\/node_modules\//i.test(name))continue;
    if(dv.getUint32(off,true)!==0x04034b50)continue;
    const start=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),raw=u8.slice(start,start+size);
    let bytes;
    if(method===0)bytes=raw;
    else if(method===8)bytes=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    items.push({name,text:dec.decode(bytes)});
  }
  return items;
}
async function readSkill(file){
  const name=file.name.toLowerCase();
  if(name.endsWith('.zip')){
    const parts=await zipEntries(await file.arrayBuffer());
    if(!parts.length)throw Error('ZIP 包中没有发现可读取的 .md 或 .txt 文件。');
    const primary=parts.filter(p=>/(^|\/)skill\.md$/i.test(p.name));
    const chosen=primary.length ? primary.concat(parts.filter(p=>p!==primary[0] && !/readme/i.test(p.name))) : parts;
    return chosen.map(p=>`# 文件：${p.name}\n\n${p.text}`).join('\n\n---\n\n');
  }
  if(name.endsWith('.docx')){
    const buf=await file.arrayBuffer();
    // docx 也是 ZIP，解析其中的 word/document.xml 文件。
    const dv=new DataView(buf),bytes=new Uint8Array(buf);let end=-1;
    for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65558);i--){if(dv.getUint32(i,true)===0x06054b50){end=i;break}}
    if(end<0)throw Error('DOCX 文件结构无效。');
    let p=dv.getUint32(end+16,true),n=dv.getUint16(end+10,true),xml='';
    for(let i=0;i<n&&i<2000;i++){
      if(dv.getUint32(p,true)!==0x02014b50)break;
      const method=dv.getUint16(p+10,true),size=dv.getUint32(p+20,true),len=dv.getUint16(p+28,true),ex=dv.getUint16(p+30,true),co=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
      const entry=new TextDecoder().decode(bytes.slice(p+46,p+46+len));p+=46+len+ex+co;
      if(entry!=='word/document.xml')continue;
      const start=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),raw=bytes.slice(start,start+size);
      const result=method===0?raw:new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      xml=new TextDecoder().decode(result);break;
    }
    if(!xml)throw Error('DOCX 中没有找到正文。');
    return xml.replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<\/w:p>/g,'\n').replace(/<w:br\b[^>]*\/>/g,'\n').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
  }
  return await file.text();
}
async function onSkillFile(file){
  if(!file)return;
  try{
    const text=await readSkill(file);
    if(!text.trim())throw Error('文件没有可读取的文本。');
    if(text.length>150000&&!confirm(`这个Skill有${text.length}个字，目标AI网页可能无法一次提交。仍然导入吗？`))return;
    await saveSkillToLibrary(file.name,text);
    updateSkillCount();saveDraftSoon();notice(`已保存到Skill文件库：${file.name}，共${text.length}字。后续可以下拉选择，无需反复上传。`);
  }catch(e){notice('读取Skill失败：'+e.message,true)}
}
function showEpisode(number){
  const eps=lastState?.manjuEpisodes||{},ep=eps[String(number)];
  if(!ep)return;
  selectedEpisode=number;manualMode=false;
  $('modalTitle').textContent=`第${number}集 · ${ep.status==='skipped'?'已跳过':'已保存'}`;
  $('modalText').readOnly=true;$('modalText').value=ep.content||'(此集已跳过)';$('saveManual').hidden=true;
  $('downloadOne').hidden=ep.status!=='done';$('modal').hidden=false;
}
async function showManual(){
  const s=await getState(),r=s.manjuRun;
  if(!r)return;
  if(s.manjuControl?.desired==='running')return notice('请先暂停自动任务，再手动保存内容。',true);
  selectedEpisode=r.nextEpisode;manualMode=true;
  $('modalTitle').textContent=`手动粘贴并保存第${selectedEpisode}集`;
  $('modalText').readOnly=false;$('modalText').placeholder='把AI网页中生成的整集内容复制到这里';$('modalText').value='';
  $('saveManual').hidden=false;$('downloadOne').hidden=true;$('modal').hidden=false;
}
async function saveManualEpisode(){
  const text=$('modalText').value.trim();if(text.length<10)return notice('手动保存内容不足10字。',true);
  const s=await getState(),r=s.manjuRun,cfg=s.manjuConfig;
  if(!r||r.nextEpisode!==selectedEpisode)return notice('任务集数已发生变化，请关闭窗口刷新。',true);
  const episodes={...s.manjuEpisodes,[String(selectedEpisode)]:{episode:selectedEpisode,content:text,at:Date.now(),status:'done',platform:cfg.platform,prompt:'（手动存档）'}};
  const next=selectedEpisode+1;
  await put({manjuEpisodes:episodes,manjuRun:{...r,nextEpisode:next,phase:'ready',status:next>cfg.total?'finished':'paused',reason:''},manjuControl:{runId:r.id,desired:'paused',updatedAt:Date.now()},manjuLogs:addLog(s.manjuLogs||[],r.id,`第${selectedEpisode}集：人工保存${text.length}字。`,'success')});
  $('modal').hidden=true;notice(`第${selectedEpisode}集已保存。点击“继续”可生成第${next}集。`);await refresh();
}
async function runDemo(){
  if(demoInProgress)return;
  const s=await getState();
  if(s.manjuRun&&Object.keys(s.manjuEpisodes||{}).length&&!confirm('模拟演示会替换当前保存的任务记录。建议先导出备份。确定继续吗？'))return;
  demoInProgress=true;clearNotice();
  const cfg={...configFromForm(),platform:'demo',platformLabel:'本地模拟',total:3,autoDownload:false};
  const run={id:'demo-'+Date.now(),platform:'demo',tabId:null,nextEpisode:1,status:'running',phase:'waiting',updatedAt:Date.now()};
  await put({manjuConfig:cfg,manjuRun:run,manjuControl:{runId:run.id,desired:'running',updatedAt:Date.now()},manjuEpisodes:{},manjuLogs:addLog([],run.id,'开始三集模拟演示（不会连接或调用任何AI）。')});
  notice('模拟演示已开始：这会用示例文字演示“等待→存档→续写”。它不会调用真实AI。');await refresh();
  for(let ep=1;ep<=3;ep++){
    await sleep(1400);
    const c=await getState();
    if(c.manjuControl?.desired!=='running'||c.manjuRun?.id!==run.id){demoInProgress=false;return}
    const text=`第${ep}集｜模拟生成结果\n\n这里是用于演示自动续聊和保存功能的示例文字，不是AI模型生成的小说。\n\n当前演示：已完成第${ep}集。系统自动保存全文，并将下一集标为等待执行。正式运行时，内容来自你已经登录的ChatGPT、Gemini或豆包网页。`;
    const episodes={...c.manjuEpisodes,[String(ep)]:{episode:ep,content:text,at:Date.now(),status:'done',platform:'demo'}};
    const status=ep===3?'finished':'running';
    await put({manjuEpisodes:episodes,manjuRun:{...c.manjuRun,nextEpisode:ep+1,status,phase:'waiting'},manjuLogs:addLog(c.manjuLogs||[],run.id,`模拟第${ep}集已保存。`,'success')});
    await refresh();
  }
  demoInProgress=false;notice('三集模拟演示完成 ✅ 你可以点击右侧剧集查看、导出TXT。现在选择真实AI平台并开始新任务。');
}
function timeText(ms){return new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
function render(state){
  lastState=state;
  const r=state.manjuRun,cfg=state.manjuConfig||configFromForm(),eps=state.manjuEpisodes||{};
  const completed=Object.values(eps).filter(v=>v.status==='done').length;
  const total=Number(cfg.total)||30,pct=Math.round(100*completed/total),unit=cfg.mode==='rounds'?'轮':'集';
  const status=r?.status||'idle',desired=state.manjuControl?.desired;
  const actual=status==='running'&&desired==='paused'?'pausing':status;
  const names={idle:'未开始',running:'自动运行中',pausing:'暂停中',paused:'已暂停',finished:'已完成',error:'需要处理'};
  $('statusBadge').className='status '+(actual==='pausing'?'paused':actual);
  $('statusBadge').lastChild.textContent=names[actual]||status;
  $('countDone').textContent=completed;$('countTarget').textContent='/ '+total+' '+unit;$('percentage').textContent=pct+'%';$('progressBar').style.width=pct+'%';
  if(!r){$('currentTitle').textContent='还没有任务在运行';$('currentDesc').textContent='设置好后，点击“开始自动续聊”';}
  else if(status==='finished'){$('currentTitle').textContent='全部任务结束';$('currentDesc').textContent=`已完成${completed}${unit}，可以导出TXT合集。`;}
  else {$('currentTitle').textContent=`第 ${r.nextEpisode} ${unit} · ${actual==='running'?'正在执行':actual==='pausing'?'将在本集结束后暂停':actual==='error'?'执行失败':'待继续'}`;
    $('currentDesc').textContent=r.reason||({waiting:'正在等待AI网页回复完成…',ready:'等待发送下一集…'}[r.phase]||'随时可以继续运行');}
  $('startBtn').disabled=actual==='running'||actual==='pausing';
  $('pauseBtn').disabled=!r||actual!=='running';
  $('resumeBtn').disabled=!r||!['paused','error','pausing'].includes(actual)||status==='finished'||cfg.platform==='demo';
  $('retryBtn').disabled=!r||!['paused','error'].includes(actual)||cfg.platform==='demo';
  $('skipBtn').disabled=!r||!['paused','error'].includes(actual)||cfg.platform==='demo';
  $('manualBtn').disabled=!r||!['paused','error'].includes(actual)||cfg.platform==='demo';
  const list=$('episodeList');list.replaceChildren();
  const arr=Object.values(eps).sort((a,b)=>a.episode-b.episode);
  if(!arr.length){const empty=document.createElement('p');empty.className='empty';empty.innerHTML='还没有保存的剧集。<br/>每生成一集，会自动出现在这里。';list.append(empty)}
  else for(const ep of arr){
    const b=document.createElement('div');b.className='episode';b.setAttribute('role','button');b.tabIndex=0;
    const info=document.createElement('div');info.className='episode-info';
    const strong=document.createElement('strong');strong.textContent=`第 ${String(ep.episode).padStart(2,'0')} ${unit}`;
    const caption=document.createElement('span');caption.textContent=ep.status==='done'?`${ep.content?.length||0} 字 · ${timeText(ep.at)}`:'已跳过';
    info.append(strong,caption);const mark=document.createElement('span');mark.className='doneicon';mark.textContent=ep.status==='done'?'✓':'—';b.append(info,mark);
    b.addEventListener('click',()=>showEpisode(ep.episode));b.addEventListener('keydown',e=>{if(e.key==='Enter')showEpisode(ep.episode)});list.append(b);
  }
  const logs=$('logs');logs.replaceChildren();
  for(const log of (state.manjuLogs||[]).slice(-25).reverse()){
    const d=document.createElement('div');d.className='log-row '+(log.severity||'info');
    const span=document.createElement('span');span.textContent=timeText(log.at);d.append(span,document.createTextNode(log.message));logs.append(d);
  }
  if(!(state.manjuLogs||[]).length){const e=document.createElement('p');e.className='empty';e.textContent='还没有运行日志';logs.append(e)}
}
async function refresh(){try{render(await getState())}catch(e){console.error('读取数据失败',e)}}
function saveDraftSoon(){
  updateSkillCount();clearTimeout(draftTimer);
  draftTimer=setTimeout(async()=>{
    const s=await getState();
    if(s.manjuRun?.status==='running'&&s.manjuControl?.desired==='running')return;
    await put({manjuConfig:configFromForm()});
  },500);
}
async function init(){
  const state=await getState();
  skillLibrary=Array.isArray(state.manjuSkills)?state.manjuSkills:[];
  selectedSkillId=state.manjuSelectedSkill||state.manjuConfig?.skillId||'';
  // 迁移旧版v0.3技能文本至可选文件库，不会丢失原规则。
  if (!skillLibrary.length && String(state.manjuConfig?.skill||'').trim()) {
    const legacy={id:'legacy-'+Date.now(),name:'旧版本导入的Skill',content:state.manjuConfig.skill,at:Date.now()};
    skillLibrary=[legacy];selectedSkillId=legacy.id;
    await put({manjuSkills:skillLibrary,manjuSelectedSkill:selectedSkillId});
  }
  renderSkillLibrary();renderRounds();
  if(state.manjuConfig)fillForm(state.manjuConfig);
  renderSkillLibrary();
  if(selectedSkillId){const chosen=skillLibrary.find(x=>x.id===selectedSkillId);if(chosen){$('skill').value=chosen.content;updateSkillCount();}}
  render(state);
  // 浏览器关闭、电脑重启后，旧标签页ID可能失效；改为暂停，用户核对网页后才能恢复。
  if(state.manjuRun?.status==='running' && state.manjuRun.platform!=='demo') {
    let target=null;
    try { target=await chrome.tabs.get(state.manjuRun.tabId); } catch {}
    if (!target || !String(target.url||'').startsWith(urls[state.manjuRun.platform].split('/').slice(0,3).join('/'))) {
      const r={...state.manjuRun,status:'paused',reason:'原AI标签页已失效。请打开原聊天，核对已生成内容后再点击继续。'};
      await put({manjuRun:r,manjuControl:{runId:r.id,desired:'paused',updatedAt:Date.now()}});
      notice('检测到上次任务中断。已安全暂停，已保存的剧集仍在。请先打开原聊天网页，核对当前集后点击继续。');
    }
  }
  if(state.manjuRun?.platform==='demo'&&state.manjuRun.status==='running') {
    const run={...state.manjuRun,status:'paused',reason:'演示在控制台关闭后暂停，请重新点击模拟演示。'};
    await put({manjuRun:run,manjuControl:{runId:run.id,desired:'paused',updatedAt:Date.now()}});
  }
  draftFields.forEach(id=>$(id).addEventListener(['autoDownload','chatMode','includePrevious'].includes(id)?'change':'input',saveDraftSoon));
  document.querySelectorAll('.platform-btn').forEach(el=>el.addEventListener('click',()=>selectPlatform(el.dataset.platform,true)));
  document.querySelectorAll('.mode-tab').forEach(el=>el.addEventListener('click',()=>selectMode(el.dataset.mode)));
  $('addRound').addEventListener('click',()=>{if(rounds.length>=10)return;rounds.push('');renderRounds();saveDraftSoon();});
  $('skillChoice').addEventListener('change',e=>chooseSkill(e.target.value));
  $('saveSkill').addEventListener('click',async()=>{
    const content=$('skill').value.trim();if(!content)return notice('请先填写或导入Skill内容。',true);
    const name=prompt('给这个Skill取个名字，例如：AI漫剧A+B融合','我的创作Skill');
    if(name===null)return;
    try{await saveSkillToLibrary(name.trim()||'我的创作Skill',content);notice('已保存到Skill库，以后可以直接下拉选取。');}catch(e){notice(e.message,true)}
  });
  $('deleteSkill').addEventListener('click',async()=>{
    if(!selectedSkillId)return notice('没有选中的Skill。',true);
    const item=skillLibrary.find(x=>x.id===selectedSkillId);
    if(!confirm(`删除Skill“${item?.name||''}”？已发送或存档的内容不会删除。`))return;
    skillLibrary=skillLibrary.filter(x=>x.id!==selectedSkillId);selectedSkillId='';
    await put({manjuSkills:skillLibrary,manjuSelectedSkill:''});renderSkillLibrary();await chooseSkill('');
  });
  $('skillFile').addEventListener('change',e=>onSkillFile(e.target.files[0]));
  $('startBtn').addEventListener('click',start);
  $('openSiteBtn').addEventListener('click',openSite);
  $('diagnoseBtn').addEventListener('click',diagnose);
  $('pauseBtn').addEventListener('click',pause);
  $('resumeBtn').addEventListener('click',resume);
  $('retryBtn').addEventListener('click',retry);
  $('skipBtn').addEventListener('click',skip);
  $('manualBtn').addEventListener('click',showManual);
  $('demoBtn').addEventListener('click',runDemo);
  $('downloadAll').addEventListener('click',exportAll);
  $('exportBackup').addEventListener('click',exportBackup);
  $('importBackup').addEventListener('click',()=>$('backupFile').click());
  $('backupFile').addEventListener('change',e=>importBackup(e.target.files[0]));
  $('closeModal').addEventListener('click',()=>$('modal').hidden=true);
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').hidden=true});
  $('downloadOne').addEventListener('click',()=>{const e=lastState?.manjuEpisodes?.[String(selectedEpisode)];if(e?.content)downloadText(`第${String(selectedEpisode).padStart(2,'0')}集.txt`,e.content)});
  $('saveManual').addEventListener('click',saveManualEpisode);
  chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')refresh()});
  setInterval(refresh,1600);
  await refresh();
}
init().catch(e=>notice('程序初始化失败：'+e.message,true));
