'use strict';
(function(){
 const ENV='marginal-wildfowl-d9dw2q0e469ceb',BUCKET='manju-assets';
 let sdkApp=null,otpVerify=null,uid='',email='',inflight=false;
 const read=(key, fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
 const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
 function guard(result,message){if(!result||result.error)throw Error(message+': '+(result&&result.error&&result.error.message||'请求失败'));return result.data;}
 function uiMessage(t){const el=document.getElementById('cloudMessage');if(el)el.textContent=t;}
 function getApp(){if(!window.ManjuCloudBaseSDK)throw Error('未能加载 CloudBase 客户端组件，请重新安装正式 APK');if(!sdkApp)sdkApp=window.ManjuCloudBaseSDK.init({env:ENV});return sdkApp;}
 function currentAuth(){return getApp().auth;}
 async function session(){
   const r=guard(await currentAuth().getSession(),'查询登录状态');
   const user=r&& (r.user||(r.session&&r.session.user));
   if(!user||!user.id)return null;
   const id=String(user.id);
   if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))throw Error('登录身份无效');
   if(window.Native&&window.Native.getCloudOwner){
     const local=window.Native.getCloudOwner();
     if(local&&local!==id)throw Error('本机缓存属于另一账号。请先退出原账号并清除云缓存，避免数据混用');
   }
   uid=id;email=String(user.email||'');
   return {uid,email};
 }
 async function sendOtp(){
   const value=document.getElementById('cloudEmail').value.trim();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('请输入有效邮箱');
   const res=guard(await currentAuth().signInWithOtp({email:value,shouldCreateUser:true}),'发送验证码');
   if(typeof res.verifyOtp!=='function')throw Error('当前 SDK 未提供验证码校验回调');
   otpVerify=res.verifyOtp;uiMessage('验证码已发送至 '+value+'，请在邮箱中查看');email=value;
 }
 async function verifyOtp(){
   if(!otpVerify)throw Error('请先获取邮箱验证码');
   const code=document.getElementById('cloudCode').value.trim();if(!code)throw Error('请输入验证码');
   guard(await otpVerify({token:code}),'校验验证码');otpVerify=null;
   await session();uiMessage('登录成功，已启用 CloudBase 用户隔离：'+email);
   await loadCache();
 }
 async function loadCache(){
   if(!uid||!window.Native||!window.Native.getCloudWorkspaceForUid)return;
   const raw=window.Native.getCloudWorkspaceForUid(uid);if(!raw)return;
   try{window.__manjuTest.setDesktopProject(JSON.parse(raw),true);uiMessage('已载入经过身份确认的本地离线剧集缓存');}
   catch(e){uiMessage('云端缓存读取失败：'+e.message)}
 }
 async function fetchRows(table,project){
   let q=getApp().rdb().from(table).select('*');
   if(project)q=q.eq('project_id',project);
   const data=guard(await q,'读取'+table);
   return Array.isArray(data)?data:[];
 }
 function cloudWorkspace(project,episodeRows,segmentRows){
   const episodes=episodeRows.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(e=>({
     id:e.id,number:e.episode_number,title:e.title||'第'+e.episode_number+'集',original:e.original_text||'',locked:false,hidden:false,
     segments:segmentRows.filter(s=>s.episode_id===e.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(s=>({
       id:s.id,n:s.segment_number,title:s.title||'第'+s.segment_number+'段',text:s.prompt_text||'',
       codes:Array.isArray(s.reference_codes)?s.reference_codes:[],manual:true,locked:!!s.video_metadata?.locked,hidden:!!s.video_metadata?.hidden,
       status:s.status==='已完成'?'done':s.status==='需重做'?'redo':'pending'
     }))
   }));
   return {version:2,title:project.title||'漫剧项目',episodes,assetFolder:'',chosenPaths:{},
      activeEpisodeId:episodes[0]&&episodes[0].id||null,activeSegmentId:episodes[0]&&episodes[0].segments[0]&&episodes[0].segments[0].id||null};
 }
 async function download(){
   if(inflight)throw Error('上一项同步正在进行');
   inflight=true;
   try{
     const owner=await session();if(!owner)throw Error('请先邮箱登录');
     uiMessage('正在读取项目…');
     const projects=await fetchRows('manju_projects');
     if(!projects.length){uiMessage('该账号暂无云端项目，请先在电脑端上传当前剧集');return {projects:0}}
     const p=projects[0];
     const [episodes,segments,assets]=await Promise.all([fetchRows('manju_episodes',p.id),fetchRows('manju_segments',p.id),fetchRows('manju_assets',p.id)]);
     const data=cloudWorkspace(p,episodes,segments);
     if(!window.Native||!window.Native.saveCloudWorkspace)throw Error('安卓缓存接口不存在');
     window.Native.saveCloudWorkspace(JSON.stringify(data),uid);
     let scheduled=0;
     for(const item of assets){
       if(!item.storage_path||!item.code||!item.sha256)continue;
       try{
         const signed=guard(await getApp().storage.from(BUCKET).createSignedUrl(item.storage_path,3600),'获取私有图临时链接');
         const url=typeof signed==='string'?signed:(signed.signedUrl||signed.signedURL||signed.signed_url||signed.url);
         if(!url||!url.startsWith('https://'))throw Error('存储返回的下载地址无效');
         window.Native.cacheCloudAsset(uid,p.id,item.code,item.sha256,item.mime_type,url);scheduled++;
       }catch(e){uiMessage('参考图 '+item.code+' 暂时无法缓存：'+e.message)}
     }
     uiMessage('已获取 '+episodes.length+' 集、'+segments.length+' 段；已安排 '+scheduled+' 张参考图下载。下载完成后可使用一键保存图片。');
     return {episodes:episodes.length,segments:segments.length,assets:scheduled};
   }finally{inflight=false}
 }
 function queueStatus(segKey,status){
   if(!uid)return;
   if(!String(segKey).startsWith('desktop_'))return;
   const id=String(segKey).slice(8);
   if(!/^[a-fA-F0-9-]{36}$/.test(id))return;
   const all=read('manju_cloud_status_queue',{});
   if(!all[uid])all[uid]={};
   all[uid][id]={status,at:Date.now()};
   save('manju_cloud_status_queue',all);
 }
 async function uploadStatuses(){
   const owner=await session();if(!owner)throw Error('请先邮箱登录');
   const all=read('manju_cloud_status_queue',{}),queue=all[uid]||{};
   const mappings={'已完成':'已完成','需重做':'需重做','待制作':'待制作'};
   let n=0;
   for(const [id,pending] of Object.entries(queue)){
     const status=mappings[pending.status];if(!status)continue;
     // RLS verifies row ownership on server. The client never transmits owner_id.
     guard(await getApp().rdb().from('manju_segments').update({status,updated_at:new Date().toISOString()}).eq('id',id),'同步第'+id+'段状态');
     delete queue[id];n++;save('manju_cloud_status_queue',all);
   }
   uiMessage('已成功同步 '+n+' 条段落状态');
   return {synced:n};
 }
 async function signOut(){
   guard(await currentAuth().signOut(),'退出登录');
   uid='';email='';otpVerify=null;
   if(window.Native&&window.Native.clearCloudWorkspace)window.Native.clearCloudWorkspace();
   localStorage.removeItem('manju-v2-state');
   localStorage.removeItem('manju_cloud_status_queue');
   uiMessage('已退出，正在清理本地云端缓存');
   location.reload();
 }
 async function open(){
   const modal=document.getElementById('modal'),panel=document.getElementById('modalPanel');
   modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
   panel.innerHTML='<div class="modal-title">☁ 云端同步 · CloudBase</div>'+
     '<div class="tip">电脑负责上传完整提示词和原图，手机只下载制作素材并回传完成状态。不会同步豆包账号、Cookie、视频。</div>'+
     '<div class="wide-gap"><input class="input" id="cloudEmail" type="email" placeholder="邮箱账号"></div>'+
     '<div class="grid-2 wide-gap"><button class="btn" data-cloud="send">发送验证码</button><input class="input" id="cloudCode" placeholder="6位邮箱验证码" inputmode="numeric"></div>'+
     '<div class="grid-2 wide-gap"><button class="btn primary" data-cloud="verify">登录</button><button class="btn" data-cloud="refresh">检查登录状态</button></div>'+
     '<div class="divider"></div><div class="grid-2"><button class="btn primary" data-cloud="pull">↓ 获取剧集和图片</button><button class="btn" data-cloud="push">↑ 回传完成状态</button></div>'+
     '<div class="grid-2 wide-gap"><button class="btn" data-cloud="logout">退出账号</button><button class="btn" data-cloud="close">关闭窗口</button></div>'+
     '<p class="tip" id="cloudMessage">尚未验证 CloudBase 连接。请先登录同一个邮箱账号。</p>';
   try{
     const me=await session();
     if(me){uiMessage('已登录 '+(me.email||me.uid));await loadCache();}
   }catch(e){uiMessage('会话尚未连接：'+e.message)}
 }
 document.getElementById('modal').addEventListener('click',async ev=>{
   const b=ev.target.closest('[data-cloud]');if(!b)return;const action=b.dataset.cloud;
   b.disabled=true;
   try{
     if(action==='send')await sendOtp();
     if(action==='verify')await verifyOtp();
     if(action==='refresh'){const me=await session();uiMessage(me?'当前已登录：'+(me.email||me.uid):'尚未登录');}
     if(action==='pull')await download();
     if(action==='push')await uploadStatuses();
     if(action==='logout')await signOut();
     if(action==='close')document.getElementById('modal').classList.add('hidden');
   }catch(e){uiMessage('操作失败：'+e.message)}
   finally{b.disabled=false;}
 });
 window.ManjuCloud={open,queueStatus,download,uploadStatuses,session};
})();