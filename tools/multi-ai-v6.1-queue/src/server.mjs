import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { QueueEngine } from './queue.mjs';
import { CompatibleApiClient } from './api.mjs';
import { QueueRunner } from './runner.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
function send(res,code,data,type='application/json; charset=utf-8'){
 res.writeHead(code,{...headers,'Content-Type':type});
 res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
export function createServer(engine,client){
 return http.createServer(async(req,res)=>{
  try{
   const host=req.headers.host||'';
   if(!/^127\.0\.0\.1:\d+$/.test(host) && !/^localhost:\d+$/.test(host))return send(res,403,{error:'仅允许本地访问'});
   if(req.headers.origin && req.headers.origin!==`http://${host}`)return send(res,403,{error:'拒绝跨网站访问'});
   const u=new URL(req.url,`http://${host}`);
   if(req.method==='GET'&&u.pathname==='/')return send(res,200,readFileSync(path.join(dir,'../public/index.html'),'utf8'),'text/html; charset=utf-8');
   if(req.method==='GET'&&u.pathname==='/style.css')return send(res,200,readFileSync(path.join(dir,'../public/style.css'),'utf8'),'text/css; charset=utf-8');
   if(req.method==='GET'&&u.pathname==='/ui.js')return send(res,200,readFileSync(path.join(dir,'../public/ui.js'),'utf8'),'text/javascript; charset=utf-8');
   if(req.method==='GET'&&u.pathname==='/api/jobs')return send(res,200,engine.listJobs());
   if(req.method==='GET'&&u.pathname==='/api/connection')return send(res,200,{apiConfigured:!!client?.configured,baseUrl:client?.publicBase??null,webMode:'manual_only'});
   if(req.method==='POST'){
    if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return send(res,415,{error:'仅允许JSON请求'});
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>7_000_000)return send(res,413,{error:'输入超过7MB，请拆分导入'})}
    const body=raw?JSON.parse(raw):{};
    if(u.pathname==='/api/jobs')return send(res,201,engine.createJob(body));
    const m=u.pathname.match(/^\/api\/jobs\/([\w-]+)\/(start|pause|resume|import|approve|retry|export)$/);
    if(m){
     const [,id,act]=m;
     const out={start:()=>engine.start(id),pause:()=>engine.pause(id),resume:()=>engine.resume(id),import:()=>engine.importReply(id,body.reply),approve:()=>engine.approveEpisode(id,body),retry:()=>engine.retryStage(id),export:()=>engine.exportCompleted(id)}[act]();
     return send(res,200,out);
    }
   }
   const m=u.pathname.match(/^\/api\/jobs\/([\w-]+)(?:\/(current|events|usage))?$/);
   if(req.method==='GET'&&m){
    const out=m[2]==='current'?engine.current(m[1]):m[2]==='events'?engine.events(m[1]):m[2]==='usage'?engine.usage(m[1]):engine.getJob(m[1]);
    return send(res,200,out);
   }
   return send(res,404,{error:'未找到接口'});
  }catch(e){return send(res,400,{error:e.message||'请求失败'})}
 });
}
export async function startServer({root,port=17861,client}={}){
 const engine=new QueueEngine(root||process.env.MAI_DATA_DIR||path.join(process.cwd(),'local-data'));
 const activeClient=client||new CompatibleApiClient();
 const runner=new QueueRunner(engine,activeClient);
 const server=createServer(engine,activeClient);
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})}
 catch(e){engine.close();throw e}
 runner.start();
 return {url:`http://127.0.0.1:${server.address().port}`,server,engine,runner,close:async()=>{await runner.stop();await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));engine.close()}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const running=await startServer({port:Number(process.env.PORT||17861)});
 console.log(`Multi-AI 任务中心：${running.url}`);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>running.close().finally(()=>process.exit(0)));
}
