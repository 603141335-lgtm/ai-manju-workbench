'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {validateAttestation}=require('../scripts/prepare-license');
test('release accepts live signing proof only when matching actual Ed25519 key',()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const pub=publicKey.export({type:'spki',format:'der'}).toString('base64');
 const now=Date.now(),payload=Buffer.from(JSON.stringify({schema:1,product:'dudu-ai-workbench',purpose:'license-public-key-v1',issuedAt:now}));
 const signed={payload:payload.toString('base64url'),signature:crypto.sign(null,payload,privateKey).toString('base64url')};
 assert.equal(validateAttestation(signed,pub,now),true);
 const wrong=crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'der'}).toString('base64');
 assert.throws(()=>validateAttestation(signed,wrong,now),/不匹配/);
 assert.throws(()=>validateAttestation(signed,pub,now+300000),/过期/);
 assert.throws(()=>validateAttestation({...signed,signature:'bad'},pub,now),/不匹配/);
});
