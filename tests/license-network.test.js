'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createElectronLicenseTransport}=require('../src/license-network');
const {LicenseClient}=require('../src/license-client');
const SERVICE='https://license.example.test';

test('Electron license GET uses Chromium proxy stack without cookies or redirects',async()=>{
 let request;
 const network=createElectronLicenseTransport(async(url,options)=>{
  request={url,options};
  return new Response(JSON.stringify({products:[{product_id:'annual'}]}),{status:200});
 });
 assert.deepEqual((await network.getJson(SERVICE,'/v1/products')).products,[{product_id:'annual'}]);
 assert.equal(request.url,SERVICE+'/v1/products');
 assert.equal(request.options.credentials,'omit');
 assert.equal(request.options.redirect,'error');
 assert.equal(request.options.cache,'no-store');
});

test('Electron license POST preserves signed JSON body and excludes cookies',async()=>{
 let request;
 const network=createElectronLicenseTransport(async(url,options)=>{
  request={url,options};
  return new Response(JSON.stringify({ok:true}),{status:200});
 });
 assert.deepEqual(await network.post(SERVICE,'/v1/license/refresh',{signature:'signed'}),{ok:true});
 assert.equal(request.options.method,'POST');
 assert.deepEqual(JSON.parse(request.options.body),{signature:'signed'});
 assert.equal(request.options.credentials,'omit');
 assert.equal(request.options.headers['content-type'],'application/json');
});

test('Electron license request reports live HTTP 404 instead of a timeout',async()=>{
 const network=createElectronLicenseTransport(async()=>new Response('{"error":"Not found"}',{status:404}));
 await assert.rejects(network.getJson(SERVICE,'/v1/products'),/HTTP 404/);
});

test('Electron license request fails closed on redirect, non-HTTPS, and oversized response',async()=>{
 const network=createElectronLicenseTransport(async()=>new Response('x'.repeat(32769),{status:200}));
 await assert.rejects(network.getJson(SERVICE,'/v1/products'),/响应过大/);
 await assert.rejects(network.getJson('http://license.example.test','/v1/products'),/HTTPS/);
 await assert.rejects(network.getJson(SERVICE,'https://other.example.test/v1/products'),/地址不匹配/);
});

test('packaged LicenseClient routes product reads through Electron and explains missing deployment',async()=>{
 let count=0;
 const client=new LicenseClient({root:'unused-test-path',safeStorage:{isEncryptionAvailable:()=>false},
  packaged:true,config:{serviceUrl:SERVICE,publicKey:''},netFetch:async()=>{
   count++;
   return new Response('{"error":"Not found"}',{status:404});
  }});
 await assert.rejects(client.getProducts(),/商品列表接口.*HTTP 404/);
 assert.equal(count,1);
});

test('LicenseClient passes payment availability to the workbench catalog',async()=>{
 const client=new LicenseClient({root:'unused-test-path',safeStorage:{isEncryptionAvailable:()=>false},
  packaged:true,config:{serviceUrl:SERVICE,publicKey:''},netFetch:async()=>new Response(JSON.stringify({
   products:[{product_id:'lifetime',price_cents:9900}],paymentMethods:{wechat:false,alipay:true}
  }),{status:200})});
 assert.deepEqual(await client.getProducts(),{
  products:[{product_id:'lifetime',price_cents:9900}],paymentMethods:{wechat:false,alipay:true}
 });
});

test('activation explains that a card management ID is not an activation code',()=>{
 const client=new LicenseClient({root:'unused-test-path',safeStorage:{isEncryptionAvailable:()=>false},
  packaged:true,config:{serviceUrl:SERVICE,publicKey:''}});
 assert.throws(()=>client.activate('99d5571b-be39-4205-a95d-f566e4c24ba1'),/卡密管理ID.*DUDU-/);
});
