'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('mobile-android/app/src/main/assets/studio/studio-cloud.js','utf8');
const captures={};
const elements={};
const el=id=>elements[id]||(elements[id]={value:'',textContent:'',innerHTML:'',style:{},dataset:{},disabled:false,
  classList:{add(){},remove(){}},addEventListener(type,fn){captures['handler:'+id+':'+type]=fn},setAttribute(){}});
const document={getElementById:el};
let logged=false;
const user={id:'user-test-001',email:'user@example.com'};
const auth={
 signInWithPassword:async fields=>{captures.login=fields;logged=true;return {data:{user,session:{user}}}},
 getSession:async()=>({data:logged?{user,session:{user}}:{}}),
 signOut:async()=>({data:{}})
};
const db={from(name){captures.table=name;return {select(){return Promise.resolve({data:[]})}}}};
const sdk={init:opts=>{captures.init=opts;return {auth,rdb:()=>db}}};
const window={ManjuCloudBaseSDK:sdk,Native:{getCloudOwner:()=>'',getCloudWorkspaceForUid:()=>'',saveCloudWorkspace(){},cacheCloudAsset(){},registerWithInvite:(username,password,invite)=>{captures.invite={username,password,invite}}}};
const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const location={reload(){}};
vm.runInNewContext(source,{window,document,localStorage,location,setTimeout,clearTimeout,console},{timeout:3000});
(async()=>{
 const cloud=window.ManjuCloud;
 assert.equal(cloud.normalize('Ａ０１－０１'),'A01-01');
 assert.match(cloud.diagnose(Error('Failed to fetch')),/网络/);
 await cloud.open();
 assert.equal(captures.init.region,'ap-singapore');
 el('cloudUsername').value='manjuuser';el('cloudPassword').value='strongPassword123';el('cloudInvite').value='MH-123456789012345678901234';
 const click=async action=>{
  let button={dataset:{cloud:action},disabled:false};
  await captures['handler:modal:click']({target:{closest:()=>button}});
  return button;
 };
 await click('mode-register');await click('register');
 assert.equal(captures.invite.username,'manjuuser');
 assert.equal(captures.invite.invite,'MH-123456789012345678901234');
 await cloud.registrationResult(true,'注册成功');
 assert.equal(captures.login.username,'manjuuser');
 assert.equal(captures.login.password,'strongPassword123');
  assert.equal(captures.table,'manju_projects');
 console.log('CloudBase V2.2 Singapore, signup, password login and project access: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
