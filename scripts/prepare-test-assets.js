'use strict';
/** Recreate deterministic build/test assets absent from GitHub source ZIPs.
 * Never reads or changes userData, profiles, license keys or Cloudflare state.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const file=p=>path.join(root,p);
function validPng(p){
 try{const b=fs.readFileSync(file(p));return b.length>64&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.readUInt32BE(16)===256&&b.readUInt32BE(20)===256}catch{return false}
}
function validIco(){
 try{const b=fs.readFileSync(file('assets/app.ico'));return b.length>3000&&b.readUInt16LE(0)===0&&b.readUInt16LE(2)===1&&b.readUInt16LE(4)>=5}catch{return false}
}
function validBmp(p,w,h){
 try{const b=fs.readFileSync(file(p));const stride=(w*3+3)&~3;return b.length===54+stride*h&&b.toString('ascii',0,2)==='BM'&&b.readUInt32LE(18)===w&&b.readUInt32LE(22)===h&&b.readUInt16LE(28)===24}catch{return false}
}
function runGenerator(name){
 const result=spawnSync(process.execPath,[file(name)],{cwd:root,stdio:'inherit',windowsHide:false});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error('生成构建素材失败：'+name+'（退出码 '+result.status+'）');
}
function prepare(){
 if(!validIco()||!validPng('assets/branding/dudu-icon-256.png')){
  console.log('[assets] Generating missing Windows ICO and 256px brand PNG from source SVG');
  runGenerator('scripts/generate-brand-icon.js');
 }
 if(!validBmp('assets/installer/sidebar.bmp',164,314)||!validBmp('assets/installer/header.bmp',150,57)){
  console.log('[assets] Generating missing 24-bit NSIS installer graphics');
  runGenerator('scripts/generate-installer-art.js');
 }
 if(!validIco()||!validPng('assets/branding/dudu-icon-256.png')||
    !validBmp('assets/installer/sidebar.bmp',164,314)||!validBmp('assets/installer/header.bmp',150,57))
   throw Error('安装器素材生成后校验失败；已停止启动');
 console.log('[assets] Brand PNG, ICO and NSIS BMP checks passed');
}
if(require.main===module)prepare();
module.exports={prepare,validIco,validPng,validBmp};
