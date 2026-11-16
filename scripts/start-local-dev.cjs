'use strict';
/**
 * Starts an isolated V1.3 local backend and the development workbench together.
 * No remote D1, deploy, production secrets or payment provider calls.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');

const root=path.resolve(__dirname,'..');
const licenseRoot=path.join(root,'license-service');
const localEnv={...process.env,DUDU_LOCAL_TEST_PROFILE:'1'};
const windows=process.platform==='win32';
const port=8788;
const attestUrl='http://127.0.0.1:'+port+'/v1/license/attest';
let backend=null;
let closing=false;

function packageInstallMode(directory){
 return fs.existsSync(path.join(directory,'package-lock.json'))?'ci':'install';
}
function npmProcess(args,cwd,env=localEnv){
 if(!Array.isArray(args)||args.some(x=>!/^[a-zA-Z0-9:_./-]+$/.test(x)))throw Error('Invalid npm subcommand arguments');
 if(windows)return spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm '+args.join(' ')],{cwd,env,stdio:'inherit',windowsHide:false});
 return spawn('npm',args,{cwd,env,stdio:'inherit'});
}
function finished(child,label){
 return new Promise((resolve,reject)=>{
  child.once('error',err=>reject(Error(label+' failed to start: '+err.message)));
  child.once('exit',(code,signal)=>code===0?resolve():reject(Error(label+' failed (exit '+String(code||signal)+')')));
 });
}
async function npm(args,cwd,label){console.log('\n['+label+']');await finished(npmProcess(args,cwd),label)}
function verifyAttestation(value,publicKey,at=Date.now()){
 try{
  if(typeof value?.payload!=='string'||typeof value?.signature!=='string')return false;
  const payload=Buffer.from(value.payload,'base64url'),sig=Buffer.from(value.signature,'base64url');
  const key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ed25519'||sig.length!==64||!crypto.verify(null,payload,key,sig))return false;
  const body=JSON.parse(payload.toString('utf8'));
  return body.schema===1&&body.product==='dudu-ai-workbench'&&body.purpose==='license-public-key-v1'&&
   Number.isSafeInteger(body.issuedAt)&&Math.abs(at-body.issuedAt)<120000;
 }catch{return false}
}
async function probe(publicKey){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),1600);
 try{
  const response=await fetch(attestUrl,{signal:abort.signal,cache:'no-store'});
  if(!response.ok)return {listening:true,match:false};
  const body=await response.json();
  return {listening:true,match:verifyAttestation(body,publicKey)};
 }catch(error){
  if(error instanceof SyntaxError)return {listening:true,match:false};
  // Connection refused means no listener; a timeout could mean a stuck listener.
  if(error?.name==='TimeoutError'||error?.name==='AbortError')return {listening:true,match:false};
  return {listening:false,match:false};
 }finally{clearTimeout(timer)}
}
function stopBackend(){
 if(closing)return;
 closing=true;
 if(!backend||backend.exitCode!==null||!backend.pid)return;
 try{
  if(windows)spawnSync('taskkill',['/PID',String(backend.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});
  else backend.kill('SIGTERM');
 }catch{}
}
async function awaitBackend(publicKey){
 for(let i=0;i<75;i++){
  if(!backend||backend.exitCode!==null)throw Error('Local license backend exited before becoming ready; inspect the messages above');
  const health=await probe(publicKey);
  if(health.listening&&health.match)return;
  if(health.listening&&!health.match)throw Error('Port 8788 is already occupied by a different backend. Close the old Worker window before starting.');
  await delay(1000);
 }
 throw Error('Local license backend did not become ready within 75 seconds. The workbench was not started.');
}
async function main(){
 console.log('DuduAI V1.3 - isolated local workbench and admin center');
 console.log('Mode: LOCAL TEST ONLY. Production cloud resources and licenses are not changed.');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ is required.');
 if(windows&&!process.env.APPDATA)throw Error('Windows APPDATA is missing; cannot isolate the test profile.');
 if(!fs.existsSync(path.join(root,'package.json'))||!fs.existsSync(path.join(licenseRoot,'package-lock.json')))
  throw Error('Project directory is incomplete; extract the full ZIP before starting.');
 const electronExe=path.join(root,'node_modules','electron','dist',windows?'electron.exe':'electron');
 if(!fs.existsSync(electronExe)){
  await npm([packageInstallMode(root),'--no-audit','--no-fund'],root,'Install desktop dependencies');
  if(!fs.existsSync(electronExe))await npm(['rebuild','electron','--foreground-scripts'],root,'Install Electron runtime');
 }
 if(!fs.existsSync(electronExe))throw Error('Electron runtime is missing after installation: '+electronExe);
 const wrangler=path.join(licenseRoot,'node_modules','wrangler','bin','wrangler.js');
 if(!fs.existsSync(wrangler))await npm([packageInstallMode(licenseRoot),'--no-audit','--no-fund'],licenseRoot,'Install local backend dependencies');
 if(!fs.existsSync(wrangler))throw Error('Wrangler CLI is missing after installation.');
 function nativeToolReady(name){
  const suffix=windows?'.cmd':'';
  const exe=path.join(licenseRoot,'node_modules','.bin',name+suffix);
  if(!fs.existsSync(exe))return false;
  const result=windows?
   spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','node_modules\\.bin\\'+name+'.cmd --version'],{cwd:licenseRoot,stdio:'ignore',windowsHide:true,timeout:10000}):
   spawnSync(exe,['--version'],{cwd:licenseRoot,stdio:'ignore',timeout:10000});
  return !result.error&&result.status===0;
 }
 if(!nativeToolReady('workerd')||!nativeToolReady('esbuild'))
  await npm(['rebuild','esbuild','workerd','--foreground-scripts'],licenseRoot,'Repair local Workerd and esbuild runtimes');
 if(!nativeToolReady('workerd')||!nativeToolReady('esbuild'))
  throw Error('Workerd or esbuild is installed but cannot run. Check Windows Defender and npm native installation logs.');
 await npm(['run','check'],root,'Desktop syntax and regression checks');
 await npm(['run','check'],licenseRoot,'Backend syntax and launcher checks');
 await npm(['test'],licenseRoot,'Backend unit and integration checks');
 await finished(spawn(process.execPath,['scripts/prepare-local-test.mjs'],{cwd:licenseRoot,env:localEnv,stdio:'inherit'}),'Prepare isolated test credentials');
 const ownerKeys=JSON.parse(fs.readFileSync(path.join(licenseRoot,'.private','test-owner-keys.json'),'utf8'));
 const publicKey=ownerKeys.DUDU_LICENSE_PUBLIC_KEY_B64;
 if(typeof publicKey!=='string'||publicKey.length<50)throw Error('Local test public key is missing');
 const existing=await probe(publicKey);
 if(existing.listening&&!existing.match)throw Error('Port 8788 is occupied by a different or outdated Worker. Close it before launching.');
 if(existing.listening&&existing.match){
  console.log('Reusing the existing matching local test backend on 127.0.0.1:8788.');
 }else{
  console.log('Starting isolated license backend and local D1 database...');
  backend=npmProcess(['run','test:env'],licenseRoot);
  await awaitBackend(publicKey);
 }
 console.log('\nLocal backend verified with matching Ed25519 test key.');
 console.log('Admin console: http://127.0.0.1:8788/admin');
 console.log('Payment simulator: http://127.0.0.1:8788/__test');
 console.log('Starting desktop with ISOLATED TEST PROFILE. Original accounts/projects are untouched.');
 await finished(npmProcess(['start'],root),'Workbench development build');
}
if(require.main===module){
 process.on('SIGINT',()=>{stopBackend();process.exit(130)});
 process.on('SIGTERM',()=>{stopBackend();process.exit(143)});
 main().catch(e=>{console.error('\n[STARTUP FAILED] '+String(e.stack||e));process.exitCode=1})
  .finally(()=>stopBackend());
}
module.exports={packageInstallMode,verifyAttestation};
