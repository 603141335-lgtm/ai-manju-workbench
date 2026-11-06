'use strict';
(function(){
function normalize(s){
 s=String(s||'').normalize('NFKC').toUpperCase().replace(/\s+/g,'').replace(/[－_]/g,'-');
 const m=s.match(/^(AG|BL|[ABCDEK])-?(\d{1,4})(?:-(\d{1,3}))?$/);
 return m?m[1]+m[2].padStart(2,'0')+(m[3]?'-'+m[3].padStart(2,'0'):''):s;
}
function convert(payload){
 const data=payload&&payload.workspace?payload.workspace:payload;
 if(!data||![2,3].includes(Number(data.version))||!Array.isArray(data.episodes))throw Error('不是豆包创作舱 v0.2/v0.3 项目备份');
 const episodes=[],segments=[],statuses={},versions={};
 const chosen=data.chosenPaths&&typeof data.chosenPaths==='object'?data.chosenPaths:{};
 for(const [code,path] of Object.entries(chosen))if(typeof path==='string')versions[normalize(code)]=path.split(/[\\/]/).pop();
 let activeIndex=0;
 for(const [epi,e] of data.episodes.entries()){
  if(!e||!Array.isArray(e.segments))continue;
  const num=Number.isInteger(e.number)&&e.number>0?e.number:epi+1;
  const episode={num,title:String(e.title||'第'+num+'集'),items:[],id:String(e.id||'episode_'+epi)};
  for(const [i,item] of e.segments.entries()){
   if(!item)continue;
   const number=Number(item.n)>0?Number(item.n):i+1;
   const seg={ep:num,epTitle:episode.title,number,title:String(item.title||'第'+number+'段'),sourceIndex:i,
    original:String(item.text??item.prompt??''),index:segments.length,
    key:'desktop_'+String(item.id||episode.id+'_'+i),desktopId:String(item.id||''),
    desktopCodes:Array.isArray(item.codes)?[...new Set(item.codes.map(normalize).filter(Boolean))]:null,
    manual:!!item.manual,hidden:!!item.hidden||!!e.hidden,locked:!!item.locked||!!e.locked};
   if(e.id===data.activeEpisodeId&&item.id===data.activeSegmentId)activeIndex=seg.index;
   statuses[seg.key]=item.status==='done'?'已完成':item.status==='redo'?'需重做':'待制作';
   episode.items.push(seg);segments.push(seg);
  }
  if(episode.items.length)episodes.push(episode);
 }
 if(!segments.length)throw Error('备份中没有有效的剧集和段落');
 return {title:String(data.title||'豆包创作舱项目'),episodes,segments,statuses,versions,activeIndex,original:data};
}
window.ManjuCompat={convert};
})();