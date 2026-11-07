import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {QueueEngine} from '../src/queue.mjs';
import {QueueRunner} from '../src/runner.mjs';
import {CompatibleApiClient} from '../src/api.mjs';
const ctx=()=>{const root=mkdtempSync(path.join(tmpdir(),'multi-v61-api-'));return {root,q:new QueueEngine(root)}};
const stages=[{name:'GPT',provider:'openai',role:'文案',mode:'api',model:'story-model'},{name:'Gemini',provider:'google',role:'导演分镜',mode:'api',model:'shot-model'}];
const answer=(n,model)=>'第'+n+'集｜'+model+'\n这里有完整故事、人物对话、动作细节和完整导演分镜。\n本集结束状态：角色完成任务但仍有伏笔。';
test('OpenAI-compatible requests use actual model ID, path, Bearer and usage',async()=>{
  let hit=0;
  const client=new CompatibleApiClient({baseUrl:'http://127.0.0.1:3000/v1',apiKey:'test-only',fetchImpl:async(url,opts)=>{
    hit++;assert.equal(url,'http://127.0.0.1:3000/v1/chat/completions');
    assert.equal(opts.headers.Authorization,'Bearer test-only');
    const data=JSON.parse(opts.body);assert.equal(data.model,'story-model');assert.equal(data.stream,false);
    assert.equal(data.messages[0].content,'test prompt');
    return new Response(JSON.stringify({id:'req-1',model:data.model,choices:[{message:{content:answer(1,'test')}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}),{status:200});
  }});
  const result=await client.chat({model:'story-model',prompt:'test prompt'});
  assert.equal(hit,1);assert.equal(result.usage.total_tokens,30);
  assert.throws(()=>new CompatibleApiClient({baseUrl:'http://example.org/v1',apiKey:'abc'}),/HTTPS/);
  await assert.rejects(()=>new CompatibleApiClient({apiKey:''}).chat({model:'x',prompt:'test'}),/MAI_API_KEY/);
});
test('Two real-transport mock HTTP replies advance stages; API usage accounted, not priced',async()=>{
  const t=ctx();try{
    const models=[];
    const client=new CompatibleApiClient({baseUrl:'http://127.0.0.1:3000/v1',apiKey:'test-only',fetchImpl:async(url,opts)=>{
      const data=JSON.parse(opts.body);models.push(data.model);
      return new Response(JSON.stringify({model:data.model,choices:[{message:{content:answer(1,data.model)}}],usage:{prompt_tokens:20,completion_tokens:50,total_tokens:70}}),{status:200});
    }});
    const j=t.q.createJob({source:'原创小说完整剧情设定',title:'API接力',stages,totalEpisodes:1});t.q.start(j.id);
    assert.equal(t.q.current(j.id).stage.status,'ready_api');
    assert.throws(()=>t.q.importReply(j.id,answer(1,'forged')),/不允许此方式/);
    const runner=new QueueRunner(t.q,client);await runner.tick();
    assert.equal(t.q.current(j.id).stage.name,'Gemini');
    await runner.tick();
    assert.equal(t.q.current(j.id).stage,null);
    assert.equal(t.q.getJob(j.id).episodes[0].status,'needs_review');
    assert.deepEqual(models,['story-model','shot-model']);
    const usage=t.q.usage(j.id);
    assert.equal(usage.length,2);assert.equal(usage.reduce((n,x)=>n+x.total_tokens,0),140);
    const saved=t.q.db.prepare('SELECT COUNT(*) AS c FROM artifacts').get().c;assert.equal(saved,2);
    t.q.approveEpisode(j.id,{continuity:{ending:'第1集收尾'}});
    assert.equal(t.q.getJob(j.id).status,'completed');
  }finally{t.q.close();rmSync(t.root,{recursive:true,force:true})}
});
test('Interrupted in-flight stages never auto retry after process restart',async()=>{
  const t=ctx();try{
    const j=t.q.createJob({source:'原创小说剧情大纲',stages:[stages[0]],totalEpisodes:1});
    t.q.start(j.id);const first=t.q.current(j.id);
    assert.equal(t.q.claimApi(j.id,first.stage.id),true);
    t.q.close();t.q=new QueueEngine(t.root);
    assert.equal(t.q.current(j.id).stage.status,'api_interrupted');
    const empty=new CompatibleApiClient({apiKey:'',baseUrl:'http://127.0.0.1:3000/v1'});
    const runner=new QueueRunner(t.q,empty);await runner.tick();
    assert.equal(t.q.current(j.id).stage.status,'api_interrupted');
    t.q.retryStage(j.id);await runner.tick();
    assert.equal(t.q.current(j.id).stage.status,'api_failed');
  }finally{t.q.close();rmSync(t.root,{recursive:true,force:true})}
});
test('Paused API jobs cannot record late replies and require retry after unknown outcome',async()=>{
  const t=ctx();try{
    const j=t.q.createJob({source:'原创小说剧情大纲',stages:[stages[0]],totalEpisodes:1});t.q.start(j.id);
    const client=new CompatibleApiClient({apiKey:'dummy',baseUrl:'http://127.0.0.1:3000/v1',fetchImpl:async(url,{signal})=>{
      return new Promise((resolve,reject)=>{
        if(signal.aborted)reject(new DOMException('Aborted','AbortError'));
        signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
      });
    }});
    const runner=new QueueRunner(t.q,client);
    const pending=runner.tick();await new Promise(r=>setTimeout(r,20));
    t.q.pause(j.id);await runner.stop();await pending;
    assert.equal(t.q.current(j.id).stage.status,'api_interrupted');
    t.q.resume(j.id);assert.equal(t.q.current(j.id).stage.status,'api_interrupted');
    assert.equal(t.q.usage(j.id).length,0);
  }finally{t.q.close();rmSync(t.root,{recursive:true,force:true})}
});
