'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInitialData,normalizeName,safeBounds,allowedImage,allowedEdgeProfile}=require('../src/store');
test('默认5组25个隔离账号',()=>{let x=0;const a=createInitialData(()=>`id${++x}`);assert.equal(a.groups.length,5);assert.equal(a.accounts.length,25);assert.equal(new Set(a.accounts.map(a=>a.id)).size,25);assert.equal(a.target,2)});
test('边界验证',()=>{assert.equal(normalizeName(' A\n'), 'A');assert.throws(()=>normalizeName(''));assert.equal(allowedImage('A01.PNG'),true);assert.equal(allowedImage('secret.exe'),false);assert.equal(allowedEdgeProfile('Default'),true);assert.equal(allowedEdgeProfile('Profile 3'),true);assert.equal(allowedEdgeProfile('../Default'),false)});
test('嵌入网页可视区域限制',()=>{assert.deepEqual(safeBounds({x:-20,y:100,width:9000,height:700},{width:1200,height:750}),{x:0,y:100,width:1200,height:650});assert.equal(safeBounds({x:'?',y:1,width:3,height:4},{width:100,height:100}),null)});
