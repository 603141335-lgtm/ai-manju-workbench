'use strict';
const PLATFORMS=['chatgpt','gemini','doubao','deepseek'];
const BASE_LABEL={chatgpt:'ChatGPT',gemini:'Google Gemini',doubao:'豆包',deepseek:'DeepSeek'};
const platformOf=i=>String(i||'').split('-')[0];
const instanceLetter=i=>String(i||'').split('-').slice(1).join('-')||'A';
const instanceName=i=>BASE_LABEL[platformOf(i)]+' · 任务'+instanceLetter(i);
const LABEL=new Proxy(BASE_LABEL,{get:(o,k)=>o[k]||instanceName(String(k))});
const BASE_HOME={chatgpt:'https://chatgpt.com/',gemini:'https://gemini.google.com/app',doubao:'https://www.doubao.com/chat/',deepseek:'https://chat.deepseek.com/'};
const HOME=new Proxy(BASE_HOME,{get:(o,k)=>o[k]||o[platformOf(k)]});
const BASE_ICON={chatgpt:'✺',gemini:'✦',doubao:'豆',deepseek:'◈'};
const ICON=new Proxy(BASE_ICON,{get:(o,k)=>o[k]||o[platformOf(k)]});
const STATUS={running:'运行中',queued:'排队中',paused:'已暂停',error:'需要处理',finished:'已完成',idle:'未开始'};
const $=id=>document.getElementById(id);
const K=(p,t)=>`aac9:instance:${p}:${t}`;
const INDEX='aac9:index', BINDINGS='aac9:bindings', ENABLED='aac9:enabled';
const ids=()=>instances.slice();
const MAX_CONCURRENT=3;
let instances=PLATFORMS.map(p=>p+'-A'),bindings={},concurrencyLimit=MAX_CONCURRENT;
const formatDate=t=>t?new Date(t).toLocaleTimeString('zh-CN',{hour12:false}):'—';
const number=(x,min,max,fallback)=>Math.max(min,Math.min(max,Number(x)||fallback));
const nap=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let selected='chatgpt-A';
let enabled=new Set(PLATFORMS.map(p=>p+'-A'));
let updating=false;
let drafts={},snapshots={},pickedResult=null,draftTimers=new Map(),busy=false;
let imagePreviewUrls=[];const historyKey=p=>`aac9:history:${p}`;const archiveKey=id=>`aac9:archive:${id}`;

function defaultCfg(p){return {
  platform:platformOf(p),projectName:'我的30集小说',mode:'episodes',
  firstPrompt:'请生成小说第1集。保留完整剧情、人物行为和必要台词，保证前后连续。',
  nextPrompt:'请根据上一集剧情，继续生成第{集数}集。保持人物设定、剧情和台词连续，直接输出完整正文，不压缩或跳过重要情节。',
  total:30,rounds:['请生成小说大纲，保留所有关键剧情和人物关系。','请根据上一轮内容整理人物设定。','请继续完成下一阶段内容，保证前后连贯。'],
  chatMode:'same',includePrevious:true,autoDownload:false,modelChoice:'auto',workMode:'auto',modelLock:false,modelOptions:[],newTaskNewChat:true,images:{first:[],next:[],rounds:[]},nextImagesEvery:true,
  quietSeconds:8,timeoutMinutes:12,selectors:{editor:'',send:'',reply:''}
};}
function scrubOldConfig(cfg,p){
  const def=defaultCfg(p),safe={...def};
  const allow=['projectName','mode','firstPrompt','nextPrompt','total','rounds','chatMode','includePrevious','autoDownload','modelChoice','workMode','modelLock','modelOptions','newTaskNewChat','images','nextImagesEvery','quietSeconds','timeoutMinutes','selectors'];
  for(const field of allow)if(cfg?.[field]!==undefined)safe[field]=cfg[field];
  safe.platform=platformOf(p);
  safe.images={first:Array.isArray(safe.images?.first)?[...safe.images.first]:[],next:Array.isArray(safe.images?.next)?[...safe.images.next]:[],rounds:Array.isArray(safe.images?.rounds)?safe.images.rounds.map(a=>Array.isArray(a)?[...a]:[]):[]};
  safe.modelOptions=Array.isArray(safe.modelOptions)?safe.modelOptions:[];
  if(!Array.isArray(safe.rounds)||!safe.rounds.length)safe.rounds=def.rounds;
  safe.rounds=safe.rounds.slice(0,30).map(s=>String(s));
  safe.total=number(safe.mode==='rounds'?safe.rounds.length:safe.total,1,300,30);
  safe.selectors={editor:String(safe.selectors?.editor||''),send:String(safe.selectors?.send||''),reply:String(safe.selectors?.reply||'')};
  if(safe.firstPrompt?.startsWith('请严格按照上面的')&&safe.firstPrompt.includes('创作规则，生成小说第1集。')&&safe.firstPrompt.includes('保证前后连续。'))safe.firstPrompt=def.firstPrompt;
  if(safe.nextPrompt?.startsWith('请根据上一集剧情，')&&safe.nextPrompt.includes('严格遵守最初的')&&safe.nextPrompt.includes('规则'))safe.nextPrompt=def.nextPrompt;
  return safe;
}
function stateKeys(){return instances.flatMap(i=>['cfg','run','control','results','logs'].map(t=>K(i,t))).concat([ENABLED,INDEX,BINDINGS,'aac9:concurrency']);}
async function readAll(){
  const d=await chrome.storage.local.get(stateKeys());
  const out={};for(const i of instances)out[i]={cfg:d[K(i,'cfg')]||defaultCfg(i),run:d[K(i,'run')]||null,control:d[K(i,'control')]||null,results:d[K(i,'results')]||{},logs:d[K(i,'logs')]||[]};
  return {platforms:out,enabled:d[ENABLED],bindings:d[BINDINGS]||{},concurrency:MAX_CONCURRENT};
}
async function migrate(){
 const existing=await chrome.storage.local.get([INDEX,ENABLED,BINDINGS,'aac9:concurrency']);
 if(Array.isArray(existing[INDEX])&&existing[INDEX].length){
   instances=existing[INDEX];bindings=existing[BINDINGS]||{};
   concurrencyLimit=MAX_CONCURRENT;await chrome.storage.local.set({'aac9:concurrency':MAX_CONCURRENT});return;
 }
 const prior=await chrome.storage.local.get([...PLATFORMS.flatMap(p=>['cfg','run','control','results','logs'].map(t=>`aac7:${p}:${t}`)), ENABLED]);
 const write={[INDEX]:instances.slice(),[ENABLED]:(prior['aac7:enabled']||PLATFORMS).map(p=>p+'-A'),[BINDINGS]:{},'aac9:concurrency':MAX_CONCURRENT};
 for(const p of PLATFORMS){
   const i=p+'-A',old=t=>prior[`aac7:${p}:${t}`];
   write[K(i,'cfg')]=scrubOldConfig(old('cfg')||defaultCfg(i),i);
   write[K(i,'results')]=old('results')||{};
   write[K(i,'logs')]=old('logs')||[];
   const r=old('run');
   if(r){
     const m={...r,instanceId:i,platform:p, status:r.status==='finished'?'finished':'paused',
       phase:r.phase==='waiting'||r.phase==='submitting'?'submitting':r.phase,
       reason:r.status==='finished'?'': '从v0.8迁移，需核对原聊天发送状态后才可继续。',updatedAt:Date.now()};
     write[K(i,'run')]=m;
     write[K(i,'control')]={runId:m.id,desired:'paused',updatedAt:Date.now()};
     // Only inherit an old tab if still open; binding is checked in initData.
     if(Number.isInteger(r.tabId))write[BINDINGS][String(r.tabId)]=i;
   }
   const history=(await chrome.storage.local.get(`aac8:history:${p}`))[`aac8:history:${p}`]||[];
   write[historyKey(i)]=history;
   for(const h of history){const oldRec=(await chrome.storage.local.get(`aac8:archive:${h.id}`))[`aac8:archive:${h.id}`];if(oldRec)write[archiveKey(h.id)]=oldRec;}
 }
 await chrome.storage.local.set(write);
 bindings=write[BINDINGS];
}

