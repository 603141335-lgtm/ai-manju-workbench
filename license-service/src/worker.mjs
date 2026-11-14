import {adminHtml} from './admin-ui.mjs';
import {operationsHtml} from './operations-ui.mjs';
import {paymentReadiness,createWechatPayment,createAlipayPayment,verifyWechatPaymentCallback,verifyAlipayPaymentCallback} from './payments.mjs';

// Only public license proof data is accepted. No Doubao credentials, cookies,
// projects or files are read or uploaded. Signing private key stays in Worker secrets.
const PRODUCT='dudu-ai-workbench';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const enc=new TextEncoder(),dec=new TextDecoder();
const response=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const b64u=b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')};
const un64u=t=>{const s=t.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))};
const b64=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
export function deviceMessage(op,req){return JSON.stringify({op,deviceId:req.deviceId,publicKey:req.publicKey,ts:req.ts,nonce:req.nonce,code:req.code||''})}
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
const adminAuth=async(req,env)=>{const raw=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(raw.length<32||!env.DUDU_ADMIN_TOKEN_SHA256)return false;const h=await crypto.subtle.digest('SHA-256',enc.encode(raw));return boolSafeEq(Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join(''),env.DUDU_ADMIN_TOKEN_SHA256.toLowerCase())};
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
 const card=await env.DB.prepare('SELECT id FROM license_cards WHERE bound_device_hash=? AND revoked_ms IS NULL ORDER BY activated_ms DESC LIMIT 1').bind(hash).first();
 if(card)return signPermit(env,deviceId,'permanent',null);
 const d=await row(env,hash);
 if(d?.trial_ends_ms&&Date.now()<d.trial_ends_ms)return signPermit(env,deviceId,'trial',d.trial_ends_ms);
 return response({valid:false,reason:d?.trial_ends_ms?'trial_expired':'not_started'},403);
}
async function licenseRequest(request,env,op){
 const body=await request.json();await verifyDevice(op,body);
 const hash=await hmac(env.DUDU_DEVICE_HMAC_KEY,body.deviceId);
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

const cleanText=(value,max=500)=>typeof value==='string'?value.replace(/[\\u0000-\\u001f]/g,' ').trim().slice(0,max):'';
async function signedContext(request,env,op){
 const body=await request.json();
 await verifyDevice(op,body);
 const hash=await hmac(env.DUDU_DEVICE_HMAC_KEY,body.deviceId);
 const seen=await env.DB.prepare('INSERT OR IGNORE INTO request_nonces(device_hash,nonce,created_ms) VALUES(?,?,?)').bind(hash,body.nonce.toLowerCase(),Date.now()).run();
 if(!seen.meta?.changes)throw Error('请求已处理，请重新操作');
 if(crypto.getRandomValues(new Uint8Array(1))[0]===0)await env.DB.prepare('DELETE FROM request_nonces WHERE created_ms<?').bind(Date.now()-10*60*1000).run();
 await registerDevice(env,hash,body.publicKey);
 return {body,hash};
}
function parseSignedCode(body){
 try{return JSON.parse(String(body.code||'{}'))}catch{throw Error('请求参数格式无效')}
}
async function auditEvent(env,event,targetType,targetId,detail=''){
 await env.DB.prepare('INSERT INTO admin_audit_v2(event,target_type,target_id,detail,occurred_ms) VALUES(?,?,?,?,?)').bind(event,targetType,String(targetId||''),cleanText(detail,500),Date.now()).run();
}
async function contentProxy(env,path,method='GET',body,contentType='application/json'){
 if(!env.CONTENT?.fetch||!env.DUDU_CONTENT_INTERNAL_TOKEN)return response({error:'内容服务内部连接尚未配置；请完成一次性运营后台连接设置'},503);
 const headers={'X-Dudu-Internal-Token':env.DUDU_CONTENT_INTERNAL_TOKEN};
 if(contentType)headers['content-type']=contentType;
 const init={method,headers,redirect:'error'};
 if(body!==undefined&&method!=='GET'&&method!=='HEAD')init.body=body;
 const upstream=await env.CONTENT.fetch(new Request('https://dudu-content.internal'+path,init));
 const text=await upstream.text();
 return new Response(text,{status:upstream.status,headers:{'content-type':upstream.headers.get('content-type')||'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
async function consoleRequest(request,env,path){
 if(!await adminAuth(request,env))return response({error:'管理员身份验证失败'},401);
 const method=request.method;
 if(method==='GET'&&path==='/api/console/overview'){
  const [devices,cards,pendingApplications,pendingDeliveries,recentApplications,recentOrders]=await Promise.all([
   env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first(),
   env.DB.prepare('SELECT COUNT(*) AS n FROM license_cards WHERE revoked_ms IS NULL').first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM license_applications WHERE status='pending'").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE payment_status='paid' AND delivery_status<>'delivered'").first(),
   env.DB.prepare('SELECT contact,status,created_ms FROM license_applications ORDER BY created_ms DESC LIMIT 5').all(),
   env.DB.prepare('SELECT order_no,amount_fen,payment_status,created_ms FROM orders ORDER BY created_ms DESC LIMIT 5').all()
  ]);
  return response({devices:devices?.n||0,cards:cards?.n||0,pendingApplications:pendingApplications?.n||0,pendingDeliveries:pendingDeliveries?.n||0,recentApplications:recentApplications.results||[],recentOrders:recentOrders.results||[]});
 }
 if(method==='GET'&&path==='/api/console/applications'){
  const rows=await env.DB.prepare('SELECT id,contact,reason,status,created_ms,reviewed_ms,review_note,card_last_four,substr(device_hash,1,8) AS device_label FROM license_applications ORDER BY created_ms DESC LIMIT 200').all();
  return response({applications:rows.results||[]});
 }
 if(method==='GET'&&path==='/api/console/orders'){
  const rows=await env.DB.prepare('SELECT order_no,product_name,amount_fen,provider,payment_status,delivery_status,created_ms,paid_ms,provider_transaction_id FROM orders ORDER BY created_ms DESC LIMIT 200').all();
  return response({orders:rows.results||[]});
 }
 if(method==='GET'&&path==='/api/console/products'){
  const rows=await env.DB.prepare('SELECT id,name,description,price_fen,entitlement_type,delivery_mode,enabled,created_ms,updated_ms FROM products ORDER BY created_ms ASC').all();
  return response({products:rows.results||[]});
 }
 if(method==='POST'&&path==='/api/console/products/save'){
  const body=await request.json(),id=cleanText(body.id,80),name=cleanText(body.name,100),description=cleanText(body.description,500);
  const priceFen=Number(body.priceFen),enabled=body.enabled===true?1:0,deliveryMode=String(body.deliveryMode||'bind');
  if(!/^[a-z0-9-]{3,80}$/i.test(id)||!name||!Number.isSafeInteger(priceFen)||priceFen<0||priceFen>10000000||deliveryMode!=='bind')return response({error:'商品信息无效；第一期只支持永久授权自动绑定'},400);
  const now=Date.now();
  await env.DB.prepare('INSERT INTO products(id,name,description,price_fen,entitlement_type,delivery_mode,enabled,created_ms,updated_ms) VALUES(?,?,?,?,\'permanent\',?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_fen=excluded.price_fen,delivery_mode=excluded.delivery_mode,enabled=excluded.enabled,updated_ms=excluded.updated_ms')
   .bind(id,name,description,priceFen,deliveryMode,enabled,now,now).run();
  await auditEvent(env,'product.save','product',id,'商品配置已更新');
  return response({ok:true});
 }
 if(method==='POST'&&path==='/api/console/applications/approve'){
  const body=await request.json(),applicationId=String(body.applicationId||''),mode=body.mode==='code'?'code':'bind';
  if(!/^[0-9a-f-]{36}$/i.test(applicationId))return response({error:'申请编号无效'},400);
  const app=await env.DB.prepare("SELECT * FROM license_applications WHERE id=? AND status='pending'").bind(applicationId).first();
  if(!app)return response({error:'申请不存在或已经处理'},404);
  const code=newCode(),cardId=crypto.randomUUID(),codeHash=await hmac(env.DUDU_CARD_HMAC_KEY,code),now=Date.now(),lock=crypto.randomUUID();
  const bound=mode==='bind'?app.device_hash:null,activated=mode==='bind'?now:null;
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE license_applications SET status='approving',approval_lock=? WHERE id=? AND status='pending'").bind(lock,applicationId),
   env.DB.prepare("INSERT INTO license_cards(id,code_hash,last_four,issued_ms,bound_device_hash,activated_ms) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM license_applications WHERE id=? AND status='approving' AND approval_lock=?)").bind(cardId,codeHash,code.slice(-4),now,bound,activated,applicationId,lock),
   env.DB.prepare("UPDATE license_applications SET status='approved',reviewed_ms=?,card_id=?,card_last_four=?,approval_lock=NULL WHERE id=? AND status='approving' AND approval_lock=? AND EXISTS(SELECT 1 FROM license_cards WHERE id=?)").bind(now,cardId,code.slice(-4),applicationId,lock,cardId)
  ]);
  if(!results[0]?.meta?.changes||!results[1]?.meta?.changes||!results[2]?.meta?.changes)return response({error:'审批状态发生变化，请刷新列表后重试'},409);
  await auditEvent(env,'application.approve','application',applicationId,mode==='bind'?'已绑定申请设备':'已生成未绑定卡密');
  return response({ok:true,mode,cardLastFour:code.slice(-4),...(mode==='code'?{code}:{})});
 }
 if(method==='POST'&&path==='/api/console/applications/reject'){
  const body=await request.json(),id=String(body.applicationId||''),note=cleanText(body.note,300);
  const result=await env.DB.prepare("UPDATE license_applications SET status='rejected',reviewed_ms=?,review_note=? WHERE id=? AND status='pending'").bind(Date.now(),note,id).run();
  if(!result.meta?.changes)return response({error:'申请不存在或已经处理'},404);
  await auditEvent(env,'application.reject','application',id,note);
  return response({ok:true});
 }
 if(method==='GET'&&path==='/api/console/audit'){
  const rows=await env.DB.prepare('SELECT event,target_type,target_id,detail,occurred_ms FROM admin_audit_v2 ORDER BY occurred_ms DESC LIMIT 200').all();
  return response({records:rows.results||[]});
 }
 if(method==='GET'&&path==='/api/console/system')return response({payments:paymentReadiness(env),contentService:!!(env.CONTENT?.fetch&&env.DUDU_CONTENT_INTERNAL_TOKEN)});
 if(path==='/api/console/content/manifest'&&method==='GET')return contentProxy(env,'/api/admin/manifest','GET');
 if(path==='/api/console/content/history'&&method==='GET')return contentProxy(env,'/api/admin/history','GET');
 if(path==='/api/console/content/upload'&&method==='POST'){
  const size=Number(request.headers.get('content-length')||0);if(size>2097152)return response({error:'二维码图片不能超过2MB'},413);
  return contentProxy(env,'/api/admin/upload','POST',await request.arrayBuffer(),request.headers.get('content-type')||'application/octet-stream');
 }
 if(path==='/api/console/content/publish'&&method==='POST'){
  const size=Number(request.headers.get('content-length')||0);if(size>65536)return response({error:'内容清单不能超过64KB'},413);
  return contentProxy(env,'/api/admin/publish','POST',await request.text(),'application/json');
 }
 if(path==='/api/console/content/rollback'&&method==='POST'){
  return contentProxy(env,'/api/admin/rollback','POST',await request.text(),'application/json');
 }
 return response({error:'未知运营管理接口'},404);
}
async function publicApplicationCreate(request,env){
 const {body,hash}=await signedContext(request,env,'application-create'),data=parseSignedCode(body);
 const contact=cleanText(data.contact,80),reason=cleanText(data.reason,500);
 if(reason.length<8)return response({error:'请填写至少8个字的申请原因'},400);
 const existing=await env.DB.prepare("SELECT id,status,created_ms FROM license_applications WHERE device_hash=? AND status='pending' ORDER BY created_ms DESC LIMIT 1").bind(hash).first();
 if(existing)return response({ok:true,applicationId:existing.id,status:existing.status,createdAt:existing.created_ms,existing:true});
 const id=crypto.randomUUID(),now=Date.now();
 await env.DB.prepare('INSERT INTO license_applications(id,device_hash,contact,reason,status,created_ms) VALUES(?,?,?,? ,\'pending\',?)').bind(id,hash,contact,reason,now).run();
 return response({ok:true,applicationId:id,status:'pending',createdAt:now});
}
async function publicApplicationStatus(request,env){
 const {body,hash}=await signedContext(request,env,'application-status'),id=String(body.code||'');
 const row=await env.DB.prepare('SELECT id,status,created_ms,reviewed_ms,review_note,card_last_four FROM license_applications WHERE id=? AND device_hash=?').bind(id,hash).first();
 if(!row)return response({error:'未找到本设备的申请记录'},404);
 return response({applicationId:row.id,status:row.status,createdAt:row.created_ms,reviewedAt:row.reviewed_ms,reviewNote:row.review_note||'',cardLastFour:row.card_last_four||''});
}
async function publicProducts(request,env){
 await signedContext(request,env,'commerce-products');
 const rows=await env.DB.prepare("SELECT id,name,description,price_fen,entitlement_type,delivery_mode FROM products WHERE enabled=1 AND price_fen>0 ORDER BY created_ms ASC").all();
 return response({products:rows.results||[],payments:paymentReadiness(env)});
}
async function publicOrderCreate(request,env){
 const {body,hash}=await signedContext(request,env,'order-create'),data=parseSignedCode(body);
 const productId=cleanText(data.productId,80),provider=String(data.provider||'');
 if(!['wechat','alipay'].includes(provider))return response({error:'请选择微信支付或支付宝'},400);
 const product=await env.DB.prepare("SELECT * FROM products WHERE id=? AND enabled=1 AND price_fen>0 AND entitlement_type='permanent' AND delivery_mode='bind'").bind(productId).first();
 if(!product)return response({error:'商品暂未上架或价格尚未设置'},404);
 if(!paymentReadiness(env)[provider])return response({error:(provider==='wechat'?'微信支付':'支付宝')+'商户接口尚未配置'},503);
 const active=await env.DB.prepare('SELECT id FROM license_cards WHERE bound_device_hash=? AND revoked_ms IS NULL LIMIT 1').bind(hash).first();
 if(active)return response({error:'当前设备已经拥有永久授权，无需重复购买'},409);
 const now=Date.now();
 const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE device_hash=? AND payment_status='pending' AND expires_ms>?").bind(hash,now).first();
 if(Number(pending?.n||0)>=3)return response({error:'当前设备已有3笔待支付订单，请先完成或等待订单过期'},429);
 const id=crypto.randomUUID(),orderNo='DU'+now.toString(36).toUpperCase()+crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),expires=now+15*60*1000;
 await env.DB.prepare("INSERT INTO orders(id,order_no,device_hash,product_id,product_name,amount_fen,provider,payment_status,delivery_status,expires_ms,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,'pending','pending',?,?,?)").bind(id,orderNo,hash,product.id,product.name,product.price_fen,provider,expires,now,now).run();
 try{
  const pay=provider==='wechat'?await createWechatPayment(env,{orderNo,amountFen:product.price_fen,productName:product.name}):await createAlipayPayment(env,{orderNo,amountFen:product.price_fen,productName:product.name});
  await env.DB.prepare('UPDATE orders SET pay_payload=?,updated_ms=? WHERE id=? AND payment_status=\'pending\'').bind(pay.qrText,Date.now(),id).run();
  return response({ok:true,orderId:id,orderNo,productName:product.name,amountFen:product.price_fen,provider,qrText:pay.qrText,expiresAt:expires});
 }catch(error){
  await env.DB.prepare("UPDATE orders SET payment_status='failed',delivery_status='failed',updated_ms=? WHERE id=? AND payment_status='pending'").bind(Date.now(),id).run();
  return response({error:String(error.message||'支付下单失败').slice(0,180)},502);
 }
}
async function publicOrderStatus(request,env){
 const {body,hash}=await signedContext(request,env,'order-status'),id=String(body.code||'');
 const order=await env.DB.prepare('SELECT id,order_no,product_name,amount_fen,provider,payment_status,delivery_status,pay_payload,expires_ms,created_ms,paid_ms FROM orders WHERE id=? AND device_hash=?').bind(id,hash).first();
 if(!order)return response({error:'未找到本设备的订单'},404);
 if(order.payment_status==='pending'&&Date.now()>order.expires_ms){
  await env.DB.prepare("UPDATE orders SET payment_status='expired',updated_ms=? WHERE id=? AND payment_status='pending'").bind(Date.now(),id).run();
  order.payment_status='expired';order.pay_payload='';
 }
 return response({orderId:order.id,orderNo:order.order_no,productName:order.product_name,amountFen:order.amount_fen,provider:order.provider,paymentStatus:order.payment_status,deliveryStatus:order.delivery_status,qrText:order.payment_status==='pending'?order.pay_payload:'',expiresAt:order.expires_ms,paidAt:order.paid_ms});
}
async function completePaidOrder(env,{eventId,orderNo,provider,transactionId,amountFen}){
 if(!eventId||!orderNo||!transactionId||!Number.isSafeInteger(amountFen))throw Error('支付通知字段无效');
 const order=await env.DB.prepare('SELECT * FROM orders WHERE order_no=?').bind(orderNo).first();
 if(!order)throw Error('支付订单不存在');
 if(order.amount_fen!==amountFen)throw Error('支付金额与订单金额不一致');
 if(order.provider!==provider)throw Error('支付渠道与订单不一致');
 if(order.payment_status==='paid')return {duplicate:true};
 if(!['pending','expired'].includes(order.payment_status))throw Error('订单当前状态不能发货');
 const code=newCode(),cardId=crypto.randomUUID(),codeHash=await hmac(env.DUDU_CARD_HMAC_KEY,code),now=Date.now();
 const results=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO payment_events(event_id,order_no,provider,received_ms) VALUES(?,?,?,?)').bind(eventId,orderNo,provider,now),
  env.DB.prepare("UPDATE orders SET payment_status='processing',provider_transaction_id=?,paid_ms=?,updated_ms=? WHERE order_no=? AND payment_status IN ('pending','expired') AND EXISTS(SELECT 1 FROM payment_events WHERE event_id=? AND order_no=?)").bind(transactionId,now,now,orderNo,eventId,orderNo),
  env.DB.prepare("INSERT INTO license_cards(id,code_hash,last_four,issued_ms,bound_device_hash,activated_ms) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE order_no=? AND payment_status='processing')").bind(cardId,codeHash,code.slice(-4),now,order.device_hash,now,orderNo),
  env.DB.prepare("INSERT INTO order_deliveries(order_no,card_id,delivery_mode,delivered_ms) SELECT ?,?,'bind',? WHERE EXISTS(SELECT 1 FROM license_cards WHERE id=?) AND EXISTS(SELECT 1 FROM orders WHERE order_no=? AND payment_status='processing')").bind(orderNo,cardId,now,cardId,orderNo),
  env.DB.prepare("UPDATE orders SET payment_status='paid',delivery_status='delivered',updated_ms=? WHERE order_no=? AND payment_status='processing' AND EXISTS(SELECT 1 FROM order_deliveries WHERE order_no=?)").bind(now,orderNo,orderNo),
  env.DB.prepare("INSERT INTO admin_audit_v2(event,target_type,target_id,detail,occurred_ms) SELECT 'order.auto_delivered','order',?,'付款核验成功，永久授权已绑定当前设备',? WHERE EXISTS(SELECT 1 FROM orders WHERE order_no=? AND payment_status='paid')").bind(orderNo,now,orderNo)
 ]);
 if(!results[1]?.meta?.changes)return {duplicate:true};
 if(!results[2]?.meta?.changes||!results[3]?.meta?.changes||!results[4]?.meta?.changes)throw Error('支付已确认但自动发货未完成，需要管理员检查订单');
 return {duplicate:false,cardId};
}
async function paymentCallback(request,env,provider){
 try{
  if(provider==='wechat'){
   const verified=await verifyWechatPaymentCallback(request,env),tx=verified.transaction;
   if(tx.trade_state!=='SUCCESS'||tx.appid!==env.WECHAT_PAY_APP_ID||tx.mchid!==env.WECHAT_PAY_MCH_ID)throw Error('微信支付交易状态或商户信息不匹配');
   await completePaidOrder(env,{eventId:verified.eventId,orderNo:tx.out_trade_no,provider:'wechat',transactionId:tx.transaction_id,amountFen:tx.amount?.total});
   return response({code:'SUCCESS',message:'成功'});
  }
  const verified=await verifyAlipayPaymentCallback(request,env),tx=verified.transaction;
  if(!['TRADE_SUCCESS','TRADE_FINISHED'].includes(tx.trade_status))return new Response('success',{status:200,headers:{'content-type':'text/plain; charset=utf-8'}});
  const amountFen=Math.round(Number(tx.total_amount)*100);
  if(!Number.isSafeInteger(amountFen))throw Error('支付宝支付金额无效');
  await completePaidOrder(env,{eventId:verified.eventId,orderNo:tx.out_trade_no,provider:'alipay',transactionId:tx.trade_no,amountFen});
  return new Response('success',{status:200,headers:{'content-type':'text/plain; charset=utf-8'}});
 }catch(error){
  if(provider==='wechat')return response({code:'FAIL',message:String(error.message||'验签失败').slice(0,120)},400);
  return new Response('failure',{status:400,headers:{'content-type':'text/plain; charset=utf-8'}});
 }
}

