'use strict';
// Read visible UI state only. Never read cookies, credentials or private web APIs.
function inspectPage(){
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>12&&r.height>12&&s.visibility!=='hidden'&&s.display!=='none'};
 const options=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
 const rank=el=>{const r=el.getBoundingClientRect();return(el===document.activeElement?350:0)+Math.min(600,r.width)+(r.bottom>innerHeight*0.4?180:0)+(el.isContentEditable?100:0)};
 const edit=options.sort((a,b)=>rank(b)-rank(a))[0];
 if(!edit)return {ready:false,message:'未识别豆包聊天输入框',prompt:'',attachments:[],mentions:[],fileInputs:[]};
 const prompt=edit.isContentEditable?(edit.innerText||''):(edit.value||'');
 let root=edit.closest('form')||edit.parentElement;
 if(root===edit.parentElement)root=root?.parentElement?.parentElement||root;
 const raw=[...root.querySelectorAll('img[alt],img[title],[title],[aria-label]')].slice(0,140);
 const attachments=[],seen=new Set();
 for(const item of raw){
  if(!visible(item))continue;
  const val=(item.getAttribute('title')||item.getAttribute('aria-label')||item.getAttribute('alt')||'').trim();
  if(!val||val.length>170||seen.has(val))continue;
  if(/\.(png|jpe?g|webp|gif|bmp)/i.test(val)){seen.add(val);attachments.push({name:val,label:val});}
 }
 const mentionSel='[data-mention],[data-type*="mention"],[data-node-type*="mention"],[contenteditable="false"]';
 const mentions=[...edit.querySelectorAll(mentionSel)].map(el=>({text:(el.innerText||el.textContent||'').trim().slice(0,170),native:true})).filter(x=>x.text).slice(0,40);
 return {ready:true,message:'已识别聊天输入框',prompt:prompt.slice(0,300000),attachments,mentions};
}
function uploadInputInfo(){
 // Prefer multi-image inputs; do not accidentally upload to an account avatar input.
 const inputs=[...document.querySelectorAll('input[type="file"]')].filter(x=>!x.disabled);
 const image=inputs.filter(x=>x.multiple||/image/i.test(x.accept||''));
 const el=image.find(x=>x.multiple&&/image/i.test(x.accept||''))||image.find(x=>x.multiple);
 if(!el)return null;
 const css=el.accept&&el.accept.includes('image')?'input[type="file"][multiple][accept*="image"]':'input[type="file"][multiple]';
 return {css,multiple:true,accept:el.accept||''};
}
function uploadButtonRect(){
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>10&&r.height>10&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};
 const els=[...document.querySelectorAll('button,[role="button"],label,[role="menuitem"]')].filter(visible);
 const target=els.find(el=>/^(上传文件或图片|上传图片|上传本地图片|上传文件)$/.test((el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim()));
 if(!target)return null;
 const r=target.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
}
function inspectMentionOptions(){
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>12&&r.height>12&&s.visibility!=='hidden'&&s.display!=='none'};
 const boxes=[...document.querySelectorAll('[role="listbox"],[role="menu"],[data-state="open"],[class*="mention"],[class*="popover"]')].filter(visible);
 const opts=[];
 for(const box of boxes.slice(-15)){
  for(const el of box.querySelectorAll('[role="option"],[role="menuitem"],li,button,[data-value]')){
   if(!visible(el))continue;
   const t=(el.textContent||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,150);
   if(!t)continue;
   const r=el.getBoundingClientRect();opts.push({text:t,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
  }
 }
 return opts.slice(0,120);
}
function focusComposer(){
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>30&&r.height>15};
 const els=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
 els.sort((a,b)=>{const r=x=>x.getBoundingClientRect();return (r(b).width+(r(b).bottom>innerHeight*0.4?300:0))-(r(a).width+(r(a).bottom>innerHeight*0.4?300:0))});
 const el=els[0];if(!el)return false;el.focus();
 if(el.isContentEditable){const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(el);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}
 else if(typeof el.setSelectionRange==='function')el.setSelectionRange(el.value.length,el.value.length);
 return true;
}
function removeTrailingAt(){
 const el=document.activeElement;
 if(!el||!el.matches('textarea,[contenteditable="true"],[role="textbox"]'))return false;
 const v=el.isContentEditable?el.textContent:(el.value||'');return v.endsWith('@');
}
function inspectRichMentions(){
 const els=[...document.querySelectorAll('[contenteditable="true"]')].filter(el=>el.getBoundingClientRect().width>50);
 const edit=els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];
 if(!edit)return [];
 return [...edit.querySelectorAll('[data-mention],[data-type*="mention"],[contenteditable="false"]')].map(el=>({text:(el.innerText||el.textContent||'').trim().slice(0,150)})).filter(x=>x.text).slice(0,40);
}
const js=fn=>'('+fn.toString()+')()';
module.exports={inspectPage,uploadInputInfo,uploadButtonRect,inspectMentionOptions,focusComposer,removeTrailingAt,inspectRichMentions,js};
