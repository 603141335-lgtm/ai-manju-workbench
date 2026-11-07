'use strict';
/** v2.2: account/password + verified email sign-up; sync only episodes/prompts/images/status. */
(function(){
 const ENV='marginal-wildfowl-d9dw2q0e469ceb',REGION='ap-singapore',BUCKET='manju-assets';
 let cloud=null,uid='',email='',busy=false,loginMode='login',timer=0,projectId='',catalog=[],caching=new Set();
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
 const save=(key,val)=>localStorage.setItem(key,JSON.stringify(val));
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const response=(r,action)=>{if(!r||r.error)throw Error(action+'：'+(r?.error?.message||'云服务请求失败'));return r.data;};
 function diagnose(e){
   const m=String(e?.message||e||'连接失败');
   if(/Failed to fetch|networkerror|unreachable|fetch failed/i.test(m))return '无法连接腾讯云新加坡环境。检查网络、DNS/代理、系统日期及 CloudBase「环境配置→安全来源」是否已允许 appassets.androidplatform.net。原始错误：'+m;
   if(/cors|origin|domain/i.test(m))return 'CloudBase 安全来源未授权当前APP，检查环境配置→安全来源。'+m;
   if(/login_type_disabled|PROVIDER_NOT_ENABLED|provider not found/i.test(m))return '未开启账号密码或邮箱验证码登录；请到 CloudBase→身份认证→登录方式检查。';
   return m.slice(0,450);
 }
 function msg(t){if($('cloudMessage'))$('cloudMessage').textContent=t;}
 function app(){if(!window.ManjuCloudBaseSDK)throw Error('安装包缺少 CloudBase SDK，请安装完整版本');
   if(!cloud)cloud=window.ManjuCloudBaseSDK.init({env:ENV,region:REGION});return cloud;
 }
 function auth(){return app().auth;}
 function validId(id){if(!/^[A-Za-z0-9_:\-.]{8,160}$/.test(id))throw Error('服务器返回的账号UID异常');return id;}
 async function session(){
   const data=response(await auth().getSession(),'检查登录状态');
   if(!data?.session||!data?.user?.id){uid='';return null;}
   const id=validId(String(data.user.id));
   const owner=window.Native?.getCloudOwner?.()||'';
   if(owner && owner!==id)throw Error('本机检测到另一账号的未清理私有缓存。请先在同步中心选择「清除旧云缓存」再登录');
   uid=id;email=String(data.user.email||'');
   return {uid,email};
 }
 async function register(){
   const username=$('cloudUsername').value.trim(),password=$('cloudPassword').value,invite=$('cloudInvite').value.trim();
   if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{4,23}$/.test(username))throw Error('用户名为5—24位英文字母、数字、点或下划线');
   if(password.length<8||password.length>32)throw Error('密码为8—32位，必须包含大写、小写、数字、特殊字符中的至少3类');
   if([/[A-Z]/,/[a-z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(r=>r.test(password)).length<3)throw Error('密码强度不足：请包含至少3类字符');
   if(invite.length<16)throw Error('请输入有效邀请码');
   if(!window.Native?.registerWithInvite)throw Error('请安装 v2.3 或更高版本安卓客户端');
   msg('已提交注册请求，正在通过安全连接验证邀请码…');
   window.Native.registerWithInvite(username,password,invite);
 }
 async function registrationResult(ok,text){
   if(!ok){msg(text+'。请确认云端注册服务已部署、邀请码正确。');return}
   msg('邀请码注册成功，正在自动登录…');
   try{await login()}catch(e){msg('账号已创建，请点击「账号密码登录」重试：'+diagnose(e));}
 }
 async function login(){
   const account=$('cloudUsername').value.trim(),password=$('cloudPassword').value;
   if(!account||!password)throw Error('请输入登录账号和密码');
   const credentials=account.includes('@')?{email:account,password}:{username:account,password};
   response(await auth().signInWithPassword(credentials),'账号密码登录');
   const user=await session();if(!user)throw Error('登录接口没有返回有效会话');
   msg('已登录 '+(user.email||user.uid)+'；正在同步项目…');
   await loadCache();await download();
 }
 async function loadCache(){
   if(!uid||!window.Native?.getCloudWorkspaceForUid)return;
   const raw=window.Native.getCloudWorkspaceForUid(uid);if(!raw)return;
   try{window.__manjuTest?.setDesktopProject(JSON.parse(raw),true);msg('已载入本账号离线缓存');}
   catch(e){msg('本地缓存验证失败：'+e.message);}
 }
 async function rows(table,projectId){
   let q=app().rdb().from(table).select('*');
   if(projectId)q=q.eq('project_id',projectId);
   const r=response(await q,'读取'+table);
   return Array.isArray(r)?r:[];
 }
 const normalize=c=>String(c||'').normalize('NFKC').toUpperCase().replace(/\s+/g,'').replace(/[－_]/g,'-');
 function mapProject(project,episodes,segments){
   const items=episodes.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(e=>({
     id:e.id,number:e.episode_number,title:e.title||'第'+e.episode_number+'集',original:e.original_text||'',
     segments:segments.filter(s=>s.episode_id===e.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(s=>({
       id:s.id,n:s.segment_number,title:s.title||'第'+s.segment_number+'段',text:s.prompt_text||'',
       codes:Array.isArray(s.reference_codes)?s.reference_codes.map(normalize):[],
       manual:true,locked:!!s.video_metadata?.locked,hidden:!!s.video_metadata?.hidden,
       status:s.status==='已完成'?'done':s.status==='需重做'?'redo':'pending'
     }))
   }));
   return {version:2,cloudAuthoritative:true,title:project.title||'我的漫剧',episodes:items,chosenPaths:{},assetFolder:'',
      activeEpisodeId:items[0]?.id||null,activeSegmentId:items[0]?.segments?.[0]?.id||null};
 }
 async function download(){
   if(busy)throw Error('正在执行同步操作');
   busy=true;
   try{
     const owner=await session();if(!owner)throw Error('请先注册或登录');
     msg('正在获取个人项目…');
     const projects=await rows('manju_projects');
     if(!projects.length){msg('当前账号尚未有云端项目。先在电脑版登录同一账号并同步项目与参考图。');return {projects:0};}
     const project=projects[0];
     const [episodes,segments,assets]=await Promise.all([rows('manju_episodes',project.id),rows('manju_segments',project.id),rows('manju_assets',project.id)]);
     const ws=mapProject(project,episodes,segments);
     if(!window.Native?.saveCloudWorkspace)throw Error('安装包缺少项目缓存接口');
     window.Native.saveCloudWorkspace(JSON.stringify(ws),uid);
     projectId=project.id;catalog=assets;
     const starting=(ws.episodes[0]?.segments[0]?.codes)||[];
     const initial=await ensureReferences(starting);
     msg('已同步 '+episodes.length+' 集、'+segments.length+' 段、'+assets.length+' 个参考图编号；当前段已安排 '+initial.requested+' 张原图缓存。进入其他段时自动按需下载。'+(initial.errors.length?' 失败：'+initial.errors.slice(0,3).join('；'):''));
     return {episodes:episodes.length,segments:segments.length,catalog:assets.length,requested:initial.requested,errors:initial.errors};
   }finally{busy=false;}
 }

 async function ensureReferences(codes){
   if(!uid||!projectId||!Array.isArray(codes))return {requested:0,errors:[]};
   const need=[...new Set(codes.map(normalize))],errors=[];let requested=0;
   for(const code of need){
     const item=catalog.find(x=>normalize(x.code)===code&&Number(x.variant||1)===1);
     if(!item){errors.push(code+' 无云端原图');continue}
     const exists=(()=>{try{return JSON.parse(window.Native?.getAssets?.()||'[]').some(x=>x.code===code&&String(x.name||'').includes(String(item.sha256||'').slice(0,20)))}catch{return false}})();
     if(exists||caching.has(code))continue;
     if(!item.storage_path||!/^[a-f0-9]{64}$/i.test(String(item.sha256||''))){errors.push(code+' 缺少有效校验值');continue;}
     try{
       caching.add(code);
       const signed=response(await app().storage.from(BUCKET).createSignedUrl(item.storage_path,900),'请求私有原图');
       const url=typeof signed==='string'?signed:(signed.fullSignedURL||signed.signedUrl||signed.url);
       if(!url||!url.startsWith('https://'))throw Error('云端返回的图片地址无效');
       window.Native?.cacheCloudAsset?.(uid,projectId,code,String(item.sha256),item.mime_type||'image/jpeg',url);
       requested++;
     }catch(e){errors.push(code+':'+String(e.message||e));}
     finally{caching.delete(code)}
   }
   return {requested,errors};
 }

 function queueStatus(key,status){
   if(!uid||!key.startsWith('desktop_'))return;
   const id=key.slice(8);
   if(!/^[a-f0-9-]{36}$/i.test(id))return;
   const queue=read('manju_cloud_status_queue',{});
   if(!queue[uid])queue[uid]={};
   queue[uid][id]={status,updated:Date.now()};
   save('manju_cloud_status_queue',queue);
   clearTimeout(timer);timer=setTimeout(()=>uploadStatuses().catch(e=>msg('完成状态仍在本机待同步：'+diagnose(e))),4000);
 }
 async function uploadStatuses(){
   const owner=await session();if(!owner)throw Error('请先登录');
   const all=read('manju_cloud_status_queue',{}),queue=all[uid]||{};
   const allowed={'待制作':'待制作','需重做':'需重做','已完成':'已完成'};
   let count=0;
   for(const [id,entry] of Object.entries(queue)){
     if(!allowed[entry.status])continue;
     response(await app().rdb().from('manju_segments').update({status:entry.status,updated_at:new Date().toISOString()}).eq('id',id),'回传完成状态');
     delete queue[id];save('manju_cloud_status_queue',all);count++;
   }
   msg('已回传 '+count+' 条段落状态；其余操作仍保存在本机');
   return count;
 }
 async function logout(){
   response(await auth().signOut(),'退出账号');
   uid='';email='';clearTimeout(timer);
   window.Native?.clearCloudWorkspace?.();
   localStorage.removeItem('manju-v2-state');localStorage.removeItem('manju_cloud_status_queue');
   msg('已退出并清理云端缓存');location.reload();
 }
 function clearCache(){
   // Explicit action for switching accounts, never exposes old data.
   window.Native?.clearCloudWorkspace?.();
   localStorage.removeItem('manju-v2-state');
   localStorage.removeItem('manju_cloud_status_queue');
   msg('已请求清除旧云缓存。完成后可重新登录。');
 }
 function switchMode(mode){
   loginMode=mode;
   const sign=mode==='register';
   $('cloudRegisterFields').style.display=sign?'block':'none';
   $('cloudLoginButton').style.display=sign?'none':'block';
   $('cloudRegisterButton').style.display=sign?'block':'none';
 }
 async function open(){
   const modal=$('modal'),p=$('modalPanel');
   modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
   p.innerHTML='<div class="modal-title">☁ 创作舱账号与同步</div>'+
     '<p class="tip">电脑端管理完整提示词和图片，手机只用于豆包制作。每个注册账号使用独立云端资料。</p>'+
     '<div class="grid-2 wide-gap"><button class="btn primary" data-cloud="mode-login">账号密码登录</button><button class="btn secondary" data-cloud="mode-register">注册新账号</button></div>'+
     '<div class="wide-gap"><input class="input" id="cloudUsername" placeholder="用户名或邮箱" autocomplete="username"></div>'+
     '<div class="wide-gap"><input class="input" id="cloudPassword" type="password" placeholder="登录密码（注册至少8位）" autocomplete="current-password"></div>'+
     '<div id="cloudRegisterFields" style="display:none"><div class="wide-gap"><input class="input" id="cloudInvite" placeholder="输入管理员发放的邀请码" autocapitalize="characters"></div></div>'+
     '<div class="wide-gap"><button class="btn primary full" id="cloudLoginButton" data-cloud="login">登录并获取电脑素材</button>'+
     '<button class="btn primary full" id="cloudRegisterButton" data-cloud="register" style="display:none">邀请码注册（无需邮箱）</button>'+
     '</div>'+
     '<div class="divider"></div><div class="grid-2"><button class="btn secondary" data-cloud="pull">↓ 重新获取参考图</button><button class="btn" data-cloud="push">↑ 回传完成状态</button></div>'+
     '<div class="grid-2 wide-gap"><button class="btn" data-cloud="logout">退出账号</button><button class="btn" data-cloud="clear">清除旧云缓存</button></div>'+
     '<p class="tip" id="cloudMessage" role="status">检查 CloudBase 登录状态中…</p><button class="btn slim secondary wide-gap" data-cloud="probe">诊断网络连接</button>';
   try{const u=await session();msg(u?'已登录 '+(u.email||u.uid):'尚未登录，第一次使用请先注册')}catch(e){msg(diagnose(e));}
 }
 $('modal').addEventListener('click',async ev=>{
   const b=ev.target.closest('[data-cloud]');if(!b)return;
   b.disabled=true;
   try{
     const key=b.dataset.cloud;
     if(key==='mode-login')switchMode('login');
     else if(key==='mode-register')switchMode('register');
     else if(key==='login')await login();
     else if(key==='register')await register();
     else if(key==='pull')await download();
     else if(key==='push')await uploadStatuses();
     else if(key==='logout')await logout();
     else if(key==='clear')clearCache();
     else if(key==='probe'){msg('正在检查腾讯云网关连通性…');window.Native?.probeCloudGateway?.();}
   }catch(e){msg('操作失败：'+diagnose(e));}
   finally{b.disabled=false;}
 });
 window.ManjuCloud={open,queueStatus,download,uploadStatuses,session,diagnose,normalize,reportProbe:msg,reportRegistrationError:msg,registrationResult,ensureReferences,catalog:()=>catalog.slice()};
})();