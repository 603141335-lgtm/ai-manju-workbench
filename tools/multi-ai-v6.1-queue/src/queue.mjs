import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, renameSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { checkReply } from './quality.mjs';

const now = () => new Date().toISOString();
const sha = s => createHash('sha256').update(s).digest('hex');
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80) || 'unnamed';
const epLabel = n => `第${String(n).padStart(2,'0')}集`;
const DEFAULT_STAGES = [
  {provider:'chatgpt',name:'ChatGPT',role:'文案',mode:'web_manual'},
  {provider:'gemini',name:'Gemini',role:'导演分镜',mode:'web_manual'},
  {provider:'other',name:'其他AI',role:'审核优化',mode:'web_manual'}
];
const REQUIRED_RULES = [
  '每次只生成当前一集，不提前生成后续集。',
  '保留原剧情、台词、动作、情节因果和参考图编号；精简不是压缩。',
  '参考图只写 A02、AG14、B12 等编号，不在编号后追加说明。',
  '分镜可在10—15秒内切换，表情、站位、镜头和连续性完整。',
  '禁止背景音乐、歌曲、字幕、水印和LOGO。',
  '结尾写出人物/道具状态、未解决伏笔，供下一集使用。'
];
function atomicWrite(file, content){
  mkdirSync(path.dirname(file),{recursive:true});
  const tmp=`${file}.${randomUUID()}.tmp`;
  const fd=openSync(tmp,'wx',0o600);
  try {writeSync(fd,content);fsyncSync(fd)} finally {closeSync(fd)}
  renameSync(tmp,file);
}
function event(db,jobId,type,payload={}) {
  db.prepare('INSERT INTO queue_events(job_id,type,payload_json,created_at) VALUES(?,?,?,?)').run(jobId,type,JSON.stringify(payload),now());
}
export class QueueEngine {
  constructor(root) {
    this.root=path.resolve(root);
    mkdirSync(this.root,{recursive:true});
    this.db=new DatabaseSync(path.join(this.root,'queue.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,title TEXT NOT NULL,total_episodes INTEGER NOT NULL,status TEXT NOT NULL,source TEXT NOT NULL,settings_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id),number INTEGER NOT NULL,status TEXT NOT NULL,quality_status TEXT NOT NULL DEFAULT 'pending',continuity_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL,UNIQUE(job_id,number));
      CREATE TABLE IF NOT EXISTS stages (id TEXT PRIMARY KEY,episode_id TEXT NOT NULL REFERENCES episodes(id),seq INTEGER NOT NULL,provider TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,attempt INTEGER NOT NULL DEFAULT 0,reply_artifact_id TEXT,prompt_hash TEXT,last_error TEXT,updated_at TEXT NOT NULL,UNIQUE(episode_id,seq));
      CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY,episode_id TEXT NOT NULL,stage_id TEXT,version INTEGER NOT NULL,file_path TEXT NOT NULL,hash TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quality_reports (id TEXT PRIMARY KEY,episode_id TEXT NOT NULL,stage_id TEXT,report_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS queue_events (id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_episode_job ON episodes(job_id,number);
      CREATE INDEX IF NOT EXISTS idx_artifacts_ep ON artifacts(episode_id,stage_id,version);
    `);
  }
  close(){this.db.close()}
  _job(id){const j=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!j)throw new Error('任务不存在');return j}
  _ep(jobId,n){const e=this.db.prepare('SELECT * FROM episodes WHERE job_id=? AND number=?').get(jobId,n);if(!e)throw new Error('集数不存在');return e}
  _stages(epId){return this.db.prepare('SELECT * FROM stages WHERE episode_id=? ORDER BY seq').all(epId)}
  _dir(j,n){return path.join(this.root,'projects',safeName(j.title)+'_'+j.id.slice(0,8),epLabel(n))}
  listJobs(){return this.db.prepare('SELECT id,title,total_episodes,status,created_at,updated_at FROM jobs ORDER BY created_at DESC').all()}
  createJob(input={}) {
    const {title='漫剧30集',source='',episodePlans=[],stages=DEFAULT_STAGES,totalEpisodes=30,immutableRules=REQUIRED_RULES,minChars=20}=input;
    if(!Number.isInteger(totalEpisodes)||totalEpisodes<1||totalEpisodes>200)throw new Error('集数必须为1-200');
    if(!String(source).trim())throw new Error('请填写原始故事或全剧总纲');
    if(!Array.isArray(stages)||stages.length===0||stages.length>12)throw new Error('每集需要1-12个阶段');
    if(stages.some(s=>!s.name||!s.role||s.mode!=='web_manual'))throw new Error('此版本只支持web_manual人工网页交接');
    const id=randomUUID(),t=now();
    const options={episodePlans,stages,immutableRules,minChars};
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)').run(id,title,totalEpisodes,'queued',source,JSON.stringify(options),t,t);
      const insE=this.db.prepare('INSERT INTO episodes(id,job_id,number,status,updated_at) VALUES(?,?,?,?,?)');
      const insS=this.db.prepare('INSERT INTO stages(id,episode_id,seq,provider,name,role,mode,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
      for(let n=1;n<=totalEpisodes;n++){
        const eId=randomUUID();insE.run(eId,id,n,'queued',t);
        for(let i=0;i<stages.length;i++){const s=stages[i];insS.run(randomUUID(),eId,i,s.provider??s.name,s.name,s.role,s.mode,'queued',t)}
      }
      event(this.db,id,'created',{totalEpisodes,stages:stages.map(s=>s.name)});
      this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e}
    const projectDir=path.dirname(this._dir(this._job(id),1));
    atomicWrite(path.join(projectDir,'00_原始资料','原始故事.md'),source);
    atomicWrite(path.join(projectDir,'00_故事记忆','episode_plan.json'),JSON.stringify(episodePlans,null,2));
    atomicWrite(path.join(projectDir,'00_故事记忆','rules.json'),JSON.stringify(immutableRules,null,2));
    return this.getJob(id);
  }
  getJob(id){
    const job=this._job(id);
    const episodes=this.db.prepare('SELECT id,number,status,quality_status,continuity_json FROM episodes WHERE job_id=? ORDER BY number').all(id);
    return {...job,settings:JSON.parse(job.settings_json),episodes:episodes.map(e=>({...e,stages:this._stages(e.id)}))};
  }
  _getActive(id){
    const job=this._job(id);
    const e=this.db.prepare("SELECT * FROM episodes WHERE job_id=? AND status != 'completed' ORDER BY number LIMIT 1").get(id);
    const stage=e?this.db.prepare("SELECT * FROM stages WHERE episode_id=? AND status != 'completed' ORDER BY seq LIMIT 1").get(e.id):null;
    return {job,episode:e,stage};
  }
  start(id){const j=this._job(id);if(j.status==='completed')return this.getJob(id);if(j.status==='paused')throw new Error('任务已暂停，请使用继续');
    this.db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=?").run(now(),id);event(this.db,id,'started');return this._advance(id)}
  _advance(id){
    const {job,episode,stage}=this._getActive(id);
    if(job.status!=='running')return this.getJob(id);
    if(!episode){this.db.prepare("UPDATE jobs SET status='completed',updated_at=? WHERE id=?").run(now(),id);event(this.db,id,'job_completed');return this.getJob(id)}
    if(!stage){this.db.prepare("UPDATE episodes SET status='needs_review',quality_status='manual_required',updated_at=? WHERE id=?").run(now(),episode.id);event(this.db,id,'episode_needs_review',{episode:episode.number});return this.getJob(id)}
    if(stage.status==='queued'){
      this.db.prepare("UPDATE stages SET status='waiting_web',updated_at=? WHERE id=?").run(now(),stage.id);
      this.db.prepare("UPDATE episodes SET status='running',updated_at=? WHERE id=?").run(now(),episode.id);
      event(this.db,id,'handoff_prepared',{episode:episode.number,stage:stage.seq,provider:stage.provider});
    }
    return this.getJob(id);
  }
  pause(id){const j=this._job(id);if(j.status!=='running')throw new Error('仅运行中的任务可暂停');this.db.prepare("UPDATE jobs SET status='paused',updated_at=? WHERE id=?").run(now(),id);event(this.db,id,'paused');return this.getJob(id)}
  resume(id){const j=this._job(id);if(j.status!=='paused')throw new Error('仅暂停中的任务可继续');this.db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=?").run(now(),id);event(this.db,id,'resumed');return this._advance(id)}
  current(id){
    const {job,episode,stage}=this._getActive(id);
    const prompt=stage&&episode&&stage.status==='waiting_web'?this.preparePrompt(id):null;
    return {job:{id:job.id,title:job.title,status:job.status,totalEpisodes:job.total_episodes},episode:episode?.number??null,stage:stage?{id:stage.id,name:stage.name,provider:stage.provider,role:stage.role,status:stage.status,attempt:stage.attempt}:null,prompt};
  }
  preparePrompt(id){
    const {job,episode,stage}=this._getActive(id);
    if(!episode||!stage)throw new Error('没有待交接阶段');
    if(!['waiting_web','manual_required'].includes(stage.status))throw new Error('阶段状态暂不可交接');
    const settings=JSON.parse(job.settings_json);
    const prior=this.db.prepare('SELECT * FROM episodes WHERE job_id=? AND number=?').get(id,episode.number-1);
    const prevContinuity=prior?JSON.parse(prior.continuity_json):{};
    const prevStage=stage.seq>0?this._stages(episode.id)[stage.seq-1]:null;
    const artifact=prevStage?.reply_artifact_id?this.db.prepare('SELECT * FROM artifacts WHERE id=?').get(prevStage.reply_artifact_id):null;
    const previousFull=artifact?readFileSync(artifact.file_path,'utf8'):'';
    const plan=Array.isArray(settings.episodePlans)?settings.episodePlans[episode.number-1]??'未提供单集提纲，须遵循全剧总纲。':'未提供单集提纲';
    const prompt=[`【项目】${job.title}｜${epLabel(episode.number)} / 共${job.total_episodes}集`,`【本阶段】${stage.name}｜${stage.role}`,'【必须遵守的规则】',...(settings.immutableRules||REQUIRED_RULES),'【完整原始材料】',job.source,'【本集提纲】',typeof plan==='string'?plan:JSON.stringify(plan,null,2),'【上一集结束状态】',JSON.stringify(prevContinuity,null,2),'【上一阶段完整成果】',previousFull||'首阶段，无上一阶段。','【本次任务】',`仅生成${epLabel(episode.number)}的${stage.role}结果。保留全部重要情节，不生成其他集。列出本集标题、完整正文、结尾状态与未解决伏笔。`].join('\n\n');
    if(prompt.length>400000)throw new Error('提示词过长，请人工分段，原文未被截断');
    return prompt;
  }
  importReply(id,reply){
    const {job,episode,stage}=this._getActive(id);
    if(job.status!=='running'||!episode||!stage||!['waiting_web','manual_required'].includes(stage.status))throw new Error('当前没有可导入的运行中网页阶段');
    if(typeof reply!=='string')throw new Error('内容必须是文本');
    const options=JSON.parse(job.settings_json);
    const report=checkReply({text:reply,episodeNo:episode.number,minChars:options.minChars??20});
    const maxVersion=this.db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM artifacts WHERE stage_id=?').get(stage.id).v;
    const version=maxVersion+1;
    const file=path.join(this._dir(job,episode.number),`${String(stage.seq+1).padStart(2,'0')}_${safeName(stage.name)}_${safeName(stage.role)}_v${String(version).padStart(3,'0')}.md`);
    atomicWrite(file,reply);
    const hash=sha(reply),artifactId=randomUUID(),time=now(),promptHash=sha(this.preparePrompt(id));
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?)').run(artifactId,episode.id,stage.id,version,file,hash,Buffer.byteLength(reply),time);
      this.db.prepare('INSERT INTO quality_reports VALUES(?,?,?,?,?)').run(randomUUID(),episode.id,stage.id,JSON.stringify(report),time);
      this.db.prepare('UPDATE stages SET status=?,reply_artifact_id=?,prompt_hash=?,last_error=?,updated_at=? WHERE id=?').run(report.pass?'completed':'manual_required',artifactId,promptHash,report.pass?null:JSON.stringify(report.checks),time,stage.id);
      event(this.db,id,'reply_imported',{episode:episode.number,stage:stage.seq,version,hash,pass:report.pass});
      this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e}
    if(report.pass)this._advance(id);
    return {report,artifact:{file,hash,version},current:this.current(id)};
  }
  approveEpisode(id,{continuity={},reviewer='用户',reason='已人工核对剧情和台词'}={}){
    const {job,episode,stage}=this._getActive(id);
    if(job.status!=='running'||!episode||stage||episode.status!=='needs_review')throw new Error('当前集尚未达到人工终审阶段');
    if(!reason.trim())throw new Error('请填写人工审核依据');
    const finalStage=this._stages(episode.id).at(-1);
    const a=this.db.prepare('SELECT * FROM artifacts WHERE id=?').get(finalStage.reply_artifact_id);
    if(!a||!existsSync(a.file_path)||sha(readFileSync(a.file_path,'utf8'))!==a.hash)throw new Error('最终稿不存在或校验不一致');
    const dest=path.join(this._dir(job,episode.number),'最终稿.md');
    atomicWrite(dest,readFileSync(a.file_path));
    const checkpoint={episode:episode.number,approvedAt:now(),reviewer,reason,continuity,sourceHash:a.hash,finalHash:sha(readFileSync(dest)),semanticReviewedBy:'human'};
    atomicWrite(path.join(this._dir(job,episode.number),'checkpoint.json'),JSON.stringify(checkpoint,null,2));
    this.db.prepare("UPDATE episodes SET status='completed',quality_status='human_approved',continuity_json=?,updated_at=? WHERE id=?").run(JSON.stringify(continuity),now(),episode.id);
    event(this.db,id,'episode_approved',{episode:episode.number,reviewer});
    const result=this._advance(id);
    return {checkpoint,current:this.current(id),job:result};
  }
  retryStage(id){const {job,episode,stage}=this._getActive(id);if(job.status!=='running'||!stage||!['manual_required','waiting_web'].includes(stage.status))throw new Error('当前状态不能重试');
    this.db.prepare("UPDATE stages SET status='waiting_web',attempt=attempt+1,last_error=NULL,updated_at=? WHERE id=?").run(now(),stage.id);
    event(this.db,id,'stage_retry',{episode:episode.number,stage:stage.seq});return this.current(id)}
  events(id,limit=300){this._job(id);return this.db.prepare('SELECT * FROM queue_events WHERE job_id=? ORDER BY id DESC LIMIT ?').all(id,Math.min(Math.max(limit,1),1000))}
  exportCompleted(id){const job=this._job(id);const eps=this.db.prepare("SELECT * FROM episodes WHERE job_id=? AND status='completed' ORDER BY number").all(id);const parts=[];
    for(const e of eps){const p=path.join(this._dir(job,e.number),'最终稿.md');if(!existsSync(p))throw new Error(`${epLabel(e.number)}缺少最终稿，拒绝导出`);parts.push(readFileSync(p,'utf8'))}
    const out=path.join(path.dirname(this._dir(job,1)),'_导出','已完成剧集合并稿.md');atomicWrite(out,parts.join('\n\n---\n\n'));return {file:out,episodes:eps.length};
  }
}
export {DEFAULT_STAGES,REQUIRED_RULES};
