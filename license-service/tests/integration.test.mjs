import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign,randomBytes,createHash} from 'node:crypto';
import * as cryptoExtra from 'node:crypto';
import worker,{deviceMessage} from '../src/worker.mjs';
const SCHEMA=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
class FakeD1{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(SCHEMA)}
 prepare(sql){const stmt=this.db.prepare(sql);
  return {first:async()=>stmt.get()||null,all:async()=>({results:stmt.all()}),run:async()=>({meta:{changes:Number(stmt.run().changes)}}),bind(...args){return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})}}}
 }
}
function env(){
 const signer=generateKeyPairSync('ed25519');
 return {DB:new FakeD1(),DUDU_SIGNING_PRIVATE_PKCS8_B64:signer.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),
  DUDU_DEVICE_HMAC_KEY:'device-secret-'+('d'.repeat(60)),DUDU_CARD_HMAC_KEY:'card-secret-'+('c'.repeat(60)),
  DUDU_ADMIN_TOKEN_SHA256:createHash('sha256').update('A'.repeat(64)).digest('hex')};
}
function device(deviceId){
 const keys=generateKeyPairSync('ed25519');
 const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
 return {deviceId,keys,publicKey};
}
function proof(d,op,code=''){
 const req={deviceId:d.deviceId,publicKey:d.publicKey,ts:Date.now(),nonce:randomBytes(16).toString('hex'),code};
 req.signature=sign(null,Buffer.from(deviceMessage(op,req)),d.keys.privateKey).toString('base64url');
 return req;
}
async function call(e,path,body,admin=false){
 const res=await worker.fetch(new Request('https://license.example.test'+path,{method:'POST',headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+'A'.repeat(64)}:{})},body:JSON.stringify(body)}),e);
 return {status:res.status,data:await res.json()};
}
test('same device never gets more than one 24-hour trial, different key cannot claim it',async()=>{
 const e=env(),a=device('a'.repeat(64));const a1=await call(e,'/v1/trial/start',proof(a,'trial'));
 assert.equal(a1.status,200,JSON.stringify(a1.data));
 assert.equal(a1.data.type,'trial');
 const b=await call(e,'/v1/trial/start',proof(a,'trial'));
 assert.equal(b.data.expiresAt,a1.data.expiresAt);
 const clone=device(a.deviceId);
 const stolen=await call(e,'/v1/trial/start',proof(clone,'trial'));
 assert.notEqual(stolen.status,200);
});
test('signed requests cannot be replayed with the same nonce',async()=>{
 const e=env(),a=device('c'.repeat(64));
 const signed=proof(a,'trial');
 const first=await call(e,'/v1/trial/start',signed);
 assert.equal(first.status,200,JSON.stringify(first.data));
 const second=await call(e,'/v1/trial/start',signed);
 assert.equal(second.status,400);
 assert.match(second.data.error,/请求已处理/);
 const third=await call(e,'/v1/trial/start',proof(a,'trial'));
 assert.equal(third.status,200);
 assert.equal(third.data.expiresAt,first.data.expiresAt);
});
test('card permanently binds one device; revocation prevents online renewal',async()=>{
 const e=env(),a=device('a'.repeat(64)),b=device('b'.repeat(64));
 const generated=await call(e,'/v1/admin/cards/issue',{count:1},true);
 assert.equal(generated.status,200);
 const code=generated.data.codes[0];
 const activated=await call(e,'/v1/license/activate',proof(a,'activate',code));
 assert.equal(activated.status,200,JSON.stringify(activated.data));
 assert.equal(activated.data.type,'permanent');
 assert.equal((await call(e,'/v1/license/activate',proof(b,'activate',code))).status,400);
 assert.equal((await call(e,'/v1/license/refresh',proof(a,'refresh'))).data.type,'permanent');
 const list=await call(e,'/v1/admin/cards/list',{},true);
 assert.equal(list.status,200,JSON.stringify(list.data));
 const id=list.data.cards[0].id;
 assert.equal((await call(e,'/v1/admin/cards/revoke',{cardId:id},true)).status,200);
 assert.equal((await call(e,'/v1/license/refresh',proof(a,'refresh'))).status,403);
});
test('public signing attestation is a verifiable server-held private key proof',async()=>{
 const e=env();
 const reply=await worker.fetch(new Request('https://license.example.test/v1/license/attest',{method:'GET'}),e);
 assert.equal(reply.status,200);
 const signed=await reply.json();
 const privateKey=cryptoExtra.createPrivateKey({key:Buffer.from(e.DUDU_SIGNING_PRIVATE_PKCS8_B64,'base64'),type:'pkcs8',format:'der'});
 const publicKey=cryptoExtra.createPublicKey(privateKey);
 assert.equal(cryptoExtra.verify(null,Buffer.from(signed.payload,'base64url'),publicKey,Buffer.from(signed.signature,'base64url')),true);
 const att=JSON.parse(Buffer.from(signed.payload,'base64url').toString('utf8'));
 assert.equal(att.purpose,'license-public-key-v1');
});
test('bad device signature and bad admin token are denied',async()=>{
 const e=env(),a=device('f'.repeat(64));
 const x=proof(a,'trial');x.nonce='0'.repeat(32);
 assert.equal((await call(e,'/v1/trial/start',x)).status,400);
 assert.equal((await call(e,'/v1/admin/cards/issue',{count:2},false)).status,401);
});

test('device block denies subsequent signed license refresh requests',async()=>{
 const e=env(),a=device('e'.repeat(64));
 const trial=await call(e,'/v1/trial/start',proof(a,'trial'));
 assert.equal(trial.status,200);
 const deviceHash=e.DB.db.prepare('SELECT device_hash FROM devices LIMIT 1').get().device_hash;
 e.DB.prepare('INSERT INTO device_controls(device_hash,blocked_ms,block_reason,blocked_by,updated_ms) VALUES(?,?,?,?,?)')
  .bind(deviceHash,Date.now(),'test block','support-1',Date.now()).run();
 const refresh=await call(e,'/v1/license/refresh',proof(a,'refresh'));
 assert.equal(refresh.status,403);
 assert.equal(refresh.data.reason,'device_blocked');
});

test('operator tokens authenticate against stored hashes and enforce server-side roles',async()=>{
 const e=env(),token='DUDU-OP-'+randomBytes(24).toString('hex');
 const tokenHash=createHash('sha256').update(token).digest('hex'),now=Date.now(),id='operator-finance-1';
 e.DB.prepare('INSERT INTO admin_operators(operator_id,display_name,role,token_sha256,enabled,created_ms,updated_ms) VALUES(?,?,?,?,1,?,?)')
  .bind(id,'财务管理员','finance',tokenHash,now,now).run();
 const callAs=async(path,body={})=>{
  const response=await worker.fetch(new Request('https://license.example.test'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)}),e);
  return {status:response.status,data:await response.json()};
 };
 const session=await callAs('/v1/admin/session');
 assert.equal(session.status,200);
 assert.equal(session.data.role,'finance');
 const finance=await callAs('/v1/admin/finance/summary',{fromMs:now-86400000,toMs:now+86400000});
 assert.equal(finance.status,200);
 const customers=await callAs('/v1/admin/customers/list');
 assert.equal(customers.status,403);
 const issue=await callAs('/v1/admin/cards/issue',{count:1});
 assert.equal(issue.status,403);
 e.DB.prepare('UPDATE admin_operators SET enabled=0 WHERE operator_id=?').bind(id).run();
 const disabled=await callAs('/v1/admin/session');
 assert.equal(disabled.status,401);
});
