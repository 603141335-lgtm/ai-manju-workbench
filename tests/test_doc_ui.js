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
 // Drag the native-feeling vertical divider to resize the document outline.
 assert.equal(document.getElementById('panelSize'),null,'No toolbar slider');
 const side=document.getElementById('sidebarResize');
 assert(side,'sidebar resize divider exists');
 side.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:264}));
 window.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:340}));
 window.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true}));
 assert.equal(document.querySelector('.sidebar').style.flexBasis,'340px');
 // One resizing handle for BOTH text and images, with a constant 50/50 split.
 const pane=document.querySelector('.segment-workarea');
 assert(pane.querySelector('.content')&&pane.querySelector('.image-pane'),'Both panes preserved');
 assert(pane.querySelector('.fixed-divider'),'Non-interactive visual separator exists');
 assert(!pane.querySelector('.fixed-divider').hasAttribute('tabindex'),'Text/image divider cannot be resized alone');
 assert.equal(pane.dataset.promptRatio,undefined,'Old independent ratio control removed');
 const corner=pane.querySelector('.unified-resize-handle');
 assert(corner,'One unified resize corner exists');
 const card=pane.closest('.segment');
 card.getBoundingClientRect=()=>({width:600,height:500});
 corner.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:400,clientY:100}));
 window.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:350,clientY:140}));
 window.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true}));
 for(const p of document.querySelectorAll('.segment-workarea'))
  assert.equal(p.style.height,'380px','All text+image areas grow together by 40px');
 const widths=[...document.querySelectorAll('.segment')].map(el=>el.style.width);
 assert(widths.every(w=>w===widths[0]),'All segment cards use the same overall width');
 assert(Number.parseInt(widths[0])<100,'Whole unit gets narrower, not just one pane');
 assert.equal(document.querySelectorAll('.prompt-box').length,2,'Prompt texts still present');
 assert.equal(document.querySelectorAll('.image-tile').length,2,'Reference images still present');
 assert.equal(state.project.episodes[0].segments[0].text,'第1段｜完整提示词\n台词：不可删改\n需要参考图：A01');
 assert.deepEqual(state.project.episodes[0].segments[1].codes,['B02']);
 const create=async(label,title)=>{
  const menu=document.getElementById('treeMenu');
  const action=[...menu.querySelectorAll('button')].find(b=>b.textContent.includes(label));
  assert(action,'Menu must include '+label);
  action.click();
  document.getElementById('docNameInput').value=title;
  document.getElementById('docDialogSave').click();await tick();
 };
 assert(!document.getElementById('newRootBtn'),'Top row create buttons have been removed');
 document.getElementById('rootMenuBtn').click();
 await create('新建大标题','《食神小祖宗》大剧本');
 assert.equal(state.project.groups[0].title,'《食神小祖宗》大剧本');
 const rootGroup=document.querySelector('.tree-group-title.root');
 rootGroup.parentElement.querySelector('.tree-ellipsis').click();
 await create('创建小标题','1-10集提示词');
 assert.equal(state.project.groups[1].parentId,state.project.groups[0].id);
 const sub=document.querySelector('.tree-group-title.sub');
 sub.parentElement.querySelector('.tree-ellipsis').click();
 await create('创建文档','第11集');
 assert.equal(state.project.episodes.at(-1).groupId,state.project.groups[1].id);
 assert(document.querySelectorAll('.doc-tree-row').length>=3);
 // The document has an independent three-dot menu and can be renamed.
 const created=[...document.querySelectorAll('.doc-tree-row')]
   .find(row=>row.textContent.includes('第11集'));
 assert(created,'new document is displayed in the left tree');
 created.querySelector('.tree-ellipsis').click();
 assert([...document.getElementById('treeMenu').querySelectorAll('button')]
    .some(el=>el.textContent.includes('新建大标题')),'Any document ellipsis offers title creation');
 await create('重命名文档','第11集｜新标题');
 assert.equal(state.project.episodes.at(-1).title,'第11集｜新标题');
 console.log('PASS v4.4 UI: per-row title menu, free sidebar, shared prompt/image resize, source unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
