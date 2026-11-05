'use strict';
// Local-only relay for the Manju Edge extension. No remote requests, browser cookies, or passwords.
const http=require('http');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

function createLinkStore(filename,profileExists=()=>true){
  let state={tokens:{},jobs:{},selectedProfile:null};
  try{
    const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(parsed&&typeof parsed==='object'){
      state.tokens=parsed.tokens&&typeof parsed.tokens==='object'?parsed.tokens:{};
      state.jobs=parsed.jobs&&typeof parsed.jobs==='object'?parsed.jobs:{};
      state.selectedProfile=parsed.selectedProfile||null;
    }
  }catch{}
  const persist=()=>{
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    const tmp=filename+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');
    fs.renameSync(tmp,filename);
  };
  const forProfile=p=>profileExists(p);
  function tokenFor(profileId){
    if(!forProfile(profileId))throw Error('Edge 用户资料不存在');
    if(!state.tokens[profileId]){
      state.tokens[profileId]={token:crypto.randomBytes(24).toString('hex'),lastSeen:null};
      persist();
    }
    return state.tokens[profileId].token;
  }
  function profileByToken(token){
    if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return null;
    for(const [id,value] of Object.entries(state.tokens)){
      if(!value||typeof value.token!=='string'||value.token.length!==token.length)continue;
      if(crypto.timingSafeEqual(Buffer.from(value.token),Buffer.from(token)))return id;
    }
    return null;
  }
  function selectProfile(profileId){
    if(!forProfile(profileId))throw Error('请选择有效的 Edge 用户');
    state.selectedProfile=profileId;persist();return profileId;
  }
  function enqueue(profileId,prompt){
    if(!forProfile(profileId))throw Error('Edge 用户不存在');
    if(!prompt||!Number.isSafeInteger(prompt.episode)||prompt.episode<1||
      !Number.isSafeInteger(prompt.segment)||prompt.segment<1||
      typeof prompt.prompt!=='string'||!prompt.prompt.trim()||prompt.prompt.length>250000)
      throw Error('提示词段落信息无效');
    const old=state.jobs[profileId];
    if(old&&old.status!=='filled')old.status='replaced';
    const job={id:crypto.randomUUID(),profileId,
      episode:prompt.episode,segment:prompt.segment,
      title:String(prompt.title||'').slice(0,180),
      prompt:prompt.prompt,createdAt:new Date().toISOString(),
      status:'queued',detail:''};
    state.jobs[profileId]=job;persist();return job;
  }
  function poll(token){
    const id=profileByToken(token);
    if(!id)return null;
    state.tokens[id].lastSeen=new Date().toISOString();
    // Avoid writing every 2 seconds; connection state is updated at most once each minute.
    const job=state.jobs[id];
    if(!job||!['queued','needs_input'].includes(job.status))return {profileId:id,job:null};
    return {profileId:id,job:{id:job.id,episode:job.episode,segment:job.segment,
      title:job.title,prompt:job.prompt}};
  }
  function ack(token,jobId,status,detail=''){
    const id=profileByToken(token);
    if(!id)throw Error('未授权');
    const job=state.jobs[id];
    if(!job||job.id!==jobId)throw Error('任务不存在或已被新任务替代');
    if(!['filled','needs_input','failed'].includes(status))throw Error('非法状态');
    job.status=status;job.detail=String(detail).slice(0,200);
    job.updatedAt=new Date().toISOString();
    state.tokens[id].lastSeen=job.updatedAt;
    persist();return {profileId:id,status};
  }
  const status=()=>({
    selectedProfile:state.selectedProfile,
    profiles:Object.fromEntries(Object.entries(state.tokens).map(([p,x])=>[p,{
      paired:!!x.token,lastSeen:x.lastSeen,job:state.jobs[p]?
      {id:state.jobs[p].id,episode:state.jobs[p].episode,segment:state.jobs[p].segment,
       status:state.jobs[p].status,detail:state.jobs[p].detail}:null
    }]))
  });
  return {tokenFor,profileByToken,selectProfile,enqueue,poll,ack,status};
}
function createRelay({store,port=18741}){
  let server=null,ready=false,error=null;
  const reply=(res,status,data,origin)=>{
    res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    if(/^chrome-extension:\/\/[a-p]{32}$/.test(origin||'')){
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Manju-Token');
      res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
      res.setHeader('Vary','Origin');
    }
    res.end(JSON.stringify(data));
  };
  function handler(req,res){
    const origin=req.headers.origin||'';
    if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){
      return reply(res,403,{ok:false,error:'禁止的访问来源'},'');
    }
    if(req.method==='OPTIONS')return reply(res,204,{ok:true},origin);
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='GET'&&url.pathname==='/health'){
      return reply(res,200,{ok:true,service:'manju-edge-relay-v1'},origin);
    }
    const token=req.headers['x-manju-token'];
    if(!store.profileByToken(token))return reply(res,401,{ok:false,error:'未配对'},origin);
    if(req.method==='GET'&&url.pathname==='/poll'){
      return reply(res,200,{ok:true,...store.poll(token)},origin);
    }
    if(req.method==='POST'&&url.pathname==='/ack'){
      let body='',tooLarge=false;
      req.on('data',chunk=>{body+=chunk;if(body.length>4096){tooLarge=true;req.destroy();}});
      req.on('end',()=>{
        if(tooLarge)return;
        try{
          const parsed=JSON.parse(body);
          const result=store.ack(token,parsed.id,parsed.status,parsed.detail);
          reply(res,200,{ok:true,...result},origin);
        }catch(e){reply(res,400,{ok:false,error:String(e.message||e)},origin);}
      });
      return;
    }
    reply(res,404,{ok:false,error:'未知接口'},origin);
  }
  async function start(){
    if(server)return;
    server=http.createServer(handler);
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',()=>{ready=true;server.off('error',reject);resolve();});
    }).catch(e=>{error=e.message;ready=false;server=null;throw e;});
  }
  async function stop(){if(server)await new Promise(resolve=>server.close(resolve));server=null;ready=false;}
  const state=()=>({ready,error,port:server?.address()?.port??port});
  return {start,stop,state};
}
module.exports={createLinkStore,createRelay};
