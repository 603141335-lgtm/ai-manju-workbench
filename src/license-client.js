'use strict';
// v1.2.0 desktop license client. No owner signing secrets in the application.
// Device signing private key and license cache are encrypted by Windows DPAPI
// through Electron safeStorage. MachineGuid is hashed before leaving this PC.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https');
const {execFileSync}=require('node:child_process');
const licenseConfig=require('./license-config.json');
const MAX_RESPONSE=32768;
const enc=s=>Buffer.from(String(s),'utf8');
const b64u=b=>Buffer.from(b).toString('base64url');
const cleanCode=s=>String(s||'').toUpperCase().replace(/[\s]/g,'').slice(0,45);
function deviceMessage(op,request){
 return JSON.stringify({op,deviceId:request.deviceId,publicKey:request.publicKey,ts:request.ts,nonce:request.nonce,code:request.code||''});
}
function winMachineGuid(){
 if(process.platform!=='win32')return '';
 try{
  const out=execFileSync('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',timeout:3500,windowsHide:true});
  const m=out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
  return m?m[1].trim().toLowerCase():'';
 }catch{return ''}
}
function validServiceUrl(url){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&!u.port&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)?u.origin:''}catch{return ''}
}
function post(service,endpoint,data){
 return new Promise((resolve,reject)=>{
  const url=new URL(endpoint,service);const body=JSON.stringify(data);
  if(body.length>8192)return reject(Error('授权请求过长'));
  const req=https.request(url,{method:'POST',timeout:9000,headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'accept':'application/json'}},res=>{
   const chunks=[];let len=0;res.on('data',b=>{len+=b.length;if(len>MAX_RESPONSE)req.destroy(Error('授权响应过大'));else chunks.push(b)});
   res.on('end',()=>{try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode<200||res.statusCode>=300)return reject(Error(String(result.error||result.reason||'授权服务异常').slice(0,200)));resolve(result)}catch(e){reject(e)}});
  });
  req.on('timeout',()=>req.destroy(Error('授权服务连接超时')));
  req.on('error',reject);req.end(body);
 });
}
// Electron Chromium networking honors the system proxy/PAC used by browsers.
// Keep the signed device request and server-side Ed25519 verification unchanged.
function makeChromiumTransport(fetcher,{timeoutMs=25000}={}){
 if(typeof fetcher!=='function')throw Error('授权网络模块未初始化');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('授权连接超时配置无效');
 return async(service,endpoint,data)=>{
  const origin=validServiceUrl(service);
  if(!origin)throw Error('授权服务器地址不安全');
  const url=new URL(endpoint,origin);
  if(url.origin!==origin||url.protocol!=='https:')throw Error('授权接口地址不安全');
  const body=JSON.stringify(data);
  if(Buffer.byteLength(body)>8192)throw Error('授权请求过长');
  const signal=AbortSignal.timeout(timeoutMs);
  let res;
  try{
   res=await fetcher(url.toString(),{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body,signal,redirect:'error',cache:'no-store',credentials:'omit'});
   if(!res||typeof res.status!=='number')throw Error('服务器响应无效');
   if(Number(res.headers?.get?.('content-length')||0)>MAX_RESPONSE)throw Error('授权响应过大');
   const reader=res.body?.getReader?.(),parts=[];let size=0;
   if(reader){
    try{
     while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      size+=chunk.value?.byteLength||0;
      if(size>MAX_RESPONSE)throw Error('授权响应过大');
      parts.push(Buffer.from(chunk.value));
     }
    }finally{reader.releaseLock()}
   }else{
    const buffer=Buffer.from(await res.arrayBuffer());
    if(buffer.length>MAX_RESPONSE)throw Error('授权响应过大');
    parts.push(buffer);
   }
   let payload;
   try{payload=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Error('授权服务器返回内容无效')}
   if(!res.ok)throw Error(String(payload.error||payload.reason||'授权服务器响应异常').slice(0,200));
   return payload;
  }catch(error){
   if(signal.aborted||['TimeoutError','AbortError'].includes(error?.name))throw Error('授权服务连接超时（25秒），请检查软件网络或代理设置');
   if(/授权响应过大|授权服务器返回内容无效|授权服务器响应异常|卡密|设备|签名|请求|试用|管理员/.test(String(error?.message||'')))throw error;
   if(error instanceof TypeError||/fetch failed|ERR_|network/i.test(String(error?.message||'')))throw Error('授权连接失败：请检查本机代理或Cloudflare网络');
   throw error;
  }
 };
}

