'use strict';
// Shared between Node regression tests and the renderer; never invent an episode number.
(function(root,factory){
  const out=factory();
  if(typeof module==='object'&&module.exports)module.exports=out;
  if(root)root.ManjuEpisode=out;
})(typeof window!=='undefined'?window:null,function(){
  const digits={'零':0,'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  function cnNumber(source){
    const s=String(source||'').trim();
    if(/^\d{1,5}$/.test(s)){const n=Number(s);return n>=1&&n<=99999?n:null;}
    if(!/^[零〇一二三四五六七八九十百千]{1,9}$/.test(s))return null;
    if(!/[十百千]/.test(s)){
      const n=Number([...s].map(c=>digits[c]).join(''));return n>=1&&n<=99999?n:null;
    }
    let sum=0,num=0;
    for(const c of s){
      if(c in digits){num=digits[c];continue;}
      const unit={十:10,百:100,千:1000}[c];
      sum+=(num||1)*unit;num=0;
    }
    sum+=num;return sum>=1&&sum<=99999?sum:null;
  }
  function parseFromTitle(source){
    const m=String(source||'').match(/第\s*([0-9]{1,5}|[零〇一二三四五六七八九十百千]{1,9})\s*集/);
    return m?cnNumber(m[1]):null;
  }
  function inferEpisode(episode){
    const raw=episode?.number;
    if(Number.isSafeInteger(raw)&&raw>=1&&raw<=99999)return raw;
    if(typeof raw==='string'&&/^\d{1,5}$/.test(raw)&&Number(raw)>=1)return Number(raw);
    return parseFromTitle(episode?.title)||parseFromTitle(String(episode?.original||'').slice(0,1600));
  }
  function validSegment(n){
    return Number.isSafeInteger(Number(n))&&Number(n)>=1&&Number(n)<=99999;
  }
  return {cnNumber,parseFromTitle,inferEpisode,validSegment};
});
