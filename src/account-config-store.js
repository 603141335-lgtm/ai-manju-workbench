'use strict';
const fs=require('node:fs');
const path=require('node:path');

function validAccountConfig(value){
 return !!value && value.version===1 &&
  Array.isArray(value.accounts) && Array.isArray(value.groups) && Array.isArray(value.segments);
}
function existsFile(file){
 try{return fs.statSync(file).isFile()}catch{return false}
}
function saveAccountConfig(file,config){
 if(!validAccountConfig(config))throw Error('账号配置格式错误，拒绝写入以免覆盖现有数据');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.tmp';
 try{
  fs.writeFileSync(temp,JSON.stringify(config,null,2),'utf8');
  // Preserve the last good file before replacing it. Never touch browser profiles.
  if(existsFile(file))fs.copyFileSync(file,file+'.bak');
  fs.renameSync(temp,file);
 }catch(err){
  try{if(existsFile(temp))fs.unlinkSync(temp)}catch{}
  throw err;
 }
}
function readOrCreateAccountConfig(file,makeInitial){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(existsFile(file)){
  let cfg;
  try{cfg=JSON.parse(fs.readFileSync(file,'utf8'))}catch(err){
   // A broken file must never be silently replaced with a blank account list.
   try{fs.copyFileSync(file,file+'.corrupted-'+Date.now())}catch{}
   throw Error('账号配置文件无法解析，原文件已保留；请备份 config.json 并检查原因：'+err.message);
  }
  if(!validAccountConfig(cfg))throw Error('账号配置版本或结构不兼容，原文件未被覆盖');
  return cfg;
 }
 if(typeof makeInitial!=='function')throw Error('缺少首次初始化数据生成函数');
 const created=makeInitial();
 if(!validAccountConfig(created))throw Error('首次初始化数据结构无效');
 saveAccountConfig(file,created);
 return created;
}
module.exports={validAccountConfig,saveAccountConfig,readOrCreateAccountConfig};
