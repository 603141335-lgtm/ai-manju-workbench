import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign,verify,createCipheriv,randomBytes} from 'node:crypto';
import worker,{deviceMessage} from '../src/worker.mjs';
import {createWechatPayment,createAlipayPayment,verifyWechatPaymentCallback,verifyAlipayPaymentCallback,paymentReadiness} from '../src/payments.mjs';
const SCHEMA=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
class FakeD1{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(SCHEMA)}
 prepare(sql){
  const stmt=this.db.prepare(sql);
  const make=args=>({
   first:async()=>stmt.get(...args)||null,
   all:async()=>({results:stmt.all(...args)}),
   run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})
  });
  return {first:async()=>stmt.get()||null,all:async()=>({results:stmt.all()}),run:async()=>({meta:{changes:Number(stmt.run().changes)}}),bind(...args){return make(args)}};
 }
 async batch(statements){
  this.db.exec('BEGIN');
  try{const out=[];for(const statement of statements)out.push(await statement.run());this.db.exec('COMMIT');return out}
  catch(error){this.db.exec('ROLLBACK');throw error}
 }
}
function signer(){
 const keys=generateKeyPairSync('ed25519');
 return {keys,publicKey:keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),deviceId:randomBytes(32).toString('hex')};
}
function proof(d,op,code=''){
 const req={deviceId:d.deviceId,publicKey:d.publicKey,ts:Date.now(),nonce:randomBytes(16).toString('hex'),code};
 req.signature=sign(null,Buffer.from(deviceMessage(op,req)),d.keys.privateKey).toString('base64url');
 return req;
}
function environment(){
 const signing=generateKeyPairSync('ed25519');
 const admin='A'.repeat(64);
 return {DB:new FakeD1(),DUDU_SIGNING_PRIVATE_PKCS8_B64:signing.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),
  DUDU_DEVICE_HMAC_KEY:'device-secret-'+('d'.repeat(60)),DUDU_CARD_HMAC_KEY:'card-secret-'+('c'.repeat(60)),
  DUDU_ADMIN_TOKEN_SHA256:createHash('sha256').update(admin).digest('hex'),admin};
}
async function post(env,path,body,adminToken){
 const res=await worker.fetch(new Request('https://license.example.test'+path,{method:'POST',headers:{'content-type':'application/json',...(adminToken?{authorization:'Bearer '+adminToken}:{})},body:JSON.stringify(body)}),env);
 return {status:res.status,data:await res.json()};
}
function rsaPair(){
 const p=generateKeyPairSync('rsa',{modulusLength:2048});
 return {privateKey:p.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:p.publicKey.export({type:'spki',format:'pem'}),privateObject:p.privateKey,publicObject:p.publicKey};
}
test('operations schema is additive and preserves all original license tables',()=>{
 assert.match(SCHEMA,/CREATE TABLE IF NOT EXISTS devices/);
 assert.match(SCHEMA,/CREATE TABLE IF NOT EXISTS license_cards/);
 assert.match(SCHEMA,/CREATE TABLE IF NOT EXISTS products/);
 assert.match(SCHEMA,/CREATE TABLE IF NOT EXISTS license_applications/);
 assert.match(SCHEMA,/CREATE TABLE IF NOT EXISTS orders/);
 assert.doesNotMatch(SCHEMA,/DROP TABLE|DELETE FROM/i);
});
test('free application can be reviewed and bound to the signed requesting device',async()=>{
 const env=environment(),d=signer();
 const created=await post(env,'/v1/application/create',proof(d,'application-create',JSON.stringify({contact:'wechat-demo',reason:'我正在制作AI漫剧，希望申请工作台永久授权。'})));
 assert.equal(created.status,200,JSON.stringify(created.data));
 assert.equal(created.data.status,'pending');
 const list=await worker.fetch(new Request('https://license.example.test/api/console/applications',{headers:{authorization:'Bearer '+env.admin}}),env);
 const apps=await list.json();assert.equal(apps.applications.length,1);assert.equal(apps.applications[0].contact,'wechat-demo');
 const approved=await post(env,'/api/console/applications/approve',{applicationId:created.data.applicationId,mode:'bind'},env.admin);
 assert.equal(approved.status,200,JSON.stringify(approved.data));assert.equal(approved.data.mode,'bind');
 const state=await post(env,'/v1/license/refresh',proof(d,'refresh'));
 assert.equal(state.status,200,JSON.stringify(state.data));assert.equal(state.data.type,'permanent');
 const status=await post(env,'/v1/application/status',proof(d,'application-status',created.data.applicationId));
 assert.equal(status.data.status,'approved');
});
test('product configuration is admin-only and public product list is device-signed',async()=>{
 const env=environment(),d=signer();
 const denied=await post(env,'/api/console/products/save',{id:'dudu-ai-workbench-permanent',name:'永久授权',priceFen:2900,enabled:true,deliveryMode:'bind'});
 assert.equal(denied.status,401);
 const saved=await post(env,'/api/console/products/save',{id:'dudu-ai-workbench-permanent',name:'独独AI永久授权',description:'单设备永久授权',priceFen:2900,enabled:true,deliveryMode:'bind'},env.admin);
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 const listed=await post(env,'/v1/commerce/products',proof(d,'commerce-products'));
 assert.equal(listed.status,200,JSON.stringify(listed.data));
 assert.equal(listed.data.products.length,1);assert.equal(listed.data.products[0].price_fen,2900);
});
test('official payment readiness stays disabled until every required merchant secret exists',()=>{
 assert.deepEqual(paymentReadiness({}),{wechat:false,alipay:false});
 assert.deepEqual(paymentReadiness({WECHAT_PAY_APP_ID:'a',WECHAT_PAY_MCH_ID:'b',WECHAT_PAY_CERT_SERIAL:'c',WECHAT_PAY_PRIVATE_KEY_PEM:'d',WECHAT_PAY_API_V3_KEY:'12345678901234567890123456789012',WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM:'e',WECHAT_PAY_NOTIFY_URL:'https://x.test/notify',ALIPAY_APP_ID:'a',ALIPAY_PRIVATE_KEY_PEM:'b',ALIPAY_PUBLIC_KEY_PEM:'c',ALIPAY_NOTIFY_URL:'https://x.test/a'}),{wechat:true,alipay:true});
});
test('WeChat Native order request is RSA-SHA256 signed and returns provider QR content',async()=>{
 const pair=rsaPair(),oldFetch=globalThis.fetch;
 const env={WECHAT_PAY_APP_ID:'wx-app',WECHAT_PAY_MCH_ID:'mch',WECHAT_PAY_CERT_SERIAL:'serial-1',WECHAT_PAY_PRIVATE_KEY_PEM:pair.privateKey,WECHAT_PAY_API_V3_KEY:'12345678901234567890123456789012',WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM:pair.publicKey,WECHAT_PAY_NOTIFY_URL:'https://license.example.test/v1/payments/wechat/notify'};
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.mch.weixin.qq.com/v3/pay/transactions/native');
  const auth=options.headers.Authorization,ts=auth.match(/timestamp="([^"]+)"/)[1],n=auth.match(/nonce_str="([^"]+)"/)[1],sig=auth.match(/signature="([^"]+)"/)[1];
  const raw=options.body,message='POST\n/v3/pay/transactions/native\n'+ts+'\n'+n+'\n'+raw+'\n';
  assert.equal(verify('RSA-SHA256',Buffer.from(message),pair.publicObject,Buffer.from(sig,'base64')),true);
  const body=JSON.parse(raw);assert.equal(body.amount.total,2900);assert.equal(body.mchid,'mch');
  return {ok:true,status:200,json:async()=>({code_url:'weixin://wxpay/bizpayurl?pr=test'})};
 };
 try{const out=await createWechatPayment(env,{orderNo:'DUORDER123',amountFen:2900,productName:'独独AI授权'});assert.equal(out.qrText,'weixin://wxpay/bizpayurl?pr=test')}
 finally{globalThis.fetch=oldFetch}
});
test('Alipay precreate request is RSA2 signed and returns official QR content',async()=>{
 const pair=rsaPair(),oldFetch=globalThis.fetch;
 const env={ALIPAY_APP_ID:'alipay-app',ALIPAY_PRIVATE_KEY_PEM:pair.privateKey,ALIPAY_PUBLIC_KEY_PEM:pair.publicKey,ALIPAY_NOTIFY_URL:'https://license.example.test/v1/payments/alipay/notify'};
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://openapi.alipay.com/gateway.do');
  const params=Object.fromEntries(new URLSearchParams(options.body));
  const canonical=Object.keys(params).filter(k=>!['sign','sign_type'].includes(k)&&params[k]!=='').sort().map(k=>k+'='+params[k]).join('&');
  assert.equal(verify('RSA-SHA256',Buffer.from(canonical),pair.publicObject,Buffer.from(params.sign,'base64')),true);
  assert.equal(params.method,'alipay.trade.precreate');
  return {ok:true,status:200,json:async()=>({alipay_trade_precreate_response:{code:'10000',qr_code:'https://qr.alipay.com/test'}})};
 };
 try{const out=await createAlipayPayment(env,{orderNo:'DUORDER123',amountFen:2900,productName:'独独AI授权'});assert.equal(out.qrText,'https://qr.alipay.com/test')}
 finally{globalThis.fetch=oldFetch}
});
test('WeChat callback signature and AES-256-GCM resource are verified before use',async()=>{
 const pair=rsaPair(),key='12345678901234567890123456789012',nonce='123456789012',aad='transaction';
 const cipher=createCipheriv('aes-256-gcm',Buffer.from(key),Buffer.from(nonce));cipher.setAAD(Buffer.from(aad));
 const transaction={appid:'wx-app',mchid:'mch',trade_state:'SUCCESS',out_trade_no:'DUORDER123',transaction_id:'wx-tx',amount:{total:2900}};
 const encrypted=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(transaction))),cipher.final(),cipher.getAuthTag()]);
 const raw=JSON.stringify({id:'event-1',event_type:'TRANSACTION.SUCCESS',resource:{nonce,associated_data:aad,ciphertext:encrypted.toString('base64')}});
 const ts=String(Math.floor(Date.now()/1000)),headerNonce='header-nonce',message=ts+'\n'+headerNonce+'\n'+raw+'\n';
 const signature=sign('RSA-SHA256',Buffer.from(message),pair.privateObject).toString('base64');
 const request=new Request('https://license.example.test/v1/payments/wechat/notify',{method:'POST',headers:{'Wechatpay-Timestamp':ts,'Wechatpay-Nonce':headerNonce,'Wechatpay-Signature':signature,'Wechatpay-Serial':'platform-1'},body:raw});
 const result=await verifyWechatPaymentCallback(request,{WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM:pair.publicKey,WECHAT_PAY_PLATFORM_SERIAL:'platform-1',WECHAT_PAY_API_V3_KEY:key});
 assert.equal(result.eventId,'event-1');assert.equal(result.transaction.transaction_id,'wx-tx');
});
test('Alipay asynchronous notification RSA2 signature is verified',async()=>{
 const pair=rsaPair(),params={app_id:'alipay-app',trade_status:'TRADE_SUCCESS',out_trade_no:'DUORDER123',trade_no:'ali-tx',total_amount:'29.00',notify_id:'ali-event',sign_type:'RSA2'};
 const canonical=Object.keys(params).filter(k=>!['sign','sign_type'].includes(k)&&params[k]!=='').sort().map(k=>k+'='+params[k]).join('&');
 params.sign=sign('RSA-SHA256',Buffer.from(canonical),pair.privateObject).toString('base64');
 const request=new Request('https://license.example.test/v1/payments/alipay/notify',{method:'POST',body:new URLSearchParams(params)});
 const result=await verifyAlipayPaymentCallback(request,{ALIPAY_APP_ID:'alipay-app',ALIPAY_PUBLIC_KEY_PEM:pair.publicKey});
 assert.equal(result.eventId,'ali-event');assert.equal(result.transaction.trade_no,'ali-tx');
});
