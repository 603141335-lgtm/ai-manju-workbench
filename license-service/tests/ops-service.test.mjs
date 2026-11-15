import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManifest,alipaySignContent,importRsaPrivate,importRsaPublic,paymentReady,wechatOrderQueryPath,wechatRequestMessage,buildAlipayQueryParams,alipayGateway,paymentSelfTest,logPaymentWebhook,runScheduledReconciliation,handleOpsRequest} from '../src/ops-service.mjs';
import {generateKeyPairSync,sign as nodeSign} from 'node:crypto';
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
  const wrap=sql=>{
    let values=[];
    const api={
      sql,get values(){return values},
      bind(...args){values=args;return api},
      async first(){return db.prepare(sql).get(...values)||null},
      async all(){return {results:db.prepare(sql).all(...values)}},
      async run(){const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}}
    };
    return api;
  };
  return {
    prepare:wrap,
    async batch(statements){
      db.exec('BEGIN');
      try{
        const results=statements.map(x=>{const r=db.prepare(x.sql).run(...x.values);return {meta:{changes:Number(r.changes)}}});
        db.exec('COMMIT');return results;
      }catch(error){db.exec('ROLLBACK');throw error}
    }
  };
}

test('admin payment monitoring endpoints return health, webhook history and delivery queue',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:makeD1(db)};
  const helpers={adminAuth:async()=>true};
  db.prepare("INSERT INTO payment_webhook_logs(provider,event_id,order_no,outcome,message,payload_sha256,occurred_ms) VALUES('wechat','refund-event-1','DU-REFUND-1','accepted','退款回调验签通过：SUCCESS',?,?)").run('a'.repeat(64),Date.now());
  const request=path=>new Request('https://dudu.example'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const healthResponse=await handleOpsRequest(request('/v1/admin/payments/health'),env,'/v1/admin/payments/health',helpers);
  assert.equal(healthResponse.status,200);
  const health=await healthResponse.json();
  assert.equal(health.pendingOrders,0);
  assert.equal(health.paidUndelivered,0);
  assert.equal(health.callbacks.wechat,'https://dudu.example/v1/payments/wechat/notify');
  assert.equal(health.callbacks.wechatRefund,'https://dudu.example/v1/payments/wechat/refund-notify');
  assert.equal(health.callbacks.alipay,'https://dudu.example/v1/payments/alipay/notify');
  assert.equal(health.lastWebhook.wechatRefund.outcome,'accepted');
  assert.equal(health.lastWebhook.wechatRefund.event_id,'refund-event-1');
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

function seedPaidOrder(db,{orderId='order-1',orderNo='DU-ORDER-1',provider='alipay',amount=1200,cardId='card-1'}={}){
  const now=Date.now();
  db.prepare("INSERT OR IGNORE INTO products(product_id,name,description,price_cents,entitlement_type,enabled,sort_order,created_ms,updated_ms) VALUES('prod-1','独独AI年卡','',29900,'permanent',1,0,?,?)").run(now,now);
  db.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,provider_trade_no,created_ms,paid_ms,updated_ms) VALUES(?,?,?,?,?,?,?,'paid',?,?,?,?)")
    .run(orderId,orderNo,'device-hash','prod-1','独独AI年卡',amount,provider,provider==='wechat'?'wx-trade-1':'ali-trade-1',now-60000,now-30000,now);
  db.prepare("INSERT OR IGNORE INTO devices(device_hash,public_key,created_ms) VALUES(?,?,?)").run('device-hash','test-public-key',now-60000);
  const cardHash='hmac-card-code-'+orderId;
  db.prepare("INSERT INTO license_cards(id,code_hash,last_four,issued_ms,bound_device_hash,activated_ms) VALUES(?,?,?,?,?,?)")
    .run(cardId,cardHash,'1234',now-20000,'device-hash',now-20000);
  db.prepare("INSERT INTO delivery_outbox(delivery_id,order_id,card_id,code_hash,last_four,status,attempts,created_ms,delivered_ms) VALUES(?,?,?,?,?,'delivered',1,?,?)")
    .run('delivery-'+orderId,orderId,cardId,cardHash,'1234',now-20000,now-10000);
  return {now,orderId,orderNo,cardId};
}
function signedAlipayEnvelope(data,privateKey){
  return JSON.stringify({alipay_trade_refund_response:data,sign:nodeSign('RSA-SHA256',Buffer.from(alipaySignContent(data)),privateKey).toString('base64')});
}
function signedWechatResponse(data,privateKey,serial='platform-serial'){
  const raw=JSON.stringify(data),timestamp=String(Math.floor(Date.now()/1000)),nonce='response-nonce';
  const message=[timestamp,nonce,raw,""].join(String.fromCharCode(10));
  const signature=nodeSign('RSA-SHA256',Buffer.from(message),privateKey).toString('base64');
  return new Response(raw,{status:200,headers:{
    'content-type':'application/json',
    'Wechatpay-Serial':serial,'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,'Wechatpay-Signature':signature
  }});
}
async function signedWechatRefundNotify(data,env,privateKey){
  const nonce='123456789012',associated='';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WECHATPAY_API_V3_KEY),{name:'AES-GCM'},false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:new TextEncoder().encode(nonce),additionalData:new TextEncoder().encode(associated),tagLength:128},key,new TextEncoder().encode(JSON.stringify(data)));
  const notice={id:'refund-event-1',event_type:'REFUND.SUCCESS',resource:{original_type:'refund',algorithm:'AEAD_AES_256_GCM',ciphertext:Buffer.from(encrypted).toString('base64'),associated_data:associated,nonce}};
  const raw=JSON.stringify(notice),timestamp=String(Math.floor(Date.now()/1000)),sigNonce='callback-nonce';
  const message=[timestamp,sigNonce,raw,""].join(String.fromCharCode(10));
  const signature=nodeSign('RSA-SHA256',Buffer.from(message),privateKey).toString('base64');
  return new Request('https://dudu.example/v1/payments/wechat/refund-notify',{method:'POST',headers:{
    'content-type':'application/json','Wechatpay-Serial':env.WECHATPAY_PLATFORM_SERIAL,
    'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':sigNonce,'Wechatpay-Signature':signature
  },body:raw});
}

