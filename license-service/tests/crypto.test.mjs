import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign,verify} from 'node:crypto';
import {deviceMessage} from '../src/worker.mjs';
test('device proof binds operation, device, public key, nonce and code',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const r={deviceId:'f'.repeat(64),publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),ts:Date.now(),nonce:randomBytes(16).toString('hex'),code:''};
 const a=Buffer.from(deviceMessage('trial',r)),sig=sign(null,a,privateKey);
 assert.equal(verify(null,a,publicKey,sig),true);
 assert.equal(verify(null,Buffer.from(deviceMessage('activate',r)),publicKey,sig),false);
 assert.equal(verify(null,Buffer.from(deviceMessage('trial',{...r,nonce:'e'.repeat(32)})),publicKey,sig),false);
});
test('static administrative page does not store admin token in localStorage',async()=>{
 const {adminHtml}=await import('../src/admin-ui.mjs');
 assert.match(adminHtml,/du4du44/);assert.doesNotMatch(adminHtml,/localStorage|document.cookie/);
});
test('device proof binds free application and purchase metadata',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const r={deviceId:'a'.repeat(64),publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),ts:Date.now(),nonce:randomBytes(16).toString('hex'),code:'',contact:'du4du44',reason:'创作者申请'};
 const message=Buffer.from(deviceMessage('apply',r)),sig=sign(null,message,privateKey);
 assert.equal(verify(null,message,publicKey,sig),true);
 assert.equal(verify(null,Buffer.from(deviceMessage('apply',{...r,reason:'被篡改'})),publicKey,sig),false);
 const order={...r,productId:'permanent',paymentMethod:'wechat'};
 const orderMessage=Buffer.from(deviceMessage('order-create',order)),orderSig=sign(null,orderMessage,privateKey);
 assert.equal(verify(null,orderMessage,publicKey,orderSig),true);
 assert.equal(verify(null,Buffer.from(deviceMessage('order-create',{...order,paymentMethod:'alipay'})),publicKey,orderSig),false);
});

test('device proof binds order history and self-service payment reconciliation',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const r={deviceId:'b'.repeat(64),publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),ts:Date.now(),nonce:randomBytes(16).toString('hex'),code:'',orderId:'123e4567-e89b-12d3-a456-426614174000'};
 for(const op of ['order-list','order-reconcile']){
  const message=Buffer.from(deviceMessage(op,r)),sig=sign(null,message,privateKey);
  assert.equal(verify(null,message,publicKey,sig),true);
  assert.equal(verify(null,Buffer.from(deviceMessage(op==='order-list'?'order-reconcile':'order-list',r)),publicKey,sig),false);
 }
 assert.equal(verify(null,Buffer.from(deviceMessage('order-reconcile',{...r,orderId:'00000000-0000-0000-0000-000000000000'})),publicKey,sign(null,Buffer.from(deviceMessage('order-reconcile',r)),privateKey)),false);
});

test('operations admin inline script parses and exposes payment monitoring actions',async()=>{
 const {adminHtml}=await import('../src/admin-ui.mjs');
 const script=adminHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'admin page contains its application script');
 assert.doesNotThrow(()=>new Function(script));
 for(const id of ['tab-monitor','paymentEventsBody','deliveriesBody','runPaymentReconcile','runPaymentSelfTest','tab-finance','financeGross','financeChannelsBody','tab-refunds','refundsBody','loadFinance','loadRefunds']){
  assert.ok(adminHtml.includes(id),id+' control exists');
 }
});
