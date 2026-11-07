/** Official/OpenAI-compatible API transport. API keys never enter SQLite or renderer. */
export class CompatibleApiClient {
  constructor({baseUrl=process.env.MAI_API_BASE_URL||'http://127.0.0.1:3000/v1',apiKey=process.env.MAI_API_KEY||'',fetchImpl=globalThis.fetch,timeoutMs=180000}={}) {
    const raw=String(baseUrl).replace(/\/+$/,'')+'/';
    const parsed=new URL(raw);
    if(parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('API地址不能包含账号密码或查询参数');
    if(!(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))))throw new Error('API需使用HTTPS，或本机localhost HTTP');
    this.endpoint=new URL('chat/completions',parsed).toString();
    this.publicBase=parsed.toString();
    this.key=String(apiKey).trim();
    this.fetch=fetchImpl;
    this.timeoutMs=timeoutMs;
  }
  get configured(){return !!this.key;}
  async chat({model,prompt,signal}){
    if(!this.configured)throw new Error('尚未配置 MAI_API_KEY；API请求未发送');
    if(typeof model!=='string'||!model.trim())throw new Error('缺少真实模型ID');
    if(typeof prompt!=='string'||!prompt.trim())throw new Error('提示词不能为空');
    const timeout=AbortSignal.timeout(this.timeoutMs);
    const abort=signal?AbortSignal.any([signal,timeout]):timeout;
    const res=await this.fetch(this.endpoint,{method:'POST',headers:{'Authorization':'Bearer '+this.key,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],stream:false}),signal:abort});
    if(!res.ok){
      let code='';
      try{const err=await res.json();code=String(err?.error?.code||err?.code||'').slice(0,60)}catch{}
      throw new Error('API请求失败 HTTP '+res.status+(code?' ('+code+')':'')+'，请在上游账单确认是否计费');
    }
    const data=await res.json();
    const msg=data?.choices?.[0]?.message?.content;
    const content=typeof msg==='string'?msg:Array.isArray(msg)?msg.filter(x=>x.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n'):'';
    if(!content.trim())throw new Error('API返回了空内容，已阻止自动推进');
    return {content,usage:data.usage||null,model:data.model||model,requestId:data.id||null};
  }
}
