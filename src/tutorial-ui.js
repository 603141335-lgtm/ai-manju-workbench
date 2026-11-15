'use strict';
/* Tutorial UI is presentation-only; all network I/O and checksum checking stays in main. */
(()=>{
 const $=id=>document.getElementById(id),B=window.bridge;
 if(!B?.getTutorialImage)return; // Optional offline browser mock tests may omit the tutorial bridge.
 const dialog=$('tutorialDialog'),image=$('tutorialSlideImage'),placeholder=$('tutorialImagePlaceholder');
 let manifest=null,index=0,serial=0,opened=false;
 const esc=s=>String(s||'').slice(0,400);
 async function refreshManifest(){
  const notice=await B.getNotice();
  manifest=notice?.tutorial||{version:'1',slides:[]};
  return manifest;
 }
 function close(){
  if(!dialog.open)return;
  dialog.close();opened=false;serial++;
  B.setOverlay(false);
 }
 async function render(){
  const tutorial=manifest||await refreshManifest(),slides=tutorial.slides||[];
  index=Math.max(0,Math.min(index,Math.max(0,slides.length-1)));
  const slide=slides[index];
  if(!slide){
   $('tutorialStepTitle').textContent='教程暂时不可用';
   $('tutorialStepDesc').textContent='请联网后刷新公告，或者稍后重试。';
   $('tutorialProgress').textContent='00 / 00';
   image.hidden=true;placeholder.hidden=false;placeholder.textContent='暂无教程图片';
   return;
  }
  $('tutorialHeading').textContent=esc(tutorial.title)||'独独AI工作台｜图文教程';
  $('tutorialStepTitle').textContent=(index+1)+' / '+slides.length+' · '+esc(slide.title);
  $('tutorialStepDesc').textContent=esc(slide.description);
  $('tutorialProgress').textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
  $('btnTutorialPrev').disabled=index===0;
  $('btnTutorialNext').textContent=index===slides.length-1?'完成教程 ✓':'下一步 →';
  image.hidden=true;image.removeAttribute('src');placeholder.hidden=false;placeholder.textContent='正在加载第 '+(index+1)+' 步图片…';
  const current=++serial;
  try{
   const result=await B.getTutorialImage(slide.id);
   if(current!==serial||!dialog.open)return;
   if(result?.dataUrl?.startsWith('data:image/')){
    image.src=result.dataUrl;image.hidden=false;placeholder.hidden=true;
   }else placeholder.textContent='图片尚未配置；你仍可以按照下面的文字完成操作';
  }catch(err){if(current===serial)placeholder.textContent='图片加载失败；请检查网络或重试'}
 }
 async function open(reset=true){
  if(reset)index=0;
  if(dialog.open)return render();
  // A native Doubao WebContentsView must be removed before an Electron dialog can overlay it.
  if($('noticeDialog')?.open){$('noticeDialog').close();B.setOverlay(false);}
  await refreshManifest();
  await new Promise(resolve=>setTimeout(resolve,30));
  B.setOverlay(true);
  dialog.showModal();opened=true;
  await render();
 }
 $('btnTutorial').onclick=()=>open().catch(console.error);
 $('btnCommunityTutorial').onclick=()=>open().catch(console.error);
 $('btnTutorialClose').onclick=$('btnTutorialSkip').onclick=close;
 $('btnTutorialPrev').onclick=()=>{if(index>0){index--;render()}};
 $('btnTutorialNext').onclick=()=>{
  if(index+1>=(manifest?.slides?.length||0)){
   try{localStorage.setItem('dudu-tutorial-seen',String(manifest?.version||'1'))}catch{}
   close();
  }else{index++;render()}
 };
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 if(B.onNoticeUpdated)B.onNoticeUpdated(v=>{
  if(!v?.tutorial)return;
  const old=manifest?.version;manifest=v.tutorial;
  if(dialog.open&&old!==manifest.version)render();
 });
 window.DuduTutorial={open,close,refresh:()=>refreshManifest().then(render)};
})();
