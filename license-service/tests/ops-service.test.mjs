import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManifest,alipaySignContent,importRsaPrivate,importRsaPublic,paymentReady,wechatOrderQueryPath,wechatRequestMessage,buildAlipayQueryParams,alipayGateway,paymentSelfTest,logPaymentWebhook,runScheduledReconciliation,handleOpsRequest,maskContact,roleCanAccess,refundStatusFromWechat,finalizeRefundSuccess,alipayApiCall,submitRefund} from '../src/ops-service.mjs';
import {generateKeyPairSync,sign as nodeSign,createHash} from 'node:crypto';
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
  },async batch(statements){return Promise.all(statements.map(statement=>statement.run()))}};
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

test('finance report uses paid time for sales and confirmed refund time for refunds',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,created_ms,paid_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run('order-a','DU-A','a'.repeat(64),'p1','工作台永久授权',1000,'wechat','paid',1500,2000,2000);
  db.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,created_ms,paid_ms,refunded_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run('order-b','DU-B','b'.repeat(64),'p1','工作台永久授权',500,'alipay','refunded',1500,3000,4500,4500);
  db.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,status,created_ms,updated_ms,completed_ms) VALUES(?,?,?,?,?,'succeeded',?,?,?)")
    .run('refund-b','order-b','RF-B','alipay',300,3500,4000,4000);
  const env={DB:makeD1(db)};
  const req=new Request('https://dudu.example/v1/admin/finance/summary',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fromMs:1000,toMs:5000})});
  const response=await handleOpsRequest(req,env,'/v1/admin/finance/summary',{adminAuth:async()=>true});
  assert.equal(response.status,200);
  const value=await response.json();
  assert.equal(value.orders,2);
  assert.equal(value.grossCents,1500);
  assert.equal(value.refundedCents,300);
  assert.equal(value.netCents,1200);
  assert.equal(value.refundCount,1);
  db.close();
});

test('customer list masks contact and device block state can be toggled by support',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const deviceHash='c'.repeat(64),now=Date.now();
  db.prepare("INSERT INTO devices(device_hash,public_key,created_ms) VALUES(?,?,?)").run(deviceHash,'public-key',now);
  db.prepare("INSERT INTO license_applications(application_id,device_hash,contact,reason,status,created_ms) VALUES(?,?,?,?,?,?)")
    .run('app-1',deviceHash,'13800138000','申请试用','pending',now);
  const env={DB:makeD1(db)};
  const helpers={adminAuth:async()=>true,adminPrincipal:async()=>({id:'support-1',name:'客服',role:'support'})};
  const req=(path,body={})=>new Request('https://dudu.example'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const list=await (await handleOpsRequest(req('/v1/admin/customers/list'),env,'/v1/admin/customers/list',helpers)).json();
  assert.equal(list.customers[0].contact,'138****8000');
  const block=await handleOpsRequest(req('/v1/admin/devices/block',{deviceHash,reason:'异常设备'}),env,'/v1/admin/devices/block',helpers);
  assert.equal(block.status,200);
  assert.ok(db.prepare("SELECT blocked_ms FROM device_controls WHERE device_hash=?").get(deviceHash).blocked_ms);
  const denied=await handleOpsRequest(req('/v1/admin/finance/summary',{fromMs:1,toMs:2}),env,'/v1/admin/finance/summary',helpers);
  assert.equal(denied.status,403);
  const unblock=await handleOpsRequest(req('/v1/admin/devices/unblock',{deviceHash}),env,'/v1/admin/devices/unblock',helpers);
  assert.equal(unblock.status,200);
  assert.equal(db.prepare("SELECT blocked_ms FROM device_controls WHERE device_hash=?").get(deviceHash).blocked_ms,null);
  db.close();
});

