// Official WeChat Pay API v3 (Native) and Alipay OpenAPI (RSA2).
// Merchant credentials are Cloudflare Worker secrets only; never returned to clients.
const enc=new TextEncoder();
const b64=s=>Uint8Array.from(atob(String(s).replace(/\s/g,'')),c=>c.charCodeAt(0));
function pemBytes(value){
 const s=String(value||'').replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g,'');
 if(!s)throw Error('支付商户密钥未配置');
 return b64(s);
}
function ready(values){return values.every(v=>typeof v==='string'&&v.trim().length>0)}
function validNotifyUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.port==='' }catch{return false}
}
export function paymentReadiness(env){
 return {
  wechat:ready([env.WECHAT_PAY_APP_ID,env.WECHAT_PAY_MCH_ID,env.WECHAT_PAY_CERT_SERIAL,env.WECHAT_PAY_PRIVATE_KEY_PEM,env.WECHAT_PAY_API_V3_KEY,env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM])&&String(env.WECHAT_PAY_API_V3_KEY).length===32&&validNotifyUrl(env.WECHAT_PAY_NOTIFY_URL),
  alipay:ready([env.ALIPAY_APP_ID,env.ALIPAY_PRIVATE_KEY_PEM,env.ALIPAY_PUBLIC_KEY_PEM])&&validNotifyUrl(env.ALIPAY_NOTIFY_URL)
 };
}
async function rsaSign(pem,message){
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(message));
 return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
