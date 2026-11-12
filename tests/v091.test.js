'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const core=require('../src/import-core');
const inline=require('../src/inline-mention-page');

test('v0.9.9: keep only original numbered references, never fabricate 图N lines',()=>{
 const original='第3段｜标题｜15秒\n需要参考图：A01、A01-01、A15\n连续性参考：保持不变\n0—3秒｜台词：不要改！\n';
 const items=['A01','A01-01','A15'].map(code=>({code,file:{name:code+'.png'}}));
 assert.equal(core.composeText(original,items),original);
 const slots=core.referenceSlots(original);
 assert.deepEqual(slots.slots.map(x=>x.code),['A01','A01-01','A15']);
 assert.equal(slots.ambiguous.length,0);
 assert(!core.composeText(original,items).includes('图1锁定人物'));
});

test('内联定位不会回退到编辑器末尾，且每个函数可序列化到真实网页',()=>{
  const src=fs.readFileSync(path.join(root,'src/import-engine.js'),'utf8');
  assert.match(src,/inlinePage\.focusReferenceSlot/);
  assert.match(src,/inlinePage\.inspectInlineReference/);
  assert.match(src,/inlinePage\.clearPendingInlineAt/);
  assert.doesNotMatch(src,/oldPage\.focusComposer/);
  for(const name of ['focusReferenceSlot','inspectInlineReference','clearPendingInlineAt']){
    assert.equal(typeof inline[name],'function');
    assert(inline[name].toString().startsWith('function '));
  }
});
test('公开分发版安装身份隔离，不引入画布',()=>{
  const pkg=require('../package.json');
  assert.match(pkg.version,/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/); // Version changes must not break the install identity test
  assert.equal(pkg.build.appId,'com.manju.doubao.creativehub.public');
  assert(!fs.existsSync(path.join(root,'src/canvas')));
});
