'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const window={};const source=fs.readFileSync('mobile-android/app/src/main/assets/studio/studio-compat.js','utf8');
vm.runInNewContext(source,{window},{timeout:3000});
const data={version:2,title:'捡了个食神小祖宗',assetFolder:'C:\\images',
 chosenPaths:{A02:'C:\\images\\A02_安安.png',BL06:'C:\\images\\BL06.png'},
 activeEpisodeId:'ep_10',activeSegmentId:'seg_10_2',
 episodes:[{id:'ep_10',number:10,title:'第10集｜开店',locked:false,hidden:false,segments:[
  {id:'seg_10_1',n:1,title:'第1段｜开场',text:'原文：起锅烧油！\n',codes:['A02','BL06'],manual:true,status:'pending',hidden:false,locked:false},
  {id:'seg_10_2',n:2,title:'第2段｜反转',text:'原文：一字不删。\n',codes:['A01-01','AG14','E02-05'],manual:true,status:'done',hidden:true,locked:true}
 ]}]};
const result=window.ManjuCompat.convert(data);
assert.equal(result.title,'捡了个食神小祖宗');
assert.equal(result.episodes.length,1);
assert.equal(result.segments.length,2);
assert.equal(result.segments[1].original,'原文：一字不删。\n');
assert.equal(result.segments[1].key,'desktop_seg_10_2');
assert.deepEqual(Array.from(result.segments[1].desktopCodes),['A01-01','AG14','E02-05']);
assert.equal(result.statuses.desktop_seg_10_2,'已完成');
assert.equal(result.segments[1].locked,true);
assert.equal(result.segments[1].hidden,true);
assert.equal(result.activeIndex,1);
assert.equal(result.versions.A02,'A02_安安.png');
assert.throws(()=>window.ManjuCompat.convert({version:1,episodes:[]}));
console.log('Doubao Creative Hub v0.3 workspace adapter tests: PASS');