function alertMessage(text,bad=false){const el=$('notice');el.hidden=false;el.textContent=text;el.classList.toggle('bad',bad);}
function dismiss(){ $('notice').hidden=true; }
function labelStatus(s){return STATUS[s]||STATUS.idle;}
function clsStatus(s){return s&&STATUS[s]?s:'idle';}
function effectiveStatus(x){if(x?.run?.status==='running'&&x?.control?.desired==='paused')return 'paused';if(x?.run?.status==='queued'&&x?.control?.desired==='paused')return 'paused';return x?.run?.status||'idle';}
function isLive(x){return x?.run?.status==='running'&&x?.control?.desired==='running';}
function liveCount(except=null){return instances.filter(i=>i!==except&&isLive(snapshots[i])).length;}
function configFromForm(){
  const p=selected;
  const cfg={...defaultCfg(p),...(drafts[p]||{})};
  cfg.platform=platformOf(p);cfg.projectName=$('projectName').value.trim()||'我的小说';cfg.mode=$('mode').value;
  cfg.firstPrompt=$('firstPrompt').value;cfg.nextPrompt=$('nextPrompt').value;
  cfg.total=cfg.mode==='rounds'?cfg.rounds.length:number($('total').value,1,300,30);
  cfg.chatMode=$('chatMode').value;cfg.includePrevious=$('includePrevious').checked;cfg.autoDownload=$('autoDownload').checked;
  cfg.modelChoice=$('modelChoice').value;cfg.workMode=$('workMode').value;cfg.modelLock=$('modelLock').checked;cfg.newTaskNewChat=$('newTaskNewChat').checked;cfg.nextImagesEvery=$('nextImagesEvery').checked;
  cfg.quietSeconds=number($('quietSeconds').value,5,60,8);cfg.timeoutMinutes=number($('timeoutMinutes').value,1,120,12);
  cfg.selectors={editor:$('editorSelector').value.trim(),send:$('sendSelector').value.trim(),reply:$('replySelector').value.trim()};
  return cfg;
}
function modeOptions(p){
  const m={chatgpt:['普通聊天','Work'],gemini:['对话','任务'],doubao:['对话','工作'],deepseek:['快速','专家','深度思考','联网搜索']};
  return m[platformOf(p)]||[];
}
function setSelect(el,items,current='auto'){
  el.replaceChildren();
  for(const item of items){const x=document.createElement('option');x.value=item.value;x.textContent=item.label;x.disabled=!!item.disabled;el.append(x);}
  if(!items.some(x=>x.value===current)&&current!=='auto'){
    const x=document.createElement('option');x.value=current;x.textContent=current+'（上次所选，待网页复核）';x.disabled=true;el.append(x);
  }
  el.value=current;
}
function updateModeView(){const isRounds=$('mode').value==='rounds';$('episodeFields').hidden=isRounds;$('roundFields').hidden=!isRounds;$('total').disabled=isRounds;$('totalLabel').textContent=isRounds?'指令轮数（自动）':'生成集数';$('total').value=isRounds?drafts[selected].rounds.length:$('total').value;}
function renderRounds(){const wrap=$('roundList');wrap.replaceChildren();const list=drafts[selected].rounds;
  list.forEach((str,i)=>{
    const card=document.createElement('div');card.className='round-card';
    const row=document.createElement('div');row.className='round-title';
    const title=document.createElement('b');title.textContent=`第 ${i+1} 轮`;
    const remove=document.createElement('button');remove.className='btn btn-sm';remove.type='button';remove.textContent='删除';remove.disabled=list.length<=1;
    remove.onclick=()=>{if(list.length<=1)return;list.splice(i,1);drafts[selected].images.rounds.splice(i,1);renderRounds();scheduleSave(selected);};
    const ta=document.createElement('textarea');ta.rows=3;ta.value=str;ta.placeholder='这轮发送给 AI 的完整指令';
    ta.oninput=()=>{list[i]=ta.value;scheduleSave(selected);};
    const media=document.createElement('div');media.className='round-media';
    row.append(title,remove);card.append(row,ta,media);wrap.append(card);renderImageWidget(media,'round',i);
  });
  $('total').value=list.length;
  $('addRound').disabled=list.length>=30;
}
function clearImagePreviewUrls(){for(const u of imagePreviewUrls)URL.revokeObjectURL(u);imagePreviewUrls=[];}
function getImageIds(role,index){const m=drafts[selected].images||={first:[],next:[],rounds:[]};return role==='round'?(m.rounds[index]||[]):(m[role]||[]);}
function setImageIds(role,index,items){const m=drafts[selected].images||(drafts[selected].images={first:[],next:[],rounds:[]});if(role==='round')m.rounds[index]=items;else m[role]=items;scheduleSave(selected);}
async function renderImageWidget(root,role,index=0){
 const key=selected,drop=document.createElement('div');drop.className='image-drop';
 const bar=document.createElement('div');bar.className='image-bar';
 const add=document.createElement('button');add.type='button';add.className='image-add';add.textContent='＋ 图片';
 const hint=document.createElement('span');hint.className='image-hint';hint.textContent='拖入图片或点击选择 · 最多6张/轮 · 单张4MB';
 bar.append(add,hint);const thumbs=document.createElement('div');thumbs.className='image-thumbs';drop.append(bar,thumbs);
 const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.hidden=true;drop.append(input);
 add.onclick=()=>input.click();
 const populate=async()=>{
   if(selected!==key||!root.isConnected)return;
   thumbs.replaceChildren();const ids=getImageIds(role,index);
   for(const id of ids){try{
     const x=await ImageStore.get(id);if(!x)continue;
     const node=document.createElement('div');node.className='image-thumb';const im=document.createElement('img');const url=URL.createObjectURL(x.blob);imagePreviewUrls.push(url);im.src=url;im.alt=x.name;
     const name=document.createElement('small');name.title=x.name;name.textContent=x.name;
     const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='移除本轮关联';remove.onclick=()=>{setImageIds(role,index,getImageIds(role,index).filter(v=>v!==id));populate();};
     node.append(im,name,remove);thumbs.append(node);
   }catch(err){console.warn('[AAC8] image preview',err)}};
   hint.textContent=`已选 ${ids.length}/6 张 · 直接拖到这里`;
 };
 async function addFiles(files){
   const list=[...files].filter(x=>['image/jpeg','image/png','image/webp'].includes(x.type));
   const prev=getImageIds(role,index).slice();
   if(prev.length+list.length>6){alertMessage('每一轮最多选择6张图片。',true);return;}
   try{for(const f of list){const x=await ImageStore.put(f);prev.push(x.id);}setImageIds(role,index,prev);await populate();}
   catch(e){alertMessage('图片保存失败：'+e.message,true)}
 }
 input.onchange=async()=>{await addFiles(input.files||[]);input.value='';};
 drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging')};
 drop.ondragleave=()=>drop.classList.remove('dragging');
 drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');addFiles(e.dataTransfer?.files||[])};
 root.replaceChildren(drop);await populate();
}
function renderImages(){renderImageWidget($('firstImages'),'first');renderImageWidget($('nextImages'),'next');}

