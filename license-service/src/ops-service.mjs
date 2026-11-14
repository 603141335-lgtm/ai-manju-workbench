const enc = new TextEncoder();
const dec = new TextDecoder();
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {
  status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff", ...headers }
});
const b64 = bytes => {
  let s=""; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
const b64u = bytes => b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64 = value => Uint8Array.from(atob(String(value).replace(/\s/g,"")), c=>c.charCodeAt(0));
const pemBytes = pem => unb64(String(pem||"").replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g,""));
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
const randomHex = (n=16) => hex(crypto.getRandomValues(new Uint8Array(n)));
const clean = (v,max=300) => typeof v==="string" ? v.replace(/[\u0000-\u001f]/g," ").trim().slice(0,max) : "";
const safeHttps = value => {
  try {
    const u=new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||u.hash||u.port&&u.port!=="443")return "";
    if(/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/i.test(u.hostname))return "";
    return u.toString();
  } catch { return ""; }
};
const html = value => String(value||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const yuan = cents => (Number(cents)/100).toFixed(2);
const orderNo = () => "DU"+Date.now().toString(36).toUpperCase()+randomHex(7).toUpperCase();

async function consumeNonce(env, body, helpers) {
  const hash=await helpers.hmac(env.DUDU_DEVICE_HMAC_KEY,body.deviceId);
  const result=await env.DB.prepare("INSERT OR IGNORE INTO request_nonces(device_hash,nonce,created_ms) VALUES(?,?,?)")
    .bind(hash,String(body.nonce).toLowerCase(),Date.now()).run();
  if(!result.meta?.changes) throw Error("请求已处理，请重新操作");
  return hash;
}

async function loadCurrentManifest(env) {
  const row=await env.DB.prepare("SELECT manifest_json FROM public_content WHERE content_id=1").first();
  if(row) return JSON.parse(row.manifest_json);
  const legacy=safeHttps(env.DUDU_LEGACY_CONTENT_URL||"");
  if(legacy) {
    try {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
      const res=await fetch(legacy,{headers:{Accept:"application/json"},signal:controller.signal});
      clearTimeout(timer);
      if(res.ok) {
        const manifest=normalizeManifest(await res.json()),now=Date.now(),value=JSON.stringify(manifest);
        await env.DB.prepare("INSERT OR IGNORE INTO public_content_history(history_id,manifest_json,created_ms) VALUES(?,?,?)")
          .bind(crypto.randomUUID(),value,now).run();
        await env.DB.prepare("INSERT INTO public_content(content_id,manifest_json,updated_ms) VALUES(1,?,?) ON CONFLICT(content_id) DO NOTHING")
          .bind(value,now).run();
        const saved=await env.DB.prepare("SELECT manifest_json FROM public_content WHERE content_id=1").first();
        if(saved) return JSON.parse(saved.manifest_json);
      }
    } catch {}
  }
  return defaultManifest();
}
function defaultManifest() {
  return {
    schemaVersion:2, updatedAt:new Date().toISOString(),
    community:{title:"AI 漫剧创作交流群",headline:"加入 AI 漫剧创作交流群",description:"创作交流、工具更新与制作经验分享",subtitle:"交流创作经验 · 关注最新工具与漫剧资讯",wechat:"du4du44",backupWechat:"du6du66",qrUrl:"",qrExpiresAt:"",enabled:true,startup:true,benefits:["交流分镜、提示词和漫剧制作经验","关注 AI 漫剧新工具和行业动态","工作台版本更新与教程消息"]},
    tutorial:{version:"1",title:"独独AI工作台｜图文使用教程",slides:[]},
    notice:{id:"",title:"",body:"",showHint:false},
    release:{version:"",title:"",notes:"",url:""}
  };
}
function normalizeManifest(raw) {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw Error("内容清单格式无效");
  const base=defaultManifest(), c=raw.community||{}, t=raw.tutorial||{}, n=raw.notice||{}, r=raw.release||{};
  const slides=(Array.isArray(t.slides)?t.slides:[]).slice(0,24).map((x,i)=>({
    id:clean(x?.id,30)||String(i+1).padStart(2,"0"),
    title:clean(x?.title,90), description:clean(x?.description,400),
    target:clean(x?.target,70), imageUrl:safeHttps(x?.imageUrl),
    sha256:/^[a-f0-9]{64}$/i.test(x?.sha256||"")?String(x.sha256).toLowerCase():""
  })).filter(x=>/^[a-z0-9-]{1,30}$/i.test(x.id)&&x.title);
  if(new Set(slides.map(x=>x.id)).size!==slides.length) throw Error("教程步骤编号重复");
  const qr=safeHttps(c.qrUrl);
  const releaseUrl=safeHttps(r.url);
  const result={
    schemaVersion:2,updatedAt:new Date().toISOString(),
    community:{
      title:clean(c.title,100)||base.community.title,headline:clean(c.headline,100)||base.community.headline,
      description:clean(c.description,400)||base.community.description,subtitle:clean(c.subtitle,220)||base.community.subtitle,
      wechat:clean(c.wechat,80)||"du4du44",backupWechat:clean(c.backupWechat,80)||"du6du66",
      qrUrl:qr,qrExpiresAt:clean(c.qrExpiresAt,42),enabled:c.enabled!==false,startup:c.startup!==false,
      benefits:(Array.isArray(c.benefits)?c.benefits:base.community.benefits).slice(0,4).map(x=>clean(x,90)).filter(Boolean)
    },
    tutorial:{version:clean(t.version,40)||"1",title:clean(t.title,90)||base.tutorial.title,slides},
    notice:{id:clean(n.id,80)||("notice-"+Date.now()),title:clean(n.title,100),body:clean(n.body,1200),showHint:n.showHint===true},
    release:{version:clean(r.version,32),title:clean(r.title,100),notes:clean(r.notes,1200),url:releaseUrl}
  };
  if(enc.encode(JSON.stringify(result)).length>65536) throw Error("公告配置不能超过64KB");
  return result;
}

function concatBytes(...parts) {
  const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.length}return out;
}
function derLength(size) {
  if(size<128)return Uint8Array.of(size);
  const bytes=[];while(size>0){bytes.unshift(size&255);size>>=8}
  return Uint8Array.of(0x80|bytes.length,...bytes);
}
function der(tag,bytes) { return concatBytes(Uint8Array.of(tag),derLength(bytes.length),bytes); }
const RSA_ALGORITHM_ID=Uint8Array.of(0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00);
function wrapRsaPublicPkcs1(pkcs1) {
  const bitString=der(0x03,concatBytes(Uint8Array.of(0),pkcs1));
  return der(0x30,concatBytes(RSA_ALGORITHM_ID,bitString));
}
function wrapRsaPrivatePkcs1(pkcs1) {
  return der(0x30,concatBytes(Uint8Array.of(0x02,0x01,0x00),RSA_ALGORITHM_ID,der(0x04,pkcs1)));
}
function pemKind(pem) { return String(pem||"").match(/-----BEGIN ([^-]+)-----/)?.[1]||""; }
async function importRsaPrivate(pem) {
  const kind=pemKind(pem),raw=pemBytes(pem);
  if(kind==="RSA PRIVATE KEY")return crypto.subtle.importKey("pkcs8",wrapRsaPrivatePkcs1(raw),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  try{return await crypto.subtle.importKey("pkcs8",raw,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"])}
  catch{return crypto.subtle.importKey("pkcs8",wrapRsaPrivatePkcs1(raw),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"])}
}
async function importRsaPublic(pem) {
  const kind=pemKind(pem),raw=pemBytes(pem);
  if(kind==="RSA PUBLIC KEY")return crypto.subtle.importKey("spki",wrapRsaPublicPkcs1(raw),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  try{return await crypto.subtle.importKey("spki",raw,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"])}
  catch{return crypto.subtle.importKey("spki",wrapRsaPublicPkcs1(raw),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"])}
}
async function rsaSign(pem, text) {
  const key=await importRsaPrivate(pem);
  return b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(text)));
}
async function rsaVerify(pem, text, signature) {
  const key=await importRsaPublic(pem);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,unb64(signature),enc.encode(text));
}
function alipaySignContent(params) {
  return Object.keys(params).filter(k=>k!=="sign"&&k!=="sign_type"&&params[k]!==undefined&&params[k]!==null&&params[k]!=="")
    .sort().map(k=>k+"="+params[k]).join("&");
}
export { alipaySignContent, normalizeManifest, importRsaPrivate, importRsaPublic };

function paymentReady(env, method) {
  if(method==="wechat") return !!(env.WECHATPAY_MCHID&&env.WECHATPAY_APPID&&env.WECHATPAY_SERIAL_NO&&env.WECHATPAY_PRIVATE_KEY_PEM&&env.WECHATPAY_API_V3_KEY&&env.WECHATPAY_PLATFORM_PUBLIC_KEY_PEM&&env.WECHATPAY_PLATFORM_SERIAL);
  if(method==="alipay") return !!(env.ALIPAY_APP_ID&&env.ALIPAY_PRIVATE_KEY_PEM&&env.ALIPAY_PUBLIC_KEY_PEM&&env.ALIPAY_SELLER_ID);
  return false;
}
async function createWechatOrder(env, order, origin) {
  const path="/v3/pay/transactions/native";
  const notify= safeHttps(env.WECHATPAY_NOTIFY_URL) || origin+"/v1/payments/wechat/notify";
  const payload={
    appid:env.WECHATPAY_APPID,mchid:env.WECHATPAY_MCHID,
    description:order.product_name.slice(0,127),out_trade_no:order.order_no,notify_url:notify,
    time_expire:new Date(Date.now()+7200000).toISOString(),amount:{total:order.amount_cents,currency:"CNY"}
  };
  const body=JSON.stringify(payload), timestamp=String(Math.floor(Date.now()/1000)), nonce=randomHex(16);
  const message="POST\n"+path+"\n"+timestamp+"\n"+nonce+"\n"+body+"\n";
  const signature=await rsaSign(env.WECHATPAY_PRIVATE_KEY_PEM,message);
  const authorization='WECHATPAY2-SHA256-RSA2048 mchid="'+env.WECHATPAY_MCHID+'",nonce_str="'+nonce+'",timestamp="'+timestamp+'",serial_no="'+env.WECHATPAY_SERIAL_NO+'",signature="'+signature+'"';
  const res=await fetch("https://api.mch.weixin.qq.com"+path,{method:"POST",headers:{"Authorization":authorization,"Accept":"application/json","Content-Type":"application/json"},body});
  const raw=await res.text();
  if(!await verifyWechatHeaders(res.headers,env,raw)) throw Error("微信支付下单响应验签失败");
  let data={};try{data=JSON.parse(raw)}catch{}
  if(!res.ok||!data.code_url) throw Error("微信支付下单失败："+clean(data.message||data.code||"接口未返回支付链接",120));
  return {code_url:data.code_url};
}
async function createAlipayOrder(env, order, origin) {
  const timestamp=new Date().toISOString().replace("T"," ").slice(0,19);
  const params={
    app_id:env.ALIPAY_APP_ID,method:"alipay.trade.page.pay",format:"JSON",charset:"utf-8",
    sign_type:"RSA2",timestamp,version:"1.0",
    notify_url:safeHttps(env.ALIPAY_NOTIFY_URL)||origin+"/v1/payments/alipay/notify",
    return_url:safeHttps(env.ALIPAY_RETURN_URL)||origin+"/payment/return?order="+encodeURIComponent(order.order_id),
    biz_content:JSON.stringify({
      out_trade_no:order.order_no,product_code:"FAST_INSTANT_TRADE_PAY",timeout_express:"2h",
      total_amount:yuan(order.amount_cents),subject:order.product_name.slice(0,128)
    })
  };
  params.sign=await rsaSign(env.ALIPAY_PRIVATE_KEY_PEM,alipaySignContent(params));
  const gateway=safeHttps(env.ALIPAY_GATEWAY_URL)||"https://openapi.alipay.com/gateway.do";
  return {gateway,pay_params:params};
}
async function markOrderPaid(env, order, providerTradeNo, eventId, payloadHash, helpers) {
  const orderRow=await env.DB.prepare("SELECT * FROM orders WHERE order_no=?").bind(order.order_no).first();
  if(!orderRow) throw Error("订单不存在");
  if(orderRow.status==="refunded") throw Error("订单已退款");
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events(event_id,provider,order_no,payload_sha256,created_ms) VALUES(?,?,?,?,?)")
    .bind(String(eventId||("evt-"+orderRow.order_no)),orderRow.payment_method,orderRow.order_no,payloadHash,Date.now()).run();
  await env.DB.prepare("UPDATE orders SET status='paid',provider_trade_no=COALESCE(provider_trade_no,?),paid_ms=COALESCE(paid_ms,?),updated_ms=? WHERE order_id=? AND status='pending'")
    .bind(String(providerTradeNo||""),Date.now(),Date.now(),orderRow.order_id).run();
  const paid=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(orderRow.order_id).first();
  if(!paid||paid.status!=="paid") throw Error("订单状态未能更新为已支付");
  let delivery=await env.DB.prepare("SELECT * FROM delivery_outbox WHERE order_id=?").bind(paid.order_id).first();
  if(!delivery){
    const code=helpers.newCode(), cardId=crypto.randomUUID(), codeHash=await helpers.hmac(env.DUDU_CARD_HMAC_KEY,code);
    await env.DB.prepare("INSERT OR IGNORE INTO delivery_outbox(delivery_id,order_id,card_id,code_hash,last_four,status,created_ms) VALUES(?,?,?,?,?,'pending',?)")
      .bind(crypto.randomUUID(),paid.order_id,cardId,codeHash,code.slice(-4),Date.now()).run();
    delivery=await env.DB.prepare("SELECT * FROM delivery_outbox WHERE order_id=?").bind(paid.order_id).first();
  }
  if(!delivery) throw Error("自动发货队列创建失败");
  await env.DB.prepare("INSERT OR IGNORE INTO license_cards(id,code_hash,last_four,issued_ms,bound_device_hash,activated_ms) SELECT ?,?,?,?,device_hash,? FROM orders WHERE order_id=? AND status='paid'")
    .bind(delivery.card_id,delivery.code_hash,delivery.last_four,delivery.created_ms,delivery.created_ms,paid.order_id).run();
  const card=await env.DB.prepare("SELECT id FROM license_cards WHERE id=? AND revoked_ms IS NULL").bind(delivery.card_id).first();
  if(!card) throw Error("授权卡密写入失败，订单保留待补发");
  await env.DB.prepare("UPDATE delivery_outbox SET status='delivered',attempts=attempts+1,delivered_ms=COALESCE(delivered_ms,?),last_error='' WHERE order_id=?")
    .bind(Date.now(),paid.order_id).run();
  await env.DB.prepare("UPDATE orders SET delivered_ms=COALESCE(delivered_ms,?),updated_ms=? WHERE order_id=?")
    .bind(Date.now(),Date.now(),paid.order_id).run();
  await env.DB.prepare("INSERT INTO admin_audit(event,card_id,occurred_ms) VALUES('auto_deliver',?,?)")
    .bind(delivery.card_id,Date.now()).run();
  return {ok:true,orderId:paid.order_id,delivered:true};
}
async function verifyWechatHeaders(headers, env, raw) {
  const serial=headers.get("Wechatpay-Serial")||"";
  const timestamp=headers.get("Wechatpay-Timestamp")||"";
  const nonce=headers.get("Wechatpay-Nonce")||"";
  const signature=headers.get("Wechatpay-Signature")||"";
  if(!serial||serial!==env.WECHATPAY_PLATFORM_SERIAL||!timestamp||!nonce||!signature) return false;
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>300) return false;
  return rsaVerify(env.WECHATPAY_PLATFORM_PUBLIC_KEY_PEM,timestamp+"\n"+nonce+"\n"+raw+"\n",signature);
}
async function verifyWechatCallback(request, env, raw) {
  return verifyWechatHeaders(request.headers,env,raw);
}
async function decryptWechatResource(resource, env) {
  if(resource?.algorithm!=="AEAD_AES_256_GCM") throw Error("微信支付回调加密算法不支持");
  const keyBytes=enc.encode(env.WECHATPAY_API_V3_KEY||"");
  if(keyBytes.length!==32) throw Error("微信支付APIv3密钥必须为32字节");
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
  const plain=await crypto.subtle.decrypt({
    name:"AES-GCM",iv:enc.encode(resource.nonce),
    additionalData:enc.encode(resource.associated_data||""),tagLength:128
  },key,unb64(resource.ciphertext));
  return JSON.parse(dec.decode(plain));
}
async function handleWechatNotify(request, env, helpers) {
  const raw=await request.text();
  if(!await verifyWechatCallback(request,env,raw)) return json({code:"FAIL",message:"签名验证失败"},401);
  try {
    const notice=JSON.parse(raw), trade=await decryptWechatResource(notice.resource,env);
    if(trade.trade_state!=="SUCCESS") return json({code:"SUCCESS",message:"已接收非成功状态"});
    if(trade.mchid!==env.WECHATPAY_MCHID||trade.appid!==env.WECHATPAY_APPID||trade.amount?.currency!=="CNY") throw Error("微信商户、应用或币种不匹配");
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_no=?").bind(trade.out_trade_no).first();
    if(!order||order.payment_method!=="wechat"||Number(trade.amount?.total)!==Number(order.amount_cents)) throw Error("微信订单号或金额不匹配");
    const hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    await markOrderPaid(env,order,trade.transaction_id,notice.id,hash,helpers);
    return json({code:"SUCCESS",message:"成功"});
  } catch(e) { return json({code:"FAIL",message:clean(e.message,120)||"处理失败"},400); }
}
async function handleAlipayNotify(request, env, helpers) {
  const raw=await request.text(), params=Object.fromEntries(new URLSearchParams(raw).entries());
  try {
    if(!params.sign||!await rsaVerify(env.ALIPAY_PUBLIC_KEY_PEM,alipaySignContent(params),params.sign)) return new Response("failure",{status:401});
    if(params.app_id!==env.ALIPAY_APP_ID) throw Error("支付宝应用ID不匹配");
    if(params.seller_id!==env.ALIPAY_SELLER_ID) throw Error("支付宝收款方不匹配");
    if(!["TRADE_SUCCESS","TRADE_FINISHED"].includes(params.trade_status)) return new Response("success",{headers:{"content-type":"text/plain"}});
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_no=?").bind(params.out_trade_no).first();
    if(!order||order.payment_method!=="alipay"||Math.round(Number(params.total_amount)*100)!==Number(order.amount_cents)) throw Error("支付宝订单号或金额不匹配");
    const hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    await markOrderPaid(env,order,params.trade_no,params.notify_id||("alipay-"+params.trade_no),hash,helpers);
    return new Response("success",{headers:{"content-type":"text/plain; charset=utf-8"}});
  } catch { return new Response("failure",{status:400,headers:{"content-type":"text/plain; charset=utf-8"}}); }
}

async function closeStaleOrders(env) {
  const now=Date.now();
  await env.DB.prepare("UPDATE orders SET status='closed',updated_ms=? WHERE status='pending' AND created_ms<?")
    .bind(now,now-7200000).run();
}
async function createOrder(request, env, body, helpers) {
  await helpers.verifyDevice("order-create",body);
  const deviceHash=await consumeNonce(env,body,helpers);
  await helpers.registerDevice(deviceHash,body.publicKey);
  await closeStaleOrders(env);
  const productId=clean(body.productId,80), method=body.paymentMethod;
  if(!/^[a-z0-9_-]{2,80}$/i.test(productId)||!["wechat","alipay"].includes(method)) throw Error("商品或支付方式无效");
  if(!paymentReady(env,method)) throw Error(method==="wechat"?"微信支付商户密钥尚未配置":"支付宝商户密钥尚未配置");
  const product=await env.DB.prepare("SELECT * FROM products WHERE product_id=? AND enabled=1").bind(productId).first();
  if(!product) throw Error("商品不存在或已下架");
  const now=Date.now();
  const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE device_hash=? AND status='pending' AND created_ms>?").bind(deviceHash,now-1800000).first();
  if(Number(pending?.n||0)>=3) throw Error("当前有多笔未支付订单，请先完成付款或等待订单关闭");
  const id=crypto.randomUUID(), no=orderNo();
  await env.DB.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,'pending',?,?)")
    .bind(id,no,deviceHash,product.product_id,product.name,product.price_cents,method,now,now).run();
  const order={order_id:id,order_no:no,product_name:product.name,amount_cents:product.price_cents};
  try {
    const checkout=method==="wechat"?await createWechatOrder(env,order,new URL(request.url).origin):await createAlipayOrder(env,order,new URL(request.url).origin);
    await env.DB.prepare("UPDATE orders SET checkout_data=?,updated_ms=? WHERE order_id=?")
      .bind(JSON.stringify(checkout),Date.now(),id).run();
    return json({orderId:id,orderNo:no,productName:product.name,amountCents:product.price_cents,paymentMethod:method,checkoutUrl:new URL("/checkout/"+id,request.url).toString(),status:"pending"},201);
  } catch(e) {
    await env.DB.prepare("UPDATE orders SET status='closed',last_error=?,updated_ms=? WHERE order_id=?")
      .bind(clean(e.message,240),Date.now(),id).run();
    throw e;
  }
}
async function orderStatus(request, env, body, helpers) {
  await helpers.verifyDevice("order-status",body);
  const deviceHash=await consumeNonce(env,body,helpers);
  const order=await env.DB.prepare("SELECT order_id,order_no,product_name,amount_cents,payment_method,status,created_ms,paid_ms,delivered_ms FROM orders WHERE order_id=? AND device_hash=?")
    .bind(clean(body.orderId,80),deviceHash).first();
  if(!order) throw Error("订单不存在");
  return json({...order,delivered:!!order.delivered_ms});
}
async function applicationCreate(request, env, body, helpers) {
  await helpers.verifyDevice("apply",body);
  const deviceHash=await consumeNonce(env,body,helpers);
  await helpers.registerDevice(deviceHash,body.publicKey);
  const contact=clean(body.contact,80),reason=clean(body.reason,400);
  if(contact.length<2) throw Error("请填写微信号或联系方式");
  const existing=await env.DB.prepare("SELECT application_id,status,created_ms FROM license_applications WHERE device_hash=? ORDER BY created_ms DESC LIMIT 1").bind(deviceHash).first();
  if(existing?.status==="pending"||existing?.status==="approved") return json({applicationId:existing.application_id,status:existing.status,createdAt:existing.created_ms});
  const now=Date.now();
  const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM license_applications WHERE device_hash=? AND created_ms>?").bind(deviceHash,now-86400000).first();
  if(Number(recent?.n||0)>=3) throw Error("24小时内申请次数已达上限，请联系官方客服");
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO license_applications(application_id,device_hash,contact,reason,status,created_ms) VALUES(?,?,?,?,'pending',?)")
    .bind(id,deviceHash,contact,reason,now).run();
  return json({applicationId:id,status:"pending",createdAt:now},201);
}
async function applicationStatus(request, env, body, helpers) {
  await helpers.verifyDevice("application-status",body);
  const deviceHash=await consumeNonce(env,body,helpers);
  const app=await env.DB.prepare("SELECT application_id,status,created_ms,reviewed_ms,review_note FROM license_applications WHERE device_hash=? ORDER BY created_ms DESC LIMIT 1")
    .bind(deviceHash).first();
  return json({application:app||null});
}
async function checkoutPage(request, env, orderId) {
  const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(orderId).first();
  if(!order) return new Response("订单不存在",{status:404});
  if(order.status==="paid") return new Response("<!doctype html><meta charset=utf-8><title>支付完成</title><h2>支付已完成</h2><p>请返回独独AI工作台，点击“联网验证 / 更新授权”。</p>",{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
  if(order.status!=="pending") return new Response("订单已关闭或退款",{status:410});
  let checkout={};try{checkout=JSON.parse(order.checkout_data||"{}")}catch{}
  if(order.payment_method==="alipay"&&checkout.pay_params&&typeof checkout.pay_params==="object") {
    const gateway=safeHttps(checkout.gateway)||"https://openapi.alipay.com/gateway.do";
    const target=new URL(gateway);
    if(target.hostname!=="openapi.alipay.com"&&target.hostname!=="openapi-sandbox.dl.alipaydev.com") return new Response("支付宝收银台地址无效",{status:502});
    const fields=Object.entries(checkout.pay_params).map(([k,v])=>'<input type="hidden" name="'+html(k)+'" value="'+html(v)+'">').join("");
    const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正在前往支付宝</title><body style="font:16px Microsoft Yahei;background:#0b1525;color:#edf4ff;display:grid;place-items:center;min-height:100vh"><main style="background:#172943;padding:28px;border-radius:16px;text-align:center"><h2>正在打开支付宝收银台</h2><p>订单：'+html(order.order_no)+'</p><p>金额：¥'+yuan(order.amount_cents)+'</p><form id="pay" method="post" action="'+html(target.toString())+'">'+fields+'<button>继续支付</button></form></main><script>document.getElementById("pay").submit()</script></body></html>';
    return new Response(page,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action https://openapi.alipay.com https://openapi-sandbox.dl.alipaydev.com; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if(order.payment_method==="wechat"&&typeof checkout.code_url==="string"&&checkout.code_url.startsWith("weixin://")) {
    const code=JSON.stringify(checkout.code_url);
    const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信扫码支付</title><style>body{font:16px Microsoft Yahei;background:#0b1525;color:#edf4ff;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#172943;border:1px solid #345174;border-radius:18px;padding:28px;text-align:center;max-width:420px;width:90%;box-sizing:border-box}#qr{display:inline-block;background:white;padding:12px;border-radius:10px;margin:16px}button,a{background:#426fe8;color:white;border:0;border-radius:8px;padding:11px 16px;text-decoration:none;display:inline-block;margin:6px;cursor:pointer}</style><div class="card"><h2>微信支付</h2><p>请使用微信扫描下方二维码，完成付款。</p><div id="qr"></div><p>如无法扫码，可复制支付链接后在微信中打开。</p><button id="copy">复制支付链接</button> <a href="'+html(checkout.code_url)+'">在微信中打开</a><p>支付完成后返回独独AI工作台，点击“联网验证 / 更新授权”。</p><small>订单号：'+html(order.order_no)+'</small></div><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script>const code='+code+';if(window.QRCode)new QRCode(document.getElementById("qr"),{text:code,width:220,height:220});document.getElementById("copy").onclick=()=>navigator.clipboard.writeText(code).then(()=>alert("已复制支付链接"));</script></html>';
    return new Response(page,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  return new Response("支付信息暂不可用",{status:502});
}

async function adminOps(req, env, path, helpers) {
  if(!await helpers.adminAuth(req,env)) return json({error:"管理员身份验证失败"},401);
  let body={}; if(req.method==="POST") body=await req.json().catch(()=>({}));
  if(path==="/v1/admin/overview") {
    await closeStaleOrders(env);
    const [cards,apps,orders,products]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM license_cards").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM license_applications WHERE status='pending'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='paid'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE enabled=1").first()
    ]);
    return json({cards:cards?.n||0,pendingApplications:apps?.n||0,paidOrders:orders?.n||0,activeProducts:products?.n||0,payments:{wechat:paymentReady(env,"wechat"),alipay:paymentReady(env,"alipay")}});
  }
  if(path==="/v1/admin/applications/list") {
    const result=await env.DB.prepare("SELECT application_id,device_hash,contact,reason,status,created_ms,reviewed_ms,review_note,card_id FROM license_applications ORDER BY created_ms DESC LIMIT 200").all();
    return json({applications:result.results||[]});
  }
  if(path==="/v1/admin/applications/approve"||path==="/v1/admin/applications/reject") {
    const id=clean(body.applicationId,80), note=clean(body.note,300);
    const app=await env.DB.prepare("SELECT * FROM license_applications WHERE application_id=?").bind(id).first();
    if(!app||app.status!=="pending") return json({error:"申请不存在或已处理"},404);
    const now=Date.now();
    if(path.endsWith("/reject")) {
      const r=await env.DB.prepare("UPDATE license_applications SET status='rejected',reviewed_ms=?,review_note=? WHERE application_id=? AND status='pending'")
        .bind(now,note,id).run();
      if(!r.meta?.changes) return json({error:"申请已被其他操作处理"},409);
      await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES('application_reject',?)").bind(now).run();
      return json({ok:true,status:"rejected"});
    }
    const code=helpers.newCode(),cardId=crypto.randomUUID(),hash=await helpers.hmac(env.DUDU_CARD_HMAC_KEY,code);
    const result=await env.DB.batch([
      env.DB.prepare("INSERT INTO license_cards(id,code_hash,last_four,issued_ms,bound_device_hash,activated_ms) SELECT ?,?,?,?,device_hash,? FROM license_applications WHERE application_id=? AND status='pending'")
        .bind(cardId,hash,code.slice(-4),now,now,id),
      env.DB.prepare("UPDATE license_applications SET status='approved',reviewed_ms=?,review_note=?,card_id=? WHERE application_id=? AND status='pending'")
        .bind(now,note,cardId,id),
      env.DB.prepare("INSERT INTO admin_audit(event,card_id,occurred_ms) SELECT 'application_approve',?,? WHERE EXISTS(SELECT 1 FROM license_applications WHERE application_id=? AND card_id=?)")
        .bind(cardId,now,id,cardId)
    ]);
    if(!result?.[0]?.meta?.changes||!result?.[1]?.meta?.changes) return json({error:"申请已被其他操作处理"},409);
    return json({ok:true,status:"approved",activatedOnDevice:true});
  }
  if(path==="/v1/admin/products/list") {
    const result=await env.DB.prepare("SELECT product_id,name,description,price_cents,entitlement_type,enabled,sort_order,created_ms,updated_ms FROM products ORDER BY sort_order,created_ms DESC").all();
    return json({products:result.results||[]});
  }
  if(path==="/v1/admin/products/save") {
    const id=clean(body.productId,80)||("prod_"+randomHex(8));
    const name=clean(body.name,80),description=clean(body.description,300);
    const price=Number(body.priceCents),enabled=body.enabled===false?0:1,sort=Math.max(-999,Math.min(999,Number(body.sortOrder)||0));
    if(!/^[a-z0-9_-]{2,80}$/i.test(id)||name.length<2||!Number.isSafeInteger(price)||price<1||price>100000000) return json({error:"商品名称、编号或价格无效"},400);
    const old=await env.DB.prepare("SELECT product_id FROM products WHERE product_id=?").bind(id).first();
    if(old) await env.DB.prepare("UPDATE products SET name=?,description=?,price_cents=?,enabled=?,sort_order=?,updated_ms=? WHERE product_id=?")
      .bind(name,description,price,enabled,sort,Date.now(),id).run();
    else await env.DB.prepare("INSERT INTO products(product_id,name,description,price_cents,entitlement_type,enabled,sort_order,created_ms,updated_ms) VALUES(?,?,?,?,'permanent',?,?,?,?)")
      .bind(id,name,description,price,enabled,sort,Date.now(),Date.now()).run();
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES('product_save',?)").bind(Date.now()).run();
    return json({ok:true,productId:id});
  }
  if(path==="/v1/admin/products/toggle") {
    const id=clean(body.productId,80),enabled=body.enabled===true?1:0;
    const r=await env.DB.prepare("UPDATE products SET enabled=?,updated_ms=? WHERE product_id=?").bind(enabled,Date.now(),id).run();
    if(!r.meta?.changes) return json({error:"商品不存在"},404);
    return json({ok:true});
  }
  if(path==="/v1/admin/orders/list") {
    await closeStaleOrders(env);
    const result=await env.DB.prepare("SELECT o.order_id,o.order_no,o.product_name,o.amount_cents,o.payment_method,o.status,o.created_ms,o.paid_ms,o.delivered_ms,o.last_error,d.status AS delivery_status FROM orders o LEFT JOIN delivery_outbox d ON d.order_id=o.order_id ORDER BY o.created_ms DESC LIMIT 300").all();
    return json({orders:result.results||[]});
  }
  if(path==="/v1/admin/orders/resend") {
    const id=clean(body.orderId,80);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(id).first();
    if(!order||order.status!=="paid") return json({error:"仅已支付订单可以补发"},400);
    await markOrderPaid(env,order,order.provider_trade_no,"admin-resend-"+randomHex(8),"manual",helpers);
    return json({ok:true,delivered:true});
  }
  if(path==="/v1/admin/audit/list") {
    const result=await env.DB.prepare("SELECT id,event,card_id,occurred_ms FROM admin_audit ORDER BY occurred_ms DESC LIMIT 200").all();
    return json({events:result.results||[]});
  }
  if(path==="/v1/admin/payments/status") {
    return json({wechat:{configured:paymentReady(env,"wechat"),required:["WECHATPAY_MCHID","WECHATPAY_APPID","WECHATPAY_SERIAL_NO","WECHATPAY_PRIVATE_KEY_PEM","WECHATPAY_API_V3_KEY","WECHATPAY_PLATFORM_PUBLIC_KEY_PEM","WECHATPAY_PLATFORM_SERIAL"]},alipay:{configured:paymentReady(env,"alipay"),required:["ALIPAY_APP_ID","ALIPAY_PRIVATE_KEY_PEM","ALIPAY_PUBLIC_KEY_PEM"]}});
  }
  if(path==="/v1/admin/content/get") {
    const manifest=await loadCurrentManifest(env);
    const row=await env.DB.prepare("SELECT updated_ms FROM public_content WHERE content_id=1").first();
    return json({manifest,updatedAt:row?.updated_ms||null});
  }
  if(path==="/v1/admin/content/publish") {
    const manifest=normalizeManifest(body.manifest||body);
    const now=Date.now(),historyId=crypto.randomUUID(),value=JSON.stringify(manifest);
    await env.DB.prepare("INSERT INTO public_content_history(history_id,manifest_json,created_ms) VALUES(?,?,?)").bind(historyId,value,now).run();
    await env.DB.prepare("INSERT INTO public_content(content_id,manifest_json,updated_ms) VALUES(1,?,?) ON CONFLICT(content_id) DO UPDATE SET manifest_json=excluded.manifest_json,updated_ms=excluded.updated_ms")
      .bind(value,now).run();
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES('content_publish',?)").bind(now).run();
    return json({ok:true,updatedAt:manifest.updatedAt,historyId});
  }
  if(path==="/v1/admin/content/history") {
    const result=await env.DB.prepare("SELECT history_id,created_ms FROM public_content_history ORDER BY created_ms DESC LIMIT 50").all();
    return json({history:result.results||[]});
  }
  if(path==="/v1/admin/content/rollback") {
    const id=clean(body.historyId,80);
    const old=await env.DB.prepare("SELECT manifest_json FROM public_content_history WHERE history_id=?").bind(id).first();
    if(!old) return json({error:"历史版本不存在"},404);
    const manifest=normalizeManifest(JSON.parse(old.manifest_json));
    const now=Date.now();
    await env.DB.prepare("INSERT INTO public_content_history(history_id,manifest_json,created_ms) VALUES(?,?,?)").bind(crypto.randomUUID(),JSON.stringify(manifest),now).run();
    await env.DB.prepare("INSERT INTO public_content(content_id,manifest_json,updated_ms) VALUES(1,?,?) ON CONFLICT(content_id) DO UPDATE SET manifest_json=excluded.manifest_json,updated_ms=excluded.updated_ms")
      .bind(JSON.stringify(manifest),now).run();
    return json({ok:true,updatedAt:manifest.updatedAt});
  }
  return json({error:"未知管理操作"},404);
}

export async function handleOpsRequest(request, env, path, helpers) {

  if(path==="/manifest.json"&&request.method==="GET") {
    return json(await loadCurrentManifest(env),200,{"cache-control":"public,max-age=60"});
  }
  if(path==="/v1/products"&&request.method==="GET") {
    const result=await env.DB.prepare("SELECT product_id,name,description,price_cents,entitlement_type FROM products WHERE enabled=1 ORDER BY sort_order,created_ms DESC").all();
    return json({products:result.results||[]},200,{"cache-control":"public,max-age=30"});
  }
  if(path==="/checkout"||path.startsWith("/checkout/")) {
    if(request.method!=="GET") return new Response("Method not allowed",{status:405});
    const id=path.slice("/checkout/".length);
    if(!/^[0-9a-f-]{36}$/i.test(id)) return new Response("订单不存在",{status:404});
    return checkoutPage(request,env,id);
  }
  if(path==="/v1/payments/wechat/notify"&&request.method==="POST") return handleWechatNotify(request,env,helpers);
  if(path==="/v1/payments/alipay/notify"&&request.method==="POST") return handleAlipayNotify(request,env,helpers);
  if(path==="/v1/application/create"&&request.method==="POST") {
    try { return await applicationCreate(request,env,await request.json(),helpers); }
    catch(e) { return json({error:clean(e.message,180)||"申请提交失败"},400); }
  }
  if(path==="/v1/application/status"&&request.method==="POST") {
    try { return await applicationStatus(request,env,await request.json(),helpers); }
    catch(e) { return json({error:clean(e.message,180)||"申请查询失败"},400); }
  }
  if(path==="/v1/orders/create"&&request.method==="POST") {
    try { return await createOrder(request,env,await request.json(),helpers); }
    catch(e) { return json({error:clean(e.message,180)||"创建订单失败"},400); }
  }
  if(path==="/v1/orders/status"&&request.method==="POST") {
    try { return await orderStatus(request,env,await request.json(),helpers); }
    catch(e) { return json({error:clean(e.message,180)||"订单查询失败"},400); }
  }
  if(path.startsWith("/v1/admin/")&&!path.startsWith("/v1/admin/cards/")&&request.method==="POST") {
    try { return await adminOps(request,env,path,helpers); }
    catch(e) { return json({error:clean(e.message,180)||"管理操作失败"},400); }
  }
  return null;
}
