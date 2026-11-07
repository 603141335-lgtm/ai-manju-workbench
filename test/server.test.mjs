import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('本地HTTP任务中心可以创建任务并拒绝跨站写请求',async()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'wq-server-'));
 const port=19000+Math.floor(Math.random()*20000);
 const proc=spawn(process.execPath,['src/server.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),MAI_DATA_DIR:tmp},stdio:'pipe'});
 try{
  let up=false;
  for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/');if(r.ok){up=true;break}}catch{}await sleep(100)}
  assert.equal(up,true,'服务应启动');
  const css=await fetch('http://127.0.0.1:'+port+'/style.css');assert.equal(css.status,200);
  const denied=await fetch('http://127.0.0.1:'+port+'/api/jobs',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
  const created=await fetch('http://127.0.0.1:'+port+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'联网交互测试',source:'一段完整原始故事',totalEpisodes:2})});
  assert.equal(created.status,201);const j=await created.json();assert.equal(j.episodes.length,2);
  const started=await fetch('http://127.0.0.1:'+port+'/api/jobs/'+j.id+'/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(started.status,200);
  const cur=await (await fetch('http://127.0.0.1:'+port+'/api/jobs/'+j.id+'/current')).json();assert.equal(cur.stage.provider,'chatgpt');assert.ok(cur.prompt.includes('一段完整原始故事'));
 }finally{proc.kill('SIGINT');await sleep(100);rmSync(tmp,{recursive:true,force:true})}
});