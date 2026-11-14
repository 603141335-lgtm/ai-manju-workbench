'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {LicenseClient,deviceMessage}=require('../src/license-client');
test('workbench signs application contact/reason and order product/provider context without truncating JSON',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-ops-client-'));
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 const calls=[];
 const client=new LicenseClient({root:dir,safeStorage,config:{serviceUrl:'https://license.example.workers.dev',publicKey:crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'der'}).toString('base64')},transport:async(_url,endpoint,body)=>{calls.push({endpoint,body});return {ok:true}}});
 await client.createApplication('wechat-abc','我正在制作AI漫剧，希望申请独独AI永久授权。');
 await client.createOrder('dudu-ai-workbench-permanent','wechat');
 assert.equal(calls[0].endpoint,'/v1/application/create');
 const context=JSON.parse(calls[0].body.code);assert.equal(context.contact,'wechat-abc');assert.match(context.reason,/AI漫剧/);
 assert.equal(calls[1].endpoint,'/v1/orders/create');
 assert.deepEqual(JSON.parse(calls[1].body.code),{productId:'dudu-ai-workbench-permanent',provider:'wechat'});
 for(const call of calls){
  const key=crypto.createPublicKey({key:Buffer.from(call.body.publicKey,'base64'),type:'spki',format:'der'});
  assert.equal(crypto.verify(null,Buffer.from(deviceMessage(call.endpoint.includes('application')?'application-create':'order-create',call.body)),key,Buffer.from(call.body.signature,'base64url')),true);
 }
 fs.rmSync(dir,{recursive:true,force:true});
});
test('desktop bridge and license UI expose application, product and order actions',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../src/license-ui.js'),'utf8');
 for(const name of ['license:applicationCreate','license:applicationStatus','license:products','license:orderCreate','license:orderStatus'])assert.match(main,new RegExp(name.replace(':','\\:')));
 for(const name of ['licenseApplicationCreate','licenseApplicationStatus','licenseProducts','licenseOrderCreate','licenseOrderStatus'])assert.match(preload,new RegExp(name));
 assert.match(html,/vendor\/qrcode\.min\.js/);assert.match(html,/licenseApplicationPane/);assert.match(html,/licensePurchasePane/);
 assert.match(ui,/B\.licenseApplicationCreate/);assert.match(ui,/B\.licenseOrderCreate/);assert.match(ui,/new QRCode/);
});