function verifyTokenJS(token,publicKey,deviceId,now=Date.now()){
 try{
  const parts=String(token||'').split('.');if(parts.length!==2)throw Error('凭证格式');
  const payload=Buffer.from(parts[0],'base64url'),sig=Buffer.from(parts[1],'base64url');
  const key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'});
  if(!crypto.verify(null,payload,key,sig))throw Error('授权签名无效');
  const p=JSON.parse(payload.toString('utf8'));
  if(p.schema!==1||p.product!=='dudu-ai-workbench'||p.deviceId!==deviceId||!['trial','permanent'].includes(p.type))throw Error('凭证不是当前设备的授权');
  if(!Number.isSafeInteger(p.leaseExpiresAt)||now>=p.leaseExpiresAt)throw Error('离线授权有效期已结束');
  if(p.type==='trial'&&(!Number.isSafeInteger(p.entitlementExpiresAt)||now>=p.entitlementExpiresAt))throw Error('24小时试用已经结束');
  if(p.type==='permanent'&&p.entitlementExpiresAt!==null)throw Error('永久卡授权格式无效');
  if(!Number.isSafeInteger(p.issuedAt)||p.issuedAt>now+300000)throw Error('授权签发时间异常');
  return {valid:true,type:p.type,expiresAt:p.entitlementExpiresAt,leaseExpiresAt:p.leaseExpiresAt,issuedAt:p.issuedAt};
 }catch(e){return {valid:false,reason:String(e.message||e).slice(0,160)}}
}
class LicenseClient{
 constructor({root,safeStorage,packaged=false,native=null,config=licenseConfig,clock=()=>Date.now(),transport=post}){
  this.root=root;this.storage=safeStorage;this.packaged=packaged;this.native=native;this.clock=clock;this.transport=transport;
  this.service=validServiceUrl(config?.serviceUrl);
  this.publicKey=/^[A-Za-z0-9+/]{50,150}={0,2}$/.test(config?.publicKey||'')?config.publicKey:'';
  this.identityFile=path.join(root,'license-device.bin');this.cacheFile=path.join(root,'license-cache.bin');
  this.identity=null;this.token='';this.maxSeen=0;this.lastError='';
  this.load();
 }
 secure(){return !!this.storage?.isEncryptionAvailable?.()}
 seal(data){if(!this.secure())throw Error('Windows DPAPI安全存储不可用，无法保存授权私钥');return this.storage.encryptString(JSON.stringify(data))}
 open(file){if(!this.secure())return null;try{return JSON.parse(this.storage.decryptString(fs.readFileSync(file)))}catch{return null}}
 save(file,object){fs.mkdirSync(this.root,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,this.seal(object),{mode:0o600});fs.renameSync(tmp,file)}
 load(){
  this.identity=this.open(this.identityFile);
  const cache=this.open(this.cacheFile)||{};
  this.token=typeof cache.token==='string'?cache.token:'';
  this.maxSeen=Number.isSafeInteger(cache.maxSeen)?cache.maxSeen:0;
 }
 identityReady(){
  if(!this.secure())throw Error('本机无法使用Windows DPAPI保护卡密，请确认使用Windows 10/11');
  if(this.identity?.privateKey&&this.identity?.publicKey&&/^[0-9a-f]{64}$/.test(this.identity?.deviceId||''))return this.identity;
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const machine=winMachineGuid();
  // On Windows a MachineGuid typically survives app reinstall; never transmit it in the clear.
  // Fallback identifier does NOT survive erased local data; server-side abuse limits remain necessary.
  const fallback=crypto.randomUUID();
  const deviceId=crypto.createHash('sha256').update('dudu-ai-v1|'+(machine||fallback)).digest('hex');
  const ident={deviceId,publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),privateKey:privateKey.export({type:'pkcs8',format:'der'}).toString('base64')};
  this.save(this.identityFile,ident);this.identity=ident;return ident;
 }
 verify(token=this.token){
  const i=this.identity;const now=this.clock();
  if(!i||!token)return {valid:false,reason:'尚未试用或激活'};
  if(this.maxSeen&&now+300000<this.maxSeen)return {valid:false,reason:'检测到系统时间明显回退，请联网校准时间'};
  if(!this.publicKey)return {valid:false,reason:'授权公钥尚未配置'};
  if(this.packaged){
   if(typeof this.native?.verifyLicenseToken!=='function')return {valid:false,reason:'原生授权模块缺失，拒绝错误放行'};
   try{const result=JSON.parse(this.native.verifyLicenseToken(token,this.publicKey,i.deviceId,now));return result}catch{return {valid:false,reason:'原生授权验证失败'}}
  }
  return verifyTokenJS(token,this.publicKey,i.deviceId,now);
 }
 status(){
  const state=this.verify();
  return {...state,configured:!!(this.service&&this.publicKey),secureStorageAvailable:this.secure(),serviceOnline:!this.lastError,error:this.lastError||'',deviceLabel:this.identity?.deviceId?.slice(0,8)||''};
 }
 requireValid(){const s=this.status();if(!s.valid)throw Error('试用已结束或尚未激活；请打开「授权中心」领取免费永久卡密。'+(s.reason||''));return true}
 request(op,code=''){
  if(!this.service||!this.publicKey)throw Error('授权服务尚未部署，当前仅提供开发预览与本地项目导出');
  const i=this.identityReady(),signedCode=op==='activate'?cleanCode(code):String(code||'').slice(0,1200),r={deviceId:i.deviceId,publicKey:i.publicKey,ts:this.clock(),nonce:crypto.randomBytes(16).toString('hex'),code:signedCode};
  r.signature=b64u(crypto.sign(null,enc(deviceMessage(op,r)),crypto.createPrivateKey({key:Buffer.from(i.privateKey,'base64'),format:'der',type:'pkcs8'})));
  return r;
 }
 async call(op,endpoint,code=''){
  try{
   const payload=this.request(op,code),out=await this.transport(this.service,endpoint,payload);
   if(!out?.token)throw Error('授权服务没有返回签名凭证');
   // A forged server response must never update the local entitlement.
   const verified=this.verify(out.token);
   if(!verified.valid)throw Error('授权签名校验失败：'+verified.reason);
   this.token=out.token;this.maxSeen=Math.max(this.maxSeen,this.clock(),verified.issuedAt);
   this.save(this.cacheFile,{token:this.token,maxSeen:this.maxSeen});
   this.lastError='';return this.status();
  }catch(e){this.lastError=String(e.message||e).slice(0,200);throw e}
 }
 async callPublic(op,endpoint,code=''){
  if(!this.service||!this.publicKey)throw Error('授权服务尚未部署，当前无法提交申请或创建订单');
  const payload=this.request(op,code);
  try{return await this.transport(this.service,endpoint,payload)}
  catch(e){this.lastError=String(e.message||e).slice(0,200);throw e}
 }
 createApplication(contact,reason){
  const data={contact:String(contact||'').trim().slice(0,80),reason:String(reason||'').trim().slice(0,500)};
  if(data.reason.length<8)throw Error('请填写至少8个字的申请原因');
  return this.callPublic('application-create','/v1/application/create',JSON.stringify(data));
 }
 applicationStatus(applicationId){
  const id=String(applicationId||'');if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('申请编号无效');
  return this.callPublic('application-status','/v1/application/status',id);
 }
 products(){return this.callPublic('commerce-products','/v1/commerce/products','')}
 createOrder(productId,provider){
  if(!/^[a-z0-9-]{3,80}$/i.test(String(productId||'')))throw Error('商品编号无效');
  if(!['wechat','alipay'].includes(provider))throw Error('请选择微信支付或支付宝');
  return this.callPublic('order-create','/v1/orders/create',JSON.stringify({productId,provider}));
 }
 orderStatus(orderId){
  const id=String(orderId||'');if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('订单编号无效');
  return this.callPublic('order-status','/v1/orders/status',id);
 }
 startTrial(){return this.call('trial','/v1/trial/start')}
 activate(code){
  if(!/^DUDU(?:-[A-Z2-9]{5}){4}$/.test(cleanCode(code)))throw Error('卡密格式应为DUDU-XXXXX-XXXXX-XXXXX-XXXXX');
  return this.call('activate','/v1/license/activate',code);
 }
 async refresh(){if(!this.service||!this.publicKey||!this.token)return this.status();try{return await this.call('refresh','/v1/license/refresh')}catch{return this.status()}}
}
module.exports={LicenseClient,deviceMessage,verifyTokenJS,validServiceUrl,cleanCode,makeChromiumTransport};
