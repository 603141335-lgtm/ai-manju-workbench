'use strict';
/** Doubao video composer adapter. Never sends a message or changes uploaded media. */
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function scanAndAct(target){
  const visible=el=>{if(!el||!el.getBoundingClientRect)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>8&&r.height>8&&s.display!=='none'&&s.visibility!=='hidden'};
  const label=el=>[el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent].filter(Boolean).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)[0]||'';
  const els=[...document.querySelectorAll('button,[role="button"],[role="option"],[role="menuitem"],[aria-haspopup],label')].filter(visible);
  const find=(pattern)=>els.find(el=>pattern.test(label(el))&&label(el).length<100&&!el.disabled);
  const controls=els.map(x=>label(x)).filter(Boolean);
  const body=document.body?.innerText||'';
  const video=controls.some(x=>/^(?:视频生成|AI视频生成|视频创作)(?:\s*[×✕])?$/.test(x))||/视频生成\s*[×✕]/.test(body);
  const model=controls.some(x=>/Seedance\s*2\.0\s*Fast/i.test(x));
  const ratio=controls.some(x=>/16\s*:\s*9\s*[·•]\s*15\s*s/i.test(x))||controls.some(x=>/^(?:16\s*:\s*9|横屏)/.test(x));
  const duration=controls.some(x=>/15\s*s|15秒/i.test(x));
  if(target==='probe')return {video,model,ratio,duration,controls:controls.slice(0,60)};
  if(target==='menu'){
    const choices=els.filter(x=>/^(?:AI创作|创作|更多|\+|添加)$/i.test(label(x)));
    const el=choices.sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top)[0];
    if(!el)return {ok:false,reason:'没有找到创作模式选择菜单'};
    el.click();return {ok:true,clicked:label(el)};
  }
  if(target==='video'){
    if(video)return {ok:true,already:true};
    const b=find(/^(?:视频生成|AI视频生成|视频创作)$/)||find(/视频生成/);
    if(!b)return {ok:false,reason:'没有找到视频生成选项（可能需要手动打开创作菜单）'};
    b.click();return {ok:true,clicked:label(b)};
  }
  if(target==='model'){
    if(model)return {ok:true,already:true};
    const b=find(/Seedance|模型|选择模型/);
    if(!b)return {ok:false,reason:'未找到模型菜单'};
    b.click();return {ok:true,clicked:label(b)};
  }
  if(target==='fast'){
    const b=find(/Seedance\s*2\.0\s*Fast/i);
    if(!b)return {ok:false,reason:'当前账号未显示 Seedance 2.0 Fast'};
    b.click();return {ok:true,clicked:label(b)};
  }
  if(target==='settings'){
    const b=find(/16\s*:\s*9|\d+\s*s|参数|比例|时长|设置/);
    if(!b)return {ok:false,reason:'未找到视频参数菜单'};
    b.click();return {ok:true,clicked:label(b)};
  }
  if(target==='ratio'){
    const b=find(/^(?:16\s*:\s*9|横屏)(?:\s|$)/);
    if(!b)return {ok:false,reason:'未找到16:9比例'};
    b.click();return {ok:true,clicked:label(b)};
  }
  if(target==='duration'){
    const b=find(/^(?:15\s*s|15\s*秒)(?:\s|$)/i);
    if(!b)return {ok:false,reason:'未找到15秒选项'};
    b.click();return {ok:true,clicked:label(b)};
  }
  return {ok:false,reason:'未知检测项'};
}
async function ensure(wc){
  if(!wc||wc.isDestroyed())return {ready:false,message:'页面不存在'};
  const url=wc.getURL();
  if(!/^https:\/\/(?:www\.)?doubao\.com\//i.test(url))return {ready:false,message:'请打开并登录豆包官方网站'};
  const exec=async target=>wc.executeJavaScript('('+scanAndAct.toString()+')('+JSON.stringify(target)+')',true);
  try{
    let p=await exec('probe');
    if(!p.video){
      let selected=await exec('video');
      if(!selected.ok){await exec('menu');await sleep(280);selected=await exec('video')}
      await sleep(650);p=await exec('probe');
    }
    if(!p.video)return {ready:false,message:'没有确认视频生成模式，请在豆包网页手动选择「视频生成」',details:p};
    if(!p.model){await exec('model');await sleep(280);await exec('fast');await sleep(430);p=await exec('probe')}
    if(!p.ratio||!p.duration){
      await exec('settings');await sleep(300);
      if(!p.ratio){await exec('ratio');await sleep(250)}
      if(!p.duration){await exec('settings');await sleep(180);await exec('duration');await sleep(280)}
      p=await exec('probe');
    }
    const ready=p.video&&p.model&&p.ratio&&p.duration;
    return {ready,video:p.video,model:p.model,ratio:p.ratio,duration:p.duration,message:ready?'视频生成 · Seedance 2.0 Fast · 16:9 · 15秒 已确认':'视频模式已打开，但模型/比例/时长未全部确认，请在网页中检查设置',details:p};
  }catch(err){return {ready:false,message:'视频模式切换失败：'+err.message};}
}
module.exports={scanAndAct,ensure};
