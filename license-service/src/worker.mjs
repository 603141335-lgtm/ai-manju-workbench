import {adminHtml} from './admin-ui.mjs';
import {handleOpsRequest,runScheduledReconciliation} from './ops-service.mjs';

// Only public license proof data is accepted. No Doubao credentials, cookies,
// projects or files are read or uploaded. Signing private key stays in Worker secrets.
const PRODUCT='dudu-ai-workbench';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const enc=new TextEncoder(),dec=new TextDecoder();
const response=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const b64u=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')};
const un64u=t=>{const s=t.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))};
const b64=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
export function deviceMessage(op,req){
 const message={op,deviceId:req.deviceId,publicKey:req.publicKey,ts:req.ts,nonce:req.nonce,code:req.code||''};
 for(const key of ['contact','reason','productId','paymentMethod','orderId'])if(typeof req[key]==='string')message[key]=req[key];
 return JSON.stringify(message);
}
const sha=async bytes=>b64u(await crypto.subtle.digest('SHA-256',bytes));
const hmac=async(key,value)=>{if(!key||key.length<32)throw Error('服务器HMAC秘密未配置');const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(await crypto.subtle.sign('HMAC',k,enc.encode(value)))};
const validDeviceId=x=>typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x);
const validPub=x=>typeof x==='string'&&/^[A-Za-z0-9+/]{50,150}={0,2}$/.test(x);
const safeError=e=>response({error:e?.message&&/^(卡密|设备|签名|时间|试用|管理员|请求|服务)/.test(e.message)?e.message:'请求未完成'},400);
const boolSafeEq=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
async function verifyDevice(op,body){
 if(!body||!validDeviceId(body.deviceId)||!validPub(body.publicKey)||!Number.isSafeInteger(body.ts)||Math.abs(Date.now()-body.ts)>120000||!/^[0-9a-f]{32}$/i.test(body.nonce||''))throw Error('设备证明或时间无效');
 try{
  const k=await crypto.subtle.importKey('spki',b64(body.publicKey),{name:'Ed25519'},false,['verify']);
  const ok=await crypto.subtle.verify('Ed25519',k,un64u(body.signature||''),enc.encode(deviceMessage(op,body)));
  if(!ok)throw Error('签名无效');
 }catch(e){throw Error('设备签名无效')}
 return true;
}
async function signPermit(env,deviceId,type,endMs){
 const now=Date.now(),lease=Math.min(endMs||Number.MAX_SAFE_INTEGER,now+(type==='trial'?24*3600*1000:30*86400*1000));
 const claims={schema:1,product:PRODUCT,type,deviceId,issuedAt:now,entitlementExpiresAt:endMs||null,leaseExpiresAt:lease};
 const raw=enc.encode(JSON.stringify(claims)),key=await crypto.subtle.importKey('pkcs8',b64(env.DUDU_SIGNING_PRIVATE_PKCS8_B64),{name:'Ed25519'},false,['sign']);
 return response({valid:true,type,expiresAt:endMs||null,leaseExpiresAt:lease,token:b64u(raw)+'.'+b64u(await crypto.subtle.sign('Ed25519',key,raw))});
}
// Public endpoint for CI: prove the deployed Worker owns the private key
// corresponding to the Windows client's verification key. Never signs user input.
async function attestSigningKey(env){
 const payload=enc.encode(JSON.stringify({schema:1,product:PRODUCT,purpose:'license-public-key-v1',issuedAt:Date.now()}));
 const key=await crypto.subtle.importKey('pkcs8',b64(env.DUDU_SIGNING_PRIVATE_PKCS8_B64),{name:'Ed25519'},false,['sign']);
 const signature=await crypto.subtle.sign('Ed25519',key,payload);
 return response({payload:b64u(payload),signature:b64u(signature)});
}
const newCode=()=>{const bytes=crypto.getRandomValues(new Uint8Array(20));let out='';for(const b of bytes)out+=alphabet[b%alphabet.length];return 'DUDU-'+out.match(/.{1,5}/g).join('-')};
const adminPrincipal=async(req,env)=>{
 const raw=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
 if(raw.length<32)return null;
 const digest=await crypto.subtle.digest('SHA-256',enc.encode(raw));
 const tokenHash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 if(env.DUDU_ADMIN_TOKEN_SHA256&&boolSafeEq(tokenHash,env.DUDU_ADMIN_TOKEN_SHA256.toLowerCase()))
  return {id:'owner',name:'超级管理员',role:'super_admin'};
 const operator=await env.DB.prepare('SELECT operator_id,display_name,role FROM admin_operators WHERE token_sha256=? AND enabled=1').bind(tokenHash).first();
 if(!operator)return null;
 const now=Date.now();
 await env.DB.prepare('UPDATE admin_operators SET last_login_ms=? WHERE operator_id=? AND (last_login_ms IS NULL OR last_login_ms<?)')
  .bind(now,operator.operator_id,now-300000).run();
 return {id:operator.operator_id,name:operator.display_name,role:operator.role};
};
const adminAuth=async(req,env)=>!!(await adminPrincipal(req,env));
const row=async(env,id)=>env.DB.prepare('SELECT * FROM devices WHERE device_hash=?').bind(id).first();
async function registerDevice(env,hash,pub){
 const old=await row(env,hash);
 if(old&&old.public_key!==pub)throw Error('设备已登记其他密钥；重装系统或更换电脑请联系管理员恢复，不会重新发放试用');
 if(!old)await env.DB.prepare('INSERT OR IGNORE INTO devices(device_hash,public_key,created_ms) VALUES (?,?,?)').bind(hash,pub,Date.now()).run();
 const fresh=await row(env,hash);
 if(!fresh||fresh.public_key!==pub)throw Error('设备绑定冲突');
 return fresh;
}
async function stateFor(env,hash,deviceId){
 const control=await env.DB.prepare('SELECT blocked_ms FROM device_controls WHERE device_hash=?').bind(hash).first();
 if(control?.blocked_ms)return response({valid:false,reason:'device_blocked'},403);
 const card=await env.DB.prepare('SELECT id FROM license_cards WHERE bound_device_hash=? AND revoked_ms IS NULL ORDER BY activated_ms DESC LIMIT 1').bind(hash).first();
 if(card)return signPermit(env,deviceId,'permanent',null);
 const d=await row(env,hash);
 if(d?.trial_ends_ms&&Date.now()<d.trial_ends_ms)return signPermit(env,deviceId,'trial',d.trial_ends_ms);
 return response({valid:false,reason:d?.trial_ends_ms?'trial_expired':'not_started'},403);
}
async function licenseRequest(request,env,op){
 const body=await request.json();await verifyDevice(op,body);
 const hash=await hmac(env.DUDU_DEVICE_HMAC_KEY,body.deviceId);
 const control=await env.DB.prepare('SELECT blocked_ms FROM device_controls WHERE device_hash=?').bind(hash).first();
 if(control?.blocked_ms)return response({valid:false,reason:'device_blocked'},403);
 // A valid signature is necessary but never sufficient to replay the same request.
 // Atomic D1 primary key prevents duplicate nonces even during concurrent requests.
 const seen=await env.DB.prepare('INSERT OR IGNORE INTO request_nonces(device_hash,nonce,created_ms) VALUES(?,?,?)').bind(hash,body.nonce.toLowerCase(),Date.now()).run();
 if(!seen.meta?.changes)throw Error('请求已处理，请重新操作');
 // Sampled pruning avoids an unbounded nonce table without adding a write to every request.
 if(crypto.getRandomValues(new Uint8Array(1))[0]===0){
   await env.DB.prepare('DELETE FROM request_nonces WHERE created_ms<?').bind(Date.now()-10*60*1000).run();
 }
 const d=await registerDevice(env,hash,body.publicKey);
 if(op==='trial'){
  if(d.trial_started_ms!==null)return stateFor(env,hash,body.deviceId);
  const now=Date.now();
  const updated=await env.DB.prepare('UPDATE devices SET trial_started_ms=?,trial_ends_ms=? WHERE device_hash=? AND trial_started_ms IS NULL').bind(now,now+86400000,hash).run();
  if(!updated.meta?.changes)return stateFor(env,hash,body.deviceId);
  return signPermit(env,body.deviceId,'trial',now+86400000);
 }
 if(op==='activate'){
  const code=String(body.code||'').trim().toUpperCase();
  if(!/^DUDU(?:-[A-Z2-9]{5}){4}$/.test(code))throw Error('卡密格式无效');
  const codeHash=await hmac(env.DUDU_CARD_HMAC_KEY,code);
  const card=await env.DB.prepare('SELECT * FROM license_cards WHERE code_hash=?').bind(codeHash).first();
  if(!card||card.revoked_ms)throw Error('卡密无效或已停用');
  if(card.bound_device_hash&&card.bound_device_hash!==hash)throw Error('卡密已绑定其他设备，请联系管理员申请换机');
  if(!card.bound_device_hash){
   await env.DB.prepare('UPDATE license_cards SET bound_device_hash=?,activated_ms=? WHERE code_hash=? AND bound_device_hash IS NULL AND revoked_ms IS NULL').bind(hash,Date.now(),codeHash).run();
   const check=await env.DB.prepare('SELECT bound_device_hash,revoked_ms FROM license_cards WHERE code_hash=?').bind(codeHash).first();
   if(!check||check.bound_device_hash!==hash||check.revoked_ms)throw Error('卡密绑定冲突，请重试');
  }
  return signPermit(env,body.deviceId,'permanent',null);
 }
 return stateFor(env,hash,body.deviceId);
}
async function adminRequest(req,env,path){
 const principal=await adminPrincipal(req,env);
 if(!principal)return response({error:'管理员身份验证失败'},401);
 const action=path.endsWith('/issue')?'issue':path.endsWith('/revoke')?'revoke':path.endsWith('/transfer')?'transfer':'list';
 const allowed=principal.role==='super_admin'
  ||(action==='issue'&&principal.role==='operations')
  ||(action==='list'&&['operations','support'].includes(principal.role))
  ||(['revoke','transfer'].includes(action)&&principal.role==='support');
 if(!allowed)return response({error:'当前管理员角色没有此操作权限'},403);
 const body=await req.json();
 if(path.endsWith('/issue')){
  const count=Number(body.count);if(!Number.isInteger(count)||count<1||count>50)return response({error:'一次生成1到50张'},400);
  const codes=[];
  for(let i=0;i<count;i++){
   const code=newCode(),id=crypto.randomUUID(),h=await hmac(env.DUDU_CARD_HMAC_KEY,code);
   await env.DB.prepare('INSERT INTO license_cards(id,code_hash,last_four,issued_ms) VALUES (?,?,?,?)').bind(id,h,code.slice(-4),Date.now()).run();
   await env.DB.prepare('INSERT INTO admin_audit(event,card_id,occurred_ms) VALUES (?,?,?)').bind('issue',id,Date.now()).run();
   codes.push(code);
  }
  await env.DB.prepare('INSERT INTO admin_activity(actor_id,actor_name,actor_role,action,target_type,target_id,detail,occurred_ms) VALUES(?,?,?,?,?,?,?,?)')
   .bind(principal.id,principal.name,principal.role,'card_issue','cards','', '批量生成卡密：'+count+'张',Date.now()).run();
  return response({codes});
 }
 if(path.endsWith('/list')){
  const {results}=await env.DB.prepare('SELECT id,last_four,issued_ms,activated_ms,bound_device_hash IS NOT NULL AS bound,revoked_ms FROM license_cards ORDER BY issued_ms DESC LIMIT 200').all();
  return response({cards:results});
 }
 if(path.endsWith('/revoke')||path.endsWith('/transfer')){
  const cardId=String(body.cardId||'');
  if(!/^[0-9a-f-]{36}$/i.test(cardId))return response({error:'卡密ID无效'},400);
  const action=path.endsWith('/revoke')?'revoke':'transfer';
  const result=action==='revoke'
    ?await env.DB.prepare('UPDATE license_cards SET revoked_ms=? WHERE id=? AND revoked_ms IS NULL').bind(Date.now(),cardId).run()
    :await env.DB.prepare('UPDATE license_cards SET bound_device_hash=NULL,activated_ms=NULL WHERE id=? AND revoked_ms IS NULL').bind(cardId).run();
  if(!result.meta?.changes)return response({error:'卡密不存在或已停用'},404);
  await env.DB.prepare('INSERT INTO admin_audit(event,card_id,occurred_ms) VALUES (?,?,?)').bind(action,cardId,Date.now()).run();
  await env.DB.prepare('INSERT INTO admin_activity(actor_id,actor_name,actor_role,action,target_type,target_id,detail,occurred_ms) VALUES(?,?,?,?,?,?,?,?)')
   .bind(principal.id,principal.name,principal.role,'card_'+action,'card',cardId,action==='revoke'?'管理员停用卡密':'管理员解绑设备',Date.now()).run();
  return response({ok:true,action});
 }
 return response({error:'未知管理员操作'},404);
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/health'&&request.method==='GET')return response({status:'ok',service:'dudu-license-v1'});
 if(path==='/v1/license/attest'&&request.method==='GET'){
  try{return await attestSigningKey(env)}catch{return response({error:'服务器签名服务尚未正确配置'},503)}
 }
 if(path==='/admin'&&request.method==='GET')return new Response(adminHtml,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}});
 const opsResponse=await handleOpsRequest(request,env,path,{adminAuth,adminPrincipal,hmac,newCode,verifyDevice,registerDevice:(hash,pub)=>registerDevice(env,hash,pub)});
 if(opsResponse)return opsResponse;
 if(request.method!=='POST'||!path.startsWith('/v1/'))return response({error:'Not found'},404);
 if(Number(request.headers.get('content-length')||0)>8192)return response({error:'请求过大'},413);
 if(!(request.headers.get('content-type')||'').startsWith('application/json'))return response({error:'请求必须为JSON'},415);
 try{
  if(path.startsWith('/v1/admin/'))return await adminRequest(request,env,path);
  const op=({'/v1/trial/start':'trial','/v1/license/activate':'activate','/v1/license/refresh':'refresh'})[path];
  if(!op)return response({error:'Not found'},404);
  return await licenseRequest(request,env,op);
 }catch(e){return safeError(e)}
},
 async scheduled(_controller,env,ctx){
  const task=runScheduledReconciliation(env,{hmac,newCode})
   .then(result=>console.log('dudu-payment-reconcile',JSON.stringify(result)))
   .catch(error=>console.error('dudu-payment-reconcile-failed',String(error?.message||error)));
  ctx.waitUntil(task);
 }
};