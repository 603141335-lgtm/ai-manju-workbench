'use strict';
/**
 * Functions executed exclusively inside the current, trusted Doubao chat view.
 * Based on the standalone browser extension's tested DOM/File/DataTransfer path.
 * No cookies, auth tokens, remote APIs or automatic send calls.
 * Each exported function is self-contained so it can be serialized by .toString().
 */
function probe(){
 const richText=root=>{let s='';function visit(node){if(node.nodeType===3){s+=node.nodeValue||'';return;}if(node.nodeType!==1)return;const tag=node.tagName;if(tag==='BR'){if(node.parentElement?.childNodes.length!==1)s+='\n';return;}if(['DIV','P','LI'].includes(tag)&&s.length>0)s+='\n';for(const child of node.childNodes)visit(child);}for(const child of root.childNodes)visit(child);return s;};
 const visible=el=>{if(!el?.getBoundingClientRect)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>15&&r.height>12&&s.display!=='none'&&s.visibility!=='hidden'};
 const els=[...document.querySelectorAll('.guidance-input-content .tiptap.ProseMirror[contenteditable="true"],.guidance-input-content [contenteditable="true"],.tiptap.ProseMirror[contenteditable="true"],textarea.semi-input-textarea,[role="textbox"][contenteditable="true"],textarea,[contenteditable="true"]')].filter(visible);
 const rank=el=>{const r=el.getBoundingClientRect();return (el.closest('.guidance-input-content')?500:0)+(el.matches('.tiptap.ProseMirror')?200:0)+Math.min(r.width,700)+(r.bottom>innerHeight*.35?100:0)};
 const edit=els.sort((a,b)=>rank(b)-rank(a))[0];
 if(!edit)return {ready:false,message:'没有找到豆包的聊天输入框'};
 const region=edit.closest('.guidance-input-content')?.parentElement||edit.closest('form')||edit.parentElement?.parentElement||document.body;
 // No data URLs, cookies or message history are returned to the Electron host.
 const names=new Set(),thumbs=new Set();
 for(const el of region.querySelectorAll('[title],[aria-label],[data-filename],img[alt]')){
  const str=[el.getAttribute('title'),el.getAttribute('aria-label'),el.getAttribute('data-filename'),el.getAttribute('alt')].filter(Boolean).join(' ');
  for(const m of str.matchAll(/(?:^|[\s/\\])([^\s/\\<>"']+\.(?:png|jpe?g|webp|gif))(?!\w)/gi))names.add(m[1].slice(0,180));
 }
 for(const img of region.querySelectorAll('img')){
  const r=img.getBoundingClientRect(),src=img.currentSrc||img.src||'';
  if(r.width>=38&&r.height>=38&&r.width<=260&&r.height<=260&&src)thumbs.add(src.slice(0,400));
 }
 const busy=!!region.querySelector('[role="progressbar"],[aria-busy="true"],[data-state="uploading"],[class*="uploading"]');
 const raw=edit.isContentEditable?richText(edit):(edit.value||'');
 const rich=[...edit.querySelectorAll('[data-mention],[data-type*="mention"],[data-node-type*="mention"],[contenteditable="false"]')].map(x=>({text:(x.innerText||x.textContent||'').trim().slice(0,140),marked:x.hasAttribute('data-mention')||/mention/i.test((x.getAttribute('data-type')||'')+' '+(x.getAttribute('data-node-type')||''))})).filter(x=>x.text);
 return {ready:true,prompt:raw.slice(0,300000),names:[...names],thumbs:[...thumbs],busy,mentions:rich,editor:edit.classList.contains('tiptap')?'rich':edit.tagName.toLowerCase()};
}
function selectImageFile(payload){
 // Equivalent to standalone plugin v0.1: File -> DataTransfer -> native input/change.
 const inputs=[...document.querySelectorAll('input[type="file"]')].filter(x=>!x.disabled);
 const candidates=inputs.filter(x=>!x.accept||/image|png|jpe?g|webp/i.test(x.accept));
 const input=candidates.find(x=>x.multiple&&/image|png|jpe?g|webp/i.test(x.accept))||candidates.find(x=>/image|png|jpe?g|webp/i.test(x.accept))||candidates.find(x=>x.multiple)||candidates[0];
 if(!input)return {ok:false,message:'豆包当前页面未提供图片上传控件，请先点开聊天框的“＋”上传菜单后重试'};
 if(!payload||!payload.base64||!payload.name)return {ok:false,message:'没有可提交的图片文件'};
 let file;
 try{
  const raw=atob(payload.base64);const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  file=new File([bytes],payload.name,{type:payload.mime||'image/png',lastModified:payload.modified||Date.now()});
 }catch(e){return {ok:false,message:'无法构造浏览器图片文件：'+e.message};}
 const dt=new DataTransfer();dt.items.add(file);
 input.files=dt.files;
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
 return {ok:true,fileSelected:true,selectedName:file.name,message:'已触发豆包原生文件上传处理，请继续核验附件'};
}
function openUploadMenu(){
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>10&&r.height>10&&r.top>=0&&r.bottom<=innerHeight};
 const controls=[...document.querySelectorAll('button,[role="button"],[role="menuitem"],label')].filter(visible);
 const label=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim().replace(/\s+/g,' ');
 const plus=controls.find(el=>/^(?:\+|添加|添加附件|附件|更多附件|添加文件)$/i.test(label(el)));
 if(!plus)return {ok:false,message:'未找到聊天框附件“＋”按钮'};
 plus.click();return {ok:true,message:'已打开附件操作菜单'};
}
function setPrompt(payload){
 const richText=root=>{let s='';function visit(node){if(node.nodeType===3){s+=node.nodeValue||'';return;}if(node.nodeType!==1)return;const tag=node.tagName;if(tag==='BR'){if(node.parentElement?.childNodes.length!==1)s+='\n';return;}if(['DIV','P','LI'].includes(tag)&&s.length>0)s+='\n';for(const child of node.childNodes)visit(child);}for(const child of root.childNodes)visit(child);return s;};
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>25&&r.height>15};
 const els=[...document.querySelectorAll('.guidance-input-content .tiptap.ProseMirror[contenteditable="true"],.guidance-input-content [contenteditable="true"],.tiptap.ProseMirror[contenteditable="true"],textarea.semi-input-textarea,[role="textbox"][contenteditable="true"],textarea,[contenteditable="true"]')].filter(visible);
 const rank=el=>{const r=el.getBoundingClientRect();return(el.closest('.guidance-input-content')?500:0)+(el.matches('.tiptap.ProseMirror')?200:0)+Math.min(r.width,700)};
 const el=els.sort((a,b)=>rank(b)-rank(a))[0];if(!el)return {ok:false,message:'没有找到豆包聊天输入框'};
 const actual=el.isContentEditable?richText(el):(el.value||'');
 if(actual===payload.text)return {ok:true,same:true,length:actual.length,message:'提示词已有相同内容，未重复填写'};
 if(actual.trim()&&!payload.replace&&actual.trim()!==String(payload.allowedExisting||'').trim())return {ok:false,needsConfirmation:true,message:'豆包聊天框已有不同草稿，禁止未经确认直接覆盖'};
 if(el.isContentEditable&&el.querySelector('[data-mention],[data-type*="mention"],[contenteditable="false"]'))return {ok:false,message:'聊天框已有富文本引用组件，为避免丢失引用已停止自动改写'};
 el.focus();
 if(el.isContentEditable){
  const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);
  if(!document.execCommand('insertText',false,payload.text))return {ok:false,message:'豆包富文本编辑器拒绝写入'};
 }else{
  const desc=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  desc.set.call(el,payload.text);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null}));el.dispatchEvent(new Event('change',{bubbles:true}));
 }
 const now=el.isContentEditable?richText(el):(el.value||'');
 return {ok:now.replace(/\r\n/g,'\n').trim()===payload.text.replace(/\r\n/g,'\n').trim(),length:now.length,expected:payload.text.length,message:'提示词写入后已回读'};
}
const call=(fn,arg)=>'('+fn.toString()+')('+JSON.stringify(arg===undefined?null:arg)+')';
module.exports={probe,selectImageFile,openUploadMenu,setPrompt,call};