test('finance summary reports gross sales, completed refunds, net cash flow and channel totals',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  seedPaidOrder(db,{orderId:'order-paid',orderNo:'DU-PAID',provider:'wechat',amount:1500,cardId:'card-paid'});
  seedPaidOrder(db,{orderId:'order-refunded',orderNo:'DU-REFUNDED',provider:'alipay',amount:2500,cardId:'card-refunded'});
  db.prepare("UPDATE orders SET status='refunded',refunded_ms=? WHERE order_id='order-refunded'").run(Date.now()-1000);
  db.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,reason,status,created_ms,updated_ms,succeeded_ms) VALUES('refund-1','order-refunded','RF-1','alipay',2500,'用户申请','succeeded',?,?,?)")
    .run(Date.now()-2000,Date.now()-1000,Date.now()-1000);
  const env={DB:makeD1(db)},helpers={adminAuth:async()=>true};
  const req=new Request('https://dudu.example/v1/admin/finance/summary',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startMs:Date.now()-86400000,endMs:Date.now()+10000})});
  const response=await handleOpsRequest(req,env,'/v1/admin/finance/summary',helpers);
  assert.equal(response.status,200);
  const v=await response.json();
  assert.equal(v.grossCents,4000);assert.equal(v.refundsCents,2500);assert.equal(v.netCents,1500);
  assert.equal(v.paidOrders,2);assert.equal(v.refundCount,1);
  assert.deepEqual(v.channels.map(x=>x.provider).sort(),['alipay','wechat']);
  db.close();
});

