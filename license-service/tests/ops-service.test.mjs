import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManifest,alipaySignContent} from '../src/ops-service.mjs';

test('manifest normalizer keeps public content only and rejects duplicate tutorial ids',()=>{
  const value=normalizeManifest({
    community:{headline:'独独AI公告',wechat:'du4du44',qrUrl:'http://not-https.example/qr.png'},
    tutorial:{title:'新手教程',slides:[{id:'01',title:'第一步',description:'打开工作台',imageUrl:'https://cdn.example/step1.webp'}]},
    notice:{title:'维护通知',body:'今晚更新'},
    release:{version:'1.3.0',url:'https://download.example/setup.exe'}
  });
  assert.equal(value.schemaVersion,2);
  assert.equal(value.community.wechat,'du4du44');
  assert.equal(value.community.qrUrl,'');
  assert.equal(value.tutorial.slides.length,1);
  assert.equal(value.tutorial.slides[0].imageUrl,'https://cdn.example/step1.webp');
  assert.equal(value.release.url,'https://download.example/setup.exe');
  assert.throws(()=>normalizeManifest({tutorial:{slides:[
    {id:'same',title:'步骤一'},{id:'same',title:'步骤二'}
  ]}}),/编号重复/);
});

test('manifest normalizer strips non-HTTPS media and caps tutorial steps',()=>{
  const slides=Array.from({length:30},(_,i)=>({id:'s'+i,title:'步骤'+i,imageUrl:'javascript:alert(1)'}));
  const value=normalizeManifest({tutorial:{slides}});
  assert.equal(value.tutorial.slides.length,24);
  assert.equal(value.tutorial.slides[0].imageUrl,'');
});

test('Alipay RSA2 canonical string sorts keys and excludes signature metadata',()=>{
  const value=alipaySignContent({
    sign:'ignored',sign_type:'RSA2',app_id:'20260001',
    method:'alipay.trade.page.pay',charset:'utf-8',biz_content:'{"x":1}'
  });
  assert.equal(value,'app_id=20260001&biz_content={"x":1}&charset=utf-8&method=alipay.trade.page.pay');
});
