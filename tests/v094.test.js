'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {WorkspaceStore}=require('../src/workspace');
const {findPredecessor,TailFrameStore}=require('../src/tailframe');
const {DownloadAssociations}=require('../src/download-association');
const {TailFrameQueue}=require('../src/tailframe-queue');
const {probeVideoMode,clickVideoModeControl,callVideoMode}=require('../src/video-mode-page');
const {createPlan}=require('../src/import-engine');
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v094-'));
function example(){
 const segments=[1,2,3].map(n=>({id:'s'+n,n,title:'第'+n+'段',text:'需要参考图：A01',codes:['A01'],status:n===1?'done':'pending',
  manual:false,hidden:false,locked:false,deletedAt:null,previousSegmentId:n>1?'s'+(n-1):null,selectedPaths:[],manualPaths:[]}));
 const e={id:'e1',number:1,title:'第1集',hidden:false,locked:false,deletedAt:null,segments};
 return {e,segments};
}
test('v094: 段落回收与恢复，不移动磁盘素材也不改变稳定前段ID',async()=>{
 const store=new WorkspaceStore(path.join(dir(),'workspace.json'));await store.load();
 const {e,segments}=example();store.data.episodes=[e];store.data.activeEpisodeId=e.id;store.data.activeSegmentId=segments[1].id;await store.save();
 let state=await store.deleteSegment('e1','s1');
 assert(!!state.workspace.episodes[0].segments[0].deletedAt);
 assert.equal(state.workspace.activeSegmentId,'s2');
 assert.equal(findPredecessor(store.data,'e1','s2').seg.id,'s1');
 assert.equal(store.trash().segments.length,1);
 await store.restoreSegment('e1','s1');assert.equal(store.trash().segments.length,0);
 await store.deleteEpisode('e1');assert.equal(store.trash().episodes.length,1);
 await store.restoreEpisode('e1');assert.equal(store.trash().episodes.length,0);
 const reloaded=new WorkspaceStore(store.file);await reloaded.load();
 assert.equal(reloaded.data.episodes[0].segments[1].previousSegmentId,'s1');
 assert.equal(reloaded.data.episodes[0].segments[0].status,'done');
});
test('v094: 旧版本工作区迁移保留段落顺序/hidden/锁定状态',()=>{
 const {scrub}=require('../src/workspace');
 const {e}=example();for(const seg of e.segments)delete seg.previousSegmentId;
 const out=scrub({version:2,episodes:[e],activeEpisodeId:'e1',activeSegmentId:'s2'});
 assert.equal(out.version,3);
 assert.equal(out.episodes[0].segments[1].previousSegmentId,'s1');
 assert.equal(out.episodes[0].segments[2].previousSegmentId,'s2');
});
test('v094: download matching requires unique prepared task AND selected segment',()=>{
 const x=new DownloadAssociations();
 x.record({accountId:'a',episodeId:'e1',segmentId:'s1'});
 assert.equal(x.find('a',{episodeId:'e1',segmentId:'s2'}).state,'pending');
 assert.equal(x.find('a',{episodeId:'e1',segmentId:'s1'}).state,'matched');
 x.confirmed({accountId:'a',episodeId:'e1',segmentId:'s1'});
 x.record({accountId:'a',episodeId:'e1',segmentId:'s2'});
 assert.equal(x.find('a',{episodeId:'e1',segmentId:'s2'}).state,'matched');
 x.record({accountId:'a',episodeId:'e1',segmentId:'s3'});
 assert.equal(x.find('a',{episodeId:'e1',segmentId:'s2'}).state,'pending');
 assert.equal(x.find('b',{episodeId:'e1',segmentId:'s2'}).state,'pending');
});
test('v094: v1 旧尾帧映射可直接读取，原视频移动后已提取图仍可用',async()=>{
 const root=dir(),folder=path.join(root,'tailframes');fs.mkdirSync(folder,{recursive:true});
 const video=path.join(root,'video.mp4'),frame=path.join(folder,'frame.png');
 fs.writeFileSync(video,Buffer.alloc(1024));fs.writeFileSync(frame,Buffer.alloc(1000));
 const st=fs.statSync(video);
 fs.writeFileSync(path.join(folder,'bindings.json'),JSON.stringify({version:1,rows:{'e1:s1':{episodeId:'e1',segmentId:'s1',videoPath:video,framePath:frame,sourceMtime:st.mtimeMs,sourceSize:st.size}}}));
 const store=await new TailFrameStore(root).load(),data={episodes:[example().e]};
 assert.equal(store.listVersions('e1','s1').versions.length,1);
 assert.equal(store.status(data,'e1','s2').state,'ready');
 fs.renameSync(video,video+'.moved');
 const state=store.status(data,'e1','s2');
 assert.equal(state.state,'ready');assert.equal(state.sourceMoved,true);
});
test('v094: video mode DOM probing uses actual bottom composer chips, not body text',()=>{
 let clicked=false;
 const element=(label,top=705)=>({
  innerText:label,textContent:label,disabled:false,
  getAttribute:n=>n==='aria-label'?label:null,
  getBoundingClientRect:()=>({width:120,height:26,top,bottom:top+26}),
  click(){clicked=true}
 });
 const elements=['视频生成','模型 Seedance 2.0 Fast','16:9 · 15s'].map(x=>element(x));
 const editor=element('',710);
 const document={
  querySelectorAll:selector=>selector.includes('textarea')?[editor]:elements
 };
 const context={document,innerHeight:800,getComputedStyle:()=>({display:'block',visibility:'visible'})};
 const report=vm.runInNewContext(callVideoMode(probeVideoMode,null),context);
 assert.equal(report.mode,true);
 assert.equal(report.model,true);
 assert.equal(report.aspect,true);
 assert.equal(report.duration,true);
 assert.equal(report.verified,true);
 const click=vm.runInNewContext(callVideoMode(clickVideoModeControl,'choose-mode'),context);
 assert.equal(click.ok,true);assert.equal(clicked,true);
});
test('v094: tailframe queue only processes completed and properly associated videos',async()=>{
 const received=[];
 const result=new Promise(resolve=>{
  const queue=new TailFrameQueue({
   tailframes:{setFinal:async()=>({state:'ready',message:'已截帧'})},
   workspace:{data:{episodes:[example().e]}},
   onRecord:(id,state)=>received.push([id,state]),
   notify:x=>{if(x.state==='ready')resolve(x)}
  });
  assert.equal(queue.enqueue({id:'bad',type:'视频',episodeId:'e1',segmentId:'s1',status:'progressing'}),false);
  assert.equal(queue.enqueue({id:'good',type:'视频',episodeId:'e1',segmentId:'s1',status:'completed',file:'clip.mp4',path:'clip.mp4'}),true);
  assert.equal(queue.enqueue({id:'good',type:'视频',episodeId:'e1',segmentId:'s1',status:'completed',file:'clip.mp4',path:'clip.mp4'}),false);
 });
 const done=await result;
 assert.equal(done.state,'ready');assert(received.some(([id,s])=>id==='good'&&s==='ready'));
});
test('v094: no predecessor tailframe is NOT an import blocker',()=>{
 const rows=[{code:'A01',file:{path:path.join(dir(),'A01.png')},missing:false,versions:[]}];
 fs.writeFileSync(rows[0].file.path,Buffer.alloc(50));
 const p=createPlan({prompt:'需要参考图：A01',rows,tail:{state:'none'},limit:9});
 assert.equal(p.blocked,false);
});
