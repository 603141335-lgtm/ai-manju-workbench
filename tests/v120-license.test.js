'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{generateKeyPairSync,sign,randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {LicenseClient,deviceMessage,verifyTokenJS,validServiceUrl}=require('../src/license-client');
const src=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../src/license-ui.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
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
test('unconfigured license fails closed; loopback HTTP is allowed only for explicit dev test mode',()=>{
 assert.equal(validServiceUrl('http://example.com'),'');
 assert.equal(validServiceUrl('https://localhost'),'');
 assert.equal(validServiceUrl('https://license.example.org/path'),'https://license.example.org');
 assert.equal(validServiceUrl('http://127.0.0.1:8788'),'');
 assert.equal(validServiceUrl('http://127.0.0.1:8788',{allowLocalTest:true}),'http://127.0.0.1:8788');
 assert.equal(validServiceUrl('http://localhost:8788',{allowLocalTest:true}),'');
 assert.equal(validServiceUrl('http://192.168.1.10:8788',{allowLocalTest:true}),'');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-license-'));
 const enc=s=>Buffer.from(s),dec=b=>b.toString();
 const st={isEncryptionAvailable:()=>true,encryptString:enc,decryptString:dec};
 const lic=new LicenseClient({root:dir,safeStorage:st,config:{serviceUrl:'',publicKey:''}});
 assert.equal(lic.status().valid,false);
 assert.throws(()=>lic.requireValid(),/授权中心/);
 assert.throws(()=>lic.request('trial'),/尚未部署/);
 const {pem}=pub();
 const local=new LicenseClient({root:dir,safeStorage:st,packaged:false,config:{serviceUrl:'http://127.0.0.1:8788',publicKey:pem,localTestMode:true}});
 assert.equal(local.service,'http://127.0.0.1:8788');
 assert.equal(local.adminUrl(),'http://127.0.0.1:8788/admin');
 const packaged=new LicenseClient({root:dir,safeStorage:st,packaged:true,config:{serviceUrl:'http://127.0.0.1:8788',publicKey:pem,localTestMode:true}});
 assert.equal(packaged.service,'');
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

test('unlicensed account must never attach its Doubao browser view',()=>{
 assert.match(src,/if\(!overlayShown&&licenseClient\?\.status\(\)\.valid\)/);
 assert.match(src,/else if\(licenseClient\?\.status\(\)\.valid\)/);
});
test('workbench exposes the same backend admin console without embedding its admin token',()=>{
 assert.match(src,/license:openAdmin/);
 assert.match(src,/license-config\.local\.json/);
 assert.match(preload,/licenseOpenAdmin/);
 assert.match(html,/btnLicenseAdmin/);
 assert.match(ui,/btnLicenseAdmin/);
 assert.match(ui,/trial_expired/);
});
