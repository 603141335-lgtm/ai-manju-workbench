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
    .sort().map(k=>k+"="+(typeof params[k]==="object"?JSON.stringify(params[k]):String(params[k]))).join("&");
}
function wechatOrderQueryPath(outTradeNo,mchid) {
  return "/v3/pay/transactions/out-trade-no/"+encodeURIComponent(outTradeNo)+"?mchid="+encodeURIComponent(mchid);
}
function wechatRequestMessage(method,path,timestamp,nonce,body="") {
  return method+"\n"+path+"\n"+timestamp+"\n"+nonce+"\n"+body+"\n";
}
function buildAlipayQueryParams(env,orderNo,timestamp) {
  return {app_id:env.ALIPAY_APP_ID,method:"alipay.trade.query",format:"JSON",charset:"utf-8",sign_type:"RSA2",timestamp,version:"1.0",biz_content:JSON.stringify({out_trade_no:orderNo})};
}
function alipayGateway(env) {
  const gateway=safeHttps(env.ALIPAY_GATEWAY_URL)||"https://openapi.alipay.com/gateway.do";
  const target=new URL(gateway);
  if(target.hostname!=="openapi.alipay.com"&&target.hostname!=="openapi-sandbox.dl.alipaydev.com") throw Error("支付宝网关地址不在允许列表");
  return target.toString();
}
export { alipaySignContent, normalizeManifest, importRsaPrivate, importRsaPublic, paymentReady, wechatOrderQueryPath, wechatRequestMessage, buildAlipayQueryParams, alipayGateway, paymentSelfTest, logPaymentWebhook, runScheduledReconciliation };

