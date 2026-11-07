import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { QueueEngine } from './queue.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=process.env.MAI_DATA_DIR || path.join(process.cwd(),'local-data');
const engine=new QueueEngine(root);
const port=Number(process.env.PORT||17861);
const send=(res,code,data,type='application/json; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"});res.end(type.startsWith('application/json')?JSON.stringify(data):data)};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://127.0.0.1');
    if(!['127.0.0.1',`127.0.0.1:${port}`].includes(req.headers.host))return send(res,403,{error:'非法Host'});
    if(req.method==='POST'){const origin=req.headers.origin;const localOrigin=`http://127.0.0.1:${port}`;if(origin&&origin!==localOrigin)return send(res,403,{error:'跨站请求已拒绝'});if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'仅允许 JSON 请求'})}
    if(req.method==='GET'&&u.pathname==='/'){return send(res,200,readFileSync(path.join(dir,'../public/index.html'),'utf8'),'text/html; charset=utf-8')}
    if(req.method==='GET'&&u.pathname==='/style.css')return send(res,200,readFileSync(path.join(dir,'../public/style.css'),'utf8'),'text/css; charset=utf-8');
    if(req.method==='GET'&&u.pathname==='/ui.js'){return send(res,200,readFileSync(path.join(dir,'../public/ui.js'),'utf8'),'text/javascript; charset=utf-8')}
    if(req.method==='GET'&&u.pathname==='/api/jobs')return send(res,200,engine.listJobs());
    if(req.method==='POST'){
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>7_000_000)throw new Error('输入超过限制（约7MB），请拆分导入')}
      const body=raw?JSON.parse(raw):{};
      if(u.pathname==='/api/jobs')return send(res,201,engine.createJob(body));
      const m=u.pathname.match(/^\/api\/jobs\/([\w-]+)\/(start|pause|resume|import|approve|retry|export)$/);
      if(m){const id=m[1],act=m[2];let out;
        if(act==='start')out=engine.start(id);
        if(act==='pause')out=engine.pause(id);
        if(act==='resume')out=engine.resume(id);
        if(act==='import')out=engine.importReply(id,body.reply);
        if(act==='approve')out=engine.approveEpisode(id,body);
        if(act==='retry')out=engine.retryStage(id);
        if(act==='export')out=engine.exportCompleted(id);
        return send(res,200,out);
      }
    }
    const m=u.pathname.match(/^\/api\/jobs\/([\w-]+)(?:\/(current|events))?$/);
    if(req.method==='GET'&&m){const v=m[2]==='current'?engine.current(m[1]):m[2]==='events'?engine.events(m[1]):engine.getJob(m[1]);return send(res,200,v)}
    send(res,404,{error:'未找到接口'});
  }catch(e){send(res,400,{error:e.message||'请求失败'})}
});
server.listen(port,'127.0.0.1',()=>console.log(`Multi-AI 任务中心：http://127.0.0.1:${port} （仅本机访问）`));
process.on('SIGINT',()=>{server.close();engine.close()});
