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
 find(accountId,now=Date.now()){
  const matches=[...this.candidates.values()].filter(x=>x.accountId===accountId&&now-x.createdAt<=2*60*60*1000);
  if(matches.length!==1)return {state:'pending',reason:matches.length?'同账号有多个待下载段落，无法判断视频所属段':'没有可靠的已导入段落记录'};
  return {state:'matched',context:{...matches[0]},candidate:matches[0]};
 }
 confirmed(context){const key=context.accountId+':'+context.episodeId+':'+context.segmentId;const candidate=this.candidates.get(key);if(candidate)candidate.downloads++}
 clearFor(accountId,episodeId,segmentId){this.candidates.delete(accountId+':'+episodeId+':'+segmentId)}
}
module.exports={DownloadAssociations};
