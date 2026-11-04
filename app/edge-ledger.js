'use strict';
// Counts are user-confirmed submissions, NOT official Doubao quota.
const fs=require('fs');
const path=require('path');
function cleanNumber(n,label){if(!Number.isSafeInteger(n)||n<1||n>99999)throw Error(label+'无效');return n;}
function validProfile(id){return typeof id==='string'&&(id==='Default'||/^Profile [1-9][0-9]{0,3}$/.test(id));}
function makeRecord({profileId,accountLabel='',episode,segment}){
  if(!validProfile(profileId))throw Error('Edge 用户资料无效');
  return {id:'task_'+Date.now().toString(36)+'_'+require('crypto').randomBytes(4).toString('hex'),
    profileId,accountLabel:String(accountLabel).slice(0,100),
    episode:cleanNumber(episode,'集数'),segment:cleanNumber(segment,'段落'),
    status:'submitted',createdAt:new Date().toISOString()};
}
function countSubmitted(records,profileId){
  return records.filter(t=>t.profileId===profileId&&t.status==='submitted').length;
}
function fileName(t,version=1,ext='.mp4'){
  if(!['.mp4','.mov','.webm'].includes(ext.toLowerCase()))throw Error('不支持的视频格式');
  return `第${cleanNumber(t.episode,'集数')}集_第${String(cleanNumber(t.segment,'段落')).padStart(2,'0')}段_V${String(cleanNumber(version,'版本')).padStart(2,'0')}${ext.toLowerCase()}`;
}
function loadLedger(file){
  try{const d=JSON.parse(fs.readFileSync(file,'utf8'));return Array.isArray(d.records)?d.records:[];}catch{return [];}
}
function saveLedger(file,records){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({schema:1,records},null,2));
  fs.renameSync(tmp,file);
}
module.exports={makeRecord,countSubmitted,fileName,loadLedger,saveLedger};
