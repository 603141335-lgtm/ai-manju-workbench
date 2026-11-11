'use strict';
// OpenAI-compatible text API client. User's key and settings stay only on this Windows profile.
// Never sends Doubao cookies, prompts, photos or local project files automatically.
const fs=require('node:fs');
const path=require('node:path');
const https=require('node:https');
const {safeHttps}=require('./notice-service');
const PROVIDERS=Object.freeze({
  openai:'https://api.openai.com/v1',
  deepseek:'https://api.deepseek.com/v1',
  volcengine:'https://ark.cn-beijing.volces.com/api/v3',
  custom:''
});
function validateEndpoint(value){
  const v=String(value||'').trim();
  const clean=safeHttps(v);
  if(!clean)throw Error('API 地址必须是公网 HTTPS 地址，不能使用本地或内网地址');
  const url=new URL(clean);
  if(url.search||url.hash||/\/(?:chat\/completions|models)\/?$/i.test(url.pathname))throw Error('请填写 API 基础地址，例如 https://api.example.com/v1');
  if(/(?:^|\.)local$/i.test(url.hostname))throw Error('不支持本地网络地址');
  return url.origin+url.pathname.replace(/\/+$/,'');
}
const shortText=(v,n)=>String(v||'').trim().slice(0,n);
function requestJSON(url,method,headers,payload,timeout=9000){
  return new Promise((resolve,reject)=>{
    const body=payload?Buffer.from(JSON.stringify(payload),'utf8'):null;
    let size=0;const chunks=[];
    const req=https.request(url,{method,headers:{Accept:'application/json',...headers,...(body?{'Content-Type':'application/json','Content-Length':body.length}: {})}},res=>{
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>256*1024){req.destroy(Error('API 响应过大'));return;}
        chunks.push(chunk);
      });
      res.on('error',reject);
      res.on('end',()=>{
        const raw=Buffer.concat(chunks).toString('utf8');
        let result={};
        try{result=JSON.parse(raw)}catch{}
        if(res.statusCode<200||res.statusCode>=300){
          // Never pass user headers or keys to the renderer or logs.
          return reject(Error('API HTTP '+res.statusCode+'：'+shortText(result?.error?.message||'接口返回失败',200)));
        }
        resolve(result);
      });
    });
    req.setTimeout(timeout,()=>req.destroy(Error('API 连接超时')));
    req.on('error',reject);
    if(body)req.write(body);
    req.end();
  });
}
class ApiSettings{
  constructor({file,safeStorage,transport=requestJSON}={}){
    if(!file||!safeStorage)throw Error('API 配置缺少存储服务');
    this.file=file;this.safeStorage=safeStorage;this.transport=transport;
    this.data={provider:'custom',endpoint:'',model:'',encryptedKey:''};this.load();
  }
  load(){
    try{
      const st=fs.statSync(this.file);if(st.size>32*1024)return;
      const o=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(!o||typeof o!=='object')return;
      this.data={
        provider:PROVIDERS.hasOwnProperty(o.provider)?o.provider:'custom',
        endpoint:shortText(o.endpoint,350),model:shortText(o.model,120),
        encryptedKey:typeof o.encryptedKey==='string'?o.encryptedKey.slice(0,16000):''
      };
    }catch{}
  }
  snapshot(){
    return {provider:this.data.provider,endpoint:this.data.endpoint,model:this.data.model,
      hasKey:!!this.data.encryptedKey,secureStorageAvailable:this.safeStorage.isEncryptionAvailable(),
      availableProviders:PROVIDERS};
  }
  async save({provider,endpoint,model,key,clearKey}={}){
    if(!Object.prototype.hasOwnProperty.call(PROVIDERS,provider))throw Error('API 服务商不支持');
    const apiBase=validateEndpoint(endpoint||PROVIDERS[provider]);
    const apiModel=shortText(model,120);
    if(!apiModel)throw Error('请填写模型 ID');
    let encryptedKey=this.data.encryptedKey;
    if(clearKey===true)encryptedKey='';
    if(typeof key==='string'&&key.trim()){
      if(key.trim().length>4096)throw Error('API Key 太长');
      if(!this.safeStorage.isEncryptionAvailable())throw Error('当前设备无法加密保存 API Key，请检查 Windows 安全环境');
      encryptedKey=this.safeStorage.encryptString(key.trim()).toString('base64');
    }
    this.data={provider,endpoint:apiBase,model:apiModel,encryptedKey};
    await fs.promises.mkdir(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.tmp';await fs.promises.writeFile(temp,JSON.stringify(this.data),'utf8');
    await fs.promises.rename(temp,this.file);
    return this.snapshot();
  }
  getCredentials(){
    if(!this.data.endpoint)throw Error('请先保存 API 地址');
    if(!this.data.model)throw Error('请先设置模型 ID');
    if(!this.data.encryptedKey)throw Error('请填写并保存 API Key');
    if(!this.safeStorage.isEncryptionAvailable())throw Error('Windows 当前无法解密 API Key');
    let key;
    try{key=this.safeStorage.decryptString(Buffer.from(this.data.encryptedKey,'base64'))}
    catch{throw Error('API Key 无法解密，请重新输入并保存')}
    return {endpoint:validateEndpoint(this.data.endpoint),model:this.data.model,key};
  }
  async check(){
    const {endpoint,key}=this.getCredentials();
    const result=await this.transport(endpoint+'/models','GET',{Authorization:'Bearer '+key},null,9000);
    const models=Array.isArray(result?.data)?result.data.length:null;
    return {ok:true,message:'API 已连通'+(models===null?'':'，服务器返回 '+models+' 个模型')+'。当前仅验证 /models 接口，不代表所有模型都可调用。'};
  }
  async chat(prompt){
    const input=shortText(prompt,4000);
    if(!input)throw Error('请输入要测试的文字');
    const {endpoint,model,key}=this.getCredentials();
    const json=await this.transport(endpoint+'/chat/completions','POST',
      {Authorization:'Bearer '+key},
      {model,messages:[{role:'user',content:input}],max_tokens:160},20000);
    const output=json?.choices?.[0]?.message?.content;
    if(typeof output!=='string'||!output.trim())throw Error('API 未返回可用的文本回复');
    return {ok:true,text:output.slice(0,5000),model,usage:json?.usage&&typeof json.usage==='object'?
      {total_tokens:Math.max(0,Number(json.usage.total_tokens)||0)}:null};
  }
}
module.exports={ApiSettings,PROVIDERS,validateEndpoint,requestJSON};
