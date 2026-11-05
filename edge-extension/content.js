'use strict';
// Runs only on Doubao domains. Never clicks Generate/Submit and never reads account credentials.
(()=>{
 let busy=false,lastFilled=null,lastNotice='';
 const isVisible=el=>{
  if(!el||!el.isConnected||el.closest('[aria-hidden="true"]'))return false;
  const rect=el.getBoundingClientRect();
  const cs=getComputedStyle(el);
  return rect.width>35&&rect.height>10&&cs.display!=='none'&&cs.visibility!=='hidden';
 };
 const editable=el=>!!el&&(
  (el.tagName==='TEXTAREA'&&!el.disabled&&!el.readOnly)||
  (el.isContentEditable&&el.getAttribute('contenteditable')!=='false')
 );
 function candidates(){
  return [...document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""],[role="textbox"][contenteditable]')]
    .filter(el=>editable(el)&&isVisible(el));
 }
 function chooseEditor(){
  const list=candidates();
  const focused=document.activeElement;
  const active=list.find(el=>el===focused||el.contains(focused));
  if(active)return active;
  if(list.length===1)return list[0];
  const good=list.filter(el=>{
   const txt=[el.getAttribute('placeholder'),el.getAttribute('data-placeholder'),
    el.getAttribute('aria-label'),el.closest('[data-placeholder]')?.getAttribute('data-placeholder')]
    .filter(Boolean).join(' ');
   return /提示词|描述|视频|输入|创作|prompt|describe/i.test(txt);
  });
  if(good.length===1)return good[0];
  return null;
 }
 function message(text){
  if(text===lastNotice)return;
  lastNotice=text;
  let el=document.getElementById('manju-edge-note');
  if(!el){
   el=document.createElement('div');el.id='manju-edge-note';
   Object.assign(el.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483647',
    background:'#182a46',color:'#fff',padding:'10px 14px',borderRadius:'10px',
    boxShadow:'0 5px 24px #0004',fontSize:'13px',maxWidth:'420px'});
   document.documentElement.append(el);
  }
  el.textContent=text;
 }
 function insertText(el,text){
  const current=(el.tagName==='TEXTAREA'?el.value:el.innerText||'').trim();
  if(current===text.trim())return {success:true,detail:'输入框已包含相同提示词'};
  if(current)return {success:false,detail:'输入框已有文字，请先清空或点选空白提示词输入框'};
  el.focus();
  if(el.tagName==='TEXTAREA'){
   const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
   if(setter)setter.call(el,text);else el.value=text;
   el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
   el.dispatchEvent(new Event('change',{bubbles:true}));
   return {success:el.value===text,detail:'textarea'};
  }
  let done=false;
  try{done=!!document.execCommand('insertText',false,text);}catch{}
  if(!done){
   el.textContent=text;
   el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  }
  const actual=(el.innerText||el.textContent||'').trim();
  return {success:actual===text.trim(),detail:'contenteditable'};
 }
 async function poll(){
  if(busy||document.hidden)return;
  busy=true;
  try{
   const result=await chrome.runtime.sendMessage({type:'poll'});
   if(!result?.ok||!result.job||result.job.id===lastFilled)return;
   const job=result.job;
   const editor=chooseEditor();
   if(!editor){
    message('工作台已发送第'+job.episode+'集第'+job.segment+'段：请点一下豆包提示词输入框。');
    return;
   }
   const outcome=insertText(editor,job.prompt);
   if(outcome.success){
    const ack=await chrome.runtime.sendMessage({type:'ack',id:job.id,status:'filled',detail:outcome.detail});
    if(ack?.ok){
     lastFilled=job.id;
     message('第'+job.episode+'集第'+job.segment+'段提示词已填入，请检查参考图后手动生成。');
    }
   }else message('需要你确认：'+outcome.detail);
  }catch{}finally{busy=false;}
 }
 setInterval(poll,1800);
 poll();
})();
