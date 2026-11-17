'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {EventEmitter}=require('node:events');
const {createMentionRunner,confirmedNativeCode}=require('../src/mention-runner');
const {matchVisibleAttachment}=require('../src/mention-core');

class FakeDebugger extends EventEmitter{
 constructor(onFiles){super();this.active=false;this.onFiles=onFiles;this.calls=[];}
 isAttached(){return this.active;}
 attach(){this.active=true;}
 detach(){this.active=false;}
 async sendCommand(name,args){this.calls.push(name);
  if(name==='DOM.setFileInputFiles'){this.onFiles(args.files);return {};}
  if(name==='DOM.getDocument')return {root:{nodeId:1}};
  if(name==='DOM.querySelector')return {nodeId:2};
  return {};
 }
}
function makeScenario({shouldAppear=false,showNativeToken=false,chooser=true}={}){
 const location=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-at-'));
 const file=path.join(location,'A15.png');fs.writeFileSync(file,Buffer.from([137,80,78,71,1,2,3]));
 let selected=false,mentioned=false,clicked=false;
 const debuggerInstance=new FakeDebugger(()=>{selected=true});
 const wc={debugger:debuggerInstance, getURL:()=> 'https://www.doubao.com/chat/',isDestroyed:()=>false,
  sendInputEvent(e){
   if(e.type==='mouseDown'&&!clicked){clicked=true;if(chooser)debuggerInstance.emit('message',null,'Page.fileChooserOpened',{backendNodeId:8,mode:'selectMultiple'});}
   else if(e.type==='mouseDown'&&clicked&&showNativeToken)mentioned=true;
  },insertText(){},
  async executeJavaScript(script){
   if(script.includes('function inspectPage('))return {ready:true,prompt:'需要参考图：A15',attachments:selected&&shouldAppear?[{name:'A15.png'}]:[],mentions:[],busy:false};
   if(script.includes('function uploadAction('))return {kind:'upload',x:123,y:456};
   if(script.includes('function candidateFileInput('))return chooser?null:{selector:'input[data-test]',multiple:true};
   if(script.includes('function inspectRichMentions('))return mentioned?[{text:'A15.png',marked:true}]:[];
   if(script.includes('function focusComposer('))return true;
   if(script.includes('function trailingAt('))return true;
   if(script.includes('function inspectMentionOptions('))return [{text:'A15.png',x:22,y:44}];
   throw Error('Unexpected page probe '+script.slice(0,70));
  }};
 const output=[];
 const runner=createMentionRunner({
  getActive:()=>({accountId:'doubao-01',webContents:wc}),
  resolveRows:()=>[{code:'A15',file:{name:'A15.png',path:file},versions:[{name:'A15.png',path:file}],missing:false}],
  getCodes:()=>['A15'],getChosenPaths:()=>({}),notify:x=>output.push(x),
  limits:{chooserMs:18,uploadMs:25,pollMs:1,mentionMs:15},clock:async()=>{}
 });
 return {runner,output,debuggerInstance,cleanup:()=>fs.rmSync(location,{recursive:true,force:true})};
}
test('DOM file selection alone NEVER reports uploaded or real @',async()=>{
 const s=makeScenario();try{
  const res=await s.runner.execute({episodeId:'ep',segmentId:'s'});
  assert.equal(res.selected,1);assert.equal(res.uploaded,0);assert.equal(res.verified,0);
  assert.equal(res.results[0].state,'pending');assert(!/已提交 1 张上传/.test(res.message));
  assert(s.debuggerInstance.calls.includes('Page.setInterceptFileChooserDialog'));
  assert(s.debuggerInstance.calls.includes('DOM.setFileInputFiles'));
  assert.equal(s.debuggerInstance.isAttached(),false);
 }finally{s.cleanup()}
});
test('only a named stable attachment can advance to @; plain text is NOT native verified',async()=>{
 const s=makeScenario({shouldAppear:true,showNativeToken:false});try{
  const res=await s.runner.execute({episodeId:'ep',segmentId:'s'});
  assert.equal(res.selected,1);assert.equal(res.uploaded,1);assert.equal(res.verified,0);
  assert.equal(res.results[0].state,'unverified');
  assert.equal(confirmedNativeCode('A15',[{text:'@A15.png',marked:false}]),false);
  assert.equal(confirmedNativeCode('A15',[{text:'@A15.png',marked:true}]),true);
 }finally{s.cleanup()}
});
test('native component gets verified only when it appeared after selecting the exact option',async()=>{
 const s=makeScenario({shouldAppear:true,showNativeToken:true});try{
  const res=await s.runner.execute({episodeId:'ep',segmentId:'s'});
  assert.equal(res.uploaded,1);assert.equal(res.verified,1);
  assert.equal(res.results[0].state,'verified');
 }finally{s.cleanup()}
});
test('A01 never matches A01-01; unexpected mention attrs cannot fake a match',()=>{
 assert.equal(matchVisibleAttachment('A01',[{name:'A01-01.png'}]),'unknown');
 assert.equal(confirmedNativeCode('A01',[{text:'A01-01.png',marked:true}]),false);
});