function paymentReady(env, method) {
  if(method==="wechat") return !!(env.WECHATPAY_MCHID&&env.WECHATPAY_APPID&&env.WECHATPAY_SERIAL_NO&&env.WECHATPAY_PRIVATE_KEY_PEM&&env.WECHATPAY_API_V3_KEY&&env.WECHATPAY_PLATFORM_PUBLIC_KEY_PEM&&env.WECHATPAY_PLATFORM_SERIAL);
  if(method==="alipay") return !!(env.ALIPAY_APP_ID&&env.ALIPAY_PRIVATE_KEY_PEM&&env.ALIPAY_PUBLIC_KEY_PEM&&env.ALIPAY_SELLER_ID);
  return false;
}
async function paymentSelfTest(env,method) {
  const checks=[];
  if(!paymentReady(env,method)) return {ok:false,method,message:"仍有必需密钥或商户参数未配置",checks:[{name:"必需配置",ok:false,message:"仍有必需密钥或商户参数未配置"}]};
  try {
    if(method==="wechat") {
      if(enc.encode(env.WECHATPAY_API_V3_KEY).length!==32) throw Error("微信支付APIv3密钥必须为32字节");
      await importRsaPrivate(env.WECHATPAY_PRIVATE_KEY_PEM);
      checks.push({name:"商户API私钥格式",ok:true});
      await importRsaPublic(env.WECHATPAY_PLATFORM_PUBLIC_KEY_PEM);
      checks.push({name:"微信支付平台公钥格式",ok:true});
      const challenge="DUDU-WECHAT-LOCAL-KEY-TEST-"+randomHex(16);
      const signature=await rsaSign(env.WECHATPAY_PRIVATE_KEY_PEM,challenge);
      if(!signature) throw Error("商户私钥签名失败");
      checks.push({name:"商户私钥签名",ok:true});
      checks.push({name:"APIv3密钥长度",ok:true});
      return {ok:true,method,checks,note:"本地密钥格式与签名能力通过；未发起真实扣款，也未验证商户平台在线连通性。微信平台公钥与商户私钥用途不同，不进行配对校验。"};
    }
    const challenge="DUDU-ALIPAY-LOCAL-KEY-TEST-"+randomHex(16);
    const signature=await rsaSign(env.ALIPAY_PRIVATE_KEY_PEM,challenge);
    const verified=await rsaVerify(env.ALIPAY_PUBLIC_KEY_PEM,challenge,signature);
    if(!verified) throw Error("支付宝应用私钥与支付宝公钥无法完成签名配对校验");
    checks.push({name:"支付宝RSA2私钥签名",ok:true});
    checks.push({name:"支付宝公钥验签配对",ok:true});
    checks.push({name:"应用ID与收款方UID",ok:true});
    return {ok:true,method,checks,note:"本地RSA2密钥配对通过；未发起真实扣款，也未验证商户平台在线连通性。"};
  } catch(error) {
    return {ok:false,method,checks,message:clean(error.message,180)||"本地密钥自检失败"};
  }
}
async function logPaymentWebhook(env,{provider,eventId="",orderNo="",outcome="error",message="",raw=""}) {
  try {
    const digest=hex(await crypto.subtle.digest("SHA-256",enc.encode(String(raw))));
    await env.DB.prepare("INSERT INTO payment_webhook_logs(provider,event_id,order_no,outcome,message,payload_sha256,occurred_ms) VALUES(?,?,?,?,?,?,?)")
      .bind(provider,clean(eventId,120),clean(orderNo,80),outcome,clean(message,180),digest,Date.now()).run();
    return true;
  } catch(error) {
    console.error("payment-webhook-log-failed",provider,String(error?.message||error));
    return false;
  }
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
  const res=await fetch("https://api.mch.weixin.qq.com"+path,{method:"POST",headers:{"Authorization":authorization,"Wechatpay-Serial":env.WECHATPAY_PLATFORM_SERIAL,"Accept":"application/json","Content-Type":"application/json"},body});
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
  const gateway=alipayGateway(env);
  return {gateway,pay_params:params};
}
async function queryWechatPayment(env,order,helpers) {
  const path=wechatOrderQueryPath(order.order_no,env.WECHATPAY_MCHID);
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomHex(16);
  const signature=await rsaSign(env.WECHATPAY_PRIVATE_KEY_PEM,wechatRequestMessage("GET",path,timestamp,nonce,""));
  const authorization='WECHATPAY2-SHA256-RSA2048 mchid="'+env.WECHATPAY_MCHID+'",nonce_str="'+nonce+'",timestamp="'+timestamp+'",serial_no="'+env.WECHATPAY_SERIAL_NO+'",signature="'+signature+'"';
  const res=await fetch("https://api.mch.weixin.qq.com"+path,{method:"GET",headers:{"Authorization":authorization,"Wechatpay-Serial":env.WECHATPAY_PLATFORM_SERIAL,"Accept":"application/json"}});
  const raw=await res.text();
  if(!await verifyWechatHeaders(res.headers,env,raw)) throw Error("微信支付查单响应验签失败");
  let data={};try{data=JSON.parse(raw)}catch{}
  if(res.status===404) return {status:"not_found",tradeState:"NOT_FOUND",message:"微信支付平台暂未查到该订单"};
  if(!res.ok) throw Error("微信支付查单失败："+clean(data.message||data.code||"接口异常",120));
  if(data.out_trade_no!==order.order_no||data.mchid!==env.WECHATPAY_MCHID||data.appid!==env.WECHATPAY_APPID) throw Error("微信支付查单返回的订单或商户信息不匹配");
  if(data.trade_state==="SUCCESS") {
    if(data.amount?.currency!=="CNY"||Number(data.amount?.total)!==Number(order.amount_cents)||!data.transaction_id) throw Error("微信支付查单金额、币种或交易号不匹配");
    const hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    await markOrderPaid(env,order,data.transaction_id,"reconcile-wechat-"+data.transaction_id,hash,helpers);
    return {status:"paid",tradeState:data.trade_state,delivered:true,message:"微信支付已确认到账，授权已自动发放"};
  }
  if(data.trade_state==="CLOSED") {
    await env.DB.prepare("UPDATE orders SET status='closed',updated_ms=? WHERE order_id=? AND status='pending'").bind(Date.now(),order.order_id).run();
    return {status:"closed",tradeState:data.trade_state,message:data.trade_state_desc||"微信订单已关闭"};
  }
  return {status:"pending",tradeState:clean(data.trade_state,40),message:clean(data.trade_state_desc||"微信支付尚未完成",160)};
}
async function queryAlipayPayment(env,order,helpers) {
  const timestamp=new Date().toISOString().replace("T"," ").slice(0,19);
  const params=buildAlipayQueryParams(env,order.order_no,timestamp);
  params.sign=await rsaSign(env.ALIPAY_PRIVATE_KEY_PEM,alipaySignContent(params));
  const body=new URLSearchParams(params).toString();
  const res=await fetch(alipayGateway(env),{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded;charset=utf-8"},body});
  const raw=await res.text();
  let envelope={};try{envelope=JSON.parse(raw)}catch{}
  const data=envelope.alipay_trade_query_response;
  if(!data||!envelope.sign||!await rsaVerify(env.ALIPAY_PUBLIC_KEY_PEM,alipaySignContent(data),envelope.sign)) throw Error("支付宝查单响应验签失败");
  if(data.code!=="10000") {
    if(data.sub_code==="ACQ.TRADE_NOT_EXIST") return {status:"not_found",tradeState:"NOT_FOUND",message:"支付宝平台暂未查到该订单"};
    throw Error("支付宝查单失败："+clean(data.sub_msg||data.msg||data.sub_code||"接口异常",160));
  }
  if(data.out_trade_no!==order.order_no||Math.round(Number(data.total_amount)*100)!==Number(order.amount_cents)||!data.trade_no) throw Error("支付宝查单订单号、金额或交易号不匹配");
  if(["TRADE_SUCCESS","TRADE_FINISHED"].includes(data.trade_status)) {
    const hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    await markOrderPaid(env,order,data.trade_no,"reconcile-alipay-"+data.trade_no,hash,helpers);
    return {status:"paid",tradeState:data.trade_status,delivered:true,message:"支付宝已确认到账，授权已自动发放"};
  }
  if(data.trade_status==="TRADE_CLOSED") {
    await env.DB.prepare("UPDATE orders SET status='closed',updated_ms=? WHERE order_id=? AND status='pending'").bind(Date.now(),order.order_id).run();
    return {status:"closed",tradeState:data.trade_status,message:"支付宝订单已关闭"};
  }
  return {status:"pending",tradeState:clean(data.trade_status,40),message:data.trade_status==="WAIT_BUYER_PAY"?"支付宝订单等待付款":"支付宝订单尚未完成"};
}

function truncateUtf8(value,maxBytes) {
  let out="",size=0;
  for(const char of Array.from(clean(value,300))){
    const n=enc.encode(char).length;
    if(size+n>maxBytes)break;
    out+=char;size+=n;
  }
  return out;
}
function newRefundNo() {
  return "RF"+Date.now().toString(36).toUpperCase()+randomHex(12).toUpperCase();
}
async function signedWechatApiRequest(env,method,path,payload=null) {
  const body=payload===null?"":JSON.stringify(payload);
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomHex(16);
  const signature=await rsaSign(env.WECHATPAY_PRIVATE_KEY_PEM,wechatRequestMessage(method,path,timestamp,nonce,body));
  const authorization='WECHATPAY2-SHA256-RSA2048 mchid="'+env.WECHATPAY_MCHID+'",nonce_str="'+nonce+'",timestamp="'+timestamp+'",serial_no="'+env.WECHATPAY_SERIAL_NO+'",signature="'+signature+'"';
  const response=await fetch("https://api.mch.weixin.qq.com"+path,{
    method,headers:{"Authorization":authorization,"Wechatpay-Serial":env.WECHATPAY_PLATFORM_SERIAL,"Accept":"application/json","Content-Type":"application/json"},
    ...(method==="GET"?{}:{body})
  });
  const raw=await response.text();
  let data={};try{data=JSON.parse(raw)}catch{}
  let verified=false;try{verified=await verifyWechatHeaders(response.headers,env,raw)}catch{}
  if(!verified)throw Error("微信支付退款接口响应验签失败，结果暂不确定");
  return {response,data,raw};
}
async function callAlipayApi(env,method,bizContent) {
  const timestamp=new Date().toISOString().replace("T"," ").slice(0,19);
  const params={app_id:env.ALIPAY_APP_ID,method,format:"JSON",charset:"utf-8",sign_type:"RSA2",timestamp,version:"1.0",biz_content:JSON.stringify(bizContent)};
  params.sign=await rsaSign(env.ALIPAY_PRIVATE_KEY_PEM,alipaySignContent(params));
  const response=await fetch(alipayGateway(env),{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/x-www-form-urlencoded;charset=utf-8"},body:new URLSearchParams(params).toString()});
  const raw=await response.text();
  let envelope={};try{envelope=JSON.parse(raw)}catch{}
  const key=method.replace(/\./g,"_")+"_response",data=envelope[key];
  if(!data||!envelope.sign||!await rsaVerify(env.ALIPAY_PUBLIC_KEY_PEM,alipaySignContent(data),envelope.sign)) throw Error("支付宝退款接口响应验签失败，结果暂不确定");
  return {response,data,raw};
}
async function completeRefund(env,refund,providerStatus,providerRefundId="") {
  const now=Date.now(),event="refund_succeeded:"+refund.refund_id;
  await env.DB.batch([
    env.DB.prepare("UPDATE refunds SET status='succeeded',provider_status=?,provider_refund_id=CASE WHEN ?='' THEN provider_refund_id ELSE ? END,last_error='',last_checked_ms=?,updated_ms=?,succeeded_ms=COALESCE(succeeded_ms,?) WHERE refund_id=?")
      .bind(clean(providerStatus,60),providerRefundId,providerRefundId,now,now,now,refund.refund_id),
    env.DB.prepare("UPDATE orders SET status='refunded',refunded_ms=COALESCE(refunded_ms,?),updated_ms=?,last_error='' WHERE order_id=? AND status='paid'")
      .bind(now,now,refund.order_id),
    env.DB.prepare("UPDATE license_cards SET revoked_ms=COALESCE(revoked_ms,?) WHERE id=(SELECT card_id FROM delivery_outbox WHERE order_id=?)")
      .bind(now,refund.order_id),
    env.DB.prepare("INSERT INTO admin_audit(event,card_id,occurred_ms) SELECT ?, (SELECT card_id FROM delivery_outbox WHERE order_id=?), ? WHERE NOT EXISTS(SELECT 1 FROM admin_audit WHERE event=?)")
      .bind(event,refund.order_id,now,event)
  ]);
  return {status:"succeeded",message:"退款已由支付平台确认成功；本订单对应授权已自动撤销"};
}
async function setRefundState(env,refund,{status,providerStatus="",providerRefundId="",error=""}) {
  if(status==="succeeded") return completeRefund(env,refund,providerStatus,providerRefundId);
  const now=Date.now();
  const updated=await env.DB.prepare("UPDATE refunds SET status=?,provider_status=?,provider_refund_id=CASE WHEN ?='' THEN provider_refund_id ELSE ? END,last_error=?,last_checked_ms=?,updated_ms=?,attempts=attempts+1 WHERE refund_id=? AND status IN ('processing','manual_review')")
    .bind(status,clean(providerStatus,60),providerRefundId,providerRefundId,clean(error,240),now,now,refund.refund_id).run();
  if(!updated.meta?.changes) {
    const current=await env.DB.prepare("SELECT status FROM refunds WHERE refund_id=?").bind(refund.refund_id).first();
    if(current?.status==="succeeded") return {status:"succeeded",message:"退款已由支付平台确认成功；本订单对应授权已自动撤销"};
    if(current?.status==="failed") return {status:"failed",message:"该退款单已确认未成功，请核对后再决定是否重新申请"};
    if(!current) return {status:"not_found",message:"退款记录已不存在"};
    return {status:current.status,message:"退款状态已被其他操作更新，请刷新后核对"};
  }
  return {status,message:clean(error,220)||({processing:"退款正在支付平台处理中，尚未撤销授权",failed:"支付平台已确认本次退款未完成",manual_review:"退款结果需要人工核对，系统已暂停自动补发"})[status]||"退款状态已更新"};
}
function refundStatusFromWechat(value) {
  if(value==="SUCCESS")return "succeeded";
  if(value==="CLOSED")return "failed";
  if(value==="ABNORMAL")return "manual_review";
  return "processing";
}
async function submitWechatRefund(env,order,refund,origin) {
  const path="/v3/refund/domestic/refunds";
  const payload={
    ...(order.provider_trade_no?{transaction_id:order.provider_trade_no}:{out_trade_no:order.order_no}),
    out_refund_no:refund.refund_no,
    reason:truncateUtf8(refund.reason,80)||"订单退款",
    notify_url:safeHttps(env.WECHATPAY_REFUND_NOTIFY_URL)||origin+"/v1/payments/wechat/refund-notify",
    amount:{refund:refund.amount_cents,total:order.amount_cents,currency:"CNY"}
  };
  const {response,data}=await signedWechatApiRequest(env,"POST",path,payload);
  if(!response.ok) return {status:"manual_review",providerStatus:"HTTP_"+response.status,error:clean(data.message||data.code||"微信支付未明确受理退款，请查询原退款单号",220)};
  if(data.out_refund_no!==refund.refund_no||(data.out_trade_no&&data.out_trade_no!==order.order_no)) return {status:"manual_review",providerStatus:clean(data.status,60),error:"微信退款响应订单号不匹配，请人工核对"};
  if(Number(data.amount?.total)!==Number(order.amount_cents)||Number(data.amount?.refund)!==Number(refund.amount_cents)) return {status:"manual_review",providerStatus:clean(data.status,60),error:"微信退款响应金额不匹配，请人工核对"};
  return {status:refundStatusFromWechat(data.status),providerStatus:clean(data.status,60),providerRefundId:clean(data.refund_id,80),error:data.status==="ABNORMAL"?"微信退款异常，请前往商户平台处理":data.status==="CLOSED"?"微信支付已关闭本次退款":data.status==="PROCESSING"?"微信已受理退款，等待最终结果通知":" "};
}
async function queryWechatRefund(env,order,refund) {
  const path="/v3/refund/domestic/refunds/"+encodeURIComponent(refund.refund_no);
  const {response,data}=await signedWechatApiRequest(env,"GET",path);
  if(!response.ok) return {status:"manual_review",providerStatus:"HTTP_"+response.status,error:clean(data.message||data.code||"微信退款查单失败，请人工核对",220)};
  if(data.out_refund_no!==refund.refund_no||(data.out_trade_no&&data.out_trade_no!==order.order_no)) return {status:"manual_review",providerStatus:clean(data.status,60),error:"微信退款查单订单号不匹配"};
  if(Number(data.amount?.total)!==Number(order.amount_cents)||Number(data.amount?.refund)!==Number(refund.amount_cents)) return {status:"manual_review",providerStatus:clean(data.status,60),error:"微信退款查单金额不匹配"};
  return {status:refundStatusFromWechat(data.status),providerStatus:clean(data.status,60),providerRefundId:clean(data.refund_id,80),error:data.status==="ABNORMAL"?"微信退款异常，请前往商户平台处理":data.status==="CLOSED"?"微信退款已关闭":data.status==="PROCESSING"?"退款仍在处理中":""};
}
async function submitAlipayRefund(env,order,refund) {
  const data=(await callAlipayApi(env,"alipay.trade.refund",{
    ...(order.provider_trade_no?{trade_no:order.provider_trade_no}:{out_trade_no:order.order_no}),
    refund_amount:yuan(refund.amount_cents),refund_reason:clean(refund.reason,200)||"订单退款",out_request_no:refund.refund_no
  })).data;
  if(data.out_trade_no&&data.out_trade_no!==order.order_no) return {status:"manual_review",providerStatus:clean(data.code,40),error:"支付宝退款响应订单号不匹配"};
  if(data.out_request_no&&data.out_request_no!==refund.refund_no) return {status:"manual_review",providerStatus:clean(data.code,40),error:"支付宝退款请求号不匹配"};
  if(data.code!=="10000") return {status:"manual_review",providerStatus:clean(data.code,40),error:clean(data.sub_msg||data.msg||"支付宝未明确受理退款，请查询原退款请求号",220)};
  if(data.refund_fee&&Math.round(Number(data.refund_fee)*100)!==refund.amount_cents) return {status:"manual_review",providerStatus:"10000",error:"支付宝退款响应金额不匹配"};
  if(data.fund_change==="Y") return {status:"succeeded",providerStatus:"FUND_CHANGE_Y",providerRefundId:clean(data.trade_no,80),error:""};
  return {status:"processing",providerStatus:"FUND_CHANGE_N",providerRefundId:clean(data.trade_no,80),error:"支付宝接口已响应，但未确认资金变动；请等待10秒后查询退款状态"};
}
async function queryAlipayRefund(env,order,refund) {
  const data=(await callAlipayApi(env,"alipay.trade.fastpay.refund.query",{
    ...(order.provider_trade_no?{trade_no:order.provider_trade_no}:{out_trade_no:order.order_no}),
    out_request_no:refund.refund_no
  })).data;
  if(data.code!=="10000") return {status:"manual_review",providerStatus:clean(data.code,40),error:clean(data.sub_msg||data.msg||"支付宝退款查询失败",220)};
  if(data.out_trade_no&&data.out_trade_no!==order.order_no) return {status:"manual_review",providerStatus:clean(data.refund_status,60),error:"支付宝退款查询订单号不匹配"};
  if(data.out_request_no&&data.out_request_no!==refund.refund_no) return {status:"manual_review",providerStatus:clean(data.refund_status,60),error:"支付宝退款查询请求号不匹配"};
  if(data.total_amount&&Math.round(Number(data.total_amount)*100)!==Number(order.amount_cents)) return {status:"manual_review",providerStatus:clean(data.refund_status,60),error:"支付宝退款查询原订单金额不匹配"};
  if(data.refund_amount&&Math.round(Number(data.refund_amount)*100)!==Number(refund.amount_cents)) return {status:"manual_review",providerStatus:clean(data.refund_status,60),error:"支付宝退款查询退款金额不匹配"};
  if(data.refund_status==="REFUND_SUCCESS") return {status:"succeeded",providerStatus:"REFUND_SUCCESS",providerRefundId:clean(data.trade_no,80),error:""};
  if(!data.refund_status) return {status:"processing",providerStatus:"QUERY_ACCEPTED_NO_FINAL_STATUS",error:"支付宝查询接口已成功响应，但没有返回REFUND_SUCCESS；暂不撤销授权，请稍后再次查询"};
  return {status:"failed",providerStatus:clean(data.refund_status,60),error:"支付宝查询结果未确认退款成功，请核对后再决定是否重新发起"};
}
async function createAdminRefund(req,env,body) {
  if(body.confirmFullRefund!==true) return json({error:"必须明确确认全额退款"},400);
  const id=clean(body.orderId,80),reason=clean(body.reason,200)||"用户申请退款";
  const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(id).first();
  if(!order) return json({error:"订单不存在"},404);
  const active=await env.DB.prepare("SELECT refund_id,status FROM refunds WHERE order_id=? AND status IN ('processing','manual_review','succeeded') ORDER BY created_ms DESC LIMIT 1").bind(id).first();
  if(active) return json({error:active.status==="succeeded"?"该订单已经退款成功":"该订单已有退款正在处理或等待人工核对",refundId:active.refund_id,status:active.status},409);
  if(order.status!=="paid") return json({error:"只有已确认付款且未退款的订单可以退款"},400);
  if(!paymentReady(env,order.payment_method)) return json({error:"对应支付商户密钥尚未完整配置"},400);
  const now=Date.now(),refund={refund_id:crypto.randomUUID(),order_id:id,refund_no:newRefundNo(),provider:order.payment_method,amount_cents:order.amount_cents,reason,status:"processing",created_ms:now,updated_ms:now};
  try {
    await env.DB.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,reason,status,created_ms,updated_ms) VALUES(?,?,?,?,?,?,'processing',?,?)")
      .bind(refund.refund_id,refund.order_id,refund.refund_no,refund.provider,refund.amount_cents,refund.reason,now,now).run();
  } catch {
    const conflict=await env.DB.prepare("SELECT refund_id,status FROM refunds WHERE order_id=? AND status IN ('processing','manual_review','succeeded') ORDER BY created_ms DESC LIMIT 1").bind(id).first();
    return json({error:"退款请求已被其他操作创建，请刷新退款列表",refundId:conflict?.refund_id||"",status:conflict?.status||""},409);
  }
  try {
    const result=order.payment_method==="wechat"
      ?await submitWechatRefund(env,order,refund,new URL(req.url).origin)
      :await submitAlipayRefund(env,order,refund);
    const state=await setRefundState(env,refund,result);
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES(?,?)").bind("refund_submit_"+state.status+":"+refund.refund_id,Date.now()).run();
    return json({ok:true,refundId:refund.refund_id,refundNo:refund.refund_no,amountCents:refund.amount_cents,...state},state.status==="succeeded"?200:202);
  } catch(error) {
    const state=await setRefundState(env,refund,{status:"processing",providerStatus:"UNKNOWN",error:"退款请求结果暂不确定："+clean(error?.message||"网络或验签异常",180)+"；请查询原退款单号，不要重复创建退款"});
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES(?,?)").bind("refund_submit_uncertain:"+refund.refund_id,Date.now()).run();
    return json({ok:true,refundId:refund.refund_id,refundNo:refund.refund_no,amountCents:refund.amount_cents,...state},202);
  }
}
async function reconcileAdminRefund(env,refundId) {
  const refund=await env.DB.prepare("SELECT * FROM refunds WHERE refund_id=?").bind(clean(refundId,80)).first();
  if(!refund) return json({error:"退款记录不存在"},404);
  if(refund.status==="succeeded"||refund.status==="failed") return json({ok:true,status:refund.status,message:refund.status==="succeeded"?"退款已确认成功":"该退款单已确认未成功，请核对后再决定是否重新申请"});
  if(!paymentReady(env,refund.provider)) return json({error:"对应支付商户密钥尚未完整配置"},400);
  const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(refund.order_id).first();
  if(!order) return json({error:"原订单不存在"},404);
  const now=Date.now(),queryIntervalMs=refund.provider==="wechat"?60000:10000;
  const claimed=await env.DB.prepare("UPDATE refunds SET last_checked_ms=?,updated_ms=? WHERE refund_id=? AND status IN ('processing','manual_review') AND COALESCE(last_checked_ms,created_ms)<=?")
    .bind(now,now,refund.refund_id,now-queryIntervalMs).run();
  if(!claimed.meta?.changes) {
    const current=await env.DB.prepare("SELECT status FROM refunds WHERE refund_id=?").bind(refund.refund_id).first();
    if(current?.status==="succeeded"||current?.status==="failed") return json({ok:true,status:current.status,message:current.status==="succeeded"?"退款已确认成功":"该退款单已确认未成功，请核对后再决定是否重新申请"});
    if(!current) return json({error:"退款记录不存在"},404);
    return json({error:refund.provider==="wechat"?"微信退款查询已被其他请求占用，或需等待上次查询后60秒":"支付宝退款查询已被其他请求占用，或需等待上次查询后10秒"},429);
  }
  try {
    const result=refund.provider==="wechat"?await queryWechatRefund(env,order,refund):await queryAlipayRefund(env,order,refund);
    const state=await setRefundState(env,refund,result);
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES(?,?)").bind("refund_reconcile_"+state.status+":"+refund.refund_id,Date.now()).run();
    return json({ok:true,refundId:refund.refund_id,...state});
  } catch(error) {
    const state=await setRefundState(env,refund,{status:"processing",providerStatus:"QUERY_UNKNOWN",error:"退款查询结果暂不确定："+clean(error?.message||"接口异常",180)});
    return json({ok:true,refundId:refund.refund_id,...state},202);
  }
}
async function handleWechatRefundNotify(request,env) {
  if(Number(request.headers.get("content-length")||0)>65536) return json({code:"FAIL",message:"请求过大"},413);
  const raw=await request.text(),event={};try{Object.assign(event,JSON.parse(raw))}catch{}
  const eventId=clean(event.id,120);
  if(enc.encode(raw).length>65536) return json({code:"FAIL",message:"请求过大"},413);
  let verified=false;try{verified=await verifyWechatCallback(request,env,raw)}catch{}
  if(!verified) {
    await logPaymentWebhook(env,{provider:"wechat",eventId,outcome:"rejected",message:"微信退款回调验签失败",raw});
    return json({code:"FAIL",message:"签名验证失败"},401);
  }
  try {
    const trade=await decryptWechatResource(event.resource,env),refundNo=clean(trade.out_refund_no,80);
    const refund=await env.DB.prepare("SELECT r.*,o.order_no,o.amount_cents AS order_amount_cents,o.payment_method FROM refunds r JOIN orders o ON o.order_id=r.order_id WHERE r.refund_no=?").bind(refundNo).first();
    if(!refund||refund.provider!=="wechat"||refund.payment_method!=="wechat"||trade.out_trade_no!==refund.order_no) throw Error("微信退款回调与本地退款单不匹配");
    if(trade.mchid!==env.WECHATPAY_MCHID||Number(trade.amount?.total)!==Number(refund.order_amount_cents)||Number(trade.amount?.refund)!==Number(refund.amount_cents)) throw Error("微信退款回调商户或金额不匹配");
    const status=refundStatusFromWechat(trade.refund_status);
    const state=await setRefundState(env,refund,{status,providerStatus:clean(trade.refund_status,60),providerRefundId:clean(trade.refund_id,80),error:status==="manual_review"?"微信退款异常，需要在商户平台人工处理":status==="failed"?"微信退款已关闭":""});
    await logPaymentWebhook(env,{provider:"wechat",eventId,orderNo:refund.order_no,outcome:"accepted",message:"退款回调验签通过："+clean(trade.refund_status,40),raw});
    return json({code:"SUCCESS",message:state.message||"成功"});
  } catch(error) {
    await logPaymentWebhook(env,{provider:"wechat",eventId,outcome:"error",message:"微信退款回调处理失败："+clean(error.message||"未知错误",140),raw});
    return json({code:"FAIL",message:clean(error.message,120)||"处理失败"},400);
  }
}

async function recordReconcileAttempt(env,orderId,error="") {
  const now=Date.now();
  await env.DB.prepare("INSERT INTO payment_reconcile_state(order_id,last_checked_ms,attempts,last_error) VALUES(?,?,1,?) ON CONFLICT(order_id) DO UPDATE SET last_checked_ms=excluded.last_checked_ms,attempts=payment_reconcile_state.attempts+1,last_error=excluded.last_error")
    .bind(orderId,now,clean(error,240)).run();
}
async function runScheduledReconciliation(env,helpers) {
  const now=Date.now(),minCreated=now-3*60*60*1000,cutoff=now-5*60*1000;
  const pending=await env.DB.prepare("SELECT o.* FROM orders o LEFT JOIN payment_reconcile_state r ON r.order_id=o.order_id WHERE o.status IN ('pending','closed') AND o.created_ms>? AND (r.last_checked_ms IS NULL OR r.last_checked_ms<?) ORDER BY o.created_ms ASC LIMIT 10")
    .bind(minCreated,cutoff).all();
  const undelivered=await env.DB.prepare("SELECT * FROM orders o WHERE o.status='paid' AND o.delivered_ms IS NULL AND NOT EXISTS(SELECT 1 FROM refunds r WHERE r.order_id=o.order_id AND r.status IN ('processing','manual_review','succeeded')) ORDER BY o.paid_ms ASC LIMIT 10").all();
  let checked=0,paid=0,failed=0,deliveryRecovered=0;
  for(const order of pending.results||[]) {
    if(!paymentReady(env,order.payment_method)) continue;
    try {
      const result=order.payment_method==="wechat"?await queryWechatPayment(env,order,helpers):await queryAlipayPayment(env,order,helpers);
      await recordReconcileAttempt(env,order.order_id,result.status==="paid"?"":result.message||"");
      checked++;
      if(result.status==="paid") paid++;
    } catch(error) {
      await recordReconcileAttempt(env,order.order_id,error.message||"查单失败");
      await env.DB.prepare("UPDATE orders SET last_error=?,updated_ms=? WHERE order_id=?").bind(clean(error.message,240),Date.now(),order.order_id).run();
      checked++;failed++;
    }
  }
  for(const order of undelivered.results||[]) {
    try {
      await deliverPaidOrder(env,order,helpers);
      await recordReconcileAttempt(env,order.order_id,"");
      deliveryRecovered++;
    } catch(error) {
      await recordReconcileAttempt(env,order.order_id,error.message||"自动发货失败");
      await env.DB.prepare("UPDATE orders SET last_error=?,updated_ms=? WHERE order_id=?").bind(clean(error.message,240),Date.now(),order.order_id).run();
      failed++;
    }
  }
  return {checked,paid,failed,deliveryRecovered};
}
async function deliverPaidOrder(env,paid,helpers) {
  if(!paid||paid.status!=="paid") throw Error("只有已确认付款的订单可以发放授权");
  const refund=await env.DB.prepare("SELECT refund_id,status FROM refunds WHERE order_id=? AND status IN ('processing','manual_review','succeeded') LIMIT 1").bind(paid.order_id).first();
  if(refund) throw Error(refund.status==="succeeded"?"订单已退款，不能再次发放授权":"订单退款处理中或等待人工核对，暂时禁止补发授权");
  if(paid.delivered_ms) return {ok:true,orderId:paid.order_id,delivered:true,alreadyDelivered:true};
  try {
    let delivery=await env.DB.prepare("SELECT * FROM delivery_outbox WHERE order_id=?").bind(paid.order_id).first();
    if(!delivery){
      const code=helpers.newCode(),cardId=crypto.randomUUID(),codeHash=await helpers.hmac(env.DUDU_CARD_HMAC_KEY,code);
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
    await env.DB.prepare("UPDATE orders SET delivered_ms=COALESCE(delivered_ms,?),updated_ms=?,last_error='' WHERE order_id=?")
      .bind(Date.now(),Date.now(),paid.order_id).run();
    await env.DB.prepare("INSERT INTO admin_audit(event,card_id,occurred_ms) VALUES('auto_deliver',?,?)")
      .bind(delivery.card_id,Date.now()).run();
    return {ok:true,orderId:paid.order_id,delivered:true};
  } catch(error) {
    const message=clean(error?.message||"自动发货失败",240);
    try {
      await env.DB.prepare("UPDATE delivery_outbox SET status='failed',attempts=attempts+1,last_error=? WHERE order_id=?")
        .bind(message,paid.order_id).run();
      await env.DB.prepare("UPDATE orders SET last_error=?,updated_ms=? WHERE order_id=?")
        .bind(message,Date.now(),paid.order_id).run();
    } catch {}
    throw error;
  }
}
async function markOrderPaid(env, order, providerTradeNo, eventId, payloadHash, helpers) {
  const orderRow=await env.DB.prepare("SELECT * FROM orders WHERE order_no=?").bind(order.order_no).first();
  if(!orderRow) throw Error("订单不存在");
  if(orderRow.status==="refunded") throw Error("订单已退款");
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events(event_id,provider,order_no,payload_sha256,created_ms) VALUES(?,?,?,?,?)")
    .bind(String(eventId||("evt-"+orderRow.order_no)),orderRow.payment_method,orderRow.order_no,payloadHash,Date.now()).run();
  await env.DB.prepare("UPDATE orders SET status='paid',provider_trade_no=COALESCE(provider_trade_no,?),paid_ms=COALESCE(paid_ms,?),updated_ms=? WHERE order_id=? AND status IN ('pending','closed')")
    .bind(String(providerTradeNo||""),Date.now(),Date.now(),orderRow.order_id).run();
  const paid=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(orderRow.order_id).first();
  if(!paid||paid.status!=="paid") throw Error("订单状态未能更新为已支付");
  const refund=await env.DB.prepare("SELECT status FROM refunds WHERE order_id=? AND status IN ('processing','manual_review','succeeded') LIMIT 1").bind(orderRow.order_id).first();
  if(refund) return {ok:true,orderId:orderRow.order_id,delivered:!!paid.delivered_ms,refundPending:true};
  return deliverPaidOrder(env,paid,helpers);
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
  if(Number(request.headers.get("content-length")||0)>65536) return json({code:"FAIL",message:"请求过大"},413);
  const raw=await request.text(), bytes=enc.encode(raw).length;
  let notice={};try{notice=JSON.parse(raw)}catch{}
  const eventId=clean(notice.id,120);
  if(bytes>65536) {
    await logPaymentWebhook(env,{provider:"wechat",eventId,outcome:"rejected",message:"回调请求超过64KB",raw});
    return json({code:"FAIL",message:"请求过大"},413);
  }
  let verified=false;
  try { verified=await verifyWechatCallback(request,env,raw); } catch { verified=false; }
  if(!verified) {
    await logPaymentWebhook(env,{provider:"wechat",eventId,outcome:"rejected",message:"微信支付回调验签失败或验签密钥不可用",raw});
    return json({code:"FAIL",message:"签名验证失败"},401);
  }
  let orderNo="";
  try {
    const trade=await decryptWechatResource(notice.resource,env);
    orderNo=clean(trade.out_trade_no,80);
    if(trade.trade_state!=="SUCCESS") {
      await logPaymentWebhook(env,{provider:"wechat",eventId,orderNo,outcome:"ignored",message:"已验签，非成功交易状态："+clean(trade.trade_state,40),raw});
      return json({code:"SUCCESS",message:"已接收非成功状态"});
    }
    if(trade.mchid!==env.WECHATPAY_MCHID||trade.appid!==env.WECHATPAY_APPID||trade.amount?.currency!=="CNY") throw Error("微信商户、应用或币种不匹配");
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_no=?").bind(trade.out_trade_no).first();
    if(!order||order.payment_method!=="wechat"||Number(trade.amount?.total)!==Number(order.amount_cents)) throw Error("微信订单号或金额不匹配");
    const hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    await markOrderPaid(env,order,trade.transaction_id,notice.id,hash,helpers);
    await logPaymentWebhook(env,{provider:"wechat",eventId,orderNo,outcome:"accepted",message:"验签通过，到账已确认并完成授权发放",raw});
    return json({code:"SUCCESS",message:"成功"});
  } catch(error) {
    await logPaymentWebhook(env,{provider:"wechat",eventId,orderNo,outcome:"error",message:error.message||"回调处理失败",raw});
    return json({code:"FAIL",message:clean(error.message,120)||"处理失败"},400);
  }
}
async function handleAlipayNotify(request, env, helpers) {
  if(Number(request.headers.get("content-length")||0)>65536) return new Response("failure",{status:413});
  const raw=await request.text(),bytes=enc.encode(raw).length,params=Object.fromEntries(new URLSearchParams(raw).entries());
  const eventId=clean(params.notify_id,120),orderNo=clean(params.out_trade_no,80);
  if(bytes>65536) {
    await logPaymentWebhook(env,{provider:"alipay",eventId,orderNo,outcome:"rejected",message:"回调请求超过64KB",raw});
    return new Response("failure",{status:413});
  }
  let verified=false;
  try { verified=!!params.sign&&await rsaVerify(env.ALIPAY_PUBLIC_KEY_PEM,alipaySignContent(params),params.sign); } catch { verified=false; }
  if(!verified) {
    await logPaymentWebhook(env,{provider:"alipay",eventId,orderNo,outcome:"rejected",message:"支付宝回调验签失败或验签密钥不可用",raw});
    return new Response("failure",{status:401});
  }
  try {
    if(params.app_id!==env.ALIPAY_APP_ID) throw Error("支付宝应用ID不匹配");
    if(params.seller_id!==env.ALIPAY_SELLER_ID) throw Error("支付宝收款方不匹配");
    if(!["TRADE_SUCCESS","TRADE_FINISHED"].includes(params.trade_status)) {
      await logPaymentWebhook(env,{provider:"alipay",eventId,orderNo,outcome:"ignored",message:"已验签，非成功交易状态："+clean(params.trade_status,40),raw});
      return new Response("success",{headers:{"content-type":"text/plain; charset=utf-8"}});
    }
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_no=?").bind(params.out_trade_no).first();
    if(!order||order.payment_method!=="alipay"||Math.round(Number(params.total_amount)*100)!==Number(order.amount_cents)) throw Error("支付宝订单号或金额不匹配");
    const hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    await markOrderPaid(env,order,params.trade_no,params.notify_id||("alipay-"+params.trade_no),hash,helpers);
    await logPaymentWebhook(env,{provider:"alipay",eventId,orderNo,outcome:"accepted",message:"验签通过，到账已确认并完成授权发放",raw});
    return new Response("success",{headers:{"content-type":"text/plain; charset=utf-8"}});
  } catch(error) {
    await logPaymentWebhook(env,{provider:"alipay",eventId,orderNo,outcome:"error",message:error.message||"回调处理失败",raw});
    return new Response("failure",{status:400,headers:{"content-type":"text/plain; charset=utf-8"}});
  }
}

async function closeStaleOrders(env) {
  const now=Date.now();
  await env.DB.prepare("UPDATE orders SET status='closed',updated_ms=? WHERE status='pending' AND created_ms<?")
    .bind(now,now-7200000).run();
}
async function createOrder(request, env, body, helpers) {
  if(env.DUDU_SALES_ENABLED!=="true") throw Error("在线购买尚未开放");
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
  const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE device_hash=? AND status='pending' AND created_ms>?").bind(deviceHash,now-7200000).first();
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
async function listUserOrders(request,env,body,helpers) {
  await helpers.verifyDevice("order-list",body);
  const deviceHash=await consumeNonce(env,body,helpers);
  const result=await env.DB.prepare("SELECT order_id,order_no,product_name,amount_cents,payment_method,status,created_ms,paid_ms,delivered_ms FROM orders WHERE device_hash=? ORDER BY created_ms DESC LIMIT 20")
    .bind(deviceHash).all();
  const origin=new URL(request.url).origin;
  return json({orders:(result.results||[]).map(order=>({...order,delivered:!!order.delivered_ms,checkoutUrl:order.status==="pending"?new URL("/checkout/"+order.order_id,origin).toString():""}))});
}
async function reconcileUserOrder(request,env,body,helpers) {
  await helpers.verifyDevice("order-reconcile",body);
  const deviceHash=await consumeNonce(env,body,helpers);
  const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=? AND device_hash=?").bind(clean(body.orderId,80),deviceHash).first();
  if(!order) throw Error("订单不存在");
  if(order.status==="refunded") return json({status:"refunded",message:"订单已退款，不能自动发放授权"});
  if(order.status==="paid") {
    if(!order.delivered_ms) await deliverPaidOrder(env,order,helpers);
    const latest=await env.DB.prepare("SELECT delivered_ms FROM orders WHERE order_id=?").bind(order.order_id).first();
    return json({status:"paid",delivered:!!latest?.delivered_ms,message:latest?.delivered_ms?"付款已确认，永久授权已发放":"付款已确认，授权正在处理"});
  }
  if(!paymentReady(env,order.payment_method)) throw Error("对应支付商户密钥尚未完整配置");
  const result=order.payment_method==="wechat"?await queryWechatPayment(env,order,helpers):await queryAlipayPayment(env,order,helpers);
  await recordReconcileAttempt(env,order.order_id,result.status==="paid"?"":result.message||"");
  return json({...result,orderId:order.order_id});
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
async function paymentReturnPage(request,env) {
  const id=new URL(request.url).searchParams.get("order")||"";
  if(!/^[0-9a-f-]{36}$/i.test(id)) return new Response("订单编号无效",{status:400});
  const order=await env.DB.prepare("SELECT order_no,status,delivered_ms FROM orders WHERE order_id=?").bind(id).first();
  if(!order) return new Response("订单不存在",{status:404});
  const paid=order.status==="paid",delivered=!!order.delivered_ms;
  const title=delivered?"付款与授权已完成":paid?"付款已确认，授权处理中":"已返回支付页面";
  const message=delivered?"系统已收到支付平台确认，永久授权已自动发放。":paid?"系统已确认付款，授权正在处理。请返回独独AI工作台稍后刷新授权。":"如果你已经完成付款，请稍候返回独独AI工作台，系统会自动核对到账结果。请不要重复付款。";
  const page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html(title)+'</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1525;color:#edf4ff;font:16px Microsoft Yahei"><main style="max-width:520px;margin:20px;padding:30px;background:#172943;border:1px solid #345174;border-radius:16px;text-align:center"><h2>'+html(title)+'</h2><p>'+html(message)+'</p><p>订单号：'+html(order.order_no)+'</p><p>请关闭此页面并返回独独AI工作台。</p></main></body></html>';
  return new Response(page,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","x-content-type-options":"nosniff"}});
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

function isLocalTestRequest(request,env) {
  if(env.DUDU_TEST_MODE!=="local-only") return false;
  const host=new URL(request.url).hostname.toLowerCase().replace(/^\[|\]$/g,"");
  return host==="localhost"||host==="127.0.0.1"||host==="::1";
}

const localTestConsoleHtml = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>独独AI V1.3 本机支付模拟台</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1424;color:#e8eef9;font:15px "Microsoft YaHei",sans-serif;padding:24px}
main{max-width:760px;margin:auto}.panel{background:#14243a;border:1px solid #29415f;border-radius:14px;padding:20px;margin:14px 0}
h1{font-size:24px;margin:0 0 8px}.muted{color:#a9bad1}.warning{color:#ffd48a;background:#3b2b16;border:1px solid #705027;padding:12px;border-radius:9px}
input,select,button{font:inherit;border-radius:8px;padding:10px;border:1px solid #49617e;background:#0e1b2e;color:#eef4ff}
input,select{width:100%;margin:8px 0 14px}button{background:#315fba;border:0;margin:4px 6px 4px 0;cursor:pointer}button.secondary{background:#42536b}
pre{white-space:pre-wrap;word-break:break-word;background:#09111e;border-radius:9px;padding:14px;min-height:120px;overflow:auto}
a{color:#9bc1ff}
</style>
<main>
<h1>独独AI运营管理中心 V1.3｜本机模拟测试</h1>
<p class="muted">仅供本机开发验收 · 监听 127.0.0.1 · 不连接微信/支付宝 · 不发生真实扣款或退款</p>
<div class="warning">测试数据只写入本机 D1 状态目录。请勿将本测试配置部署到 Cloudflare，也不要填入正式商户密钥。</div>
<section class="panel">
<label>本机测试管理员令牌</label><input id="token" type="password" autocomplete="off" placeholder="粘贴启动命令输出的本机测试令牌">
<label>模拟支付渠道</label><select id="provider"><option value="wechat">微信支付流程（模拟）</option><option value="alipay">支付宝流程（模拟）</option></select>
<p><button onclick="createOrder()">1. 创建模拟订单</button><button onclick="markPaid()">2. 模拟支付成功并发放授权</button></p>
<p><button onclick="startRefund()">3. 发起模拟退款</button><button onclick="completeRefund()">4. 模拟退款成功并撤销授权</button><button class="secondary" onclick="failRefund()">模拟退款失败</button></p>
<p><a href="/admin" target="_blank" rel="noreferrer">打开运营管理后台</a></p>
</section>
<section class="panel"><strong>本次测试结果</strong><pre id="output">等待操作…</pre></section>
</main>
<script>
let orderId="",refundId="";
async function call(path,body){
 const token=document.getElementById("token").value.trim();
 if(!token){alert("请先粘贴本机测试管理员令牌");return null}
 const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify(body||{})});
 const data=await response.json().catch(()=>({error:"服务器返回非JSON"}));
 if(data.orderId)orderId=data.orderId;if(data.refundId)refundId=data.refundId;
 document.getElementById("output").textContent=JSON.stringify({httpStatus:response.status,data},null,2);
 return data;
}
async function createOrder(){await call("/v1/admin/test/orders/create",{productId:"v13-test-product",paymentMethod:document.getElementById("provider").value})}
async function markPaid(){if(!orderId){alert("请先创建模拟订单");return}await call("/v1/admin/test/payments/mark-paid",{orderId})}
async function startRefund(){if(!orderId){alert("请先创建并模拟支付成功");return}await call("/v1/admin/test/refunds/start",{orderId,reason:"本机 V1.3 退款流程验收"})}
async function completeRefund(){if(!refundId){alert("请先发起模拟退款");return}await call("/v1/admin/test/refunds/complete",{refundId})}
async function failRefund(){if(!refundId){alert("请先发起模拟退款");return}await call("/v1/admin/test/refunds/fail",{refundId})}
</script></html>`;

async function localTestAdminOps(req,env,path,body,helpers) {
  if(path==="/v1/admin/test/orders/create") {
    const productId=clean(body.productId,80)||"v13-test-product",method=body.paymentMethod;
    if(!["wechat","alipay"].includes(method)) return json({error:"模拟支付渠道无效"},400);
    const product=await env.DB.prepare("SELECT * FROM products WHERE product_id=? AND enabled=1").bind(productId).first();
    if(!product) return json({error:"本机测试商品不存在，请重新初始化本机测试环境"},404);
    const now=Date.now(),id=crypto.randomUUID(),number="DU-LOCAL-"+Date.now().toString(36).toUpperCase()+randomHex(6).toUpperCase();
    const deviceHash=hex(await crypto.subtle.digest("SHA-256",enc.encode("local-test-device:"+id)));
    await env.DB.prepare("INSERT INTO devices(device_hash,public_key,created_ms) VALUES(?,?,?)").bind(deviceHash,"LOCAL_TEST_ONLY",now).run();
    await env.DB.prepare("INSERT INTO orders(order_id,order_no,device_hash,product_id,product_name,amount_cents,payment_method,status,checkout_data,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,'pending','{}',?,?)")
      .bind(id,number,deviceHash,product.product_id,product.name,product.price_cents,method,now,now).run();
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES('local_test_order_create',?)").bind(now).run();
    return json({ok:true,orderId:id,orderNo:number,status:"pending",paymentMethod:method,productName:product.name,amountCents:product.price_cents,simulated:true},201);
  }
  if(path==="/v1/admin/test/payments/mark-paid") {
    const id=clean(body.orderId,80),order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(id).first();
    if(!order) return json({error:"本机测试订单不存在"},404);
    if(order.status==="refunded") return json({error:"订单已退款，不能再次模拟支付"},409);
    const eventId="local-test-paid-"+order.order_id;
    const raw=JSON.stringify({mode:"local-only",orderId:order.order_id,orderNo:order.order_no,paymentMethod:order.payment_method});
    const digest=hex(await crypto.subtle.digest("SHA-256",enc.encode(raw)));
    const delivery=await markOrderPaid(env,order,"LOCAL-TEST-TRADE-"+order.order_no,eventId,digest,helpers);
    await logPaymentWebhook(env,{provider:order.payment_method,eventId,orderNo:order.order_no,outcome:"accepted",message:"本机模拟支付成功（无真实资金）",raw});
    return json({ok:true,orderId:order.order_id,orderNo:order.order_no,status:"paid",simulated:true,...delivery});
  }
  if(path==="/v1/admin/test/refunds/start") {
    const id=clean(body.orderId,80),order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(id).first();
    if(!order) return json({error:"本机测试订单不存在"},404);
    if(order.status!=="paid") return json({error:"只有模拟支付成功的订单可以发起退款"},400);
    const active=await env.DB.prepare("SELECT refund_id,status FROM refunds WHERE order_id=? AND status IN ('processing','manual_review','succeeded') LIMIT 1").bind(id).first();
    if(active) return json({error:"该订单已有退款记录",refundId:active.refund_id,status:active.status},409);
    const now=Date.now(),refund={refund_id:crypto.randomUUID(),order_id:id,refund_no:"RF-LOCAL-"+randomHex(8).toUpperCase(),provider:order.payment_method,amount_cents:order.amount_cents,reason:clean(body.reason,200)||"本机模拟退款",status:"processing",created_ms:now,updated_ms:now};
    await env.DB.prepare("INSERT INTO refunds(refund_id,order_id,refund_no,provider,amount_cents,reason,status,created_ms,updated_ms) VALUES(?,?,?,?,?,?, 'processing',?,?)")
      .bind(refund.refund_id,refund.order_id,refund.refund_no,refund.provider,refund.amount_cents,refund.reason,now,now).run();
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES('local_test_refund_start',?)").bind(now).run();
    return json({ok:true,refundId:refund.refund_id,refundNo:refund.refund_no,status:"processing",amountCents:refund.amount_cents,simulated:true},202);
  }
  if(path==="/v1/admin/test/refunds/complete"||path==="/v1/admin/test/refunds/fail") {
    const refund=await env.DB.prepare("SELECT * FROM refunds WHERE refund_id=?").bind(clean(body.refundId,80)).first();
    if(!refund) return json({error:"本机测试退款记录不存在"},404);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(refund.order_id).first();
    if(!order) return json({error:"本机测试原订单不存在"},404);
    if(!["processing","manual_review"].includes(refund.status)) return json({error:"本机测试退款不处于可模拟处理状态"},409);
    if(path.endsWith("/complete")) {
      const result=await completeRefund(env,refund,"LOCAL_TEST_REFUND_SUCCESS","LOCAL-REFUND-"+refund.refund_no);
      await logPaymentWebhook(env,{provider:refund.provider,eventId:"local-test-refund-"+refund.refund_id,orderNo:order.order_no,outcome:"accepted",message:"本机模拟退款成功（无真实资金）",raw:JSON.stringify({mode:"local-only",refundId:refund.refund_id})});
      return json({ok:true,refundId:refund.refund_id,orderId:order.order_id,simulated:true,...result});
    }
    const result=await setRefundState(env,refund,{status:"failed",providerStatus:"LOCAL_TEST_FAILED",error:"本机模拟退款失败；未发生真实资金退款"});
    await logPaymentWebhook(env,{provider:refund.provider,eventId:"local-test-refund-failed-"+refund.refund_id,orderNo:order.order_no,outcome:"ignored",message:"本机模拟退款失败（无真实资金）",raw:JSON.stringify({mode:"local-only",refundId:refund.refund_id})});
    return json({ok:true,refundId:refund.refund_id,orderId:order.order_id,simulated:true,...result});
  }
  return json({error:"未知本机测试操作"},404);
}

async function adminOps(req, env, path, helpers) {
  if(path.startsWith("/v1/admin/test/")) {
    if(!isLocalTestRequest(req,env)) return json({error:"Not found"},404);
    if(!await helpers.adminAuth(req,env)) return json({error:"管理员身份验证失败"},401);
    const testBody=await req.json().catch(()=>({}));
    return localTestAdminOps(req,env,path,testBody,helpers);
  }
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
  if(path==="/v1/admin/finance/summary") {
    const now=Date.now(),startMs=Number.isSafeInteger(body.startMs)?Math.max(0,body.startMs):now-30*24*60*60*1000,endMs=Number.isSafeInteger(body.endMs)?body.endMs:now;
    if(endMs<=startMs||endMs-startMs>366*24*60*60*1000) return json({error:"统计日期范围无效，最多查询366天"},400);
    const [paid,refunds,channels,products,pendingRefunds]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM orders WHERE status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<?").bind(startMs,endMs).first(),
      env.DB.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM refunds WHERE status='succeeded' AND succeeded_ms>=? AND succeeded_ms<?").bind(startMs,endMs).first(),
      env.DB.prepare("SELECT payment_method AS provider,COUNT(*) AS orders,COALESCE(SUM(amount_cents),0) AS gross_cents FROM orders WHERE status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<? GROUP BY payment_method").bind(startMs,endMs).all(),
      env.DB.prepare("SELECT product_id,product_name,COUNT(*) AS orders,COALESCE(SUM(amount_cents),0) AS gross_cents FROM orders WHERE status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<? GROUP BY product_id,product_name ORDER BY gross_cents DESC LIMIT 10").bind(startMs,endMs).all(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM refunds WHERE status IN ('processing','manual_review')").first()
    ]);
    const grossCents=Number(paid?.cents||0),refundsCents=Number(refunds?.cents||0);
    return json({startMs,endMs,paidOrders:Number(paid?.n||0),grossCents,refundCount:Number(refunds?.n||0),refundsCents,netCents:grossCents-refundsCents,pendingRefunds:Number(pendingRefunds?.n||0),channels:channels.results||[],products:products.results||[]});
  }
  if(path==="/v1/admin/refunds/list") {
    const result=await env.DB.prepare("SELECT r.refund_id,r.refund_no,r.provider,r.amount_cents,r.reason,r.status,r.provider_refund_id,r.provider_status,r.attempts,r.last_checked_ms,r.last_error,r.created_ms,r.updated_ms,r.succeeded_ms,o.order_no,o.product_name,o.status AS order_status FROM refunds r JOIN orders o ON o.order_id=r.order_id ORDER BY r.created_ms DESC LIMIT 200").all();
    return json({refunds:result.results||[]});
  }
  if(path==="/v1/admin/refunds/create") return createAdminRefund(req,env,body);
  if(path==="/v1/admin/refunds/reconcile") return reconcileAdminRefund(env,body.refundId);
  if(path==="/v1/admin/orders/list") {
    await closeStaleOrders(env);
    const result=await env.DB.prepare("SELECT o.order_id,o.order_no,o.product_name,o.amount_cents,o.payment_method,o.status,o.created_ms,o.paid_ms,o.delivered_ms,o.last_error,d.status AS delivery_status,(SELECT r.status FROM refunds r WHERE r.order_id=o.order_id ORDER BY r.created_ms DESC LIMIT 1) AS refund_status,(SELECT r.refund_id FROM refunds r WHERE r.order_id=o.order_id ORDER BY r.created_ms DESC LIMIT 1) AS refund_id FROM orders o LEFT JOIN delivery_outbox d ON d.order_id=o.order_id ORDER BY o.created_ms DESC LIMIT 300").all();
    return json({orders:result.results||[]});
  }
  if(path==="/v1/admin/orders/reconcile") {
    const id=clean(body.orderId,80);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(id).first();
    if(!order) return json({error:"订单不存在"},404);
    if(order.status==="refunded") return json({status:"refunded",message:"订单已退款，不能自动发放授权"});
    if(order.status==="paid") {
      const refund=await env.DB.prepare("SELECT status FROM refunds WHERE order_id=? AND status IN ('processing','manual_review','succeeded') LIMIT 1").bind(order.order_id).first();
      if(refund) return json({status:"refund_processing",delivered:!!order.delivered_ms,message:"订单退款处理中或等待人工核对，暂不执行授权补发"});
      if(!order.delivered_ms) await deliverPaidOrder(env,order,helpers);
      return json({status:"paid",delivered:true,message:"订单已确认付款"});
    }
    if(!paymentReady(env,order.payment_method)) throw Error("对应支付商户密钥尚未完整配置");
    const result=order.payment_method==="wechat"?await queryWechatPayment(env,order,helpers):await queryAlipayPayment(env,order,helpers);
    await recordReconcileAttempt(env,order.order_id,result.status==="paid"?"":result.message||"");
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES(?,?)").bind("payment_reconcile_"+result.status,Date.now()).run();
    if(result.status!=="paid"&&result.message) await env.DB.prepare("UPDATE orders SET last_error=?,updated_ms=? WHERE order_id=?").bind(clean(result.message,240),Date.now(),order.order_id).run();
    return json({...result,orderId:id});
  }
  if(path==="/v1/admin/orders/resend") {
    const id=clean(body.orderId,80);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE order_id=?").bind(id).first();
    if(!order||order.status!=="paid") return json({error:"仅已支付订单可以补发"},400);
    await deliverPaidOrder(env,order,helpers);
    return json({ok:true,delivered:true});
  }
  if(path==="/v1/admin/audit/list") {
    const result=await env.DB.prepare("SELECT id,event,card_id,occurred_ms FROM admin_audit ORDER BY occurred_ms DESC LIMIT 200").all();
    return json({events:result.results||[]});
  }
  if(path==="/v1/admin/payments/health") {
    const since=Date.now()-24*60*60*1000;
    const [pending,undelivered,failedDeliveries,failedWebhooks,webhookCounts,lastWechat,lastAlipay,lastReconcile,lastWechatRefund] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='pending'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='paid' AND delivered_ms IS NULL").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM delivery_outbox WHERE status IN ('pending','failed')").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM payment_webhook_logs WHERE outcome IN ('rejected','error') AND occurred_ms>?").bind(since).first(),
      env.DB.prepare("SELECT provider,outcome,COUNT(*) AS n FROM payment_webhook_logs WHERE occurred_ms>? GROUP BY provider,outcome").bind(since).all(),
      env.DB.prepare("SELECT occurred_ms,outcome,message FROM payment_webhook_logs WHERE provider='wechat' AND message NOT LIKE '%退款回调%' ORDER BY occurred_ms DESC LIMIT 1").first(),
      env.DB.prepare("SELECT occurred_ms,outcome,message FROM payment_webhook_logs WHERE provider='alipay' ORDER BY occurred_ms DESC LIMIT 1").first(),
      env.DB.prepare("SELECT MAX(last_checked_ms) AS checked_ms, SUM(attempts) AS attempts FROM payment_reconcile_state").first(),
      env.DB.prepare("SELECT event_id,occurred_ms,outcome,message FROM payment_webhook_logs WHERE provider='wechat' AND message LIKE '%退款回调%' ORDER BY occurred_ms DESC LIMIT 1").first()
    ]);
    const origin=new URL(req.url).origin;
    return json({
      pendingOrders:pending?.n||0,paidUndelivered:undelivered?.n||0,failedDeliveries:failedDeliveries?.n||0,
      failedWebhooks24h:failedWebhooks?.n||0,webhookCounts24h:webhookCounts.results||[],
      lastWebhook:{wechat:lastWechat||null,alipay:lastAlipay||null,wechatRefund:lastWechatRefund||null},
      reconciliation:{lastCheckedMs:lastReconcile?.checked_ms||null,totalAttempts:lastReconcile?.attempts||0},
      callbacks:{
        wechat:safeHttps(env.WECHATPAY_NOTIFY_URL)||origin+"/v1/payments/wechat/notify",
        wechatRefund:safeHttps(env.WECHATPAY_REFUND_NOTIFY_URL)||origin+"/v1/payments/wechat/refund-notify",
        alipay:safeHttps(env.ALIPAY_NOTIFY_URL)||origin+"/v1/payments/alipay/notify"
      },
      providers:{wechat:paymentReady(env,"wechat"),alipay:paymentReady(env,"alipay")}
    });
  }
  if(path==="/v1/admin/payments/events/list") {
    const result=await env.DB.prepare("SELECT id,provider,event_id,order_no,outcome,message,payload_sha256,occurred_ms FROM payment_webhook_logs ORDER BY occurred_ms DESC LIMIT 200").all();
    return json({events:result.results||[]});
  }
  if(path==="/v1/admin/deliveries/list") {
    const result=await env.DB.prepare("SELECT d.delivery_id,o.order_id,d.card_id,d.last_four,COALESCE(d.status,'pending') AS status,COALESCE(d.attempts,0) AS attempts,COALESCE(d.created_ms,o.paid_ms) AS created_ms,d.delivered_ms,COALESCE(d.last_error,o.last_error,'') AS last_error,o.order_no,o.product_name,o.amount_cents,o.status AS order_status FROM orders o LEFT JOIN delivery_outbox d ON d.order_id=o.order_id WHERE (o.status='paid' AND o.delivered_ms IS NULL) OR d.status IN ('pending','failed') ORDER BY CASE WHEN COALESCE(d.status,'pending') IN ('failed','pending') THEN 0 ELSE 1 END,COALESCE(d.created_ms,o.paid_ms) DESC LIMIT 200").all();
    return json({deliveries:result.results||[]});
  }
  if(path==="/v1/admin/payments/self-test") {
    const [wechat,alipay]=await Promise.all([paymentSelfTest(env,"wechat"),paymentSelfTest(env,"alipay")]);
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES('payment_local_self_test',?)").bind(Date.now()).run();
    return json({wechat,alipay,note:"本地密钥自检不等于支付平台在线连通性测试；不会创建订单或扣款。"});
  }
  if(path==="/v1/admin/payments/reconcile/run") {
    const last=await env.DB.prepare("SELECT occurred_ms FROM admin_audit WHERE event='manual_payment_reconcile' ORDER BY occurred_ms DESC LIMIT 1").first();
    if(last?.occurred_ms&&Date.now()-last.occurred_ms<60000) return json({error:"手动补偿操作间隔至少60秒"},429);
    const result=await runScheduledReconciliation(env,helpers);
    await env.DB.prepare("INSERT INTO admin_audit(event,occurred_ms) VALUES(?,?)").bind("manual_payment_reconcile",Date.now()).run();
    return json({ok:true,...result});
  }
  if(path==="/v1/admin/payments/status") {
    return json({salesEnabled:env.DUDU_SALES_ENABLED==="true",wechat:{configured:paymentReady(env,"wechat"),required:["WECHATPAY_MCHID","WECHATPAY_APPID","WECHATPAY_SERIAL_NO","WECHATPAY_PRIVATE_KEY_PEM","WECHATPAY_API_V3_KEY","WECHATPAY_PLATFORM_PUBLIC_KEY_PEM","WECHATPAY_PLATFORM_SERIAL"]},alipay:{configured:paymentReady(env,"alipay"),required:["ALIPAY_APP_ID","ALIPAY_PRIVATE_KEY_PEM","ALIPAY_PUBLIC_KEY_PEM","ALIPAY_SELLER_ID"]}});
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

  const signedDevicePaths=new Set(["/v1/application/create","/v1/application/status","/v1/orders/create","/v1/orders/status","/v1/orders/list","/v1/orders/reconcile"]);
  if(request.method==="POST"&&(signedDevicePaths.has(path)||path.startsWith("/v1/admin/"))) {
    const limit=path.startsWith("/v1/admin/content/")?65536:8192;
    if(Number(request.headers.get("content-length")||0)>limit) return json({error:"请求过大"},413);
    if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json")) return json({error:"请求必须为JSON"},415);
  }
  if(path==="/__test"&&request.method==="GET") {
    if(!isLocalTestRequest(request,env)) return new Response("Not found",{status:404});
    return new Response(localTestConsoleHtml,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'","x-content-type-options":"nosniff"}});
  }
  if(path==="/manifest.json"&&request.method==="GET") {
    return json(await loadCurrentManifest(env),200,{"cache-control":"public,max-age=60"});
  }
  if(path==="/v1/products"&&request.method==="GET") {
    const result=await env.DB.prepare("SELECT product_id,name,description,price_cents,entitlement_type FROM products WHERE enabled=1 ORDER BY sort_order,created_ms DESC").all();
    const salesEnabled=env.DUDU_SALES_ENABLED==="true";
    return json({products:result.results||[],paymentMethods:{wechat:salesEnabled&&paymentReady(env,"wechat"),alipay:salesEnabled&&paymentReady(env,"alipay")}},200,{"cache-control":"public,max-age=30"});
  }
  if(path==="/checkout"||path.startsWith("/checkout/")) {
    if(request.method!=="GET") return new Response("Method not allowed",{status:405});
    const id=path.slice("/checkout/".length);
    if(!/^[0-9a-f-]{36}$/i.test(id)) return new Response("订单不存在",{status:404});
    return checkoutPage(request,env,id);
  }
  if(path==="/payment/return"&&request.method==="GET") return paymentReturnPage(request,env);
  if(path==="/v1/payments/wechat/notify"&&request.method==="POST") return handleWechatNotify(request,env,helpers);
  if(path==="/v1/payments/alipay/notify"&&request.method==="POST") return handleAlipayNotify(request,env,helpers);
  if(path==="/v1/payments/wechat/refund-notify"&&request.method==="POST") return handleWechatRefundNotify(request,env);
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
  if(path==="/v1/orders/list"&&request.method==="POST") {
    try { return await listUserOrders(request,env,await request.json(),helpers); }
    catch(e) { return json({error:clean(e.message,180)||"订单列表读取失败"},400); }
  }
  if(path==="/v1/orders/reconcile"&&request.method==="POST") {
    try { return await reconcileUserOrder(request,env,await request.json(),helpers); }
    catch(e) { return json({error:clean(e.message,180)||"支付核对失败"},400); }
  }
  if(path.startsWith("/v1/admin/")&&!path.startsWith("/v1/admin/cards/")&&request.method==="POST") {
    try { return await adminOps(request,env,path,helpers); }
    catch(e) { return json({error:clean(e.message,180)||"管理操作失败"},400); }
  }
  return null;
}
