'use strict';
/** Only unambiguous completed imports may be auto-associated with downloads.
 * A profile can have two concurrent Doubao jobs; selecting a segment is NOT proof
 * of a download's provenance, so ambiguity is shown to the user.
 */
class DownloadAssociations{
 constructor(){this.candidates=new Map()}
 record({accountId,episodeId,segmentId,project,episode,segment}){
  if(!accountId||!episodeId||!segmentId)return;
  const key=accountId+':'+episodeId+':'+segmentId;
  this.candidates.set(key,{accountId,episodeId,segmentId,project,episode,segment,createdAt:Date.now(),downloads:0});
 }
 find(accountId,{episodeId,segmentId,now=Date.now()}={}){
  const matches=[...this.candidates.values()].filter(x=>x.accountId===accountId&&now-x.createdAt<=2*60*60*1000);
  const waiting=matches.filter(x=>x.downloads===0);
  const candidates=waiting.length?waiting:matches;
  if(candidates.length!==1)return {state:'pending',reason:candidates.length?'同账号有多个尚未关联的生成段落':'没有本账号最近的导入记录'};
  const candidate=candidates[0];
  // Current editor selection is a second independent confidence signal. Once
  // the user navigates elsewhere the click-to-download could be for any older job.
  if(candidate.episodeId!==episodeId||candidate.segmentId!==segmentId)
   return {state:'pending',reason:'当前选中段落与准备生成的段落不同，无法自动确认下载来源'};
  return {state:'matched',context:{...candidate},candidate};
 }
 confirmed(context){
  const key=context.accountId+':'+context.episodeId+':'+context.segmentId;
  const candidate=this.candidates.get(key);if(candidate){candidate.downloads++;candidate.lastDownloadedAt=Date.now()}
 }
 clearFor(accountId,episodeId,segmentId){this.candidates.delete(accountId+':'+episodeId+':'+segmentId)}
}
module.exports={DownloadAssociations};
