/* Doubao Import Mini v0.1 — standalone reference parsing & mapping (original implementation). */
(function(global){
  'use strict';
  const CODE = /(?:^|[^A-Z0-9])((?:AG|BL|A|B|C|E)\d{2,3}(?:-\d{2})?)(?=$|[^A-Z0-9])/ig;
  const FILES = /\.(png|jpe?g|webp)$/i;
  const unique = arr => [...new Set(arr)];
  function norm(v){return String(v || '').toUpperCase().trim().replace(/[＿－–—]/g, '-');}
  function tokens(v){const out=[];const t=String(v||'').toUpperCase();let m; const reg=new RegExp(CODE.source,'gi');while((m=reg.exec(t))!==null){out.push(norm(m[1])); if(reg.lastIndex===m.index)reg.lastIndex++;}return unique(out);}
  function parseCodes(text){
    const lines=String(text||'').split(/\r?\n/), blocks=[];
    const header = /(?:需要参考图|参考图(?:编号|列表)?|所需参考图|引用参考图)\s*[:：]?\s*(.*)/i;
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(header);if(!m)continue;
      const part=[m[1]];
      for(let j=i+1;j<Math.min(lines.length,i+13);j++){
        const t=lines[j].trim();if(!t)break;
        if(/^(?:连续性|场景|画风|限制|分镜|音效|时间|承接|镜头|台词|\d+[—-]\d+秒|第\d+段)/.test(t))break;
        // Number-only lines or "A: A15" style, not arbitrary prose.
        const content=t.replace(/^[A-Z]{1,3}\s*[:：]/i,'').trim();
        if(!tokens(content).length)break;
        // Chinese sentence punctuation is also a valid delimiter inside a reference list.
        part.push(content);
      }
      blocks.push(part.join(' '));
    }
    if(blocks.length)return {codes:unique(blocks.flatMap(tokens)),origin:'参考图栏目'};
    return {codes:[],origin:'未检测到“需要参考图”栏目'};
  }
  function codeFromFile(file){
    const fullname=(file?.name||'').replace(FILES,'');
    const name=fullname.replace(/^[\s【\[(（]+/,'');
    const m=name.match(/^((?:AG|BL|A|B|C|E)\d{2,3}(?:-\d{2})?)(?=$|[^A-Z0-9])/i);
    if(m)return norm(m[1]);
    const folders=String(file?.webkitRelativePath||'').split('/').slice(0,-1).reverse();
    for(const f of folders){const mm=f.match(/^((?:AG|BL|A|B|C|E)\d{2,3}(?:-\d{2})?)(?=$|[^A-Z0-9])/i);if(mm)return norm(mm[1]);}
    return null;
  }
  function buildPlan(prompt, files){
    const info=parseCodes(prompt), byCode=new Map();
    for(const f of Array.from(files||[])){
      if(!FILES.test(f.name))continue;
      const code=codeFromFile(f);if(!code)continue;
      if(!byCode.has(code))byCode.set(code,[]);
      byCode.get(code).push(f);
    }
    const items=info.codes.map(code=>{const candidates=byCode.get(code)||[];const file=candidates.length===1?candidates[0]:null;
      return {code,candidates,file,status:candidates.length===0?'missing':candidates.length>1?'conflict':'ready'};
    });
    return {items,origin:info.origin,files:Array.from(files||[]).length,
      blocked:!items.length||items.some(i=>i.status!=='ready'),
      summary:{ready:items.filter(i=>i.status==='ready').length,missing:items.filter(i=>i.status==='missing').length,conflict:items.filter(i=>i.status==='conflict').length}};
  }
  /** Keep the author's exact reference order. Do not invent numbered image lines. */
  function sortReferenceItems(items){return Array.from(items||[]);}
  const REFHEADER=/(?:需要参考图|参考图(?:编号|列表)?|所需参考图|引用参考图)\s*[:：]?/i;
  const SECTIONSTOP=/^(?:连续性|场景与站位|场景设定|画风|限制|分镜|音效|时间|承接|镜头|台词|对白|人物情绪|人物表演|运镜|动作|\d+[—-]\d+秒|第\d+段)/;
  /** Precise plaintext anchors in the ORIGINAL "需要参考图" area.
   * For one reference per line, anchor is that original line's entire description.
   * For combined lists, anchor is the exact substring ending before next code.
   */
  function referenceSlots(prompt){
    const lines=String(prompt||'').split(/\r?\n/),slots=[],ambiguous=new Set();
    let collecting=false,scanned=0;
    for(const originalLine of lines){
      const line=originalLine.trim();
      const header=line.match(REFHEADER);
      if(header){collecting=true;scanned=0;}
      if(!collecting)continue;
      if(!header&&(!line||SECTIONSTOP.test(line)||scanned>=13)){collecting=false;continue;}
      scanned++;
      const body=header?line.slice(header.index+header[0].length):line;
      const regex=new RegExp(CODE.source,'gi'),matches=[];let m;
      while((m=regex.exec(body))!==null){
        const start=m.index+m[0].lastIndexOf(m[1]);
        matches.push({code:norm(m[1]),start});
      }
      for(let j=0;j<matches.length;j++){
        const curr=matches[j],end=matches[j+1]?.start??body.length;
        const anchor=body.slice(curr.start,end).trim().replace(/[\s、，,;；]+$/u,'');
        if(!anchor||anchor.length>350){ambiguous.add(curr.code);continue;}
        if(slots.some(x=>x.code===curr.code)){ambiguous.add(curr.code);continue;}
        slots.push({code:curr.code,anchor,originalLine:line});
      }
    }
    return {slots,ambiguous:[...ambiguous]};
  }
  /** No extra mapping text: blue chips are inserted only by Doubao's native @ menu. */
  function makeMapping(items){
    return (items||[]).map(x=>x.refAnchor||x.anchor||'').filter(Boolean).join('\n');
  }
  function composeText(prompt,items,offset=0,voices=[]){
    const raw=String(prompt||'');
    const tail=(items||[]).some(x=>x.kind==='tail'||x.code==='尾帧');
    const head=tail?'上一段尾帧参考：\n':'';
    const voiceText=voices.length?'\n【人物音色绑定｜参考音频】\n'+voices.map((v,i)=>
      '音频'+(i+1)+' = '+v.code+(v.characterName?' '+v.characterName:'')+
      '（'+String(v.label||'人物声音').replace(/[\r\n]/g,' ')+'：'+
      (v.filename||v.path?.split(/[\\/]/).pop()||'未命名音频')+'）'
    ).join('\n')+'\n'+voices.map((v,i)=>
      String(v.code)+'中的人物使用音频'+(i+1)+'作为声音/音色参考；说话人对口型，台词依照本段分镜。'
    ).join('\n'):'';
    return head+raw+(voiceText?(raw&&!raw.endsWith('\n')?'\n':'')+voiceText.trimStart():'');
  }
  const api={parseCodes,codeFromFile,buildPlan,makeMapping,composeText,sortReferenceItems,referenceSlots,tokens,norm};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(global)global.DoubaoImportCore=api;
})(typeof globalThis==='object'?globalThis:null);
