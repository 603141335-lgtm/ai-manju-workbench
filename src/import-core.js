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
        if(/[。！？]/.test(content))break;
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
  function makeMapping(items,initialIndex=0){
    return items.map((r,i)=>`图${initialIndex+i+1} = ${r.code}（${r.file?.name||'文件未确认'}）`).join('\n');
  }
  function composeText(prompt,items,offset=0){
    const mapping=makeMapping(items,offset);
    return String(prompt||'')+`\n\n【参考图顺序对应表｜按本次上传顺序】\n${mapping}\n请以对应图片为准，严格保持人物、场景和道具一致。`;
  }
  const api={parseCodes,codeFromFile,buildPlan,makeMapping,composeText,tokens,norm};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(global)global.DoubaoImportCore=api;
})(typeof globalThis==='object'?globalThis:null);