test('confirmed full refund updates order and revokes the purchased license card',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const deviceHash='d'.repeat(64),now=Date.now();
  db.prepare("INSERT INTO devices(device_hash,public_key,created_ms) VALUES(?,?,?)").run(deviceHash,'public-key',now);
  db.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,provider_trade_no,created_ms,paid_ms,delivered_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run('order-refund','DU-REFUND',deviceHash,'p1','工作台永久授权',9900,'wechat','paid','wx-trade',now,now,now,now);
  db.prepare("INSERT INTO license_cards(id,code_hash,last_four,issued_ms,bound_device_hash,activated_ms) VALUES(?,?,?,?,?,?)")
    .run('card-refund','hash-refund','ABCD',now,deviceHash,now);
  db.prepare("INSERT INTO delivery_outbox(delivery_id,order_id,card_id,code_hash,last_four,status,attempts,created_ms,delivered_ms) VALUES(?,?,?,?,?,'pending',0,?,NULL)")
    .run('delivery-refund','order-refund','card-refund','hash-refund','ABCD',now);
  db.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,status,created_ms,updated_ms) VALUES(?,?,?,?,?,'processing',?,?)")
    .run('refund-1','order-refund','RF-1','wechat',9900,now,now);
  const env={DB:makeD1(db)};
  const result=await finalizeRefundSuccess(env,{refund_id:'refund-1',order_id:'order-refund'},'SUCCESS','wx-refund',{id:'finance-1',name:'财务',role:'finance'});
  assert.equal(result.status,'succeeded');
  assert.equal(db.prepare("SELECT status FROM orders WHERE order_id='order-refund'").get().status,'refunded');
  assert.ok(db.prepare("SELECT revoked_ms FROM license_cards WHERE id='card-refund'").get().revoked_ms);
  assert.equal(db.prepare("SELECT status FROM refunds WHERE refund_id='refund-1'").get().status,'succeeded');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_activity WHERE action='refund_success'").get().n,1);
  const helpers={adminAuth:async()=>true};
  const deliveries=await (await handleOpsRequest(new Request('https://dudu.example/v1/admin/deliveries/list',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,'/v1/admin/deliveries/list',helpers)).json();
  assert.deepEqual(deliveries.deliveries,[]);
  const health=await (await handleOpsRequest(new Request('https://dudu.example/v1/admin/payments/health',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,'/v1/admin/payments/health',helpers)).json();
  assert.equal(health.failedDeliveries,0);
  assert.equal(health.paidUndelivered,0);
  db.close();
});

test('operator creation stores only token hash and role permissions are enforced',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:makeD1(db)};
  const helpers={adminAuth:async()=>true,adminPrincipal:async()=>({id:'owner',name:'超级管理员',role:'super_admin'})};
  const req=(path,body={})=>new Request('https://dudu.example'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const created=await (await handleOpsRequest(req('/v1/admin/operators/create',{displayName:'财务一号',role:'finance'}),env,'/v1/admin/operators/create',helpers)).json();
  assert.ok(created.token.startsWith('DUDU-OP-'));
  const tokenHash=createHash('sha256').update(created.token).digest('hex');
  const row=db.prepare("SELECT token_sha256,role,enabled FROM admin_operators WHERE operator_id=?").get(created.operator.operator_id);
  assert.equal(row.token_sha256,tokenHash);
  assert.equal(row.role,'finance');
  assert.equal(row.enabled,1);
  const listed=await (await handleOpsRequest(req('/v1/admin/operators/list'),env,'/v1/admin/operators/list',helpers)).json();
  assert.equal('token_sha256' in listed.operators[0],false);
  const support={adminAuth:async()=>true,adminPrincipal:async()=>({id:'support-1',name:'客服',role:'support'})};
  const denied=await handleOpsRequest(req('/v1/admin/operators/list'),env,'/v1/admin/operators/list',support);
  assert.equal(denied.status,403);
  db.close();
});

