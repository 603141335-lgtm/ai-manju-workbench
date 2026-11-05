'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http');
const {createLinkStore,createRelay}=require('../app/edge-relay');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'manju-relay-'));
const profiles=new Set(['Default','Profile 1']);
const store=createLinkStore(path.join(root,'link.json'),id=>profiles.has(id));
function call(port,route,{token,method='GET',body,origin}={}){
 return new Promise((resolve,reject)=>{
  const request=http.request({hostname:'127.0.0.1',port,path:route,method,
   headers:{...(token?{'X-Manju-Token':token}:{}),
    ...(origin?{'Origin':origin}:{}),
    ...(body?{'Content-Type':'application/json'}:{})}},res=>{
     let raw='';res.on('data',b=>raw+=b);
     res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}
       resolve({code:res.statusCode,data});});
    });
  request.on('error',reject);
  request.end(body?JSON.stringify(body):undefined);
 });
}
(async()=>{
 const relay=createRelay({store,port:0});
 try{
  await relay.start();
  const port=relay.state().port;
  assert(port>0);
  assert.equal((await call(port,'/health')).code,200);
  assert.equal((await call(port,'/poll')).code,401);
  const tokenA=store.tokenFor('Default'),tokenB=store.tokenFor('Profile 1');
  assert.notEqual(tokenA,tokenB);
  assert.equal(store.profileByToken(tokenA),'Default');
  assert.equal(store.profileByToken('not-a-token'),null);
  store.selectProfile('Default');
  const job=store.enqueue('Default',{episode:10,segment:3,prompt:'中文完整提示词\nA15、B02',title:'夜市'});
  const a=await call(port,'/poll',{token:tokenA});
  assert.equal(a.code,200);
  assert.equal(a.data.job.id,job.id);
  assert.equal(a.data.job.prompt,'中文完整提示词\nA15、B02');
  const b=await call(port,'/poll',{token:tokenB});
  assert.equal(b.code,200);
  assert.equal(b.data.job,null,'Profile 1 must not receive Default job');
  const foreignAck=await call(port,'/ack',{token:tokenB,method:'POST',
    body:{id:job.id,status:'filled'}});
  assert.equal(foreignAck.code,400);
  const ok=await call(port,'/ack',{token:tokenA,method:'POST',
    body:{id:job.id,status:'filled'}});
  assert.equal(ok.code,200);
  assert.equal((await call(port,'/poll',{token:tokenA})).data.job,null);
  assert.equal(store.status().profiles.Default.job.status,'filled');
  assert.equal((await call(port,'/poll',{token:tokenA,origin:'https://evil.example'})).code,403);
  assert.equal((await call(port,'/poll',{token:tokenA,origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'})).code,200);
  assert.throws(()=>store.tokenFor('../notprofile'));
  const fresh=createLinkStore(path.join(root,'link.json'),id=>profiles.has(id));
  assert.equal(fresh.status().selectedProfile,'Default');
  assert.equal(fresh.status().profiles.Default.job.status,'filled');
  console.log('PASS Edge local relay, per-profile tokens, queue/ack isolation, origin blocking, persistence');
 }finally{await relay.stop();fs.rmSync(root,{force:true,recursive:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
