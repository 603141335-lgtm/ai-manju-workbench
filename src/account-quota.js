'use strict';

function quotaCycleDate(timestamp=Date.now(),resetHour=0){
 const date=new Date(timestamp),hour=Math.max(0,Math.min(23,Math.round(Number(resetHour)||0)));
 if(date.getHours()<hour)date.setDate(date.getDate()-1);
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function normalizeQuota(value={}){
 const hour=Math.max(0,Math.min(23,Math.round(Number(value.resetHour)||0)));
 const status=value.status==='exhausted'?'exhausted':'available';
 return {status,markedDate:typeof value.markedDate==='string'?value.markedDate:null,resetHour:hour};
}
function shouldResetQuota(value={},timestamp=Date.now()){
 const quota=normalizeQuota(value);
 return quota.status==='exhausted'&&quota.markedDate!==quotaCycleDate(timestamp,quota.resetHour);
}
module.exports={quotaCycleDate,normalizeQuota,shouldResetQuota};
