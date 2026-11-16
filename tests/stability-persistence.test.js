'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {VoiceBindingsStore}=require('../src/voice-bindings');
const {TaskJournal}=require('../src/task-journal');
const {ApiSettings}=require('../src/api-settings');
function scratch(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-safety-'));return {dir,file:extension=>path.join(dir,extension)}}

test('rapid voice binding saves serialize and retain a previous byte-for-byte backup',async()=>{
 const {dir,file}=scratch();
 try{
  const target=file('voices.json'),store=await new VoiceBindingsStore(target).load();
  store.data.bindings.A15=[{id:'one',path:'/test/one.wav',label:'a',duration:3,isDefault:true}];
  const first=store.save();
  store.data.bindings.A15.push({id:'two',path:'/test/two.wav',label:'b',duration:4,isDefault:false});
  const second=store.save();
  await Promise.all([first,second]);
  assert.equal(JSON.parse(fs.readFileSync(target,'utf8')).bindings.A15.length,2);
  assert.equal(JSON.parse(fs.readFileSync(target+'.bak','utf8')).bindings.A15.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('corrupted voice binding file is never replaced with an empty list',async()=>{
 const {dir,file}=scratch();
 try{
  const target=file('voices.json'),raw='{corrupted';
  fs.writeFileSync(target,raw);
  const store=await new VoiceBindingsStore(target).load();
  assert.match(store.snapshot().warning,/禁止覆盖/);
  await assert.rejects(store.save(),/禁止覆盖/);
  assert.equal(fs.readFileSync(target,'utf8'),raw);
  assert(fs.readdirSync(dir).some(name=>name.startsWith('voices.json.invalid-')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('overlapping task journal flushes keep the most recent account states',async()=>{
 const {dir,file}=scratch();
 try{
  const target=file('journal.json'),journal=new TaskJournal(target);
  journal.update({accountId:'A01',state:'done',message:'complete'});
  const first=journal.flush();
  journal.update({accountId:'A02',state:'error',message:'retry later'});
  const second=journal.flush();
  await Promise.all([first,second]);
  const saved=JSON.parse(fs.readFileSync(target,'utf8'));
  assert.equal(saved.length,2);
  assert.deepEqual(saved.map(v=>v.accountId),['A01','A02']);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('damaged encrypted API settings are preserved and cannot be silently overwritten',async()=>{
 const {dir,file}=scratch();
 try{
  const target=file('api-settings.json'),original='{ "encryptedKey":';
  fs.writeFileSync(target,original);
  const storage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:bytes=>bytes.toString()};
  const api=new ApiSettings({file:target,safeStorage:storage});
  assert.match(api.snapshot().loadWarning,/禁止覆盖/);
  await assert.rejects(api.save({provider:'openai',endpoint:'https://api.openai.com/v1',model:'test'}),/禁止覆盖/);
  assert.equal(fs.readFileSync(target,'utf8'),original);
  assert(fs.readdirSync(dir).some(name=>name.startsWith('api-settings.json.invalid-')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('concurrent API settings writes are serialized and the newest encrypted value persists',async()=>{
 const {dir,file}=scratch();
 try{
  const storage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:bytes=>bytes.toString()};
  const target=file('api-settings.json'),api=new ApiSettings({file:target,safeStorage:storage});
  const first=api.save({provider:'openai',endpoint:'https://api.openai.com/v1',model:'first',key:'test-private-key'});
  const second=api.save({provider:'openai',endpoint:'https://api.openai.com/v1',model:'second',key:'test-private-key'});
  await Promise.all([first,second]);
  assert.equal(JSON.parse(fs.readFileSync(target,'utf8')).model,'second');
  assert.equal(JSON.parse(fs.readFileSync(target+'.bak','utf8')).model,'first');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