async function choosePlatform(p){
  if(!instances.includes(p))return;
  if(drafts[selected]){const old=selected;drafts[old]=configFromForm();await saveDraft(old);}
  selected=p;pickedResult=null;fillForm();renderAll();
}
function fillForm(){clearImagePreviewUrls();const c=drafts[selected]||defaultCfg(selected);const el=id=>$(id);
  el('editorTitle').textContent=instanceName(selected)+' · 任务设置';
  for(const key of ['projectName','firstPrompt','nextPrompt','total','mode','chatMode','quietSeconds','timeoutMinutes'])el(key).value=c[key];
  el('autoDownload').checked=!!c.autoDownload;el('includePrevious').checked=c.includePrevious!==false;
  for(const key of ['editor','send','reply'])el(key+'Selector').value=c.selectors?.[key]||'';
  setSelect(el('modelChoice'),[{value:'auto',label:'跟随网页当前模型（推荐）'},...(c.modelOptions||[]).filter(Boolean).map(v=>({value:v,label:v}))],c.modelChoice||'auto');
  setSelect(el('workMode'),[{value:'auto',label:'跟随网页当前模式（推荐）'},...modeOptions(selected).map(v=>({value:v,label:v}))],c.workMode||'auto');
  el('modelLock').checked=!!c.modelLock;el('newTaskNewChat').checked=c.newTaskNewChat!==false;el('nextImagesEvery').checked=c.nextImagesEvery!==false;

  el('modelResult').textContent='请打开绑定窗口，点击“扫描模型”读取当前账号可用的选项。模型列表仅来自网页，不需要手动输入。';
  updateModeView();renderRounds();renderImages();
}
function scheduleSave(p){
  if(p===selected)drafts[p]=configFromForm();
  clearTimeout(draftTimers.get(p));
  draftTimers.set(p,setTimeout(()=>saveDraft(p).catch(e=>console.warn(e)),300));
}
async function saveDraft(p){
  if(p===selected)drafts[p]=configFromForm();
  const cfg=structuredClone(drafts[p]||defaultCfg(p));
  await chrome.storage.local.set({[K(p,'cfg')]:cfg});
}
async function bindTab(i,tabId){
  const p=platformOf(i);
  let tab=await chrome.tabs.get(Number(tabId));
  for(let retry=0;tab&&!belongsTo(p,tab.url||tab.pendingUrl||'')&&retry<20;retry++){
    await nap(300);tab=await chrome.tabs.get(Number(tabId));
  }
  if(!tab||!belongsTo(p,tab.url||tab.pendingUrl||''))throw Error('该窗口未进入正确的 AI 网站，请等待网页加载完成后重试绑定。');
  const d=await chrome.storage.local.get(BINDINGS),map=d[BINDINGS]||{};
  const existing=map[String(tab.id)];
  if(existing&&existing!==i)throw Error(`该标签页已绑定 ${existing}，不能分配给两个任务`);
  const oldTab=Object.keys(map).find(key=>map[key]===i&&key!==String(tab.id));
  if(oldTab){
    const rk=K(i,'run'),ck=K(i,'control'),prior=await chrome.storage.local.get([rk,ck]);
    const run=prior[rk],control=prior[ck];
    if(run&&run.status==='running'&&control?.desired==='running')
      throw Error('原窗口还在运行，请先暂停当前任务后再更换绑定。');
    if(run&&['waiting','submitting'].includes(run.phase))
      throw Error('当前有发送或回复未确认的任务，不能换窗口续接。请保留原窗口完成，或新建任务后再绑定。');
  }
  for(const [key,value] of Object.entries(map))if(value===i&&key!==String(tab.id))delete map[key];
  map[String(tab.id)]=i;
  // A new binding is never permission to continue an unknown old reply.
  const rk=K(i,'run'),ck=K(i,'control'),state=await chrome.storage.local.get([rk,ck]);
  const patch={[BINDINGS]:map};
  if(state[rk]&&state[rk].tabId!==tab.id&&state[rk].status!=='finished'){
    patch[rk]={...state[rk],tabId:tab.id,status:'paused',reason:'已更换聊天窗口，原运行状态安全暂停。',updatedAt:Date.now()};
    patch[ck]={runId:state[rk].id,desired:'paused',updatedAt:Date.now()};
  }
  await chrome.storage.local.set(patch);bindings=map;
  await chrome.tabs.sendMessage(tab.id,{type:'AAC9_BIND'}).catch(()=>{});
  return tab;
}
async function getTab(i,open=false,preferred=null){
  const p=platformOf(i),bound=Object.entries(bindings).find(([tab,slot])=>slot===i);
  const wanted=preferred||bound?.[0];
  if(wanted!=null){try{
    const t=await chrome.tabs.get(Number(wanted));
    if(t&&belongsTo(p,t.url||t.pendingUrl||'')&&bindings[String(t.id)]===i)return t;
  }catch{}}
  if(!open)return null;
  const win=await chrome.windows.create({url:HOME[p],focused:true,type:'normal'});
  const tab=win.tabs?.[0];if(!tab)throw Error('浏览器未创建聊天标签页');
  await bindTab(i,tab.id);return tab;
}
function belongsTo(p,url){
  try{const h=new URL(url).hostname;
    return p==='chatgpt'?['chatgpt.com','chat.openai.com'].includes(h):p==='gemini'?h==='gemini.google.com':p==='doubao'?['doubao.com','www.doubao.com'].includes(h):h==='chat.deepseek.com';
  }catch{return false;}
}
async function chooseExistingTab(){
  const p=platformOf(selected),tabs=(await chrome.tabs.query({})).filter(t=>belongsTo(p,t.url||''));
  const eligible=tabs.filter(t=>!bindings[String(t.id)]||bindings[String(t.id)]===selected);
  if(!eligible.length)return alertMessage('没有可绑定的空闲'+BASE_LABEL[p]+'网页。请点击“新开窗口”。',true);
  const picked=eligible.length===1?eligible[0]:eligible.find(t=>Number(t.id)===Number($('tabSelect').value));
  if(!picked)return alertMessage('请先从列表中选择一个聊天标签页。',true);
  try{await bindTab(selected,picked.id);await refresh();alertMessage(`已绑定 ${instanceName(selected)} 到标签页 #${picked.id}。`);}catch(e){alertMessage('绑定失败：'+e.message,true)}
}
async function refreshTabOptions(){
 const select=$('tabSelect');select.replaceChildren();
 const p=platformOf(selected),tabs=(await chrome.tabs.query({})).filter(t=>belongsTo(p,t.url||''));
 for(const t of tabs){if(bindings[String(t.id)]&&bindings[String(t.id)]!==selected)continue;
   const o=document.createElement('option');o.value=String(t.id);o.textContent='#'+t.id+' · '+(t.title||t.url||'聊天窗口').slice(0,60);select.append(o);
 }
 if(!select.options.length){const o=document.createElement('option');o.value='';o.textContent='暂无可绑定网页';select.append(o);}
}

