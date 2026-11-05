'use strict';
// v4 Lite: Microsoft Edge profiles only. Does not read cookies, passwords or browser history.
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn}=require('child_process');
function edgeUserDataDir(env=process.env){
  if(!env.LOCALAPPDATA) return null;
  return path.join(env.LOCALAPPDATA,'Microsoft','Edge','User Data');
}
function isProfileDirectory(name){
  return name==='Default'||/^Profile [1-9][0-9]{0,3}$/.test(name);
}
function discoverProfiles(root=edgeUserDataDir()){
  if(!root||!fs.existsSync(root))return [];
  let cache={};
  try{
    const obj=JSON.parse(fs.readFileSync(path.join(root,'Local State'),'utf8'));
    cache=obj.profile&&obj.profile.info_cache||{};
  }catch{}
  return fs.readdirSync(root,{withFileTypes:true})
    .filter(d=>d.isDirectory()&&isProfileDirectory(d.name))
    .filter(d=>fs.existsSync(path.join(root,d.name,'Preferences')))
    .map(d=>({id:d.name,name:String(cache[d.name]?.name||d.name).slice(0,120),directory:d.name}))
    .sort((a,b)=>a.id==='Default'?-1:b.id==='Default'?1:a.id.localeCompare(b.id,undefined,{numeric:true}));
}
function edgeExeCandidates(env=process.env){
  return [
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
    env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe')
  ].filter(Boolean);
}
function findEdgeExecutable(env=process.env){
  return edgeExeCandidates(env).find(p=>fs.existsSync(p))||null;
}
function launchProfile(profileId,{exe=findEdgeExecutable(),url='https://www.doubao.com/',newWindow=false}={}){
  if(!isProfileDirectory(profileId))return Promise.reject(new Error('无效的 Edge 用户资料编号'));
  if(!exe)return Promise.reject(new Error('未找到 Microsoft Edge，请检查安装位置'));
  if(!/^https:\/\/www\.doubao\.com\/?$/.test(url))return Promise.reject(new Error('不支持的打开地址'));
  // Launch only a user-approved local browser profile; keep existing Edge session and extensions.
  return new Promise((resolve,reject)=>{
    try {
      const child=spawn(exe,[`--profile-directory=${profileId}`,...(newWindow?['--new-window']:[]),url],
        {detached:true,stdio:'ignore',windowsHide:false});
      child.once('error',reject);
      child.once('spawn',()=>{child.unref();resolve({profileId});});
    } catch(error){reject(error);}
  });
}
module.exports={edgeUserDataDir,isProfileDirectory,discoverProfiles,edgeExeCandidates,findEdgeExecutable,launchProfile};
