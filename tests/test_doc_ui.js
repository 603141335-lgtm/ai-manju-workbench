'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const base=path.join(__dirname,'..','app');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const script=fs.readFileSync(path.join(base,'renderer.js'),'utf8');
const state={
 project:{title:'我的AI漫剧项目',assetFolder:'',groups:[],chosenPaths:{},episodes:[{
   id:'e1',groupId:null,number:10,title:'第10集｜夜市',
   original:'第10集\n第1段｜完整内容',preamble:'',
   segments:[
     {id:'s1',n:1,title:'第一段',text:'第1段｜完整提示词\n台词：不可删改\n需要参考图：A01',codes:['A01'],method:'栏目识别'},
     {id:'s2',n:2,title:'第二段',text:'第2段｜完整提示词\n台词：也不可删改\n需要参考图：B02',codes:['B02'],method:'栏目识别'}
   ]
 }]},
 assetList:[{code:'A01',items:[{id:'a1',path:'C:/images/A01.png',name:'A01.png',relative:'A01.png',thumb:'data:,'}]},
 {code:'B02',items:[{id:'a2',path:'C:/images/B02.png',name:'B02.png',relative:'B02.png',thumb:'data:,'}]}],
 scanStats:{}
};
const snap=()=>structuredClone(state);
const api={
 getState:async()=>snap(),importText:async()=>null,importFiles:async()=>null,
 chooseFolder:async()=>null,rescan:async()=>snap(),dragTester:async()=>true,
 backup:async()=>null,restore:async()=>null,
 rename:async n=>{state.project.title=n;return snap();},
 editSegment:async v=>{const t=state.project.episodes.find(e=>e.id===v.episodeId).segments.find(s=>s.id===v.segmentId);t.text=v.text;return snap();},
 chooseVersion:async()=>snap(),copy:async text=>{api.lastCopied=text;return true;},
 removeEpisode:async()=>snap(),exportEpisode:async()=>({images:0,missing:0,errors:[]}),
 createGroup:async v=>{const group={id:'g'+(state.project.groups.length+1),title:v.title,parentId:v.parentId||null};state.project.groups.push(group);return {group,data:snap()};},
 renameGroup:async v=>{state.project.groups.find(g=>g.id===v.id).title=v.title;return snap();},
 removeGroup:async()=>snap(),
 createDocument:async v=>{const episode={id:'e'+(state.project.episodes.length+1),groupId:v.groupId||null,title:v.title,number:null,preamble:'',original:'',segments:[{id:'ss'+state.project.episodes.length,n:1,title:'第1段',text:'',codes:[],method:'未找到编号'}]};state.project.episodes.push(episode);return {episode,data:snap()};},
 renameDocument:async v=>{state.project.episodes.find(e=>e.id===v.id).title=v.title;return snap();},
 moveDocument:async v=>{state.project.episodes.find(e=>e.id===v.id).groupId=v.groupId;return snap();},
 onDragError:()=>{},startNativeDrag:()=>{}
};
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,document=window.document;
window.manju=api;window.confirm=()=>true;window.prompt=()=>null;
window.HTMLElement.prototype.scrollTo=function(){};
window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
window.eval(script);
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
(async()=>{
 await tick();
 assert.equal(document.querySelectorAll('.segment').length,2);
 assert(!document.body.textContent.includes('Edge账号小窗'));
 const boxes=[...document.querySelectorAll('.prompt-box')];
 const galleries=[...document.querySelectorAll('.gallery')];
 boxes[0].focus();
 boxes[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));
 assert(window.getSelection().toString().includes('不可删改'),'Ctrl+A selects first segment text only');
 galleries[0].focus();
 galleries[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));
 assert.equal(window.getSelection().toString(),'','Selecting images clears text selection');
 assert.equal(galleries[0].querySelectorAll('.image-tile.selected').length,1);
 galleries[1].focus();
 galleries[1].dispatchEvent(new window.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));
 assert.equal(galleries[0].querySelectorAll('.image-tile.selected').length,0,'Previous segment image selection cleared');
 assert.equal(galleries[1].querySelectorAll('.image-tile.selected').length,1);
 const copy=Array.from(document.querySelectorAll('.segment'))[1].querySelector('.segment-actions .primary');
 copy.click();await tick();
 assert.equal(api.lastCopied,state.project.episodes[0].segments[1].text,'Copies complete second segment');
 assert.equal(galleries[1].querySelectorAll('.image-tile.selected').length,0,'Copy clears old image selection');
 const range=document.getElementById('panelSize');
 range.value='240';range.dispatchEvent(new window.Event('input',{bubbles:true}));
 for(const pane of document.querySelectorAll('.segment-workarea'))assert.equal(pane.style.height,'240px');
 const create=async(btn,title)=>{
  document.getElementById(btn).click();
  document.getElementById('docNameInput').value=title;
  document.getElementById('docDialogSave').click();await tick();
 };
 await create('newRootBtn','《食神小祖宗》大剧本');
 assert.equal(state.project.groups[0].title,'《食神小祖宗》大剧本');
 document.querySelector('.tree-group-title.root').click();
 await create('newSubBtn','1-10集提示词');
 assert.equal(state.project.groups[1].parentId,state.project.groups[0].id);
 document.querySelector('.tree-group-title.sub').click();
 await create('newDocBtn','第11集');
 assert.equal(state.project.episodes.at(-1).groupId,state.project.groups[1].id);
 assert(document.querySelectorAll('.doc-tree-row').length>=3);
 console.log('PASS document UI: tree buttons, no Edge UI, complete copy, scoped selections, sync resizing');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
