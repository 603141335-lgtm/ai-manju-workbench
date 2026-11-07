import { describe,it,expect } from 'vitest';
import { buildRelayPrompt,selectTargets,validateCheckpoint,type Member } from '../logic';
const members:Member[]=[
 {id:'gemini',provider:'gemini',name:'Gemini',kind:'web_native',modelId:'',role:'编剧'},
 {id:'doubao',provider:'doubao',name:'豆包',kind:'api',modelId:'',role:'优化'},
 {id:'deepseek',provider:'deepseek',name:'DeepSeek',kind:'api',modelId:'',role:'审核'},
];
describe('v3 group routing and relay safety',()=>{
 it('routes @mentions to exactly the named members',()=>{
  expect(selectTargets('@豆包 和 @DeepSeek 检查',members,'relay').map(m=>m.id)).toEqual(['doubao','deepseek']);
  expect(selectTargets('故事',members,'normal').map(m=>m.id)).toEqual(['gemini']);
  expect(selectTargets('故事',members,'parallel')).toHaveLength(3);
 });
 it('preserves original task and all predecessor outputs',()=>{
  const prompt=buildRelayPrompt('完整原稿',members[1],'提示词优化',[{memberId:'gemini',provider:'gemini',role:'编剧',body:'完整剧本内容',source:'user_imported_web'}]);
  expect(prompt).toContain('完整原稿');expect(prompt).toContain('完整剧本内容');expect(prompt).toContain('提示词优化');
 });
 it('never silently truncates long outputs',()=>{
  expect(()=>buildRelayPrompt('x'.repeat(160000),members[1],'编剧',[])).toThrow('分段');
 });
 it('rejects corrupt recovery checkpoints',()=>{
  expect(validateCheckpoint({task:'原稿',memberIds:['gemini'],nextIndex:0,outputs:[],status:'waiting_manual'})).toBe(true);
  expect(validateCheckpoint({task:'x',memberIds:['a'],nextIndex:3,outputs:[],status:'completed'})).toBe(false);
 });
});