async function ping(tab,i,cfg){
  await chrome.tabs.sendMessage(tab.id,{type:'AAC9_BIND'}).catch(()=>{});
  try{return await chrome.tabs.sendMessage(tab.id,{type:'AAC9_PING',instanceId:i,run:{selectors:cfg.selectors}});}
  catch{
    try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['runner.js']});await nap(350);return chrome.tabs.sendMessage(tab.id,{type:'AAC9_PING',instanceId:i,run:{selectors:cfg.selectors}});}catch{return null;}
  }
}
async function archivePlatform(p,record){
 const prior=record[K(p,'run')];if(!prior)return;
 const hist=(await chrome.storage.local.get(historyKey(p)))[historyKey(p)]||[];
 const key=archiveKey(prior.id);
 // Preserve the full original configuration, text results, and logs. Avoid destructive migration.
 await chrome.storage.local.set({[key]:{platform:p,run:prior,cfg:prior.configSnapshot||(await chrome.storage.local.get(K(p,'cfg')))[K(p,'cfg')]||defaultCfg(p),results:record[K(p,'results')]||{},logs:(await chrome.storage.local.get(K(p,'logs')))[K(p,'logs')]||[],archivedAt:Date.now()},[historyKey(p)]:[{id:prior.id,at:Date.now(),status:prior.status,count:Object.values(record[K(p,'results')]||{}).filter(x=>x.status==='done').length},...hist.filter(h=>h.id!==prior.id)].slice(0,60)});
}
async function beginNewTask(p,fromOriginal=false,skipConfirm=false){
 if(p===selected&&!fromOriginal)await saveDraft(p);
 const r=snapshots[p]?.run;if(r?.status==='running'&&snapshots[p]?.control?.desired!=='paused')return alertMessage(`${LABEL[p]} 还在执行，请先点击暂停，确认后再新建任务。`,true);
 // Previous-task configuration is intentionally kept in history. The current edited template is used for new runs.
 return startPlatform(p,{newRun:true,fromOriginal,skipConfirm});
}
async function restartPlatform(p){
 const r=snapshots[p]?.run;if(!r)return alertMessage('当前平台还没有可重跑的任务。',true);
 return beginNewTask(p,true);
}
async function startPlatform(p,{newRun=false,fromOriginal=false,skipConfirm=false}={}){
  const activeRecord=await chrome.storage.local.get([K(p,'run'),K(p,'cfg')]);
  const cfg=fromOriginal?scrubOldConfig(activeRecord[K(p,'run')]?.configSnapshot||activeRecord[K(p,'cfg')]||defaultCfg(p),p):(p===selected?configFromForm():drafts[p]||defaultCfg(p));
  if(cfg.mode==='rounds'&&(!cfg.rounds.length||cfg.rounds.some(x=>!x.trim())))return alertMessage(`${LABEL[p]}：请填写所有轮次指令。`,true);
  if(cfg.mode==='episodes'&&(!cfg.firstPrompt.trim()||(cfg.total>1&&!cfg.nextPrompt.trim())))return alertMessage(`${LABEL[p]}：首次和续写指令不能为空。`,true);
  const d=await chrome.storage.local.get([K(p,'run'),K(p,'results'),K(p,'control')]);const existing=d[K(p,'run')];
  if(existing?.status==='running'&&d[K(p,'control')]?.desired!=='paused')return alertMessage(`${LABEL[p]} 正在运行，请先暂停再开始任务。`,true);
  if(existing?.status==='queued'&&d[K(p,'control')]?.desired==='queued')return alertMessage(`${LABEL[p]} 已在等待队列中。`,true);
  if(existing?.status==='running'&&d[K(p,'control')]?.desired==='paused'&&newRun&&['waiting','submitting'].includes(existing.phase))return alertMessage(`${LABEL[p]} 上一轮可能仍在生成，请等待其结束后再重开。`,true);
  if(existing&&!newRun&&existing.status!=='finished')return resumePlatform(p);
  if(existing&&!newRun&&existing.status==='finished')return alertMessage('上一任务已完成，请点击“重新”或创建“＋ 新任务”。',true);
  let tab=await getTab(p,false);
  if(!tab){
    const matches=(await chrome.tabs.query({})).filter(t=>belongsTo(platformOf(p),t.url||'')&&(!bindings[String(t.id)]||bindings[String(t.id)]===p));
    if(matches.length===1){try{tab=await bindTab(p,matches[0].id);}catch(e){console.warn('自动绑定失败',e);}}
  }
  if(!tab){await getTab(p,true);return alertMessage(`${LABEL[p]} 已打开独立聊天窗口。登录成功后，再点一次开始即可。`);}
  const diag=await ping(tab,p,cfg);
  if(!diag?.hasEditor)return alertMessage(`${LABEL[p]} 未识别到输入框。请登录、打开聊天页、刷新后重新检测。`,true);
  if(existing&&newRun)await archivePlatform(p,d);
  const rid=`${p}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const fresh=!!existing&&newRun&&(cfg.newTaskNewChat!==false);
  const run={id:rid,instanceId:p,platform:platformOf(p),tabId:tab.id,nextEpisode:1,status:'queued',phase:'queued',queuedPhase:'ready',needsNewChat:fresh,queuedAt:Date.now(),reason:'等待调度器分配运行位置（最多同时运行3个任务）。',configSnapshot:structuredClone(cfg),updatedAt:Date.now()};
  await chrome.storage.local.set({[K(p,'cfg')]:cfg,[K(p,'run')]:run,[K(p,'control')]:{runId:rid,desired:'queued',updatedAt:Date.now()},[K(p,'results')]:{},[K(p,'logs')]:[{runId:rid,at:Date.now(),message:'任务已加入调度队列，空位可用时自动启动。',severity:'info'}]});
  drafts[p]=cfg;
  if(p===selected&&fromOriginal)fillForm();
  await pumpQueue();await refresh();
}
async function pausePlatform(p){
  const d=await chrome.storage.local.get([K(p,'run'),K(p,'control')]);const run=d[K(p,'run')];if(!run||run.status==='finished')return;
  if(run.status==='queued')await chrome.storage.local.set({[K(p,'run')]:{...run,status:'paused',phase:run.queuedPhase||'ready',reason:'已从等待队列暂停。',updatedAt:Date.now()},[K(p,'control')]:{runId:run.id,desired:'paused',updatedAt:Date.now()}});
  else await chrome.storage.local.set({[K(p,'control')]:{runId:run.id,desired:'paused',updatedAt:Date.now()}});
  alertMessage(`${LABEL[p]} 已暂停。当前回复结束后不会再自动发送下一步。`);await refresh();pumpQueue();
}
async function resumePlatform(p){
 const d=await chrome.storage.local.get([K(p,'run'),K(p,'cfg')]);let r=d[K(p,'run')],cfg=d[K(p,'cfg')];if(!r||r.status==='finished')return;
 if(r.status==='queued')return alertMessage(`${LABEL[p]} 已在等待队列中。`,false);
 const t=await getTab(p,false,r.tabId);if(!t)return alertMessage(`${LABEL[p]} 聊天标签页不在，请先打开网页。`,true);
 if(r.tabId!==t.id&&['waiting','submitting'].includes(r.phase))return alertMessage('检测到聊天窗口变化，已停止以防止发送到错误窗口。请新建任务。',true);
 const probe=await ping(t,p,cfg);if(!probe?.hasEditor)return alertMessage(`${LABEL[p]} 没有有效聊天输入框，请刷新页面。`,true);
 r={...r,tabId:t.id,status:'queued',phase:'queued',queuedAt:Date.now(),queuedPhase:r.queuedPhase||r.phase||'ready',reason:'已加入等待队列，空位可用时自动继续。',updatedAt:Date.now()};
 await chrome.storage.local.set({[K(p,'run')]:r,[K(p,'control')]:{runId:r.id,desired:'queued',updatedAt:Date.now()}});
 await pumpQueue();await refresh();
}
async function pumpQueue(){try{await chrome.runtime.sendMessage({type:'AAC9_PUMP_QUEUE'});}catch(e){console.warn('[AAC9] queue request',e);}}
async function recoverPlatform(p){
  const d=await chrome.storage.local.get([K(p,'run'),K(p,'cfg')]);
  const run=d[K(p,'run')],cfg=d[K(p,'cfg')]||drafts[p]||defaultCfg(p);
  if(!run)return alertMessage('当前没有可恢复任务。',true);
  const tab=await getTab(p,false,run.tabId);
  if(!tab||tab.id!==run.tabId)return alertMessage('原聊天窗口已关闭。为防止串聊，请为新任务开启新窗口。',true);
  const ready=await ping(tab,p,cfg);
  if(!ready?.hasEditor)return alertMessage('聊天网页尚未就绪，无法自动恢复。',true);
  const out=await chrome.tabs.sendMessage(tab.id,{type:'AAC9_RECOVER',instanceId:p}).catch(()=>null);
  if(!out?.ok)return alertMessage((out?.error||'无法自动确认上一轮状态。')+' 已暂停以防重复发送；可以新建任务。',true);
  alertMessage(`${LABEL[p]} 已自动核对发送状态并恢复监听。`);await refresh();
}
async function retryPlatform(p){
 const d=await chrome.storage.local.get(K(p,'run'));const run=d[K(p,'run')];
 if(!run||run.status==='finished')return alertMessage('暂无可重试的步骤。',true);
 return resumePlatform(p);
}
function download(file,text,type='text/plain;charset=utf-8'){
  const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);
}
function safeFile(s){return String(s||'任务').replace(/[\\/:*?"<>|]/g,'_').slice(0,55);}
async function exportPlatform(p){const d=await readAll(),x=d.platforms[p],rows=Object.values(x.results||{}).filter(y=>y.status==='done').sort((a,b)=>a.episode-b.episode);
  if(!rows.length)return alertMessage(`${LABEL[p]} 暂无已完成的内容。`,true);
  download(`${safeFile(x.cfg.projectName)}_${LABEL[p]}_全部${rows.length}步.txt`,rows.map(v=>`第${v.episode}${x.cfg.mode==='rounds'?'轮':'集'}\n\n${v.content}`).join('\n\n'+'—'.repeat(26)+'\n\n'));
}
async function exportWholeBackup(){
 const d=await readAll(),hist={},archive={};
 for(const i of instances){hist[i]=(await chrome.storage.local.get(historyKey(i)))[historyKey(i)]||[];
   for(const h of hist[i])archive[h.id]=(await chrome.storage.local.get(archiveKey(h.id)))[archiveKey(h.id)];}
 const backup={format:'AAC9_BACKUP_V1',exportedAt:new Date().toISOString(),instances:[...instances],platforms:d.platforms,enabled:[...enabled],history:hist,archive,
   imageNote:'图片数据另存于本浏览器的IndexedDB，JSON只包含关联ID。切换浏览器前应先保留原扩展数据及图片。'};
 download(`AI_Auto_Continue_v092_Backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2),'application/json');
}
async function importJSON(file){
 const data=JSON.parse(await file.text()),write={};
 if(!confirm('导入会替换任务配置和已保存内容。建议先导出当前备份。确认继续吗？'))return;
 if(data.format==='AAC9_BACKUP_V1'){
   const selectedIds=(data.instances||[]).filter(i=>/^(chatgpt|gemini|doubao|deepseek)-[A-Z]$/.test(i));
   if(!selectedIds.length)throw Error('备份没有有效任务实例');
   write[INDEX]=selectedIds;write[ENABLED]=(data.enabled||selectedIds).filter(i=>selectedIds.includes(i));write[BINDINGS]={};
   for(const i of selectedIds){const v=data.platforms?.[i];if(!v)continue;
     write[K(i,'cfg')]=scrubOldConfig(v.cfg,i);write[K(i,'results')]=v.results||{};write[K(i,'logs')]=v.logs||[];
     if(v.run){write[K(i,'run')]={...v.run,instanceId:i,platform:platformOf(i),tabId:null,status:v.run.status==='finished'?'finished':'paused',reason:'从备份恢复，运行状态已安全暂停。'};write[K(i,'control')]={runId:v.run.id,desired:'paused',updatedAt:Date.now()};}
     write[historyKey(i)]=data.history?.[i]||[];
   }
   for(const [id,v]of Object.entries(data.archive||{}))write[archiveKey(id)]=v;
 }else if(['AAC7_BACKUP_V1','AAC8_BACKUP_V1'].includes(data.format)||data.type==='MANJU_BACKUP_V1'){
   for(const p of PLATFORMS){const i=p+'-A',v=data.type==='MANJU_BACKUP_V1'?(data.config?.platform===p?{cfg:data.config,run:data.run,results:data.episodes,logs:data.logs}:null):data.platforms?.[p];
     if(!v)continue;
     write[K(i,'cfg')]=scrubOldConfig(v.cfg,i);write[K(i,'results')]=v.results||{};write[K(i,'logs')]=v.logs||[];
     if(v.run){write[K(i,'run')]={...v.run,instanceId:i,platform:p,tabId:null,status:v.run.status==='finished'?'finished':'paused',reason:'旧版记录已恢复，需重新绑定窗口确认。'};write[K(i,'control')]={runId:v.run.id,desired:'paused',updatedAt:Date.now()};}
     if(data.history?.[p])write[historyKey(i)]=data.history[p];
   }
   for(const [id,v]of Object.entries(data.archive||{}))write[archiveKey(id)]=v;
   write[BINDINGS]={};
 }else throw Error('不是本助手可识别的备份');
 await chrome.storage.local.set(write);await migrate();await initData();alertMessage('备份导入完成。所有未完成任务已暂停，需重新绑定聊天窗口。');
}

