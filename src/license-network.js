'use strict';
// Electron's Chromium network stack follows the current Windows proxy/PAC.
// Keep authorization requests in the main process and never send app cookies.
const MAX_RESPONSE=32768;

function createElectronLicenseTransport(fetchImpl){
 if(typeof fetchImpl!=='function')throw TypeError('Electron net.fetch is required');
 function target(service,endpoint){
  const base=new URL(service);
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
   throw Error('正式授权服务必须使用 HTTPS');
  const url=new URL(endpoint,base);
  if(url.protocol!=='https:'||url.origin!==base.origin||url.username||url.password||url.hash)
   throw Error('授权请求地址不匹配');
  return url.toString();
 }
 async function readJson(response){
  const chunks=[];let length=0;
  const reader=response.body?.getReader?.();
  if(reader){
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.byteLength;
    if(length>MAX_RESPONSE){await reader.cancel().catch(()=>{});throw Error('授权响应过大')}
    chunks.push(Buffer.from(value));
   }
  }else{
   const raw=Buffer.from(await response.text(),'utf8');
   if(raw.length>MAX_RESPONSE)throw Error('授权响应过大');
   chunks.push(raw);
  }
  let result;
  try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
  catch{throw Error('授权服务返回无效 JSON')}
  if(response.status<200||response.status>=300){
   const detail=String(result?.error||result?.reason||'授权服务异常').slice(0,120);
   throw Error('授权服务异常（HTTP '+response.status+'）：'+detail);
  }
  return result;
 }
 async function request(service,endpoint,data){
  const url=target(service,endpoint);
  const body=data===undefined?undefined:JSON.stringify(data);
  if(body!==undefined&&Buffer.byteLength(body)>8192)throw Error('授权请求过长');
  const options={method:body===undefined?'GET':'POST',redirect:'error',credentials:'omit',cache:'no-store',
   signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}};
  if(body!==undefined){options.headers['content-type']='application/json';options.body=body}
  let response;
  try{response=await fetchImpl(url,options)}
  catch(error){
   if(error?.name==='TimeoutError'||error?.name==='AbortError')throw Error('授权服务连接超时');
   throw Error('授权网络请求失败：'+String(error?.cause?.code||error?.code||error?.name||'network-error').slice(0,48));
  }
  return readJson(response);
 }
 return {post:(service,endpoint,data)=>request(service,endpoint,data),
  getJson:(service,endpoint)=>request(service,endpoint)};
}

module.exports={createElectronLicenseTransport};
