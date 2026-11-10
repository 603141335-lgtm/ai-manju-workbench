'use strict';
/** Conservative DOM-only Doubao video-mode adapter. Never sends a chat or starts generation.
 * Every function is self-contained so it can execute inside an isolated WebContentsView.
 */
function probeVideoMode(){
 const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
 const visible=e=>{if(!e?.getBoundingClientRect)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>8&&r.height>8&&s.visibility!=='hidden'&&s.display!=='none'&&r.bottom>0&&r.top<innerHeight};
 const raw=[...document.querySelectorAll('button,[role="button"],[role="option"],[role="menuitem"],[aria-haspopup],label')].filter(visible).map(el=>{
  const r=el.getBoundingClientRect();
  return {el,text:norm(el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||el.textContent).slice(0,100),bottom:r.bottom,top:r.top};
 }).filter(x=>x.text.length>0&&x.text.length<88);
 const lower=raw.filter(x=>x.bottom>=innerHeight*.42);
 const has=(arr,re)=>arr.some(x=>re.test(x.text));
 const mode=has(lower,/^(?:视频生成|AI视频生成|创作视频|生成视频)(?:\s*[×x])?$/i)||has(lower,/视频生成.*(?:×|Seedance|16:9)/i);
 const model=has(lower,/Seedance\s*2[.]0\s*Fast/i);
 const aspect=has(lower,/\b16\s*:\s*9\b/);
 const duration=has(lower,/(?:^|[\s·|])15\s*(?:s|秒)\b/i)||has(lower,/15秒/);
 const editor=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible).find(x=>x.getBoundingClientRect().bottom>innerHeight*.43);
 return {ready:!!editor,mode,model,aspect,duration,verified:!!(mode&&model&&aspect&&duration),
  evidence:lower.filter(x=>/视频生成|Seedance|16:9|15\s*(?:s|秒)/i.test(x.text)).map(x=>x.text).slice(0,9),
  inputs:!!editor,preview:lower.map(x=>x.text).slice(-18)};
}
function clickVideoModeControl(action){
 const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
 const visible=e=>{if(!e?.getBoundingClientRect)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>7&&r.height>7&&s.display!=='none'&&s.visibility!=='hidden'&&r.bottom>0&&r.top<innerHeight};
 const items=[...document.querySelectorAll('button,[role="button"],[role="option"],[role="menuitem"],[role="radio"],label,[aria-haspopup]')].filter(visible).map(el=>{
  const r=el.getBoundingClientRect(),text=norm(el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||el.textContent);
  return {el,text,score:r.bottom>=innerHeight*.42?100:0};
 }).filter(x=>x.text&&x.text.length<75&&!x.el.disabled);
 const options={
  'open-mode':[/^(?:视频生成|视频创作|创作|更多|模型|AI创作|图片生成|聊天)$/i,/^视频生成/i],
  'choose-mode':[/^(?:视频生成|AI视频生成|创作视频|生成视频)$/i,/视频生成/i],
  'open-model':[/Seedance\s*2[.]0/i,/^模型/i],
  'choose-model':[/^Seedance\s*2[.]0\s*Fast$/i,/Seedance\s*2[.]0\s*Fast/i],
  'open-settings':[/16\s*:\s*9.*15\s*(?:s|秒)/i,/^16\s*:\s*9$/,/^\d+\s*(?:s|秒)$/, /^(?:比例|时长|设置|参数)$/],
  'choose-aspect':[/^16\s*:\s*9$/i,/16\s*:\s*9/],
  'choose-duration':[/^15\s*(?:s|秒)$/i,/15\s*(?:s|秒)/i]
 };
 const patterns=options[action];if(!patterns)return {ok:false,reason:'未知动作'};
 let target=null;
 for(const re of patterns){const matches=items.filter(x=>re.test(x.text));if(matches.length){target=matches.sort((a,b)=>b.score-a.score||a.text.length-b.text.length)[0];break;}}
 if(!target)return {ok:false,reason:action+' 控件没有找到',candidates:items.filter(x=>/视频|模型|Seedance|16:9|15\s*(?:s|秒)/i.test(x.text)).map(x=>x.text).slice(0,14)};
 if(action==='open-model'&&/^Seedance\s*2[.]0\s*Fast$/i.test(target.text))return {ok:true,clicked:false,already:true,label:target.text};
 try{target.el.click();return {ok:true,clicked:true,label:target.text}}catch(e){return {ok:false,reason:e.message}};
}
const callVideoMode=(fn,arg)=>'('+fn.toString()+')('+JSON.stringify(arg===undefined?null:arg)+')';
module.exports={probeVideoMode,clickVideoModeControl,callVideoMode};
