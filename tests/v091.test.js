'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const core=require('../src/import-core');
const inline=require('../src/inline-mention-page');

test('v0.9.1 图号锚点属于开头参考图栏目，不是正文末尾',()=>{
  const original='第3段｜标题｜15秒\n需要参考图：A01、A01-01、A15\n连续性参考：保持不变\n0—3秒｜台词：不要改！\n';
  const items=['A01','A01-01','A15'].map(code=>({code,file:{name:code+'.png'}}));
  const composed=core.composeText(original,items);
  const first=composed.indexOf('需要参考图：'),last=composed.indexOf('连续性参考：');
  assert(first<last);
  items.forEach((x,i)=>{
    const anchor=core.makeMapping([x],i);
    assert.equal(composed.split(anchor).length,2,'唯一的图号锚点：'+anchor);
    assert(composed.indexOf(anchor)>first&&composed.indexOf(anchor)<last,'图号需位于最顶部：'+anchor);
  });
  assert(composed.endsWith('0—3秒｜台词：不要改！\n'));
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
test('浏览器版安装身份未改变，不引入画布',()=>{
  const pkg=require('../package.json');
  assert.equal(pkg.version,'0.9.3');
  assert.equal(pkg.build.appId,'com.manju.doubao.creativehub');
  assert(!fs.existsSync(path.join(root,'src/canvas')));
});
