import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign,randomBytes,createHash} from 'node:crypto';
import worker,{deviceMessage} from '../src/worker.mjs';
const SCHEMA=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
class FakeD1{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(SCHEMA)}
 prepare(sql){const stmt=this.db.prepare(sql);return {all:async()=>({results:stmt.all()}),bind(...args){return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})}}}
}
function env(){const signer=generateKeyPairSync('ed25519');return {DB:new FakeD1(),DUDU_SIGNING_PRIVATE_PKCS8_B64:signer.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),DUDU_DEVICE_HMAC_KEY:'device-secret-'+('d'.repeat(60)),DUDU_CARD_HMAC_KEY:'card-secret-'+('c'.repeat(60)),DUDU_ADMIN_TOKEN_SHA256:createHash('sha256').update('A'.repeat(64)).digest('hex')}}
function device(id){const keys=generateKeyPairSync('ed25519');return {deviceId:id,keys,publicKey:keys.publicKey.export({type:'spki',format:'der'}).toString('base64')}}
function proof(d,op,extra={}){const req={deviceId:d.deviceId,publicKey:d.publicKey,ts:Date.now(),nonce:randomBytes(16).toString('hex'),code:'',...extra};req.signature=sign(null,Buffer.from(deviceMessage(op,req)),d.keys.privateKey).toString('base64url');return req}
async function call(e,path,body,admin=false){const res=await worker.fetch(new Request('https://license.example.test'+path,{method:'POST',headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+'A'.repeat(64)}:{})},body:JSON.stringify(body)}),e);return {status:res.status,data:await res.json()}}
test('free application requires signed device proof and is visible to admin',async()=>{
 const e=env(),d=device('a'.repeat(64));
 const created=await call(e,'/v1/application/create',proof(d,'application_create',{contact:'du4du44',reason:'我需要体验独独AI漫剧工作台'}));
 assert.equal(created.status,200,JSON.stringify(created.data));
 assert.equal(created.data.status,'pending');
 const status=await call(e,'/v1/application/status',proof(d,'application_status',{applicationId:created.data.applicationId}));
 assert.equal(status.status,200);assert.equal(status.data.application.status,'pending');
 const list=await call(e,'/v1/admin/applications/list',{},true);
 assert.equal(list.status,200);assert.equal(list.data.applications.length,1);
 assert.equal(list.data.applications[0].id,created.data.applicationId);
});
test('admin approval can bind a permanent card to applicant device and is single-use',async()=>{
 const e=env(),d=device('b'.repeat(64));
 const created=await call(e,'/v1/application/create',proof(d,'application_create',{contact:'wechat-user',reason:'申请免费永久卡密用于漫剧创作'}));
 const approved=await call(e,'/v1/admin/applications/approve',{applicationId:created.data.applicationId,bindDevice:true,note:'审核通过'},true);
 assert.equal(approved.status,200,JSON.stringify(approved.data));assert.equal(approved.data.bound,true);
 const duplicate=await call(e,'/v1/admin/applications/approve',{applicationId:created.data.applicationId,bindDevice:true},true);
 assert.equal(duplicate.status,404);
 const refresh=await call(e,'/v1/license/refresh',proof(d,'refresh'));
 assert.equal(refresh.status,200,JSON.stringify(refresh.data));assert.equal(refresh.data.type,'permanent');
});
test('application cannot be queried from another device and bad admin auth is denied',async()=>{
 const e=env(),a=device('c'.repeat(64)),b=device('d'.repeat(64));
 const created=await call(e,'/v1/application/create',proof(a,'application_create',{contact:'wechat-user',reason:'申请免费永久卡密用于漫剧创作'}));
 const stolen=await call(e,'/v1/application/status',proof(b,'application_status',{applicationId:created.data.applicationId}));
 assert.equal(stolen.status,404);
 const noAuth=await call(e,'/v1/admin/applications/list',{});
 assert.equal(noAuth.status,401);
});
test('application rejects missing contact or too-short reason',async()=>{
 const e=env(),d=device('e'.repeat(64));
 const invalid=await call(e,'/v1/application/create',proof(d,'application_create',{contact:'x',reason:'no'}));
 assert.equal(invalid.status,400);
});
