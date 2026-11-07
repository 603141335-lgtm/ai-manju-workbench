'use strict';
// Pure helpers are deliberately separated so they can be tested without Electron.
function createInitialData(makeId) {
  const groups = Array.from({length:5}, (_,i) => ({id:makeId(), name:`浏览器组 ${'ABCDE'[i]}`, edgeProfile: i ? `Profile ${i}` : 'Default'}));
  const accounts = groups.flatMap((g, gi) => Array.from({length:5}, (_,j) => ({
    id:makeId(), groupId:g.id, name:`豆包 ${String(gi*5+j+1).padStart(2,'0')}`, done:0
  })));
  const segments = [{id:makeId(), name:'第1段', prompt:'', images:[]}];
  return {version:1,groups,accounts,segments,activeAccountId:accounts[0].id,activeSegmentId:segments[0].id, target:2};
}
function normalizeName(v, max=48){
  if(typeof v!=='string')throw new Error('名称必须是文字');
  const name=v.trim().replace(/[\u0000-\u001f]/g,'').slice(0,max);
  if(!name)throw new Error('名称不能为空');
  return name;
}
function safeBounds(input, bounds){
  if(!input || typeof input !== 'object')return null;
  const x=Math.round(Number(input.x)); const y=Math.round(Number(input.y));
  const width=Math.round(Number(input.width)); const height=Math.round(Number(input.height));
  if(![x,y,width,height].every(Number.isFinite))return null;
  const maxX=Math.max(0,bounds.width-100), maxY=Math.max(0,bounds.height-100);
  const sx=Math.min(Math.max(0,x),maxX), sy=Math.min(Math.max(0,y),maxY);
  return {x:sx,y:sy,width:Math.min(Math.max(100,width),bounds.width-sx),height:Math.min(Math.max(100,height),bounds.height-sy)};
}
function allowedImage(file){return /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(file||'');}
function allowedEdgeProfile(p){return /^(Default|Profile [1-9]\d{0,2})$/.test(p||'');}
module.exports={createInitialData,normalizeName,safeBounds,allowedImage,allowedEdgeProfile};
