import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { QueueEngine } from '../src/queue.mjs';
const make=()=>{const dir=mkdtempSync(path.join(tmpdir(),'wq-a-'));return {dir,q:new QueueEngine(dir)}};
function destroy({dir,q}){q.close();rmSync(dir,{recursive:true,force:true})}
function reply(n,tag){return `第${n}集｜${tag}\n完整故事正文：角色推动冲突，进行真实对话和动作，并交代本集任务，保留重要剧情信息。\n本集结尾状态：人物和道具状态已更新。`}
test('30集x3阶段可逐集产生完整文件，未经人工审批不越过集数',()=>{
 const ctx=make();try{
  const j=ctx.q.createJob({title:'30集测试',source:'完整小说原始剧情及人物设定',totalEpisodes:30,episodePlans:Array.from({length:30},(_,i)=>`第${i+1}集纲要`)});
  assert.equal(j.episodes.length,30);assert.equal(j.episodes[0].stages.length,3);
  ctx.q.start(j.id);
  for(let n=1;n<=30;n++){
   for(const tag of ['文案','分镜','质检']){
    const curr=ctx.q.current(j.id);assert.equal(curr.episode,n);assert.equal(curr.stage.status,'waiting_web');
    assert.ok(curr.prompt.includes('完整小说原始剧情'));assert.ok(curr.prompt.includes(`第${n}集纲要`));
    const r=ctx.q.importReply(j.id,reply(n,tag));assert.equal(r.report.pass,true);
    assert.ok(existsSync(r.artifact.file));
   }
   assert.equal(ctx.q.current(j.id).stage,null);
   assert.equal(ctx.q.getJob(j.id).episodes[n-1].status,'needs_review');
   ctx.q.approveEpisode(j.id,{continuity:{ending:`第${n}集结尾，下一集继续`}});
  }
  assert.equal(ctx.q.getJob(j.id).status,'completed');
  const out=ctx.q.exportCompleted(j.id);assert.equal(out.episodes,30);
  assert.ok(readFileSync(out.file,'utf8').includes('第30集'));
  assert.equal(ctx.q.getJob(j.id).episodes.filter(x=>x.status==='completed').length,30);
 }finally{destroy(ctx)}
});
test('进程重启后从安全检查点继续且不重复完成的阶段',()=>{
 const ctx=make();try{
  const j=ctx.q.createJob({title:'恢复测试',source:'总纲原始内容',totalEpisodes:2,stages:[{provider:'gpt',name:'ChatGPT',role:'文案',mode:'web_manual'}]});
  ctx.q.start(j.id);ctx.q.importReply(j.id,reply(1,'文案'));ctx.q.approveEpisode(j.id,{continuity:{ending:'第一集结尾'}});
  assert.equal(ctx.q.current(j.id).episode,2);
  ctx.q.pause(j.id);ctx.q.close();ctx.q=new QueueEngine(ctx.dir);
  assert.equal(ctx.q.getJob(j.id).status,'paused');assert.equal(ctx.q.getJob(j.id).episodes[0].status,'completed');
  ctx.q.resume(j.id);assert.equal(ctx.q.current(j.id).episode,2);
  assert.ok(ctx.q.current(j.id).prompt.includes('第一集结尾'));
  ctx.q.importReply(j.id,reply(2,'文案'));ctx.q.approveEpisode(j.id);
  assert.equal(ctx.q.getJob(j.id).status,'completed');
 }finally{destroy(ctx)}
});
test('短回答保留原始版本、禁止越级，允许安全重试',()=>{
 const ctx=make();try{
  const j=ctx.q.createJob({title:'重试测试',source:'文字总纲',totalEpisodes:1});ctx.q.start(j.id);
  const a=ctx.q.importReply(j.id,'短');assert.equal(a.report.pass,false);
  assert.equal(ctx.q.getJob(j.id).episodes[0].stages[0].status,'manual_required');
  assert.equal(ctx.q.current(j.id).episode,1);
  ctx.q.retryStage(j.id);
  const b=ctx.q.importReply(j.id,reply(1,'文案'));assert.equal(b.artifact.version,2);
  assert.notEqual(a.artifact.file,b.artifact.file);
  assert.equal(ctx.q.current(j.id).stage.name,'Gemini');
 }finally{destroy(ctx)}
});
test('暂停禁止推进，错误配置不得创建任务，导出只包含已完成集',()=>{
 const ctx=make();try{
  assert.throws(()=>ctx.q.createJob({source:'',title:'空'}),/原始故事/);
  const j=ctx.q.createJob({title:'保护测试',source:'原文',totalEpisodes:2});ctx.q.start(j.id);ctx.q.pause(j.id);
  assert.throws(()=>ctx.q.importReply(j.id,reply(1,'文案')),/没有可导入/);
  assert.throws(()=>ctx.q.approveEpisode(j.id),/人工终审/);
  ctx.q.resume(j.id);const out=ctx.q.exportCompleted(j.id);
  assert.equal(out.episodes,0);
 }finally{destroy(ctx)}
});