test('Alipay full refund is verified before order is marked refunded and purchased license is revoked',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const seeded=seedPaidOrder(db,{provider:'alipay',amount:1200});
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={DB:makeD1(db),ALIPAY_APP_ID:'app-test',ALIPAY_SELLER_ID:'seller-test',
    ALIPAY_PRIVATE_KEY_PEM:pair.privateKey.export({type:'pkcs8',format:'pem'}),
    ALIPAY_PUBLIC_KEY_PEM:pair.publicKey.export({type:'spki',format:'pem'})};
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,options)=>{
    calls++;
    const params=Object.fromEntries(new URLSearchParams(options.body).entries()),biz=JSON.parse(params.biz_content);
    assert.equal(params.method,'alipay.trade.refund');assert.equal(biz.trade_no,'ali-trade-1');
    assert.equal(biz.refund_amount,'12.00');assert.ok(biz.out_request_no);
    const data={code:'10000',msg:'Success',out_trade_no:seeded.orderNo,out_request_no:biz.out_request_no,trade_no:'ali-trade-1',refund_fee:'12.00',fund_change:'Y'};
    return new Response(signedAlipayEnvelope(data,pair.privateKey),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const req=new Request('https://dudu.example/v1/admin/refunds/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:seeded.orderId,reason:'用户申请退款',confirmFullRefund:true})});
    const response=await handleOpsRequest(req,env,'/v1/admin/refunds/create',{adminAuth:async()=>true});
    assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.status,'succeeded');assert.equal(calls,1);
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_id=?").get(seeded.orderId).status,'refunded');
    assert.ok(db.prepare("SELECT revoked_ms FROM license_cards WHERE id=?").get(seeded.cardId).revoked_ms);
    assert.equal(db.prepare("SELECT status FROM refunds WHERE order_id=?").get(seeded.orderId).status,'succeeded');
    const duplicate=await handleOpsRequest(new Request('https://dudu.example/v1/admin/refunds/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:seeded.orderId,reason:'再次退款',confirmFullRefund:true})}),env,'/v1/admin/refunds/create',{adminAuth:async()=>true});
    assert.equal(duplicate.status,409);assert.equal(calls,1);
  }finally{globalThis.fetch=originalFetch;db.close()}
});

test('WeChat refund stays processing until a verified encrypted refund notification revokes the purchased license',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const seeded=seedPaidOrder(db,{provider:'wechat',amount:1200});
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}),publicPem=pair.publicKey.export({type:'spki',format:'pem'});
  const env={DB:makeD1(db),WECHATPAY_MCHID:'1900000109',WECHATPAY_APPID:'wx-test',WECHATPAY_SERIAL_NO:'merchant-serial',
    WECHATPAY_PRIVATE_KEY_PEM:privatePem,WECHATPAY_API_V3_KEY:'12345678901234567890123456789012',
    WECHATPAY_PLATFORM_PUBLIC_KEY_PEM:publicPem,WECHATPAY_PLATFORM_SERIAL:'platform-serial'};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.mch.weixin.qq.com/v3/refund/domestic/refunds');
    const body=JSON.parse(options.body);assert.equal(body.transaction_id,'wx-trade-1');
    assert.equal(body.amount.refund,1200);assert.equal(body.amount.total,1200);
    return signedWechatResponse({out_trade_no:seeded.orderNo,out_refund_no:body.out_refund_no,refund_id:'wx-refund-1',status:'PROCESSING',amount:{total:1200,refund:1200}},pair.privateKey);
  };
  try{
    const create=await handleOpsRequest(new Request('https://dudu.example/v1/admin/refunds/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:seeded.orderId,reason:'用户申请退款',confirmFullRefund:true})}),env,'/v1/admin/refunds/create',{adminAuth:async()=>true});
    assert.equal(create.status,202);
    const created=await create.json();assert.equal(created.status,'processing');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_id=?").get(seeded.orderId).status,'paid');
    assert.equal(db.prepare("SELECT revoked_ms FROM license_cards WHERE id=?").get(seeded.cardId).revoked_ms,null);
    const refund=db.prepare("SELECT refund_no FROM refunds WHERE order_id=?").get(seeded.orderId);
    const notify=await signedWechatRefundNotify({mchid:env.WECHATPAY_MCHID,out_trade_no:seeded.orderNo,out_refund_no:refund.refund_no,refund_id:'wx-refund-1',refund_status:'SUCCESS',amount:{total:1200,refund:1200}},env,pair.privateKey);
    const response=await handleOpsRequest(notify,env,'/v1/payments/wechat/refund-notify',{});
    assert.equal(response.status,200);assert.equal((await response.json()).code,'SUCCESS');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_id=?").get(seeded.orderId).status,'refunded');
    assert.ok(db.prepare("SELECT revoked_ms FROM license_cards WHERE id=?").get(seeded.cardId).revoked_ms);
    assert.equal(db.prepare("SELECT status FROM refunds WHERE order_id=?").get(seeded.orderId).status,'succeeded');
  }finally{globalThis.fetch=originalFetch;db.close()}
});

test('a pending refund blocks manual re-delivery of an already-paid order',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const seeded=seedPaidOrder(db,{provider:'alipay'});
  db.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,reason,status,created_ms,updated_ms) VALUES('refund-pending',?,'RF-PENDING','alipay',1200,'待核验','processing',?,?)")
    .run(seeded.orderId,Date.now(),Date.now());
  const env={DB:makeD1(db)},helpers={adminAuth:async()=>true};
  const response=await handleOpsRequest(new Request('https://dudu.example/v1/admin/orders/resend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId:seeded.orderId})}),env,'/v1/admin/orders/resend',helpers);
  assert.equal(response.status,400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM license_cards WHERE bound_device_hash='device-hash'").get().n,1);
  db.close();
});

test('Alipay refund query does not mark a refund successful without REFUND_SUCCESS',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const seeded=seedPaidOrder(db,{provider:'alipay',amount:1200});
  db.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,reason,status,created_ms,updated_ms) VALUES('refund-query',?,'RF-QUERY','alipay',1200,'用户申请','processing',?,?)")
    .run(seeded.orderId,Date.now()-15000,Date.now()-15000);
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={DB:makeD1(db),ALIPAY_APP_ID:'app-test',ALIPAY_SELLER_ID:'seller-test',
    ALIPAY_PRIVATE_KEY_PEM:pair.privateKey.export({type:'pkcs8',format:'pem'}),
    ALIPAY_PUBLIC_KEY_PEM:pair.publicKey.export({type:'spki',format:'pem'})};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const params=Object.fromEntries(new URLSearchParams(options.body).entries());
    assert.equal(params.method,'alipay.trade.fastpay.refund.query');
    const data={code:'10000',msg:'Success',out_trade_no:seeded.orderNo,out_request_no:'RF-QUERY',total_amount:'12.00',refund_amount:'12.00'};
    return new Response(JSON.stringify({alipay_trade_fastpay_refund_query_response:data,sign:nodeSign('RSA-SHA256',Buffer.from(alipaySignContent(data)),pair.privateKey).toString('base64')}),{status:200});
  };
  try{
    const response=await handleOpsRequest(new Request('https://dudu.example/v1/admin/refunds/reconcile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refundId:'refund-query'})}),env,'/v1/admin/refunds/reconcile',{adminAuth:async()=>true});
    assert.equal(response.status,200);
    assert.equal((await response.json()).status,'processing');
    assert.equal(db.prepare("SELECT status FROM orders WHERE order_id=?").get(seeded.orderId).status,'paid');
  }finally{globalThis.fetch=originalFetch;db.close()}
});
