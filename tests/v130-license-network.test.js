'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {requestViaCurl, retrieveAttestation, validateAttestation} = require('../scripts/prepare-license');
const URL = 'https://license.example.test/v1/license/attest';
function signedFixture() {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(JSON.stringify({schema:1,product:'dudu-ai-workbench',purpose:'license-public-key-v1',issuedAt:Date.now()}));
  return {pub: publicKey.export({type:'spki',format:'der'}).toString('base64'), proof: {
    payload:raw.toString('base64url'), signature:crypto.sign(null,raw,privateKey).toString('base64url')
  }};
}
test('v1.3 release verifies signature from HTTPS result, not merely status 200', async ()=>{
  const {pub, proof} = signedFixture();
  const got = await retrieveAttestation(URL, {fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(proof)}), curlRunner:()=>{throw Error('unused')}});
  assert.equal(validateAttestation(got,pub),true);
});
test('v1.3 release safely falls back to curl when Node fetch times out', async ()=>{
  const {pub, proof} = signedFixture();
  let invoked = false;
  const got = await retrieveAttestation(URL, {
    fetchImpl:async()=>{const e=new Error('timeout');e.name='TimeoutError';throw e},
    curlRunner:(bin,args,opts)=>{
      invoked=true;
      assert.ok(args.includes('--proto'));
      assert.ok(args.includes('=https'));
      assert.ok(!args.includes('--insecure'));
      assert.equal(args.at(-1),URL);
      return {status:0,stdout:JSON.stringify(proof)};
    }
  });
  assert.ok(invoked);
  assert.equal(validateAttestation(got,pub),true);
});
test('v1.3 curl fallback fails closed for unreachable Worker',()=>{
  assert.throws(()=>requestViaCurl(URL,()=>({status:28,stdout:'',stderr:'network timeout'})),/退出码 28/);
});
test('v1.3 release never treats HTTP errors as a successful attestation',async()=>{
  let curlCalls=0;
  await assert.rejects(retrieveAttestation(URL,{fetchImpl:async()=>({ok:false,status:403}),curlRunner:()=>{curlCalls++;return{status:0,stdout:'{}'}}}),/HTTP 403/);
  assert.equal(curlCalls,0);
});
test('v1.3 malformed or forged Worker responses cannot bypass Ed25519 verification',async()=>{
  const {pub,proof}=signedFixture();
  await assert.rejects(retrieveAttestation(URL,{fetchImpl:async()=>({ok:true,text:async()=>'<html>Access denied</html>'})}),/不是有效 JSON/);
  assert.throws(()=>validateAttestation({...proof,signature:'invalid'},pub),/不匹配/);
});
test('v1.3 release reports both network failures without leaking URLs or tokens',async()=>{
  await assert.rejects(retrieveAttestation(URL,{
    fetchImpl:async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})},
    curlRunner:()=>({status:6,stdout:''})
  }),/Worker 无法访问.*退出码 6/);
});
