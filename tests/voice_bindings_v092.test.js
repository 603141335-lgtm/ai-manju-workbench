'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {VoiceBindingsStore,selectVoices,audioLine,LIMIT}=require('../src/voice-bindings');
const {createPlan}=require('../src/import-engine');const core=require('../src/import-core');const web=require('../src/voice-page');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doubao-voice-test-'));const file=name=>path.join(dir,name);
function wav(filename,seconds=3){const fn=file(filename),sampleRate=8000,n=seconds*sampleRate,b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);fs.writeFileSync(fn,b);return fn;}
const f1=wav('A15_常规.wav',3),f2=wav('A15_激动.wav',4),f3=wav('A32_低沉.wav',3);
test('按人物图号绑定多个声音样本、默认样本保存并可修改',async()=>{
 const st=await new VoiceBindingsStore(file('voices.json'),{probe:async p=>p===f2?4:3}).load();await st.add('A15',[f1,f2],'杜不凡声音');await st.add('A32',[f3],'老关声音');
 assert.equal(st.data.bindings.A15.length,2);assert.equal(st.data.bindings.A15.filter(x=>x.isDefault).length,1);
 let p=st.plan([{code:'A15'},{code:'A32'}]);assert.equal(p.blocked,false);assert.equal(p.items.length,2);assert.equal(p.items[0].imageIndex,1);assert.equal(p.items[1].imageIndex,2);assert.equal(p.totalSeconds,6);
 const second=st.data.bindings.A15[1];await st.setDefault('A15',second.id);
 const restored=await new VoiceBindingsStore(file('voices.json'),{probe:async p=>p===f2?4:3}).load();assert.equal(restored.plan([{code:'A15'}]).items[0].path,f2);
 await restored.remove('A15',second.id);assert.equal(restored.plan([{code:'A15'}]).items[0].path,f1);
});
test('只自动上传本段出现的人物音色，不把不相关音频加入',()=>{
 const v=selectVoices({A15:[{path:f1,label:'杜不凡',duration:3,isDefault:true}],A32:[{path:f3,label:'老关',duration:3,isDefault:true}]},[{code:'A15'},{code:'B13'}]);
 assert.deepEqual(v.items.map(x=>x.code),['A15']);assert.equal(v.blocked,false);
});
test('3段/总15秒限制，单段无效与缺文件都阻止',()=>{
 const many={};for(const [i,k] of ['A15','A32','A33','A34'].entries())many[k]=[{path:f1,label:'声音'+i,duration:5,isDefault:true}];
 const p=selectVoices(many,Object.keys(many).map(code=>({code})));assert(p.blocked);assert(p.errors.some(x=>x.includes('超过')));
 const broken=selectVoices({A15:[{path:file('gone.wav'),duration:3}]},[{code:'A15'}]);assert(broken.blocked);
 assert.equal(LIMIT.maxClips,3);
});
test('v0.9.9: voice instructions remain without extra numbered image lines',()=>{
 const original='第1段｜测试｜15秒\n需要参考图：A15、A32\n连续性参考：测试镜头\n0—3秒｜台词：不改动！\n限制：无背景音乐、无字幕\n';
 const out=core.composeText(original,[{code:'A15',file:{name:'A15.png'}},{code:'A32',file:{name:'A32.png'}}],0,[{code:'A15',label:'杜不凡声音',filename:path.basename(f1),imageIndex:1},{code:'A32',label:'老关声音',filename:path.basename(f3),imageIndex:2}]);
 assert(out.startsWith(original));
 assert(out.includes('音频1 = A15')&&out.includes('音频2 = A32'));
 assert(out.includes('A15中的人物使用音频1'));
 assert(out.includes('台词：不改动！'));
 assert(!out.includes('图1锁定人物'));
 assert.equal(audioLine({code:'A15',label:'杜不凡声音',path:f1},0),'音频1 = A15（杜不凡声音：'+path.basename(f1)+'）');
});

test('音频上传桥接具有明确格式检查；不存在可用输入时不可伪报成功',()=>{
 assert.equal(typeof web.probeAudio,'function');assert.equal(typeof web.selectAudioBatch,'function');
 assert.match(web.selectAudioBatch.toString(),/input\.files=transfer\.files/);
 assert.match(web.selectAudioBatch.toString(),/unsupported:true/);
 assert.match(fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),/voiceBindings\.plan\(items\)/);
});

test('ffprobe 对真实 WAV 文件读取正确时长（如工具可用）',async t=>{
 const found=cp.spawnSync('ffprobe',['-version'],{encoding:'utf8'});
 if(found.error){t.skip('FFprobe not installed; Windows packaged build includes it');return;}
 const {probeDuration}=require('../src/voice-bindings');
 assert.equal(await probeDuration(f1,'ffprobe'),3);
});