async function probeModel(inspect=true){
 const i=selected,c=configFromForm(),tab=await getTab(i,false);
 if(!tab)return alertMessage('先打开或绑定 '+LABEL[i]+' 聊天窗口。',true);
 const online=await ping(tab,i,c);
 if(!online?.ok)return alertMessage('当前窗口没有连接到扩展，请刷新聊天网页再试。',true);
 const data=await chrome.tabs.sendMessage(tab.id,{type:'AAC9_MODEL_PROBE',instanceId:i,inspectOptions:inspect}).catch(()=>null);
 if(!data?.ok)return alertMessage('没有取得模型列表；可以在网页手动选择模型后重新扫描。',true);
 const options=(data.options||[]).map(o=>typeof o==='string'?{value:o,label:o,disabled:false}:{value:o.id||o.label,label:o.label||o.id,disabled:!!o.disabled})
   .filter(o=>o.value&&o.label&&!/升级|upgrade|付费|help|settings|设置|帮助/i.test(o.label));
 const unique=[...new Map(options.map(o=>[o.value,o])).values()];
 drafts[i].modelOptions=unique.filter(o=>!o.disabled).map(o=>o.value);
 const current=c.modelChoice||'auto';
 setSelect($('modelChoice'),[{value:'auto',label:'跟随网页当前模型'},...unique],current);
 $('modelChoice').value=unique.some(o=>o.value===current&&!o.disabled)?current:'auto';
 if(current!=='auto'&&$('modelChoice').value==='auto'){$('modelLock').checked=false;drafts[i].modelLock=false;}
 scheduleSave(i);
 $('modelResult').textContent=`当前网页模型：${data.currentModel||'未识别'}；扫描到 ${unique.length} 个可显示选项。${unique.length?'请选择并点击“尝试切换”。':'网页没有提供可识别的模型菜单，请在网页手动设置。'}`;
 return data;
}

