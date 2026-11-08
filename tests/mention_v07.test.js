'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildPlan,matchVisibleAttachment,isAllowedDoubaoUrl}=require('../src/mention-core');
const {createMentionRunner}=require('../src/mention-runner');
const image=code=>({path:path.join(os.tmpdir(),code+'.png'),name:code+'.png'});
const rows=codes=>codes.map(code=>({code,file:image(code),versions:[image(code)],missing:false}));
test('reference codes exact; A01 never matches A01-01',()=>{
 const p=buildPlan({prompt:'需要参考图：A01-01、A01、B02\n台词：C02不是本段参考',segmentCodes:['C02'],rows:rows(['A01','A01-01','B02'])});
 assert.deepEqual(p.codes,['A01-01','A01','B02']);assert.equal(p.blocked,false);
 assert.equal(matchVisibleAttachment('A01',[{name:'A01-01.png'}]),'unknown');
});
test('ambiguous version and missing file block upload',()=>{
 const rs=rows(['A15']);rs[0].versions=[image('A15'),{path:'A15-new.png',name:'A15-new.png'}];
 const p=buildPlan({prompt:'需要参考图：A15、B02',rows:rs});
 assert.equal(p.rows[0].state,'conflict');assert.equal(p.rows[1].state,'missing');assert.equal(p.blocked,true);
 const chosen=buildPlan({prompt:'需要参考图：A15',rows:rs,chosenPaths:{A15:image('A15').path}});assert.equal(chosen.blocked,false);
});
test('over nine blocked and suspicious sites not allowed',()=>{
 const codes=Array.from({length:10},(_,i)=>'A'+String(i+1).padStart(2,'0'));
 assert.equal(buildPlan({prompt:'需要参考图：'+codes.join('、'),rows:rows(codes)}).blocked,true);
 assert(isAllowedDoubaoUrl('https://www.doubao.com/chat/'));
 assert(!isAllowedDoubaoUrl('https://doubao.com.evil.com/chat/'));
});
test('absent reference image stops before upload',async()=>{
 const wc={getURL:()=> 'https://www.doubao.com/chat/',isDestroyed:()=>false,executeJavaScript:async()=>({ready:true,prompt:'需要参考图：B02',attachments:[],mentions:[]})};
 const runner=createMentionRunner({getActive:()=>({accountId:'one',webContents:wc}),resolveRows:()=>[],getCodes:()=>['B02'],getChosenPaths:()=>({})});
 assert.equal((await runner.preflight({episodeId:'e',segmentId:'s'})).rows[0].state,'missing');
 await assert.rejects(()=>runner.execute({episodeId:'e',segmentId:'s'}),/缺图/);
});
test('real browser IPC added; no canvas and app identity stable',()=>{
 const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(read('src/index.html'),/id="btnMention"/);
 assert.match(read('src/main.js'),/mention:execute/);
 assert.match(read('src/preload.js'),/mentionExecute/);
 assert(!fs.existsSync(path.join(root,'src/canvas')));
 assert.equal(JSON.parse(read('package.json')).build.appId,'com.manju.doubao.creativehub');
});
