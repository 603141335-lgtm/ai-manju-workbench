'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {scanAndAct,ensure}=require('../src/video-mode');
const {ApiSettings,validateEndpoint}=require('../src/api-settings');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function el(textContent,attributes={}){
  return {textContent,attributes,className:attributes.class||'',
    getAttribute(k){return this.attributes[k]||null},
    getBoundingClientRect(){return {width:240,height:42}},
    querySelector(){return null}
  };
}
function probe(controls,editors,chipElements=[]){
  const context={
    document:{querySelectorAll(selector){
      if(selector.startsWith('button'))return controls;
      if(selector.startsWith('textarea'))return editors;
      return chipElements;
    }},
    getComputedStyle:()=>({display:'block',visibility:'visible'})
  };
  return vm.runInNewContext('('+scanAndAct.toString()+')("probe")',context);
}
test('v0.9.7: selected video chip and model, auto 15 seconds are detected without inventing 16:9',()=>{
  const p=probe([
    el('▣ 视频生成 ×'),el('✧ 模型 Seedance 2.0 Fast ▾'),el('自动 · 15s ▾')
  ],[el('',{placeholder:'描述你想要的视频'})]);
  assert.equal(p.video,true);assert.equal(p.model,true);
  assert.equal(p.duration,true);assert.equal(p.ratio,false);
  assert.equal(p.source,'视频输入框');
});
test('v0.9.7: chat-screen video option is NOT mistaken for selected video mode',()=>{
  const p=probe([el('对话'),el('视频生成'),el('图像生成')],[el('',{placeholder:'发消息或按住空格说话…'})]);
  assert.equal(p.video,false);
  assert.equal(p.genericComposer,true);
});
test('v0.9.7: explicit selected video chip works even when editor placeholder is generic',()=>{
  const p=probe([el('▣ 视频生成 ×'),el('Seedance 2.0 Fast'),el('16:9 · 15s')],[el('',{placeholder:'输入生成描述'})]);
  assert.equal(p.video,true);assert.equal(p.ratio,true);assert.equal(p.duration,true);
});
test('v0.9.7: unknown ratio does not block import readiness; no page click side effect',async()=>{
  const events=[];
  const wc={isDestroyed:()=>false,getURL:()=> 'https://www.doubao.com/chat/',
    executeJavaScript:async code=>{events.push(code);return {video:true,model:true,ratio:false,duration:true}}
  };
  const r=await ensure(wc);assert.equal(r.ready,true);assert.equal(r.settingsVerified,false);
  assert.match(r.message,/16:9/);assert.equal(events.length,1);
  assert(!events.some(c=>/\.click\(\)/.test(c)));
});
test('v0.9.7: user API keys encrypted locally; not returned through settings snapshot',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-api-'));
  const safeStorage={
    isEncryptionAvailable:()=>true,
    encryptString:txt=>Buffer.from('enc:'+txt),
    decryptString:buf=>buf.toString().replace(/^enc:/,'')
  };
  const requests=[];
  const transport=async(url,method,headers,payload)=>{
    requests.push({url,method,headers,payload});
    if(method==='GET')return {data:[{id:'model'}]};
    return {choices:[{message:{content:'成功回复'}}],usage:{total_tokens:15}};
  };
  const api=new ApiSettings({file:path.join(dir,'api-settings.json'),safeStorage,transport});
  await api.save({provider:'deepseek',endpoint:'https://api.deepseek.com/v1',model:'deepseek-chat',key:'secret-should-not-appear'});
  const stored=fs.readFileSync(api.file,'utf8');
  assert(!stored.includes('secret-should-not-appear'));
  assert(!JSON.stringify(api.snapshot()).includes('secret-should-not-appear'));
  const checked=await api.check();assert.equal(checked.ok,true);
  const reply=await api.chat('你好');assert.equal(reply.text,'成功回复');
  assert.equal(requests[0].url,'https://api.deepseek.com/v1/models');
  assert.equal(requests[1].url,'https://api.deepseek.com/v1/chat/completions');
  assert.equal(requests[1].payload.messages[0].content,'你好');
  assert.equal(requests[1].payload.max_tokens,160);
  const next=new ApiSettings({file:api.file,safeStorage,transport});
  assert.equal(next.snapshot().hasKey,true);
  await next.save({provider:'deepseek',endpoint:'https://api.deepseek.com/v1',model:'deepseek-chat',clearKey:true});
  assert.equal(next.snapshot().hasKey,false);
});
test('v0.9.7: API refuses unsafe endpoints and plaintext storage when OS encryption unavailable',async()=>{
  for(const endpoint of ['http://api.example.com/v1','https://localhost:9876/v1','https://192.168.1.11/v1',
    'https://user:pw@example.com/v1','file:///tmp/x','https://api.example.com/v1/chat/completions']){
    assert.throws(()=>validateEndpoint(endpoint));
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'public-api-nocrypto-'));
  const api=new ApiSettings({file:path.join(dir,'api.json'),safeStorage:{isEncryptionAvailable:()=>false}});
  await assert.rejects(api.save({provider:'custom',endpoint:'https://api.example.com/v1',model:'a',key:'secret'}),/加密/);
  assert(!fs.existsSync(api.file));
});
test('v0.9.7: API UI is top left, all memory mode controls removed, video retry remains',()=>{
  const html=source('src/index.html'),preload=source('src/preload.js'),main=source('src/main.js');
  assert.match(html,/<header class="topbar">\s*<button class="apiHeadBtn" id="btnApi"/);
  assert.match(html,/id="apiDialog"/);assert.match(html,/id="apiCheck"/);
  assert.match(html,/id="btnVideoManual"/);assert.match(html,/id="btnVideoRetry"/);
  assert(!html.includes('id="performanceDialog"'));assert(!html.includes('id="btnPerformance"'));
  assert.match(preload,/videoManualConfirm/);
  assert.match(preload,/apiChat/);assert.match(main,/guardedHandle\('api:chat'/);
  assert.match(main,/manualVideoSessions\.delete\(id\)/);
});
