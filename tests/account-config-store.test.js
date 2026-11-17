'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validAccountConfig,saveAccountConfig,readOrCreateAccountConfig}=require('../src/account-config-store');
const sample=()=>({version:1,accounts:[{id:'a'}],groups:[{id:'g'}],segments:[]});
function tempFile(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-account-safe-'));
 return {dir,file:path.join(dir,'config.json')};
}
test('account config initializes once and preserves persisted account identities',()=>{
 const {dir,file}=tempFile();
 try{
  const first=readOrCreateAccountConfig(file,sample);
  assert.deepEqual(first,sample());
  const second=readOrCreateAccountConfig(file,()=>{throw Error('must not generate a new profile')});
  assert.deepEqual(second,first);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('unparseable account config fails closed without overwriting original bytes',()=>{
 const {dir,file}=tempFile();
 try{
  const broken='{ "accounts":';
  fs.writeFileSync(file,broken);
  assert.throws(()=>readOrCreateAccountConfig(file,sample),/原文件已保留/);
  assert.equal(fs.readFileSync(file,'utf8'),broken);
  assert(fs.readdirSync(dir).some(name=>name.startsWith('config.json.corrupted-')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('unsupported account config never resets accounts, groups or segments',()=>{
 const {dir,file}=tempFile();
 try{
  const existing=JSON.stringify({version:999,accounts:[{id:'original-account'}],groups:[],segments:[]});
  fs.writeFileSync(file,existing);
  assert.throws(()=>readOrCreateAccountConfig(file,sample),/不兼容/);
  assert.equal(fs.readFileSync(file,'utf8'),existing);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('saving account config keeps a byte-for-byte rollback and rejects invalid writes',()=>{
 const {dir,file}=tempFile();
 try{
  saveAccountConfig(file,sample());
  const original=fs.readFileSync(file);
  const updated={...sample(),accounts:[{id:'new'}]};
  saveAccountConfig(file,updated);
  assert.deepEqual(fs.readFileSync(file+'.bak'),original);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).accounts[0].id,'new');
  assert.equal(validAccountConfig({version:1,accounts:[],groups:[]} ),false);
  assert.throws(()=>saveAccountConfig(file,{version:1,accounts:[],groups:[]}),/拒绝写入/);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).accounts[0].id,'new');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
