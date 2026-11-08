'use strict';
// Versioned, local-only voice/person binding. Audio data never stored in a web page.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {normCode}=require('./parser');
const EXTS=new Set(['.mp3','.wav']);
const LIMIT={maxClips:3,maxSeconds:15,maxBytes:15*1024*1024}; // Seedance 2.0 series, confirm UI capability separately
function audioName(p){return path.basename(p||'')}
function toDuration(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))?Math.round(Number(v)*100)/100:null}
function probeDuration(p,ffprobe='ffprobe'){
 return new Promise((resolve,reject)=>{
  const child=spawn(ffprobe,['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',p],{windowsHide:true});
  let s='',err='';child.stdout.on('data',b=>s+=b.toString().slice(0,120));child.stderr.on('data',b=>err+=b.toString().slice(0,180));
  const timer=setTimeout(()=>{child.kill();reject(new Error('音频读取超时'))},10000);
  child.on('error',e=>{clearTimeout(timer);reject(new Error('ffprobe 无法启动：'+e.message))});
  child.on('close',code=>{clearTimeout(timer);const n=parseFloat(s);if(code===0&&n>0&&Number.isFinite(n))resolve(toDuration(n));else reject(new Error('无法读取音频时长 '+err.slice(0,80)))});
 });
}
function safeCode(code){const c=normCode(String(code||''));if(!/^(?:A|AG|B|BL|C|E)\d{2,3}(?:-\d{2})?$/.test(c))throw Error('绑定编号格式错误：'+code);return c}
function cleanLabel(label){return String(label||'人物声音').replace(/[\r\n<>]/g,' ').trim().slice(0,45)||'人物声音'}
function clipValid(row){
 if(!row||!EXTS.has(path.extname(row.path||'').toLowerCase()))return '仅支持 WAV/MP3 音频';
 try{const st=fs.statSync(row.path);if(!st.isFile()||st.size<1||st.size>LIMIT.maxBytes)return '文件不存在、为空或大于15MB';}catch{return '音频文件已移动或被删除'}
 if(!(Number(row.duration)>=2&&Number(row.duration)<=15))return '此音频时长不符合 Seedance 2.0 的2—15秒要求';
 return null;
}
function selectVoices(bindings,imageItems,{maxClips=LIMIT.maxClips,maxSeconds=LIMIT.maxSeconds}={}){
 const seen=new Set(),items=[];let duration=0;
 for(const image of imageItems||[]){const code=String(image.code||'').toUpperCase();if(seen.has(code))continue;seen.add(code);
  const list=(bindings[code]||[]);const clip=list.find(x=>x.isDefault)||list[0];if(!clip)continue;
  const item={...clip,code,filename:audioName(clip.path),label:cleanLabel(clip.label),imageIndex:(imageItems||[]).findIndex(i=>i.code===code)+1};
  item.issue=clipValid(item);if(!item.issue)duration+=Number(item.duration);items.push(item);
 }
 const errors=items.filter(x=>x.issue).map(x=>x.code+'：'+x.issue);
 if(items.length>maxClips)errors.push('当前段落匹配到'+items.length+'段人物音频，超过Seedance 2.0的'+maxClips+'段上限');
 if(duration>maxSeconds+0.01)errors.push('本段音频总长 '+duration.toFixed(2)+'秒，超过 '+maxSeconds+'秒');
 return {items,totalSeconds:toDuration(duration),maxClips,maxSeconds,blocked:errors.length>0,errors};
}
function audioLine(row,index){return `音频${index+1} = ${row.code}${row.characterName?' '+row.characterName:''}（${cleanLabel(row.label)}：${audioName(row.path)}）`}
class VoiceBindingsStore{
 constructor(file,{ffprobe='ffprobe',probe=probeDuration}={}){this.file=file;this.ffprobe=ffprobe;this.probe=probe;this.data={version:1,bindings:{}}}
 async load(){try{const obj=JSON.parse(await fs.promises.readFile(this.file,'utf8'));if(obj&&obj.version===1&&obj.bindings&&typeof obj.bindings==='object'){
  const entries={};for(const [k,v] of Object.entries(obj.bindings)){try{const code=safeCode(k);entries[code]=(Array.isArray(v)?v:[]).filter(x=>x&&typeof x.path==='string'&&path.isAbsolute(x.path)).slice(0,20).map(x=>({id:String(x.id||randomUUID()),path:x.path,label:cleanLabel(x.label),duration:toDuration(x.duration),isDefault:!!x.isDefault}));}catch{}}
  this.data={version:1,bindings:entries};}}
 catch(e){if(e.code!=='ENOENT'){await fs.promises.copyFile(this.file,this.file+'.invalid-'+Date.now()).catch(()=>{});}}return this}
 async save(){await fs.promises.mkdir(path.dirname(this.file),{recursive:true});let tmp=this.file+'.tmp';await fs.promises.writeFile(tmp,JSON.stringify(this.data,null,2));await fs.promises.rename(tmp,this.file)}
 snapshot(){return JSON.parse(JSON.stringify(this.data))}
 async add(code,paths,label='人物声音'){
  code=safeCode(code);if(!Array.isArray(paths)||paths.length===0)return this.snapshot();let arr=this.data.bindings[code]||[];
  for(const p of paths){if(!path.isAbsolute(p))throw Error('只允许绑定本机绝对路径音频');if(!EXTS.has(path.extname(p).toLowerCase()))throw Error('仅支持WAV/MP3');const stat=await fs.promises.stat(p);if(!stat.isFile()||stat.size<1||stat.size>LIMIT.maxBytes)throw Error('音频不能超过15MB');const duration=await this.probe(p,this.ffprobe);if(duration<2||duration>15)throw Error('Seedance 2.0每段音频需2到15秒：'+audioName(p));
    if(arr.some(x=>x.path===p))continue;arr.push({id:randomUUID(),path:p,label:cleanLabel(label),duration,isDefault:arr.length===0});
  }
  this.data.bindings[code]=arr;await this.save();return this.snapshot();
 }
 async remove(code,id){code=safeCode(code);const list=(this.data.bindings[code]||[]).filter(x=>x.id!==id);if(list.length&&!list.some(x=>x.isDefault))list[0].isDefault=true;this.data.bindings[code]=list;await this.save();return this.snapshot()}
 async setDefault(code,id){code=safeCode(code);const list=this.data.bindings[code]||[];if(!list.some(x=>x.id===id))throw Error('此编号没有对应的音频');list.forEach(x=>x.isDefault=x.id===id);await this.save();return this.snapshot()}
 plan(items){return selectVoices(this.data.bindings,items)}
}
module.exports={VoiceBindingsStore,probeDuration,selectVoices,audioLine,clipValid,LIMIT};