test('Alipay API wrapper reads the underscored response envelope and verifies its signature',async()=>{
  const app=generateKeyPairSync('rsa',{modulusLength:2048});
  const platform=generateKeyPairSync('rsa',{modulusLength:2048});
  const data={code:'10000',out_trade_no:'DU-ALIPAY',out_request_no:'RF-ALIPAY',fund_change:'Y'};
  const signature=nodeSign('RSA-SHA256',Buffer.from(alipaySignContent(data)),platform.privateKey).toString('base64');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({alipay_trade_refund_response:data,sign:signature}),{status:200});
  try{
    const result=await alipayApiCall({
      ALIPAY_APP_ID:'20260001',
      ALIPAY_PRIVATE_KEY_PEM:app.privateKey.export({type:'pkcs8',format:'pem'}),
      ALIPAY_PUBLIC_KEY_PEM:platform.publicKey.export({type:'spki',format:'pem'})
    },'alipay.trade.refund',{out_trade_no:'DU-ALIPAY'});
    assert.deepEqual(result,data);
  }finally{globalThis.fetch=originalFetch}
});

test('refund state and role helper mappings are conservative',()=>{
  assert.equal(refundStatusFromWechat('SUCCESS'),'succeeded');
  assert.equal(refundStatusFromWechat('PROCESSING'),'processing');
  assert.equal(refundStatusFromWechat('ABNORMAL'),'abnormal');
  assert.equal(refundStatusFromWechat('UNKNOWN'),'manual_review');
  assert.equal(maskContact('13800138000'),'138****8000');
  assert.equal(maskContact('abc@example.com'),'ab***@example.com');
  assert.equal(roleCanAccess('finance','/v1/admin/refunds/list'),true);
  assert.equal(roleCanAccess('support','/v1/admin/refunds/list'),false);
  assert.equal(roleCanAccess('support','/v1/admin/customers/list'),true);
  assert.equal(roleCanAccess('operations','/v1/admin/products/list'),true);
  assert.equal(roleCanAccess('operations','/v1/admin/operators/list'),false);
});

test('Alipay full refund accepts documented response without out_request_no echo and revokes entitlement',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const now=Date.now();
  db.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,provider_trade_no,created_ms,paid_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run('order-alipay-refund','DU-ALIPAY-REFUND','e'.repeat(64),'p1','工作台永久授权',9900,'alipay','paid','ali-trade-1',now,now,now);
  db.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,reason,status,created_by,created_ms,updated_ms) VALUES(?,?,?,?,?,?,'requested','owner',?,?)")
    .run('refund-alipay','order-alipay-refund','RF-ALIPAY-1','alipay',9900,'用户申请全额退款',now,now);
  const app=generateKeyPairSync('rsa',{modulusLength:2048});
  const platform=generateKeyPairSync('rsa',{modulusLength:2048});
  const data={code:'10000',out_trade_no:'DU-ALIPAY-REFUND',trade_no:'ali-trade-1',fund_change:'Y',refund_fee:'99.00'};
  const signature=nodeSign('RSA-SHA256',Buffer.from(alipaySignContent(data)),platform.privateKey).toString('base64');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({alipay_trade_refund_response:data,sign:signature}),{status:200});
  try{
    const env={DB:makeD1(db),ALIPAY_APP_ID:'20260001',ALIPAY_SELLER_ID:'2088000000000000',
      ALIPAY_PRIVATE_KEY_PEM:app.privateKey.export({type:'pkcs8',format:'pem'}),
      ALIPAY_PUBLIC_KEY_PEM:platform.publicKey.export({type:'spki',format:'pem'})};
    const result=await submitRefund(env,{
      refund_id:'refund-alipay',order_id:'order-alipay-refund',refund_no:'RF-ALIPAY-1',
      provider:'alipay',amount_cents:9900,reason:'用户申请全额退款',status:'requested'
    },{
      order_id:'order-alipay-refund',order_no:'DU-ALIPAY-REFUND',amount_cents:9900,
      payment_method:'alipay',provider_trade_no:'ali-trade-1',status:'paid'
    },'https://dudu.example',{id:'finance-1',name:'财务',role:'finance'});
    assert.equal(result.status,'succeeded');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_id='order-alipay-refund'").get().status,'refunded');
    assert.equal(db.prepare("SELECT status FROM refunds WHERE refund_id='refund-alipay'").get().status,'succeeded');
  }finally{globalThis.fetch=originalFetch;db.close()}
});
