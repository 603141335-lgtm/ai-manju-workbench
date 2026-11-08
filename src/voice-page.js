'use strict';
// Serialized, self-contained helpers run inside the user's active Doubao chat only.
// An upload attempt is NOT an uploaded/verified audio file.
function probeAudio(){
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>12&&r.height>12&&s.display!=='none'&&s.visibility!=='hidden'};
 const editor=[...document.querySelectorAll('.guidance-input-content [contenteditable="true"],.tiptap.ProseMirror[contenteditable="true"],textarea,[role="textbox"]')].filter(visible)[0];
 if(!editor)return {ready:false,names:[],busy:false};
 const root=editor.closest('.guidance-input-content')?.parentElement||editor.closest('form')||editor.parentElement?.parentElement||document.body;
 const names=new Set();for(const el of root.querySelectorAll('[title],[aria-label],[data-filename],[data-name]')){
  const label=[el.getAttribute('title'),el.getAttribute('aria-label'),el.getAttribute('data-filename'),el.getAttribute('data-name')].filter(Boolean).join(' ');
  for(const m of label.matchAll(/(?:^|[\s/\\])([^\s/\\<>"']+\.(?:mp3|wav))(?!\w)/gi))names.add(m[1]);
 }
 const busy=!!root.querySelector('[role="progressbar"],[aria-busy="true"],[data-state="uploading"],[class*="uploading"]');
 return {ready:true,names:[...names],busy};
}
function openAudioUploadMenu(){
 const el=[...document.querySelectorAll('button,[role="button"],[role="menuitem"]')].find(x=>{
  const r=x.getBoundingClientRect();if(r.width<12||r.height<12)return false;
  return /^(?:上传文件或图片|上传文件|上传音频|上传声音|从本地上传)$/.test((x.getAttribute('aria-label')||x.getAttribute('title')||x.textContent||'').trim());
 });
 if(!el)return {ok:false,message:'没有找到音频/文件上传入口'};
 el.click();return {ok:true};
}
function selectAudioBatch(payload){
 const rows=Array.isArray(payload?.files)?payload.files:[];
 if(!rows.length||rows.length>3)return {ok:false,message:'音频数量应为1—3段'};
 const inputs=[...document.querySelectorAll('input[type="file"]')].filter(el=>!el.disabled);
 // Do not attach audio to an image-only or avatar upload input.
 const valid=inputs.filter(el=>/(audio|\.wav|\.mp3)/i.test(el.accept||''));
 let input=valid.find(el=>el.multiple)||valid[0];
 if(!input)return {ok:false,unsupported:true,message:'当前豆包聊天模式没有可确认的音频文件上传控件；请切换到支持参考音频的视频模式'};
 if(rows.length>1&&!input.multiple)return {ok:false,unsupported:true,message:'音频控件仅支持单文件，请切换至兼容模式'};
 try{
  const transfer=new DataTransfer();for(const row of rows){
   if(!/\.(?:wav|mp3)$/i.test(row.name||'')||!row.base64||row.base64.length>21000000)throw Error('音频格式/大小不符合要求');
   const raw=atob(row.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   transfer.items.add(new File([bytes],row.name,{type:row.mime||'audio/wav'}));
  }
  input.files=transfer.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  return {ok:true,selectedCount:transfer.files.length,message:'音频已交给网页控件，等待附件确认（不代表上传成功）'};
 }catch(e){return {ok:false,message:'音频提交失败：'+e.message};}
}
const call=(fn,arg)=>'('+fn.toString()+')('+JSON.stringify(arg===undefined?null:arg)+')';
module.exports={probeAudio,selectAudioBatch,openAudioUploadMenu,call};
