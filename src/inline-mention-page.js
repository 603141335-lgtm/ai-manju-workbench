'use strict';
/** DOM-only helpers evaluated in the active Doubao chat WebContentsView.
 * These functions must remain self-contained: each is serialized by page.call.
 * They never manufacture a rich mention: only the website's native menu can.
 */
function focusReferenceSlot(payload){
 const selector='.guidance-input-content .tiptap.ProseMirror[contenteditable="true"],.guidance-input-content [contenteditable="true"],.tiptap.ProseMirror[contenteditable="true"],[role="textbox"][contenteditable="true"],[contenteditable="true"]';
 const editors=[...document.querySelectorAll(selector)].filter(el=>{const r=el.getBoundingClientRect();return r.width>60&&r.height>25});
 editors.sort((a,b)=>{const rank=x=>{const r=x.getBoundingClientRect();return (x.closest('.guidance-input-content')?1000:0)+r.width};return rank(b)-rank(a)});
 const editor=editors[0];
 if(!editor)return {ok:false,message:'此模式不是可插入图片引用的富文本编辑器'};
 const anchor=String(payload?.anchor||'');
 if(!anchor||anchor.length>350)return {ok:false,message:'缺少准确的图号位置标记'};
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
 const texts=[];let content='',node;
 while((node=walker.nextNode())){const value=node.nodeValue||'';texts.push({node,start:content.length,end:content.length+value.length});content+=value;}
 let pos=content.indexOf(anchor);
 if(pos<0||content.indexOf(anchor,pos+anchor.length)>=0)return {ok:false,message:'没有找到唯一的图号对应行，已停止以防止艾特错位'};
 const after=pos+anchor.length;
 const target=texts.find(t=>t.end>=after&&t.start<=after);
 if(!target)return {ok:false,message:'无法确定图片编号所在的可编辑位置'};
 const selection=window.getSelection(),range=document.createRange();
 range.setStart(target.node,after-target.start);range.collapse(true);
 editor.focus();selection.removeAllRanges();selection.addRange(range);
 // Verify the cursor actually landed behind the exact mapping text.
 const selected=selection.anchorNode===target.node&&selection.anchorOffset===after-target.start;
 if(!selected)return {ok:false,message:'豆包编辑器没有接受图号位置定位'};
 try{target.node.parentElement?.scrollIntoView({block:'nearest',inline:'nearest'})}catch{}
 return {ok:true,message:'光标已准确定位到 '+anchor,anchor};
}
function inspectInlineReference(payload){
 const code=String(payload?.code||'').toUpperCase(),filename=String(payload?.filename||'').toLowerCase(),anchor=String(payload?.anchor||'');
 const selector='.guidance-input-content .tiptap.ProseMirror[contenteditable="true"],.guidance-input-content [contenteditable="true"],.tiptap.ProseMirror[contenteditable="true"],[role="textbox"][contenteditable="true"],[contenteditable="true"]';
 const editors=[...document.querySelectorAll(selector)].filter(el=>{const r=el.getBoundingClientRect();return r.width>60&&r.height>25});
 const editor=editors.sort((a,b)=>(b.closest('.guidance-input-content')?1:0)-(a.closest('.guidance-input-content')?1:0))[0];
 if(!editor||!anchor)return {lineFound:false,verified:false,message:'无法读取编辑器或图号定位标记'};
 // Use the innermost block, not a parent of the entire editor.
 const blocks=[...editor.querySelectorAll('p,li,div')];
 const matches=blocks.filter(el=>(el.textContent||'').includes(anchor))
   .filter(el=>![...el.querySelectorAll('p,li,div')].some(c=>(c.textContent||'').includes(anchor)));
 let line=matches.length===1?matches[0]:null;
 if(!line){const all=editor.textContent||'';if(all.includes(anchor))return {lineFound:true,verified:false,message:'已找到图号，但无法证明原生引用位于同一行'};return {lineFound:false,verified:false,message:'原始图号行已消失，可能被网页重新排版'};}
 const nativeSel='[data-mention],[data-type*="mention"],[data-node-type*="mention"],[contenteditable="false"],[class*="mention"]';
 const chips=[...line.querySelectorAll(nativeSel)].filter(n=>{
   const data=n.getAttribute('data-value')||n.getAttribute('data-label')||'';
   const v=(n.textContent||'')+' '+(n.getAttribute('aria-label')||'')+' '+data;
   return v.toLowerCase().includes(filename) && !!(n.hasAttribute('data-mention')||n.getAttribute('contenteditable')==='false'||/mention/i.test((n.getAttribute('data-type')||'')+' '+(n.getAttribute('data-node-type')||'')+' '+(n.className||'')));
 });
 return {lineFound:true,verified:chips.length===1,matchCount:chips.length,code,message:chips.length===1?'已验证原生 @ 标签就在图号对应行':chips.length>1?'同一图号行发现多个重复的原生 @ 标签':'对应行尚未检测到匹配的原生 @ 图片标签'};
}
function clearPendingInlineAt(payload){
 // Only remove the two characters inserted by THIS run directly after the
 // immutable mapping anchor. Never touch existing mentions or other prose.
 const selector='.guidance-input-content .tiptap.ProseMirror[contenteditable="true"],.guidance-input-content [contenteditable="true"],.tiptap.ProseMirror[contenteditable="true"],[role="textbox"][contenteditable="true"],[contenteditable="true"]';
 const editor=[...document.querySelectorAll(selector)].find(e=>e.getBoundingClientRect().width>60);
 const anchor=String(payload?.anchor||'');if(!editor||!anchor)return false;
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let texts=[],text='',node;
 while((node=walker.nextNode())){const s=node.nodeValue||'';texts.push({node,start:text.length,end:text.length+s.length});text+=s;}
 const start=text.indexOf(anchor);if(start<0||text.indexOf(anchor,start+anchor.length)>=0)return false;
 const from=start+anchor.length;
 if(text.slice(from,from+2)!==' @')return false;
 const s=texts.find(t=>t.end>from&&t.start<=from),e=texts.find(t=>t.end>=from+2&&t.start<from+2);
 if(!s||!e)return false;
 try{
  const range=document.createRange();range.setStart(s.node,from-s.start);range.setEnd(e.node,from+2-e.start);
  editor.focus();const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
  return document.execCommand('delete',false);
 }catch{return false;}
}
module.exports={focusReferenceSlot,inspectInlineReference,clearPendingInlineAt};
