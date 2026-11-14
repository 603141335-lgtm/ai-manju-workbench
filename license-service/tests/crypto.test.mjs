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