async function lockDetectedModel(){
 const data=await probeModel(false);
 if(!data?.currentModel)return alertMessage('未能从当前聊天窗口识别模型。请在网页手动选择，再点击扫描。',true);
 const name=data.currentModel;
 if(![...$('modelChoice').options].some(o=>o.value===name)){
   const option=document.createElement('option');option.value=name;option.textContent=name+'（当前网页检测）';$('modelChoice').add(option);
 }
 $('modelChoice').value=name;$('modelLock').checked=true;
 drafts[selected].modelOptions=[...new Set([...(drafts[selected].modelOptions||[]),name])];
 scheduleSave(selected);alertMessage(`已锁定当前窗口检测到的模型：${name}。`);
}
async function applyModel(){const p=selected,c=configFromForm(),tab=await getTab(p,false);
  if(!tab)return alertMessage('请先打开并登录目标AI网页。',true);
  const out=await chrome.tabs.sendMessage(tab.id,{type:'AAC9_MODEL_APPLY',instanceId:p,model:c.modelChoice,mode:c.workMode}).catch(()=>null);
  if(!out?.ok)return alertMessage(out?.detail||'网页不允许自动切换，请手动切换并重新检测。',true);
  $('modelResult').textContent=out.detail||'已确认网页设置。';scheduleSave(p);
}
async function diagnose(){const p=selected,c=configFromForm(),tab=await getTab(p,false);
  if(!tab)return alertMessage('未找到 '+LABEL[p]+' 的聊天标签页。',true);
  const d=await ping(tab,p,c);if(!d)return alertMessage('网页未响应。请登录并刷新聊天窗口。',true);
  alertMessage(`${LABEL[p]}：输入框 ${d.hasEditor?'已识别':'未识别'}，发送按钮 ${d.hasSend?'已识别':'暂不可用（输入为空时可能正常）'}，回复节点 ${d.replyCount} 条，网页模型 ${d.model?.currentModel||'未识别'}。`,!d.hasEditor);
}
async function initData(){
 const meta=await chrome.storage.local.get([INDEX,BINDINGS,'aac9:concurrency']);
 instances=(meta[INDEX]||PLATFORMS.map(p=>p+'-A')).filter(i=>/^(chatgpt|gemini|doubao|deepseek)-[A-Z]$/.test(i));
 bindings=meta[BINDINGS]||{};concurrencyLimit=MAX_CONCURRENT;await chrome.storage.local.set({'aac9:concurrency':MAX_CONCURRENT});
 const d=await readAll();enabled=new Set(d.enabled||instances);snapshots=d.platforms;
 drafts={};for(const i of instances)drafts[i]=scrubOldConfig(d.platforms[i].cfg,i);
 if(!instances.includes(selected))selected=instances[0];
 fillForm();await refreshTabOptions();renderAll();
}
async function refresh(){
 if(updating)return;
 try{updating=true;const d=await readAll();snapshots=d.platforms;bindings=d.bindings;renderAll();}
 catch(e){console.warn('[AAC9] render',e);}finally{updating=false;}
 pumpQueue();
}
function platformInstances(platform){return instances.filter(i=>platformOf(i)===platform);}
function platformTarget(platform,preferSelected=true){
 const list=platformInstances(platform);if(!list.length)return null;
 if(preferSelected&&platformOf(selected)===platform&&list.includes(selected))return selected;
 const rank=(i)=>snapshots[i]?.run?.updatedAt||snapshots[i]?.cfg?.updatedAt||0;
 const live=list.filter(i=>isLive(snapshots[i])).sort((a,b)=>rank(b)-rank(a));if(live.length)return live[0];
 const queued=list.filter(i=>effectiveStatus(snapshots[i])==='queued').sort((a,b)=>rank(b)-rank(a));if(queued.length)return queued[0];
 const paused=list.filter(i=>['paused','error'].includes(effectiveStatus(snapshots[i]))).sort((a,b)=>rank(b)-rank(a));if(paused.length)return paused[0];
 return list.slice().sort((a,b)=>rank(b)-rank(a))[0];
}
async function selectPlatform(platform){
 const target=platformTarget(platform,false);if(target)await choosePlatform(target);
}
async function createInstance(platform){
 const used=platformInstances(platform).map(instanceLetter);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ';const letter=alphabet.split('').find(x=>!used.includes(x));
 if(!letter)return alertMessage(`${BASE_LABEL[platform]} 已达到26个任务实例上限。`,true);
 if(drafts[selected])await saveDraft(selected);
 const sourceId=platformInstances(platform).includes(selected)?selected:platformTarget(platform,false);
 const cloned=scrubOldConfig(drafts[sourceId]||defaultCfg(platform+'-'+letter),platform+'-'+letter);
 const base=cloned.projectName;cloned.projectName=base+' · 任务'+letter;cloned.updatedAt=Date.now();
 const i=platform+'-'+letter;const next=[...instances,i];
 await chrome.storage.local.set({[INDEX]:next,[K(i,'cfg')]:cloned,[ENABLED]:[...enabled,i]});
 instances=next;enabled.add(i);drafts[i]=cloned;snapshots[i]={cfg:cloned,run:null,control:null,results:{},logs:[]};
 selected=i;fillForm();renderAll();
 try{await getTab(i,true);await refresh();alertMessage(`${BASE_LABEL[platform]} 任务${letter}已创建，并打开独立聊天窗口。`);}
 catch(e){alertMessage('任务已创建，但打开网页失败：'+e.message,true);}
}
function renderTaskSwitcher(){
 const root=$('taskSwitcher');if(!root)return;root.replaceChildren();
 const platform=platformOf(selected);const list=platformInstances(platform);
 for(const i of list){
  const st=snapshots[i]||{},c=st.cfg||drafts[i]||defaultCfg(i),done=Object.values(st.results||{}).filter(x=>x.status==='done').length;
  const chip=document.createElement('button');chip.type='button';chip.className='task-chip'+(i===selected?' selected':'');chip.setAttribute('aria-pressed',String(i===selected));
  const name=document.createElement('strong');name.textContent='任务 '+instanceLetter(i);
  const meta=document.createElement('small');meta.textContent=`${done}/${c.total||30} · ${labelStatus(effectiveStatus(st))}`;
  chip.append(name,meta);chip.onclick=()=>choosePlatform(i);root.append(chip);
 }
 const add=document.createElement('button');add.type='button';add.className='task-chip task-chip-add';add.innerHTML='<span class="plus">＋</span><strong>新任务</strong><small>创建独立窗口</small>';add.onclick=()=>createInstance(platform);root.append(add);
}
function renderCards(){
 const root=$('platformCards');root.replaceChildren();
 for(const platform of PLATFORMS){
  const i=platformTarget(platform,true);if(!i)continue;
  const st=snapshots[i]||{},r=st.run,c=st.cfg||drafts[i]||defaultCfg(i);
  const done=Object.values(st.results||{}).filter(x=>x.status==='done').length,total=c.total||30,pct=Math.min(100,Math.round(done/Math.max(total,1)*100));
  const status=effectiveStatus(st),tasks=platformInstances(platform);
  const card=document.createElement('article');card.className='platform-card'+(platformOf(selected)===platform?' selected':'');card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label',`选择${BASE_LABEL[platform]}平台当前任务`);
  card.addEventListener('click',()=>selectPlatform(platform));
  card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPlatform(platform);}});
  const top=document.createElement('div');top.className='platform-card-head';
  const identity=document.createElement('div');identity.className='platform-identity';
  const logo=document.createElement('span');logo.className='pc-logo logo-'+platform;logo.textContent=BASE_ICON[platform];
  const titles=document.createElement('div');const name=document.createElement('strong');name.textContent=BASE_LABEL[platform];const taskName=document.createElement('small');taskName.textContent=`任务${instanceLetter(i)} · ${c.projectName||'未命名任务'}`;titles.append(name,taskName);identity.append(logo,titles);
  const tag=document.createElement('span');tag.className='status-tag '+clsStatus(status);tag.textContent=labelStatus(status);top.append(identity,tag);card.append(top);
  const summary=document.createElement('div');summary.className='platform-card-summary';
  const count=document.createElement('strong');count.textContent=`${done} / ${total}`;const countLabel=document.createElement('small');countLabel.textContent='已完成步骤';summary.append(count,countLabel);card.append(summary);
  const track=document.createElement('div');track.className='track platform-track';const fill=document.createElement('div');fill.style.width=pct+'%';track.append(fill);card.append(track);
  const footer=document.createElement('div');footer.className='platform-card-foot';footer.textContent=tasks.length>1?`${tasks.length} 个独立任务 · 点击切换`:'点击查看任务设置';card.append(footer);
  const actions=document.createElement('div');actions.className='platform-card-actions';
  const makeAction=(label,cls,disabled,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=label;b.disabled=disabled;b.addEventListener('click',e=>{e.stopPropagation();Promise.resolve(fn?.()).catch(err=>alertMessage(err.message||String(err),true));});return b;};
  const startDisabled=['running','queued','paused','error'].includes(status);
  const pauseDisabled=!['running','queued'].includes(status);
  const resumeDisabled=!['paused','error'].includes(status);
  const restartDisabled=!r||status==='running'||status==='queued';
  const act=fn=>async()=>{if(selected!==i)await choosePlatform(i);await fn();};
  actions.append(
   makeAction('▶ 开始','btn-primary',startDisabled,act(()=>status==='finished'?beginNewTask(i,false):startPlatform(i))),
   makeAction('Ⅱ 暂停','btn-pause',pauseDisabled,act(()=>pausePlatform(i))),
   makeAction('↻ 继续','btn-resume',resumeDisabled,act(()=>resumePlatform(i))),
   makeAction('重新','btn-soft',restartDisabled,act(()=>restartPlatform(i)))
  );
  card.append(actions);root.append(card);
 }
}

