'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createImportEngine}=require('../src/import-engine');
test('v1.1.0: switching UI account does not cancel upload for original account; native @ waits for focus',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-background-')),file=path.join(dir,'A15.png');
 fs.writeFileSync(file,Buffer.from('some image test data'));
 const prompt='第2段｜测试｜15秒\n需要参考图：\nA15 杜不凡·人物参考\n限制：禁止音乐';
 const events=[],accountId='a1';let foreground='a1',uploaded=false,draft='',native=false;
 const snap=()=>({ready:true,prompt:draft,names:uploaded?['A15.png']:[],thumbs:[],busy:false,mentions:[]});
 const wc={
  getURL:()=> 'https://www.doubao.com/chat/',
  isDestroyed:()=>false,
  insertText:async()=>{},
  sendInputEvent:event=>{if(event.type==='mouseUp')native=true},
  executeJavaScript:async source=>{
   if(source.includes('function probe('))return snap();
   if(source.includes('function setPrompt(')){draft=prompt;foreground='a2';return {ok:true}};
   if(source.includes('function selectImageFile(')){uploaded=true;return {ok:true}};
   if(source.includes('function inspectInlineReference('))return {verified:native,message:'尚无原生艾特'};
   if(source.includes('function focusReferenceSlot('))return {ok:true};
   if(source.includes('function inspectMentionOptions('))return [{text:'A15.png',x:12,y:12}];
   if(source.includes('function clearPendingInlineAt('))return true;
   return {ok:false,message:'模拟网页未提供该步骤'};
  }
 };
 const engine=createImportEngine({
  getActive:()=>({accountId,webContents:wc}),
  getSegment:()=>({text:prompt}),
  resolveRows:()=>[{code:'A15',file:{path:file},versions:[{path:file}],missing:false}],
  getChosenPaths:()=>({}),
  getCurrentSelection:()=>null,
  getTailForSegment:()=>({state:'none'}),
  getVoiceForImages:()=>({items:[],blocked:false,errors:[],totalSeconds:0}),
  isForeground:id=>foreground===id,notify:x=>events.push(x),
  pause:()=>new Promise(resolve=>setTimeout(resolve,2)),intervalMs:5,uploadTimeoutMs:2000
 });
 const pending=engine.execute({episodeId:'ep1',segmentId:'seg2'});
 const deadline=Date.now()+4000;
 while(!events.some(x=>x.state==='waiting-focus')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert(uploaded,'original account file must upload despite UI switching to second account');
 assert(events.some(x=>x.state==='waiting-focus'),'native @ stage must require original account focus');
 assert.equal(engine.busy(),true);
 foreground='a1';
 const result=await pending;
 assert.equal(result.state,'done',result.message);
 assert.equal(result.uploaded,1);
 assert.equal(result.nativeVerified,1);
 assert(events.filter(x=>x.accountId!=='a1').length===0,'account status may never leak to account2');
 assert.equal(engine.busy(),false);
});
