import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManifest,alipaySignContent,importRsaPrivate,importRsaPublic,paymentReady,wechatOrderQueryPath,wechatRequestMessage,buildAlipayQueryParams,alipayGateway,paymentSelfTest,logPaymentWebhook,runScheduledReconciliation,handleOpsRequest} from '../src/ops-service.mjs';
import {generateKeyPairSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('manifest normalizer keeps public content only and rejects duplicate tutorial ids',()=>{
  const value=normalizeManifest({
    community:{headline:'独独AI公告',wechat:'du4du44',qrUrl:'http://not-https.example/qr.png'},
    tutorial:{title:'新手教程',slides:[{id:'01',title:'第一步',description:'打开工作台',imageUrl:'https://cdn.example/step1.webp'}]},
    notice:{title:'维护通知',body:'今晚更新'},
    release:{version:'1.3.0',url:'https://download.example/setup.exe'}
  });
  assert.equal(value.schemaVersion,2);
  assert.equal(value.community.wechat,'du4du44');
  assert.equal(value.community.qrUrl,'');
  assert.equal(value.tutorial.slides.length,1);
  assert.equal(value.tutorial.slides[0].imageUrl,'https://cdn.example/step1.webp');
  assert.equal(value.release.url,'https://download.example/setup.exe');
  assert.throws(()=>normalizeManifest({tutorial:{slides:[
    {id:'same',title:'步骤一'},{id:'same',title:'步骤二'}
  ]}}),/编号重复/);
});

test('manifest normalizer strips non-HTTPS media and caps tutorial steps',()=>{
  const slides=Array.from({length:30},(_,i)=>({id:'s'+i,title:'步骤'+i,imageUrl:'javascript:alert(1)'}));
  const value=normalizeManifest({tutorial:{slides}});
  assert.equal(value.tutorial.slides.length,24);
  assert.equal(value.tutorial.slides[0].imageUrl,'');
});

test('Alipay RSA2 canonical string sorts keys and excludes signature metadata',()=>{
  const value=alipaySignContent({
    sign:'ignored',sign_type:'RSA2',app_id:'20260001',
    method:'alipay.trade.page.pay',charset:'utf-8',biz_content:'{"x":1}'
  });
  assert.equal(value,'app_id=20260001&biz_content={"x":1}&charset=utf-8&method=alipay.trade.page.pay');
});

test('RSA key loader accepts PKCS8 and PKCS1 merchant key formats',async()=>{
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const privatePkcs8=pair.privateKey.export({type:'pkcs8',format:'pem'});
  const privatePkcs1=pair.privateKey.export({type:'pkcs1',format:'pem'});
  const publicSpki=pair.publicKey.export({type:'spki',format:'pem'});
  const publicPkcs1=pair.publicKey.export({type:'pkcs1',format:'pem'});
  const message=new TextEncoder().encode('dudu-ops-rsa-key-test');
  for(const privatePem of [privatePkcs8,privatePkcs1]){
    const key=await importRsaPrivate(privatePem);
    const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,message);
    for(const publicPem of [publicSpki,publicPkcs1]){
      const pub=await importRsaPublic(publicPem);
      assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pub,signature,message),true);
    }
  }
});

test('WeChat Pay query request path and GET signing message follow API v3 canonical format',()=>{
  const path=wechatOrderQueryPath('DUDU-2026-0001','1900000109');
  assert.equal(path,'/v3/pay/transactions/out-trade-no/DUDU-2026-0001?mchid=1900000109');
  assert.equal(wechatRequestMessage('GET',path,'1731650000','nonce-1',''),'GET\n'+path+'\n1731650000\nnonce-1\n\n');
});

test('Alipay query request uses the signed out_trade_no business payload',()=>{
  const params=buildAlipayQueryParams({ALIPAY_APP_ID:'20260001'},'DUDU-ORDER-1','2026-11-15 12:00:00');
  assert.equal(params.method,'alipay.trade.query');
  assert.equal(params.app_id,'20260001');
  assert.deepEqual(JSON.parse(params.biz_content),{out_trade_no:'DUDU-ORDER-1'});
  assert.match(alipaySignContent(params),/method=alipay.trade.query/);
});

test('Alipay response canonicalization serializes nested JSON values',()=>{
  const value=alipaySignContent({
    code:'10000',
    fund_bill_list:[{fund_channel:'ALIPAYACCOUNT',amount:'9.90'}],
    sign:'ignored'
  });
  assert.equal(value,'code=10000&fund_bill_list=[{"fund_channel":"ALIPAYACCOUNT","amount":"9.90"}]');
});

test('payment readiness requires every official merchant secret including Alipay seller UID',()=>{
  const alipay={ALIPAY_APP_ID:'app',ALIPAY_PRIVATE_KEY_PEM:'private',ALIPAY_PUBLIC_KEY_PEM:'public'};
  assert.equal(paymentReady(alipay,'alipay'),false);
  assert.equal(paymentReady({...alipay,ALIPAY_SELLER_ID:'seller'},'alipay'),true);
  const wechat={WECHATPAY_MCHID:'mch',WECHATPAY_APPID:'app',WECHATPAY_SERIAL_NO:'serial',WECHATPAY_PRIVATE_KEY_PEM:'private',WECHATPAY_API_V3_KEY:'12345678901234567890123456789012',WECHATPAY_PLATFORM_PUBLIC_KEY_PEM:'public',WECHATPAY_PLATFORM_SERIAL:'PUB_KEY_ID_1'};
  assert.equal(paymentReady(wechat,'wechat'),true);
  delete wechat.WECHATPAY_PLATFORM_SERIAL;
  assert.equal(paymentReady(wechat,'wechat'),false);
});

