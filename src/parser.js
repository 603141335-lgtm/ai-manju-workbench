/* v3.2 reference code parsing preserved from ai-manju-workbench/app/parser.js */
'use strict';
const codeRe=/(^|[^A-Za-z0-9])((?:AG|BL|[ABCDEK])\s*[-_ ]?\s*\d{1,4}(?:\s*[-_－]\s*\d{1,3})?)(?![A-Za-z0-9]|[-_－]\d)/gi;
const refHeader=/(?:需要参考图|使用参考图|参考图编号|本段参考图|本镜参考图|参考图片|参考图|引用图片|引用参考图|参考素材)/i;
function normalizeScanText(s){return String(s||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u2060]/g,'');}
function normCode(s){const clean=normalizeScanText(s).toUpperCase().replace(/\s+/g,'').replace(/[－_]/g,'-');const m=clean.match(/^(AG|BL|[ABCDEK])-?(\d{1,4})(?:-(\d{1,3}))?$/);if(!m)return clean;const base=m[2].length<=2?m[2].padStart(2,'0'):m[2];return m[1]+base+(m[3]!==undefined?'-'+m[3].padStart(2,'0'):'');}
function extractCodes(str){const out=[],used=new Set();const normalized=normalizeScanText(str);const re=new RegExp(codeRe.source,'gi');for(const m of normalized.matchAll(re)){const c=normCode(m[2]);if(!used.has(c)){used.add(c);out.push(c);}}return out;}
function stripLineMarkup(str){return normalizeScanText(str).trim().replace(/^(?:#{1,6}\s*|[>•*\-]+\s*|\d+[.．、)）]\s*)+/g,'').replace(/[*`]/g,'').trim();}
function detectSegmentCodes(txt){
 const lines=String(txt||'').split(/\r?\n/),picked=[];
 let collecting=false,seenHeader=false,blank=0;
 for(const raw of lines){
  const clean=stripLineMarkup(raw);
  const match=clean.match(refHeader);
  if(match && match.index<=16){seenHeader=true;collecting=true;blank=0;const rest=clean.slice(match.index+match[0].length).replace(/^[\s】\]）):：\-—]+/,'');if(extractCodes(rest).length)picked.push(rest);continue;}
  if(!collecting)continue;
  if(!clean){blank++;if(blank>2)collecting=false;continue;}
  blank=0;
  if(/^(?:连续性参考|连续性|场景与站位|场景|站位|时间|画风|限制|音效|声音|分镜|镜头设计|镜头语言|人物情绪|人物表演|运镜|动作设计|台词|对白|备注|质量检查|尾帧|首帧)\s*[:：]/i.test(clean)){collecting=false;continue;}
  const hit=extractCodes(clean);if(hit.length){picked.push(clean);continue;}
  if(/^(?:编号|人物图|场景图|组合图|道具图|镜头图|图片|参考图)\s*[|：:]?\s*$/i.test(clean))continue;
  collecting=false;
 }
 const headCodes=extractCodes(picked.join('\n'));
 if(headCodes.length)return {codes:headCodes,method:'栏目识别',headerSeen:seenHeader};
 const allCodes=extractCodes(txt);
 if(allCodes.length)return {codes:allCodes,method:'整段兜底识别',headerSeen:seenHeader};
 return {codes:[],method:'未找到编号',headerSeen:seenHeader};
}
const cnDigits={'零':0,'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function digitOf(s){if(/^\d+$/.test(s))return Number(s);if(s==='十')return 10;let v=0;if(s.includes('百')){const p=s.split('百');v+=(cnDigits[p[0]]||1)*100;s=p[1];}if(s.includes('十')){const p=s.split('十');v+=(p[0]?cnDigits[p[0]]:1)*10;s=p[1];}return v+(cnDigits[s]||0);}
const segmentHead=/^\s*(?:#{1,6}\s*)?第\s*([0-9一二三四五六七八九十百零〇]{1,5})\s*(?:段|镜头|片段|视频段|镜)\s*(?:[｜|：:—\-、.．]\s*)?(.*)$/;
const alternateHead=/^\s*(?:#{1,6}\s*)?(?:镜头|片段|视频段)\s*([0-9]{1,3})\s*(?:[｜|：:—\-、.．]\s*)?(.*)$/;
function splitEpisode(text){const lines=String(text).split('\n'),heads=[];let pos=0;
 for(const line of lines){const trimmed=line.replace(/\r$/,'');let m=trimmed.match(segmentHead)||trimmed.match(alternateHead);if(m){heads.push({at:pos,n:digitOf(m[1]),title:m[2].trim().replace(/^[｜|：:—\-、.．]\s*/,'')});}pos+=line.length+1;}
 const pre=heads.length?text.slice(0,heads[0].at).trim():'';
 if(!heads.length)return {pre:'',groups:text.trim()?[{n:1,title:'整段提示词（未识别分段标题）',text:text.trim(),fallback:true}]:[]};
 const groups=heads.map((h,i)=>({n:h.n,title:h.title||`第${h.n}段`,text:text.slice(h.at,heads[i+1]?.at??text.length).trim(),fallback:false}));return {pre,groups};
}
function parseMultiEpisode(text,filename='') {
 text=String(text||'').replace(/\r\n/g,'\n');if(!text.trim())return [];
 const lines=text.split('\n'),headers=[];let pos=0;
 for(const line of lines){const m=line.match(/^\s*(?:#{1,6}\s*)?(?:(?:《[^》]{1,100}》\s*)?)第\s*([0-9一二三四五六七八九十百零〇]{1,5})\s*集\s*(?:[｜|：:\-—、]\s*)?(.*)$/);if(m)headers.push({at:pos,n:digitOf(m[1]),title:line.trim().replace(/^#+\s*/,'')});pos+=line.length+1;}
 const parts=headers.length?headers.map((h,i)=>({start:h.at,end:headers[i+1]?.at??text.length,n:h.n,title:h.title})):[{start:0,end:text.length,n:null,title:filename.replace(/\.[^.]+$/,'')||'未命名剧集'}];
 if(headers.length&&headers[0].at>0)parts[0].start=0;
 return parts.map(part=>{const raw=text.slice(part.start,part.end).trim();const parsed=splitEpisode(raw);return {id:makeId(),number:part.n,title:part.title||`第${part.n}集`,original:raw,preamble:parsed.pre,segments:parsed.groups.map(g=>{const det=detectSegmentCodes(g.text);return {id:makeId(),n:g.n,title:g.title,text:g.text,codes:det.codes,method:det.method,manual:false};})};}).filter(e=>e.segments.length);
}
function makeId(){return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);}
function parseFilenameCode(fileName,parentFolders=[]){const stem=fileName.replace(/\.[^.]+$/,'');let codes=extractCodes(stem);if(codes.length)return codes[0];for(let i=parentFolders.length-1;i>=0;i--){codes=extractCodes(parentFolders[i]);if(codes.length)return codes[0];}return null;}
function safeName(s,max=72){let n=String(s||'').replace(/[\\/<>:"|?*\x00-\x1f]/g,'_').replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim();if(!n)n='未命名';if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(n))n='_'+n;return Array.from(n).slice(0,max).join('');}
module.exports={codeRe,extractCodes,normCode,detectSegmentCodes,splitEpisode,parseMultiEpisode,parseFilenameCode,safeName};
