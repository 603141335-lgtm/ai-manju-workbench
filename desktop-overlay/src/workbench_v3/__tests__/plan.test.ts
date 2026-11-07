import {describe,it,expect} from 'vitest';
import {initialPlan,stepPrompt,snapshotSteps,validatePlan,type WorkflowPlan} from '../plan';
import type {Member} from '../logic';
const members:Member[]=[
 {id:'gemini',provider:'gemini',kind:'web_native',name:'Gemini',modelId:'',role:'编剧'},
 {id:'doubao',provider:'doubao',kind:'api',name:'豆包',modelId:'my-model',role:'优化'}
];
describe('per-group skill and workflow routing',()=>{
 it('supports non-default order and repeated AI under separate step identities',()=>{
  const plan:WorkflowPlan={version:1,name:'漫剧流程',steps:[
   {id:'stage1',memberId:'doubao',role:'编剧',instruction:'保留所有原台词'},
   {id:'stage2',memberId:'gemini',role:'分镜',instruction:'段长 10–15 秒'},
   {id:'stage3',memberId:'doubao',role:'审核',instruction:'核对所有编号'}
  ]};
  expect(validatePlan(plan,members)).toEqual([]);
  expect(snapshotSteps(members,plan,()=> '默认').map(s=>s.memberId)).toEqual(['doubao','gemini','doubao']);
 });
 it('rejects duplicate step IDs, unavailable members and unbounded instructions',()=>{
  const p=initialPlan(members,id=>id);
  p.steps[1].id=p.steps[0].id;
  expect(validatePlan(p,members)).not.toEqual([]);
  p.steps[1].id='unique';p.steps[1].memberId='uninvited';
  expect(validatePlan(p,members).some(e=>e.includes('不在群中'))).toBe(true);
  p.steps[1].memberId='doubao';p.steps[1].instruction='x'.repeat(12001);
  expect(validatePlan(p,members).some(e=>e.includes('无效'))).toBe(true);
 });
 it('preserves entire original task and predecessor output without silent truncation',()=>{
  const p=initialPlan(members,()=> '编剧');
  const prompt=stepPrompt('小说完整原稿',p.steps[1],[{
   memberId:'gemini',provider:'gemini',role:'编剧',source:'user_imported_web',body:'不删减的完整剧本'
  }]);
  expect(prompt).toContain('小说完整原稿');
  expect(prompt).toContain('不删减的完整剧本');
  expect(()=>stepPrompt('x'.repeat(150001),p.steps[0],[])).toThrow('禁止截断');
 });
});
