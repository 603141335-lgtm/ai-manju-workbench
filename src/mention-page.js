'use strict';
/**
 * Functions are serialized and evaluated in the active Doubao WebContentsView.
 * They inspect the user's visible UI only. No credentials, cookies or private APIs.
 * Every function must be self-contained (no module-scope variables).
 */
function inspectPage(){
 const visible=el=>{if(!el?.getBoundingClientRect)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>12&&r.height>12&&s.visibility!=='hidden'&&s.display!=='none'};
 const editors=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
 const rank=el=>{const r=el.getBoundingClientRect();return (el===document.activeElement?350:0)+Math.min(700,r.width)+(r.bottom>innerHeight*.4?200:0)+(el.isContentEditable?120:0)};
 const edit=editors.sort((a,b)=>rank(b)-rank(a))[0];
 if(!edit)return {ready:false,message:'没有识别到可见的豆包聊天输入框',prompt:'',attachments:[],mentions:[],busy:true};
 const prompt=edit.isContentEditable?(edit.innerText||''):(edit.value||'');
 let root=edit.closest('form')||edit.parentElement;
 if(root===edit.parentElement)root=root?.parentElement?.parentElement||root;
 if(!root)root=edit.parentElement||document.body;
 const details=[...root.querySelectorAll('img[alt],img[title], [title],[aria-label], [data-filename], [data-name]')].filter(visible).slice(0,220);
 const attachments=[],seen=new Set();
 for(const item of details){
  const raw=(item.getAttribute('data-filename')||item.getAttribute('data-name')||item.getAttribute('title')||item.getAttribute('aria-label')||item.getAttribute('alt')||'').trim();
  const match=raw.match(/(?:^|[\\/\s])([A-Za-z][A-Za-z0-9-]{1,40}\.(?:png|jpe?g|webp|gif|bmp))(?=$|\s|[，,）\]])/i);
  if(!match)continue;const name=match[1];
  if(seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());
  attachments.push({name,label:raw.slice(0,150)});
 }
 const editMentions=[...edit.querySelectorAll('[data-mention],[data-type*="mention"],[data-node-type*="mention"],[contenteditable="false"]')].map(el=>({
  text:(el.innerText||el.textContent||el.getAttribute('data-value')||'').trim().slice(0,170),
  marked:el.hasAttribute('data-mention')||/mention/i.test((el.getAttribute('data-type')||'')+' '+(el.getAttribute('data-node-type')||'')),
 })).filter(x=>x.text).slice(0,50);
 const busy=!!root.querySelector('[role="progressbar"],[aria-busy="true"],[data-state="uploading"],[class*="uploading"],[class*="progress"]');
 return {ready:true,message:'已识别豆包输入框',prompt:prompt.slice(0,300000),attachments,mentions:editMentions,busy,editorType:edit.tagName};
}
function uploadAction(){
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>8&&r.height>8&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&s.display!=='none'&&s.visibility!=='hidden'};
 const controls=[...document.querySelectorAll('button,[role="button"],label,[role="menuitem"]')].filter(visible);
 const text=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim().replace(/\s+/g,' ');
 const upload=controls.find(el=>/^(上传文件或图片|上传图片|上传本地图片|上传文件|选择本地文件|从本地上传|上传素材)$/i.test(text(el)));
 if(upload){const r=upload.getBoundingClientRect();return {kind:'upload',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),label:text(upload)};}
 // Some Doubao versions reveal the upload action only after pressing "+".
 const add=controls.filter(el=>/^(\+|添加|添加附件|添加文件|附加文件|附件|更多附件)$/i.test(text(el)));
 const candidate=add.filter(el=>el.getBoundingClientRect().bottom>innerHeight*.45).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
 if(candidate){const r=candidate.getBoundingClientRect();return {kind:'open-menu',x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),label:text(candidate)};}
 return null;
}
function candidateFileInput(){
 // Fallback ONLY when the page has one unambiguous image-capable input.
 // Do not select any hidden profile/avatar input simply because it is multiple.
 const inputs=[...document.querySelectorAll('input[type="file"]')].filter(el=>!el.disabled);
 const images=inputs.filter(el=>/(image|\.png|\.jpg|\.jpeg|\.webp)/i.test(el.accept||''));
 const target=images.length===1?images[0]:null;
 if(!target)return null;
 const marker='data-doubao-workbench-file';
 for(const el of inputs)el.removeAttribute(marker);
 target.setAttribute(marker,'1');
 return {selector:'input[type="file"][data-doubao-workbench-file="1"]',multiple:!!target.multiple,accept:target.accept||''};
}
function inspectMentionOptions(){
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>12&&r.height>12&&s.visibility!=='hidden'&&s.display!=='none'};
 const boxes=[...document.querySelectorAll('[role="listbox"],[role="menu"],[data-state="open"],[class*="mention"],[class*="popover"]')].filter(visible);
 const options=[],seen=new Set();
 for(const box of boxes.slice(-12))for(const el of box.querySelectorAll('[role="option"],[role="menuitem"],li,button,[data-value]')){
  if(!visible(el))continue;
  const text=(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,150);
  const r=el.getBoundingClientRect(),key=text+'@'+Math.round(r.x)+','+Math.round(r.y);
  if(!text||seen.has(key))continue;seen.add(key);options.push({text,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
 }
 return options.slice(0,100);
}
function focusComposer(){
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>45&&r.height>20};
 const editors=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
 editors.sort((a,b)=>{const rank=el=>{const r=el.getBoundingClientRect();return r.width+(r.bottom>innerHeight*.4?300:0)};return rank(b)-rank(a)});
 const el=editors[0];if(!el)return false;
 el.focus();
 if(el.isContentEditable){const s=window.getSelection(),r=document.createRange();r.selectNodeContents(el);r.collapse(false);s.removeAllRanges();s.addRange(r)}
 else if(typeof el.setSelectionRange==='function')el.setSelectionRange(el.value.length,el.value.length);
 return true;
}
function trailingAt(){
 const el=document.activeElement;
 if(!el||!el.matches('textarea,[contenteditable="true"],[role="textbox"]'))return false;
 const v=el.isContentEditable?(el.textContent||''):(el.value||'');return v.endsWith('@');
}
function inspectRichMentions(){
 const els=[...document.querySelectorAll('[contenteditable="true"]')].filter(el=>el.getBoundingClientRect().width>50);
 const editor=els.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];
 if(!editor)return [];
 return [...editor.querySelectorAll('[data-mention],[data-type*="mention"],[data-node-type*="mention"],[contenteditable="false"]')].map(el=>({
  text:(el.innerText||el.textContent||'').trim().slice(0,150),
  marked:el.hasAttribute('data-mention')||/mention/i.test((el.getAttribute('data-type')||'')+' '+(el.getAttribute('data-node-type')||''))
 })).filter(x=>x.text).slice(0,40);
}
const js=fn=>'('+fn.toString()+')()';
module.exports={inspectPage,uploadAction,candidateFileInput,inspectMentionOptions,focusComposer,trailingAt,inspectRichMentions,js};