async function rsaVerify(pem,message,signature){
 const key=await crypto.subtle.importKey('spki',pemBytes(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64(signature),enc.encode(message));
}
const nonce=()=>crypto.randomUUID().replace(/-/g,'');
const stamp=()=>String(Math.floor(Date.now()/1000));
async function wechatRequest(env,path,body){
 const ts=stamp(),n=nonce(),raw=JSON.stringify(body),message='POST\n'+path+'\n'+ts+'\n'+n+'\n'+raw+'\n';
 const signature=await rsaSign(env.WECHAT_PAY_PRIVATE_KEY_PEM,message);
 const auth='WECHATPAY2-SHA256-RSA2048 mchid="'+env.WECHAT_PAY_MCH_ID+'",nonce_str="'+n+'",timestamp="'+ts+'",serial_no="'+env.WECHAT_PAY_CERT_SERIAL+'",signature="'+signature+'"';
 const res=await fetch('https://api.mch.weixin.qq.com'+path,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json','Accept':'application/json'},body:raw,signal:AbortSignal.timeout(15000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error('微信支付下单失败：'+String(data.message||data.code||res.status).slice(0,160));
 return data;
}
export async function createWechatPayment(env,order){
 if(!paymentReadiness(env).wechat)throw Error('微信支付商户参数尚未配置');
 const body={appid:env.WECHAT_PAY_APP_ID,mchid:env.WECHAT_PAY_MCH_ID,description:String(order.productName||'独独AI数字商品').slice(0,120),out_trade_no:order.orderNo,notify_url:env.WECHAT_PAY_NOTIFY_URL,time_expire:new Date(Date.now()+15*60*1000).toISOString(),amount:{total:order.amountFen,currency:'CNY'}};
 const result=await wechatRequest(env,'/v3/pay/transactions/native',body);
 if(typeof result.code_url!=='string'||!result.code_url.startsWith('weixin://'))throw Error('微信支付未返回有效二维码内容');
 return {provider:'wechat',qrText:result.code_url};
}
function alipayCanonical(params){
 return Object.keys(params).filter(k=>k!=='sign'&&k!=='sign_type'&&params[k]!==undefined&&params[k]!==null&&params[k]!=='')
  .sort().map(k=>k+'='+params[k]).join('&');
}
async function alipayRequest(env,method,bizContent){
 if(!paymentReadiness(env).alipay)throw Error('支付宝商户参数尚未配置');
 const params={app_id:env.ALIPAY_APP_ID,method,format:'JSON',charset:'utf-8',sign_type:'RSA2',timestamp:new Date().toISOString().replace('T',' ').slice(0,19),version:'1.0',notify_url:env.ALIPAY_NOTIFY_URL,biz_content:JSON.stringify(bizContent)};
 params.sign=await rsaSign(env.ALIPAY_PRIVATE_KEY_PEM,alipayCanonical(params));
 const form=new URLSearchParams(params);
 const gateway=String(env.ALIPAY_GATEWAY||'https://openapi.alipay.com/gateway.do');
 if(!/^https:\/\/openapi\.alipay\.com\/gateway\.do$/.test(gateway))throw Error('支付宝网关必须使用官方 HTTPS 地址');
 const res=await fetch(gateway,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=utf-8'},body:form.toString(),signal:AbortSignal.timeout(15000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error('支付宝下单请求失败：HTTP '+res.status);
 const payload=data[method.replaceAll('.','_')+'_response'];
 if(payload?.code!=='10000')throw Error('支付宝下单失败：'+String(payload?.sub_msg||payload?.msg||payload?.code||'响应无效').slice(0,160));
 return payload;
}
export async function createAlipayPayment(env,order){
 const result=await alipayRequest(env,'alipay.trade.precreate',{out_trade_no:order.orderNo,total_amount:(order.amountFen/100).toFixed(2),subject:String(order.productName||'独独AI数字商品').slice(0,128),timeout_express:'15m'});
 if(typeof result.qr_code!=='string'||!result.qr_code.startsWith('https://'))throw Error('支付宝未返回有效二维码内容');
 return {provider:'alipay',qrText:result.qr_code};
}
export async function verifyWechatPaymentCallback(request,env){
 const raw=await request.text();
 if(raw.length>65536)throw Error('微信支付通知过大');
 const headers=request.headers,ts=headers.get('Wechatpay-Timestamp')||'',n=headers.get('Wechatpay-Nonce')||'',sig=headers.get('Wechatpay-Signature')||'',serial=headers.get('Wechatpay-Serial')||'';
 if(!/^\d{10}$/.test(ts)||!n||!sig||!serial)throw Error('微信支付通知签名头缺失');
 if(env.WECHAT_PAY_PLATFORM_SERIAL&&serial!==env.WECHAT_PAY_PLATFORM_SERIAL)throw Error('微信支付平台证书序列号不匹配');
 if(Math.abs(Date.now()/1000-Number(ts))>86400)throw Error('微信支付通知时间超出有效范围');
 const valid=await rsaVerify(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM,ts+'\n'+n+'\n'+raw+'\n',sig);
 if(!valid)throw Error('微信支付通知签名验证失败');
 const event=JSON.parse(raw);
 if(event.event_type!=='TRANSACTION.SUCCESS'||!event.resource)throw Error('微信支付通知不是成功交易');
 const key=enc.encode(String(env.WECHAT_PAY_API_V3_KEY||''));
 if(key.length!==32)throw Error('微信支付APIv3密钥未正确配置');
 const cryptoKey=await crypto.subtle.importKey('raw',key,{name:'AES-GCM'},false,['decrypt']);
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:enc.encode(event.resource.nonce),additionalData:enc.encode(event.resource.associated_data||''),tagLength:128},cryptoKey,b64(event.resource.ciphertext));
 return {eventId:String(event.id||''),transaction:JSON.parse(new TextDecoder().decode(clear))};
}
export async function verifyAlipayPaymentCallback(request,env){
 const raw=await request.text();
 if(raw.length>65536)throw Error('支付宝通知过大');
 const params=Object.fromEntries(new URLSearchParams(raw));
 const signature=params.sign||'';
 if(!signature||params.sign_type!=='RSA2')throw Error('支付宝签名字段缺失');
 if(params.app_id!==env.ALIPAY_APP_ID)throw Error('支付宝应用ID不匹配');
 if(!await rsaVerify(env.ALIPAY_PUBLIC_KEY_PEM,alipayCanonical(params),signature))throw Error('支付宝通知签名验证失败');
 return {eventId:String(params.notify_id||params.trade_no||''),transaction:params};
}
