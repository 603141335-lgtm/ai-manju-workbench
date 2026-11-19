'use strict';
/** User-supplied character names next to stable reference IDs.
 * A01小李 / A01 小李 / A01-01小李 are split into immutable code + label.
 * Only parse the explicit reference-image section, never infer names from story text.
 */
const {normCode}=require('./parser');
const {resolveAssetLabel}=require('./asset-aliases');
const REF=/^(?:需要参考图|所需参考图|引用参考图|参考图(?:编号|列表)?|使用参考图|本段参考图|本镜参考图)\s*[:：]?/i;
const STOP=/^(?:连续性|场景|站位|画风|限制|分镜|音效|时间|承接|镜头|台词|对白|人物情绪|人物表演|运镜|动作|\d+[—-]\d+秒|第\d+段|【图片顺序|【人物音色)/;
const ENTRY=/(^|[^A-Z0-9_-])((?:AG|BL|A|B|C|E|I)\d{2,3}(?:-\d{2})?)([ \t]*)([\u3400-\u9fff]{2,16})(?=$|[、，,;；\s（(@])/ig;
const INERT=/^(?:图[一二三四五六七八九十\d]|参考图|图片|场景|道具|人物|第[一二三四五六七八九十\d])/;
function extractReferenceLabels(prompt){
 const lines=String(prompt||'').split(/\r?\n/);let collecting=false, scanned=0;
 const labels={},conflicts=[];
 for(const raw of lines){
  const line=raw.trim();const m=line.match(REF);
  if(m){collecting=true;scanned=0;}
  if(!collecting)continue;
  if(!m&&(STOP.test(line)||(!line&&scanned>0)))break;
  if(scanned++>14)break;
  const body=m?line.slice(m[0].length):line;
  const regexp=new RegExp(ENTRY.source,'gi');let hit;
  while((hit=regexp.exec(body))!==null){
   const code=normCode(hit[2]),name=hit[4].trim();
   if(INERT.test(name))continue;
   if(labels[code]&&labels[code]!==name){conflicts.push({code,first:labels[code],second:name});delete labels[code];continue;}
   if(!conflicts.some(x=>x.code===code))labels[code]=name;
  }
  const aliasOnly=/(^|[^A-Z0-9_-])((?:I)\\d{2,3})(?=$|[^A-Z0-9])/ig;let aliasHit;
  while((aliasHit=aliasOnly.exec(body))!==null){
   const code=normCode(aliasHit[2]),name=resolveAssetLabel(aliasHit[2]);
   if(!name||conflicts.some(x=>x.code===code))continue;
   if(labels[code]&&labels[code]!==name){conflicts.push({code,first:labels[code],second:name});delete labels[code];}
   else labels[code]=name;
  }
 }
 return {labels,conflicts};
}
function shortName(v){return String(v||'').split(/[（(\[【·:：]/)[0].replace(/[\r\n]/g,' ').trim().slice(0,24)}
function labelFor(code,labels,voiceLabel=''){return labels?.[code]||shortName(voiceLabel)||''}
module.exports={extractReferenceLabels,shortName,labelFor};