async function adminRequest(req,env,path){
 if(!await adminAuth(req,env))return response({error:'管理员身份验证失败'},401);
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
 if(path==='/admin'&&request.method==='GET')return new Response(operationsHtml,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' https: data: blob:; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}});
 if(path==='/admin-legacy'&&request.method==='GET')return new Response(adminHtml,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}});
 if(path==='/v1/payments/wechat/notify'&&request.method==='POST')return paymentCallback(request,env,'wechat');
 if(path==='/v1/payments/alipay/notify'&&request.method==='POST')return paymentCallback(request,env,'alipay');
 if(request.method==='GET')return response({error:'Not found'},404);
 if(request.method!=='POST'||(!path.startsWith('/v1/')&&!path.startsWith('/api/console/')))return response({error:'Not found'},404);
 const maxBody=path==='/api/console/content/upload'?2097152:65536;if(Number(request.headers.get('content-length')||0)>maxBody)return response({error:'请求过大'},413);
 if(path.startsWith('/api/console/'))return consoleRequest(request,env,path);
 if(!(request.headers.get('content-type')||'').startsWith('application/json'))return response({error:'请求必须为JSON'},415);
 try{
  if(path.startsWith('/v1/admin/'))return await adminRequest(request,env,path);
  if(path==='/v1/application/create')return await publicApplicationCreate(request,env);
  if(path==='/v1/application/status')return await publicApplicationStatus(request,env);
  if(path==='/v1/commerce/products')return await publicProducts(request,env);
  if(path==='/v1/orders/create')return await publicOrderCreate(request,env);
  if(path==='/v1/orders/status')return await publicOrderStatus(request,env);
  const op=({'/v1/trial/start':'trial','/v1/license/activate':'activate','/v1/license/refresh':'refresh'})[path];
  if(!op)return response({error:'Not found'},404);
  return await licenseRequest(request,env,op);
 }catch(e){return safeError(e)}
}};