async function renderHistory(p){
 const list=$('historyList');const entries=(await chrome.storage.local.get(historyKey(p)))[historyKey(p)]||[];
 if(p!==selected)return;
 $('historyCount').textContent=entries.length+' 项';list.replaceChildren();
 if(!entries.length){list.innerHTML='<div class="empty">暂无历史任务</div>';return;}
 for(const h of entries.slice(0,16)){
   const row=document.createElement('div');row.className='history-item';const title=document.createElement('div');
   const b=document.createElement('b');b.textContent=new Date(h.at).toLocaleString('zh-CN')+' · '+h.count+'步';
   const sub=document.createElement('small');sub.textContent='原状态 '+(STATUS[h.status]||h.status);
   title.append(b,document.createElement('br'),sub);
   const button=document.createElement('button');button.type='button';button.className='btn btn-sm';button.textContent='导出';
   button.onclick=async()=>{const record=(await chrome.storage.local.get(archiveKey(h.id)))[archiveKey(h.id)];if(!record)return alertMessage('历史数据未找到。',true);
     const rs=Object.values(record.results||{}).filter(x=>x.status==='done').sort((a,b)=>a.episode-b.episode);
     download(`${safeFile(record.cfg?.projectName)}_${p}_${h.id}.txt`,rs.map(x=>`第${x.episode}步\n\n${x.content}`).join('\n\n'));};
   row.append(title,button);list.append(row);
 }
}
function renderSide(){const s=snapshots[selected]||{},r=s.run,c=s.cfg||drafts[selected]||defaultCfg(selected),results=Object.values(s.results||{}).filter(v=>v.status==='done').sort((a,b)=>a.episode-b.episode);
  const pct=Math.round((results.length/Math.max(1,c.total))*100);
  $('editStatus').textContent=labelStatus(effectiveStatus(s));$('editStatus').className='status-tag '+clsStatus(effectiveStatus(s));
  $('rightStatus').textContent=labelStatus(effectiveStatus(s));$('rightStatus').className='status-tag '+clsStatus(effectiveStatus(s));
  $('progressTitle').textContent=LABEL[selected]+' · 当前进度';$('progressCount').innerHTML=`${results.length} <small>/ ${c.total}</small>`;$('progressPercent').textContent=pct+'%';$('progressFill').style.width=pct+'%';
  $('currentStep').textContent=r?.status==='queued'?`第${r.nextEpisode}步 · 等待运行位置`:r?.phase==='waiting'?`第${r.nextEpisode}步 · 正在等待回复完整结束`:r?.phase==='submitting'?`第${r.nextEpisode}步 · 正在确认发送`:r?.status==='finished'?'当前任务已全部完成':r?`第${Math.min(r.nextEpisode,c.total)}步 · ${labelStatus(r.status)}`:'等待开始执行';
  $('runtimeReason').textContent=r?.reason||'无法确认网页状态时自动暂停，避免重复发送。';
  const status=effectiveStatus(s);
  $('activeStart').hidden=status!=='idle';
  $('activePause').hidden=status!=='running';
  $('activeResume').hidden=!['paused','error'].includes(status);
  $('activeResume').textContent=status==='error'?'↻ 自动恢复检查':'▶ 继续运行';
  $('activeNew').hidden=status!=='finished';
  $('activeRestart').hidden=!r; // 高级设置中保留从头重跑，不占用主要操作区
  $('activeStart').disabled=false;
  $('runtimeReason').textContent=r?.reason||'每轮完成后自动续发，异常时安全暂停。';
  renderHistory(selected);
  $('savedCount').textContent=results.length+' 条';const list=$('resultList');list.replaceChildren();
  if(!results.length){list.innerHTML='<div class="empty">暂无已保存内容<small>任务完成后自动存放在这里</small></div>';}
  for(const entry of results){const b=document.createElement('button');b.type='button';b.className='result-row'+(pickedResult===entry.episode?' active':'');b.innerHTML=`<span>第 ${entry.episode} ${c.mode==='rounds'?'轮':'集'} · 已保存</span><span>${entry.content.length.toLocaleString('zh-CN')}字</span>`;b.onclick=()=>{pickedResult=entry.episode;renderSide();};list.append(b);}
  const pick=results.find(e=>e.episode===pickedResult);
  $('selectedResult').hidden=!pick;if(pick){$('resultTitle').textContent=`第${pick.episode}${c.mode==='rounds'?'轮':'集'} · 正文`;$('resultText').textContent=pick.content;}
  const logs=$('logList');logs.replaceChildren();const rows=(s.logs||[]).slice(-30).reverse();if(!rows.length)logs.innerHTML='<div class="empty">暂无运行日志</div>';
  for(const item of rows){const el=document.createElement('div');el.className='log-row '+(item.severity||'');const dt=document.createElement('time');dt.textContent=formatDate(item.at);const msg=document.createElement('span');msg.textContent=item.message;el.append(dt,msg);logs.append(el);}
}
function renderAll(){renderCards();renderTaskSwitcher();renderSide();const jobs=instances.map(p=>snapshots[p]);
  const running=jobs.filter(j=>isLive(j)).length;
  const queued=jobs.filter(j=>effectiveStatus(j)==='queued').length;
  const error=jobs.filter(j=>j?.run?.status==='error').length;
  $('globalStatus').textContent=running?`${running}/3 个运行中`:queued?`${queued} 个等待中`:error?`${error} 个待处理`:'待命';
  $('globalStatus').className='status-tag '+(running?'running':queued?'queued':error?'error':'idle');
  const summary=$('platformSummary');if(summary)summary.textContent=`最多同时运行 3 个任务 · 点击平台卡切换当前任务`;
  const q=$('queueSummary');if(q)q.textContent=`${running} 运行 · ${queued} 等待`;
}
function bind(){
  for(const id of ['projectName','firstPrompt','nextPrompt','total','autoDownload','chatMode','includePrevious','quietSeconds','timeoutMinutes','editorSelector','sendSelector','replySelector','modelChoice','workMode','modelLock','newTaskNewChat','nextImagesEvery'])$(id).addEventListener('input',()=>scheduleSave(selected));
  $('modelChoice').addEventListener('change',()=>{if($('modelChoice').value!=='auto')$('modelLock').checked=true;scheduleSave(selected);});
  $('mode').addEventListener('change',()=>{drafts[selected].mode=$('mode').value;updateModeView();scheduleSave(selected);});
  $('addRound').onclick=()=>{if(drafts[selected].rounds.length>=30)return;drafts[selected].rounds.push('');drafts[selected].images.rounds.push([]);renderRounds();scheduleSave(selected);};
  $('saveConfig').onclick=async()=>{await saveDraft(selected);alertMessage(LABEL[selected]+' 的配置已保存。');};
  $('openSite').onclick=async()=>{const tab=await getTab(selected,true);await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});await refreshTabOptions();};
  $('bindTab').onclick=chooseExistingTab;
  $('refreshTabs').onclick=refreshTabOptions;
  $('newWindow').onclick=async()=>{
    const old=await getTab(selected,false);
    if(old)return alertMessage('此任务已有绑定窗口。如需再开一个独立任务，请在下方任务选择区点击“＋ 新任务”。');
    await getTab(selected,true);await refreshTabOptions();alertMessage('已创建新的独立聊天窗口。请登录后扫描模型。');
  };

  $('lockDetected').onclick=lockDetectedModel;
  $('diagnose').onclick=diagnose;$('detectModel').onclick=()=>probeModel(true);$('applyModel').onclick=applyModel;
  $('activeStart').onclick=()=>startPlatform(selected);
  $('activeNew').onclick=()=>beginNewTask(selected);$('activeRestart').onclick=()=>restartPlatform(selected);
  $('activePause').onclick=()=>pausePlatform(selected);$('activeResume').onclick=()=>resumePlatform(selected);
  $('retry').onclick=()=>retryPlatform(selected);
  $('exportCurrent').onclick=()=>exportPlatform(selected);
  $('copyResult').onclick=()=>{const t=$('resultText').textContent;navigator.clipboard.writeText(t).then(()=>alertMessage('已复制正文。')).catch(()=>alertMessage('无法复制，请手动选择正文。',true));};
  $('exportAll').onclick=exportWholeBackup;
  $('importBackup').onclick=()=>$('importFile').click();
  $('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await importJSON(f);}catch(err){alertMessage('导入失败：'+err.message,true);}e.target.value='';};
  $('exportLogs').onclick=()=>{const items=snapshots[selected]?.logs||[];download(`${LABEL[selected]}_运行日志.txt`,items.map(r=>`${new Date(r.at).toLocaleString('zh-CN')} ${r.message}`).join('\n'));};
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('aac9:')||k.startsWith('aac8:history:')))refresh();});
}
async function main(){await migrate();await initData();bind();setInterval(refresh,2100);setInterval(pumpQueue,3000);}
main().catch(err=>{console.error(err);alertMessage('初始化失败：'+String(err),true);});
