'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {WorkspaceStore,scrub,fresh}=require('../src/workspace');
const {findPredecessor}=require('../src/tailframe');
const {createPlan}=require('../src/import-engine');
const {ensure,scanAndAct}=require('../src/video-mode');

function newWorkspace(){
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v094-')),'workspace.json');
  return new WorkspaceStore(file);
}
test('v0.9.4: delete episode is recoverable and preserves unrelated episodes',async()=>{
 const w=newWorkspace();await w.load();
 w.data.episodes=[{id:'e1',title:'第一集',segments:[{id:'s1',n:1,text:'完整原文',codes:[],status:'done'}]},{id:'e2',title:'第二集',segments:[{id:'s2',n:1,text:'第二集原文',codes:[],status:'pending'}]}];
 w.data.activeEpisodeId='e1';w.data.activeSegmentId='s1';await w.save();
 const removed=await w.deleteItem('e1');
 assert.deepEqual(w.data.episodes.map(x=>x.id),['e2']);
 assert.equal(w.data.trash.length,1);assert.equal(w.data.trash[0].item.segments[0].text,'完整原文');
 await w.restoreItem(removed.entryId);
 assert.deepEqual(w.data.episodes.map(x=>x.id),['e1','e2']);
 assert.equal(w.data.episodes[0].segments[0].status,'done');
 const reread=newWorkspace();reread.file=w.file;await reread.load();
 assert.equal(reread.data.episodes[0].segments[0].text,'完整原文');
});
test('v0.9.4: deleting an intermediate segment does not inherit another clip',async()=>{
 const w=newWorkspace();await w.load();
 w.data.episodes=[{id:'e1',title:'第一集',segments:[{id:'s1',n:1,text:'一'},{id:'s2',n:2,text:'二'},{id:'s3',n:3,text:'三'}]}];
 const removed=await w.deleteItem('e1','s2');
 assert.equal(w.data.episodes[0].segments[1].continuityBlocked,true);
 assert.equal(findPredecessor(w.data,'e1','s3'),null);
 await w.restoreItem(removed.entryId);
 assert.equal(findPredecessor(w.data,'e1','s3').seg.id,'s2');
});
test('v0.9.4: old projects migrate with empty recycle bin',()=>{
 const obj=scrub({version:2,title:'旧项目',episodes:[{id:'e1',title:'旧集',segments:[{id:'s1',text:'保留'}]}]});
 assert.deepEqual(obj.trash,[]);assert.equal(obj.episodes[0].segments[0].text,'保留');
 assert.deepEqual(fresh().trash,[]);
});
test('v0.9.4: no tail is not a blocker, extracting tail can wait',()=>{
 const img=path.join(os.tmpdir(),'doubao-094-tmp-test-image.png');fs.writeFileSync(img,'fake-png');
 const row={code:'A01',file:{name:'A01.png',path:img},versions:[{path:img}]};
 const base={prompt:'需要参考图：A01',rows:[row]};
 assert.equal(createPlan({...base,tail:{state:'none'}}).blocked,false);
 assert.equal(createPlan({...base,tail:{state:'extracting'}}).blocked,false);
});
test('v0.9.4: video adapter never falsely confirms without all four parameters',async()=>{
 assert.match(scanAndAct.toString(),/视频生成/);
 let called=0;
 const wc={getURL:()=> 'https://www.doubao.com/chat/',isDestroyed:()=>false,
   executeJavaScript:async()=>{called++;return {video:true,model:true,ratio:true,duration:false}}};
 const res=await ensure(wc);
 assert.equal(res.ready,false);assert(called>=1);
});
