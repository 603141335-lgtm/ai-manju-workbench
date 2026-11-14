'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {makeChromiumTransport}=require('../src/license-client');
const origin='https://license.example.workers.dev',testRequest={deviceId:'a'.repeat(64)};
const toResponse=(data,{status=200}={})=>({
 status,ok:status>=200&&status<300,headers:{get:()=>null},
 arrayBuffer:async()=>Buffer.from(JSON.stringify(data))
});
test('Chromium proxy-aware license transport sends HTTPS POST and does not alter device signature',async()=>{
 let calls=0;
 const transport=makeChromiumTransport(async(url,opts)=>{
  calls++;assert.equal(url,origin+'/v1/license/activate');
  assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');
  assert.equal(JSON.parse(opts.body).deviceId,testRequest.deviceId);
  assert(opts.signal);return toResponse({token:'signed-token'});
 });
 assert.deepEqual(await transport(origin,'/v1/license/activate',testRequest),{token:'signed-token'});
 assert.equal(calls,1);
});
test('license transport rejects HTTP, oversized server responses and invalid keys',async()=>{
 const tr=makeChromiumTransport(async()=>toResponse({error:'卡密已经绑定其他设备'},{status:400}));
 await assert.rejects(()=>tr(origin,'/v1/license/activate',{}),/卡密已经绑定其他设备/);
 await assert.rejects(()=>tr('http://example.org','/v1/trial/start',{}),/不安全/);
 await assert.rejects(()=>tr(origin,'https://other.example.org/v1/trial/start',{}),/不安全/);
 const big=makeChromiumTransport(async()=>toResponse({payload:'x'.repeat(33000)}));
 await assert.rejects(()=>big(origin,'/v1/trial/start',{}),/授权响应过大/);
});
test('network errors are actionable and timeout is 25 seconds',async()=>{
 const fail=makeChromiumTransport(async()=>{throw new TypeError('fetch failed')});
 await assert.rejects(()=>fail(origin,'/v1/trial/start',{}),/代理或Cloudflare网络/);
 const timeout=makeChromiumTransport(async()=>{const err=new Error('aborted');err.name='TimeoutError';throw err});
 await assert.rejects(()=>timeout(origin,'/v1/trial/start',{}),/连接超时/);
});
test('Windows main process passes Electron net.fetch to license client',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 assert.match(main,/transport:makeChromiumTransport\(net\.fetch\.bind\(net\)\)/);
});