test('Alipay gateway accepts only the official production or sandbox host',()=>{
  assert.equal(alipayGateway({}),'https://openapi.alipay.com/gateway.do');
  assert.equal(alipayGateway({ALIPAY_GATEWAY_URL:'https://openapi-sandbox.dl.alipaydev.com/gateway.do'}),'https://openapi-sandbox.dl.alipaydev.com/gateway.do');
  assert.throws(()=>alipayGateway({ALIPAY_GATEWAY_URL:'https://evil.example/gateway.do'}),/不在允许列表/);
});

test('scheduled reconciliation is safe when there are no pending or undelivered orders',async()=>{
  const db={prepare(){return {bind(){return this},async all(){return {results:[]}}}}};
  const result=await runScheduledReconciliation({DB:db},{});
  assert.deepEqual(result,{checked:0,paid:0,failed:0,deliveryRecovered:0});
});

test('local payment self-test validates Alipay key pair and WeChat key formats without network calls',async()=>{
  const alipayPair=generateKeyPairSync('rsa',{modulusLength:2048});
  const wrongPair=generateKeyPairSync('rsa',{modulusLength:2048});
  const alipay={
    ALIPAY_APP_ID:'20260001',
    ALIPAY_SELLER_ID:'2088000000000000',
    ALIPAY_PRIVATE_KEY_PEM:alipayPair.privateKey.export({type:'pkcs8',format:'pem'}),
    ALIPAY_PUBLIC_KEY_PEM:alipayPair.publicKey.export({type:'spki',format:'pem'})
  };
  const ok=await paymentSelfTest(alipay,'alipay');
  assert.equal(ok.ok,true);
  const mismatch=await paymentSelfTest({...alipay,ALIPAY_PUBLIC_KEY_PEM:wrongPair.publicKey.export({type:'spki',format:'pem'})},'alipay');
  assert.equal(mismatch.ok,false);
  const wechat={
    WECHATPAY_MCHID:'1900000109',WECHATPAY_APPID:'wx-test-app',WECHATPAY_SERIAL_NO:'merchant-serial',
    WECHATPAY_PRIVATE_KEY_PEM:alipayPair.privateKey.export({type:'pkcs8',format:'pem'}),
    WECHATPAY_API_V3_KEY:'12345678901234567890123456789012',
    WECHATPAY_PLATFORM_PUBLIC_KEY_PEM:wrongPair.publicKey.export({type:'spki',format:'pem'}),
    WECHATPAY_PLATFORM_SERIAL:'platform-key-id'
  };
  assert.equal((await paymentSelfTest(wechat,'wechat')).ok,true);
  assert.equal((await paymentSelfTest({...wechat,WECHATPAY_API_V3_KEY:'too-short'},'wechat')).ok,false);
});

test('payment webhook log stores only metadata and a SHA-256 digest, never the raw callback',async()=>{
  let captured=null;
  const db={prepare(sql){return {bind(...values){captured={sql,values};return this},async run(){return {meta:{changes:1}}}}}};
  const raw='raw-callback-body-that-must-not-be-persisted';
  const ok=await logPaymentWebhook({DB:db},{provider:'wechat',eventId:'evt-1',orderNo:'ORDER-1',outcome:'rejected',message:'验签失败',raw});
  assert.equal(ok,true);
  assert.match(captured.sql,/INSERT INTO payment_webhook_logs/);
  assert.equal(captured.values.includes(raw),false);
  assert.equal(captured.values[5].length,64);
  assert.equal(captured.values[0],'wechat');
  assert.equal(captured.values[3],'rejected');
});

function makeD1(db){
  return {prepare(sql){
    const statement=db.prepare(sql);let values=[];
    const api={
      bind(...args){values=args;return api},
      async first(){return statement.get(...values)||null},
      async all(){return {results:statement.all(...values)}},
      async run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}}}
    };
    return api;
  }};
}

test('admin payment monitoring endpoints return health, webhook history and delivery queue',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:makeD1(db)};
  const helpers={adminAuth:async()=>true};
  const request=path=>new Request('https://dudu.example'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const healthResponse=await handleOpsRequest(request('/v1/admin/payments/health'),env,'/v1/admin/payments/health',helpers);
  assert.equal(healthResponse.status,200);
  const health=await healthResponse.json();
  assert.equal(health.pendingOrders,0);
  assert.equal(health.paidUndelivered,0);
  assert.equal(health.callbacks.wechat,'https://dudu.example/v1/payments/wechat/notify');
  assert.equal(health.callbacks.alipay,'https://dudu.example/v1/payments/alipay/notify');
  const events=await (await handleOpsRequest(request('/v1/admin/payments/events/list'),env,'/v1/admin/payments/events/list',helpers)).json();
  assert.deepEqual(events.events,[]);
  const deliveries=await (await handleOpsRequest(request('/v1/admin/deliveries/list'),env,'/v1/admin/deliveries/list',helpers)).json();
  assert.deepEqual(deliveries.deliveries,[]);
  db.close();
});

test('manual payment recovery endpoint runs once and enforces its 60-second cooldown',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:makeD1(db)};
  const helpers={adminAuth:async()=>true};
  const req=()=>new Request('https://dudu.example/v1/admin/payments/reconcile/run',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const first=await handleOpsRequest(req(),env,'/v1/admin/payments/reconcile/run',helpers);
  assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{ok:true,checked:0,paid:0,failed:0,deliveryRecovered:0});
  const second=await handleOpsRequest(req(),env,'/v1/admin/payments/reconcile/run',helpers);
  assert.equal(second.status,429);
  db.close();
});
