'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const app=path.join(__dirname,'..','app');
const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
const renderer=fs.readFileSync(path.join(app,'renderer.js'),'utf8');
const css=fs.readFileSync(path.join(app,'style.css'),'utf8');
function sample(){
 const episodes=[{id:'e1',number:11,title:'第11集',groupId:null,preamble:'',segments:[
  {id:'s1',n:11,title:'当事人陈述',text:'原提示词A\n台词和动作不得删减',codes:['A01'],method:'栏目识别'},
  {id:'s2',n:12,title:'警方现场',text:'原提示词B\n第二段内容',codes:['B02'],method:'栏目识别'}]},
  {id:'e2',number:12,title:'第12集',groupId:null,preamble:'',segments:[
   {id:'s3',n:1,title:'下一集',text:'原提示词C',codes:[],method:'栏目识别'}]}];
 return {project:{title:'测试作品',assetFolder:'',groups:[],episodes,chosenPaths:{}},
  assetList:[
   {code:'A01',items:[{id:'a1',path:'C:/A01.png',name:'A01.png',relative:'A01.png',thumb:'data:,'}]},
   {code:'B02',items:[{id:'a2',path:'C:/B02.png',name:'B02.png',relative:'B02.png',thumb:'data:,'}]}],
  scanStats:{}};
}
const data=sample();
const copyCalls=[];
function create(initial={}){
 const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;
 w.confirm=()=>true;w.prompt=()=>null;
 w.HTMLElement.prototype.scrollTo=function(){};
 w.HTMLElement.prototype.scrollIntoView=function(){this.dataset.didScroll='yes';};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const api={
  getState:async()=>structuredClone(data),
  copy:async txt=>{copyCalls.push(txt);return true;},
  importText:async()=>null,importFiles:async()=>null,chooseFolder:async()=>null,
  rescan:async()=>structuredClone(data),dragTester:async()=>true,
  backup:async()=>null,restore:async()=>structuredClone(data),
  rename:async()=>structuredClone(data),editSegment:async()=>structuredClone(data),
  chooseVersion:async()=>structuredClone(data),removeEpisode:async()=>structuredClone(data),
  exportEpisode:async()=>({images:0,missing:0,errors:[]}),
  createGroup:async()=>null,renameGroup:async()=>null,removeGroup:async()=>null,
  createDocument:async()=>null,renameDocument:async()=>null,moveDocument:async()=>null,
  onDragError:()=>{},startNativeDrag:()=>{}
 };
 for(const [key,value] of Object.entries(initial))w.localStorage.setItem(key,value);
 w.manju=api;
 w.eval(renderer);
 return {dom,w,d,api};
}
const pause=()=>new Promise(r=>setTimeout(r,35));
function card(d,id){return [...d.querySelectorAll('.segment')].find(x=>x.dataset.segmentId===id);}
(async()=>{
 const {dom,w,d}=create();
 await pause();
 assert.equal(d.querySelectorAll('.segment').length,2);
 assert.equal(d.querySelector('.fold-toggle').getAttribute('aria-expanded'),'true');
 assert.equal(d.querySelector('#foldAllBtn').textContent,'全部收起');
 // Folding must suppress all non-title UI, including badge, copy, references and empty space.
 card(d,'s1').querySelector('.fold-toggle').click();
 assert(card(d,'s1').classList.contains('is-collapsed'));
 assert.equal(card(d,'s1').querySelector('.fold-toggle').getAttribute('aria-expanded'),'false');
 assert(css.includes('.segment.is-collapsed .segment-actions')&&
        css.includes('.segment.is-collapsed .segment-sub')&&
        css.includes('.segment.is-collapsed .segment-workarea')&&
        css.includes('.segment.is-collapsed .drag-footer')&&
        css.includes('.segment.is-collapsed .warning'));
 assert.equal(card(d,'s1').querySelector('.segment-title').textContent,'01 · 第11段｜当事人陈述');
 assert.equal(d.querySelector('#foldAllBtn').textContent,'全部收起');
 // Toggle all after a partial collapse: every segment in the current document folds.
 d.querySelector('#foldAllBtn').click();
 assert([...d.querySelectorAll('.segment')].every(c=>c.classList.contains('is-collapsed')));
 assert.equal(d.querySelector('#foldAllBtn').textContent,'全部展开');
 const key=Array.from({length:w.localStorage.length},(_,i)=>w.localStorage.key(i)).find(k=>k.startsWith('manju-doc-v45:'));
 assert(key,'Stored state key must exist');
 assert.deepEqual(JSON.parse(w.localStorage.getItem(key)).collapsed.sort(),['s1','s2']);
 // Renderer rerender must retain collapse state without changing prompt data.
 w.eval('render()');
 assert([...d.querySelectorAll('.segment')].every(c=>c.classList.contains('is-collapsed')));
 d.querySelector('#foldAllBtn').click();
 assert([...d.querySelectorAll('.segment')].every(c=>!c.classList.contains('is-collapsed')));
 assert.equal(d.querySelector('#foldAllBtn').textContent,'全部收起');
 // Scoped image selections, and switching segments clears the previous images and any text selection.
 const gallery1=card(d,'s1').querySelector('.gallery');
 const gallery2=card(d,'s2').querySelector('.gallery');
 gallery1.dispatchEvent(new w.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));
 assert.equal(gallery1.querySelectorAll('.image-tile.selected').length,1);
 gallery2.dispatchEvent(new w.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}));
 assert.equal(gallery1.querySelectorAll('.image-tile.selected').length,0);
 assert.equal(gallery2.querySelectorAll('.image-tile.selected').length,1);
 // Copy is complete and feedback is inside its button, not an overlay.
 const copy=card(d,'s2').querySelector('.copy-prompt-btn');
 copy.click();await pause();
 assert.equal(copyCalls.at(-1),data.project.episodes[0].segments[1].text);
 assert.equal(copy.textContent,'✓ 已复制');
 assert.equal(gallery2.querySelectorAll('.image-tile.selected').length,0);
 assert(d.querySelector('#toast').classList.contains('hidden'));
 assert.equal(JSON.parse(w.localStorage.getItem(key)).last.segmentId,'s2');
 // Sidebar fast jump expands a folded target and scrolls it into view.
 card(d,'s1').querySelector('.fold-toggle').click();
 const caret=d.querySelector('.doc-tree-row .tree-caret');caret.click();
 const link=[...d.querySelectorAll('.tree-segment')].find(x=>x.dataset.segmentId==='s1');
 assert(link,'Sidebar nested segment is reachable');
 link.click();await pause();
 assert(!card(d,'s1').classList.contains('is-collapsed'),'Jump reopens selected folded segment');
 assert(card(d,'s1').classList.contains('is-current'));
 assert.equal(card(d,'s1').dataset.didScroll,'yes');
 // Remember the most recently worked segment across a fresh app startup.
 card(d,'s2').querySelector('.fold-toggle').click();
 // Folding a different segment isn't necessarily the last editing action.
 card(d,'s1').querySelector('.copy-prompt-btn').click();
 await pause();
 const keyAfter=w.localStorage.getItem(key);
 assert(JSON.parse(keyAfter).collapsed.includes('s2'));
 const fresh=create({[key]:keyAfter});
 await pause();
 assert.equal(fresh.d.querySelector('#episodeTitle').textContent,'第11集');
 assert(card(fresh.d,'s1').classList.contains('is-current'),'Last segment restored');
 assert(card(fresh.d,'s2').classList.contains('is-collapsed'),'Folded state restored');
 // Changing current document must not erase its stored collapse state.
 const second=[...fresh.d.querySelectorAll('.tree-doc-title')].find(b=>b.textContent.includes('第12集'));
 assert(second);second.click();await pause();
 assert.equal(fresh.d.querySelector('#episodeTitle').textContent,'第12集');
 assert.equal(JSON.parse(fresh.w.localStorage.getItem(key)).last.episodeId,'e2');
 assert.equal(data.project.episodes[0].segments[0].text,'原提示词A\n台词和动作不得删减');
 assert.deepEqual(data.project.episodes[0].segments[0].codes,['A01']);
 fresh.dom.window.close();dom.window.close();
 console.log('PASS v4.5: title-only fold, batch toggle, persisted state, sidebar jump, copy feedback, scoped image selection');
})().catch(e=>{console.error(e);process.exitCode=1;});
