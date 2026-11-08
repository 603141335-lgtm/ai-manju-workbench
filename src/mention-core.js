'use strict';
const path=require('node:path');
const {detectSegmentCodes,normCode,extractCodes}=require('./parser');
const SUPPORTED=new Set(['.png','.jpg','.jpeg','.webp','.gif']);
function unique(items){return [...new Set(items)];}
function codeInName(name){return extractCodes(path.basename(String(name||''))).map(normCode);}
function matchVisibleAttachment(code,attachments){
 const matches=(attachments||[]).filter(a=>codeInName(a.name||a.label).includes(code));
 return matches.length===1?'visible':matches.length>1?'ambiguous':'unknown';
}
function buildPlan({prompt='',segmentCodes=[],rows=[],accountId='',conversation='',limit=9,chosenPaths={}}={}){
 const parsed=detectSegmentCodes(prompt);
 const codes=unique((parsed.codes.length?parsed.codes:segmentCodes).map(normCode));
 const rowByCode=new Map(rows.filter(r=>r.code).map(r=>[normCode(r.code),r]));
 const list=codes.map(code=>{
  const row=rowByCode.get(code);
  const file=row?.file;
  const versions=(row?.versions||[]).filter(v=>v.path);
  const conflict=versions.length>1&&!chosenPaths[code];
  const missing=!file||!!row.missing;
  const unsupported=!!file&&!SUPPORTED.has(path.extname(file.path||'').toLowerCase());
  const state=missing?'missing':conflict?'conflict':unsupported?'unsupported':'ready';
  return {code,state,file:file?{name:file.name,path:file.path}:null,versions:versions.map(v=>({name:v.name,path:v.path})),reason:missing?'本地参考图库没有匹配图片':conflict?'同编号多个版本，请先指定':unsupported?'此图片格式不适合直接上传，请先转换为 PNG/JPG':'可尝试上传'};
 });
 return {accountId,conversation,codes,rows:list,source:parsed.codes.length?'browser':'segment',limit,blocked:list.length>limit||list.some(r=>r.state!=='ready'),overLimit:list.length>limit};
}
function isAllowedDoubaoUrl(raw){
 try {const url=new URL(raw);return url.protocol==='https:'&&['doubao.com','www.doubao.com'].includes(url.hostname)&&url.pathname.startsWith('/chat');}catch{return false;}
}
module.exports={buildPlan,codeInName,matchVisibleAttachment,isAllowedDoubaoUrl};
