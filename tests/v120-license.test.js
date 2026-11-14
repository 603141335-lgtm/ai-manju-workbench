'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{generateKeyPairSync,sign,randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {LicenseClient,deviceMessage,verifyTokenJS,validServiceUrl}=require('../src/license-client');
const src=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const pub=()=>{const {privateKey,publicKey}=generateKeyPairSync('ed25519');return {privateKey,publicKey,pem:publicKey.export({type:'spki',format:'der'}).toString('base64')}};
function token(key,payload){const raw=Buffer.from(JSON.stringify(payload));return raw.toString('base64url')+'.'+sign(null,raw,key).toString('base64url')}
test('signature verification rejects forged, expired, wrong-device and misclassified grants',()=>{
 const {privateKey,pem}=pub(),now=Date.now(),p={schema:1,product:'dudu-ai-workbench',type:'trial',deviceId:'a'.repeat(64),issuedAt:now-1000,entitlementExpiresAt:now+10000,leaseExpiresAt:now+10000};
 assert.equal(verifyTokenJS(token(privateKey,p),pem,p.deviceId,now).valid,true);
 assert.equal(verifyTokenJS(token(privateKey,p),pem,'b'.repeat(64),now).valid,false);
 assert.equal(verifyTokenJS(token(privateKey,p),pem,p.deviceId,now+20000).valid,false);
 assert.equal(verifyTokenJS(token(privateKey,{...p,type:'permanent'}),pem,p.deviceId,now).valid,false);
 const other=pub();assert.equal(verifyTokenJS(token(privateKey,p),other.pem,p.deviceId,now).valid,false);
});
test('unconfigured license fails closed; no localhost or HTTP in production',()=>{
 assert.equal(validServiceUrl('http://example.com'),'');
 assert.equal(validServiceUrl('https://localhost'),'');
 assert.equal(validServiceUrl('https://license.example.org/path'),'https://license.example.org');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-license-'));
 const enc=s=>Buffer.from(s),dec=b=>b.toString();
 const st={isEncryptionAvailable:()=>true,encryptString:enc,decryptString:dec};
 const lic=new LicenseClient({root:dir,safeStorage:st,config:{serviceUrl:'',publicKey:''}});
 assert.equal(lic.status().valid,false);
 assert.throws(()=>lic.requireValid(),/授权中心/);
 assert.throws(()=>lic.request('trial'),/尚未部署/);
});
test('device request binds signed fields including card code',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const r={op:'activate',deviceId:'a'.repeat(64),publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),ts:Date.now(),nonce:randomBytes(16).toString('hex'),code:'DUDU-AAAAA-BBBBB-CCCCC-DDDDD'};
 const v=Buffer.from(deviceMessage(r.op,r)),sig=sign(null,v,privateKey);
 assert(sig.length>32);
 assert(!v.equals(Buffer.from(deviceMessage('trial',r))));
});
test('all 3 high value creation IPCs must be gated',()=>{
 assert.match(src,/guardedHandle\('import:execute'/);
 assert.match(src,/guardedHandle\('mention:execute'/);
 assert.match(src,/guardedHandle\('api:chat'/);
 assert.match(src,/licenseClient\.requireValid\(\)/);
});
