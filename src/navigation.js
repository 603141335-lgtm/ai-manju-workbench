'use strict';
// Pure navigation helpers; a hidden item never loses its content.
function isVisible(ep,seg,showHidden=false){return showHidden||(!ep.hidden&&!seg.hidden)}
function firstVisible(episodes,showHidden=false){for(const ep of episodes){if(ep.hidden&&!showHidden)continue;for(const seg of ep.segments){if(isVisible(ep,seg,showHidden))return {ep,seg}}}return null}
function visibleEpisodes(episodes,showHidden=false){return episodes.filter(ep=>showHidden||(!ep.hidden&&ep.segments.some(seg=>!seg.hidden)))}
function visibleSegments(ep,showHidden=false){return ep.segments.filter(s=>isVisible(ep,s,showHidden))}
function stepSegment(episodes,eid,sid,dir,showHidden=false){const flat=[];for(const ep of episodes){for(const seg of visibleSegments(ep,showHidden))flat.push({ep,seg})}const i=flat.findIndex(x=>x.ep.id===eid&&x.seg.id===sid);return i<0?flat[0]||null:flat[i+dir]||null}
function stepEpisode(episodes,eid,dir,showHidden=false){const v=visibleEpisodes(episodes,showHidden),i=v.findIndex(e=>e.id===eid),next=v[i+dir];if(!next)return null;return {ep:next,seg:visibleSegments(next,showHidden)[0]}}
module.exports={isVisible,firstVisible,visibleEpisodes,visibleSegments,stepSegment,stepEpisode};
