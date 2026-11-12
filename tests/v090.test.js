'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const core=require('../src/import-core');
const {createPlan}=require('../src/import-engine');
const {TailFrameStore,findPredecessor,extractLastValidFrame}=require('../src/tailframe');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-v090-'));
const ep='e1',a='s1',b='s2',c='s3';
const data={episodes:[{id:ep,segments:[{id:a,n:1},{id:b,n:2},{id:c,n:3}]}]};
const file=code=>{const f=path.join(dir,code+'.png');fs.writeFileSync(f,'pixels');return {path:f,name:code+'.png'}};
test('v0.9.9: tailframe has a single meaningful prefix; original reference text is not rewritten',()=>{
 const original='第3段｜第3场｜15秒\n需要参考图：A15、A32\n连续性参考：上一镜结束动作\n0—3秒｜台词：不要改变！\n限制：禁止字幕\n';
 const out=core.composeText(original,[{code:'尾帧',kind:'tail',file:{name:'尾帧.png'}},{code:'A15',file:{name:'A15.png'}},{code:'A32',file:{name:'A32.png'}}]);
 assert.equal(out,'上一段尾帧参考：\n'+original);
 assert(!out.includes('图1锁定人物'));
 assert(!out.includes('图2锁定人物'));
});

test('尾帧只对同集下一段生效，第一段和跨集不继承',()=>{
 assert.equal(findPredecessor(data,ep,a),null);
 assert.equal(findPredecessor(data,ep,b).seg.id,a);
 assert.equal(findPredecessor(data,ep,c).seg.id,b);
 assert.equal(findPredecessor({episodes:[]},ep,b),null);
});
test('上一段尾帧作为图1；普通编号依次顺延，超9张阻止',()=>{
 const rows=['A15','A32'].map(code=>({code,file:file(code),versions:[file(code)],missing:false}));
 const tail={state:'ready',file:file('tail'),message:'尾帧已绑定'};
 const p=createPlan({prompt:'需要参考图：A15、A32',rows,tail});
 assert.deepEqual(p.items.map(x=>x.code),['尾帧','A15','A32']);assert.equal(p.blocked,false);
 const many=Array.from({length:9},(_,i)=>'A'+String(i+1).padStart(2,'0'));
 const rs=many.map(code=>({code,file:file(code),versions:[file(code)],missing:false}));
 assert.equal(createPlan({prompt:'需要参考图：'+many.join('、'),rows:rs,tail}).overLimit,true);
});
test('尾帧绑定保存、再次读取，来源文件被替换能检测',async()=>{
 const root=path.join(dir,'state');const st=await new TailFrameStore(root).load();
 const frame=path.join(root,'tailframes','test.png');fs.writeFileSync(frame,'frame');
 const video=path.join(dir,'test.mp4');fs.writeFileSync(video,Buffer.alloc(1000));
 const state=fs.statSync(video);st.rows['e1:s1']={episodeId:ep,segmentId:a,videoPath:video,framePath:frame,sourceMtime:state.mtimeMs,sourceSize:state.size};await st.save();
 const reloaded=await new TailFrameStore(root).load();assert.equal(reloaded.status(data,ep,b).state,'ready');
 fs.appendFileSync(video,'changed');assert.equal(reloaded.status(data,ep,b).state,'stale');
});
test('本机 FFmpeg 实际提取尾帧，跳过末尾黑屏',async(t)=>{
 const has=cp.spawnSync('ffmpeg',['-version'],{encoding:'utf8'});if(has.error){t.skip('FFmpeg not installed on this runner');return;}
 const video=path.join(dir,'red-black.mkv');
 const proc=cp.spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=red:s=320x240:d=1:r=10','-f','lavfi','-i','color=c=black:s=320x240:d=0.5:r=10','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','ffv1',video],{encoding:'utf8',timeout:30000});
 assert.equal(proc.status,0,proc.stderr);
 const frame=path.join(dir,'extracted.png');const result=await extractLastValidFrame(video,frame,{ffmpeg:'ffmpeg',ffprobe:'ffprobe'});
 assert(fs.existsSync(frame));assert(fs.statSync(frame).size>500);assert(result.second<1.1,`selected t=${result.second}`);
});
