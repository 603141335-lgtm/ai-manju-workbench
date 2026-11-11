'use strict';
/**
 * Read-only Doubao video composer detection.
 * NEVER click unrelated model/settings menus: they may represent choices, not selected values.
 * 'ready' confirms the VIDEO composer only; model/aspect/duration are separate warnings.
 */
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function scanAndAct(target='probe'){
  const visible=el=>{
    if(!el||typeof el.getBoundingClientRect!=='function')return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>8&&r.height>8&&s.display!=='none'&&s.visibility!=='hidden';
  };
  const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
  const attr=(el,k)=>String(el?.getAttribute?.(k)||'').trim();
  const labels=el=>[text(el),attr(el,'aria-label'),attr(el,'title')].filter(Boolean);
  const controls=[...document.querySelectorAll('button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],label,[aria-pressed],[aria-selected]')]
    .filter(visible).slice(0,550);
  const allLabels=controls.flatMap(labels).filter(x=>x.length<140);
  const editors=[...document.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"],[data-placeholder],[placeholder]')]
    .filter(visible).slice(0,80);
  const placeholders=editors.flatMap(el=>[
    attr(el,'placeholder'),attr(el,'data-placeholder'),attr(el,'aria-placeholder'),attr(el,'aria-label')
  ]).filter(Boolean);
  const videoComposer=placeholders.some(x=>/描述.{0,18}视频|想要的.{0,10}视频|视频.{0,8}(?:创作|描述|生成)|describe.{0,20}video/i.test(x));
  const activeVideoChip=controls.some(el=>{
    const label=labels(el).find(v=>/视频生成|视频创作|AI视频生成/.test(v));
    if(!label||label.length>60)return false;
    if(attr(el,'aria-pressed')==='true'||attr(el,'aria-selected')==='true'||attr(el,'data-state')==='active')return true;
    const className=String(el.className||'');
    if(/(?:^|[\s_-])(?:selected|active|checked)(?:$|[\s_-])/i.test(className))return true;
    // The currently selected removable chip in Doubao contains a close control.
    const hasClose=/[×✕✖]/.test(text(el))||
      !!el.querySelector?.('[aria-label*="移除"],[aria-label*="关闭"],[aria-label*="清除"]');
    return hasClose;
  });
  // Some Doubao versions use a selected chip inside a plain non-button container.
  const chips=[...document.querySelectorAll('[class*="chip"],[class*="tag"],[data-state="active"]')]
    .filter(visible).slice(0,100);
  const chipVideo=chips.some(el=>{
    const t=text(el);
    return t.length<60&&/视频生成|视频创作/.test(t)&&(/[×✕✖]/.test(t)||attr(el,'data-state')==='active');
  });
  const video=videoComposer||activeVideoChip||chipVideo;
  const model=allLabels.some(v=>/Seedance\s*2(?:\.0)?\s*Fast/i.test(v));
  const ratio=allLabels.some(v=>/(?:^|[\s·•,，(（])16\s*:\s*9(?:$|[\s·•,，)）])/i.test(v)||/^16\s*:\s*9$/.test(v));
  const duration=allLabels.some(v=>/(?:^|[\s·•,，(（])15\s*(?:秒|s)(?:$|[\s·•,，)）])/i.test(v)||/^15\s*(?:秒|s)$/i.test(v));
  const genericComposer=placeholders.some(v=>/发消息|按住空格说话|问我任何问题/.test(v));
  return {
    video,model,ratio,duration,videoComposer,activeVideoChip,chipVideo,genericComposer,
    source:videoComposer?'视频输入框':activeVideoChip?'已选中的视频标签':chipVideo?'视频模式标签':'未识别到已选中的视频模式',
    controls:allLabels.slice(0,50),placeholders:placeholders.slice(0,15)
  };
}
async function ensure(wc){
  if(!wc||wc.isDestroyed())return {ready:false,message:'豆包网页尚未加载'};
  const url=wc.getURL();
  if(!/^https:\/\/(?:www\.)?doubao\.com\//i.test(url))return {ready:false,message:'请打开并登录豆包官方网站'};
  const exec=()=>wc.executeJavaScript('('+scanAndAct.toString()+')("probe")',true);
  try{
    let p=await exec();
    // Wait once for Doubao's asynchronous SPA editor transition, without clicking other controls.
    if(!p.video){await sleep(300);p=await exec();}
    const missing=[];
    if(!p.model)missing.push('Seedance 2.0 Fast');
    if(!p.ratio)missing.push('16:9');
    if(!p.duration)missing.push('15秒');
    const ready=!!p.video;
    return {
      ready,video:ready,model:!!p.model,ratio:!!p.ratio,duration:!!p.duration,
      settingsVerified:ready&&missing.length===0,
      manual:false,
      message:ready
        ?(missing.length?'已识别视频生成；请在豆包检查 '+missing.join('、')+'（不阻止导入）':'视频生成、Seedance 2.0 Fast、16:9、15秒均已识别')
        :'未识别到已选中的视频模式；如网页已打开视频生成，请点「人工确认模式」',
      details:p
    };
  }catch(e){return {ready:false,video:false,message:'检测豆包网页失败，请重试或人工确认：'+e.message};}
}
module.exports={scanAndAct,ensure};
