// Deploy an isolated V1.3 staging Worker + empty D1. Never targets production names or IDs.
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {parseDatabaseList} from './setup-cloudflare.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=join(root,'.private');
const dbName='dudu-license-staging';
const workerName='dudu-ai-license-staging';
const keysPath=join(privateDir,'staging-owner-keys.json');
const infoPath=join(privateDir,'staging-deployment-public.json');
const localConfigPath=join(root,'wrangler.staging.local.toml');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderStagingConfig(template,databaseId){
 if(!uuid.test(databaseId||''))throw Error('Staging D1数据库ID必须为UUID');
 if(!template.includes('REPLACE_WITH_DUDU_STAGING_D1_ID'))throw Error('Staging D1配置占位符缺失');
 if(!template.includes('name = "'+workerName+'"')||!template.includes('database_name = "'+dbName+'"'))throw Error('Staging配置中的Worker或D1名称不正确');
 return template.replace('REPLACE_WITH_DUDU_STAGING_D1_ID',databaseId);
}
export function assertStagingDatabaseIdentity({databaseId,localConfig='',deploymentInfo=null}){
 if(!uuid.test(databaseId||''))throw Error('Staging D1数据库ID无效');
 const configured=localConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1]||'';
 const recorded=typeof deploymentInfo?.d1Id==='string'&&uuid.test(deploymentInfo.d1Id)?deploymentInfo.d1Id:'';
 if(uuid.test(configured)&&configured!==databaseId)throw Error('Staging本地配置与Cloudflare D1 ID不一致，已停止');
 if(recorded&&recorded!==databaseId)throw Error('Staging部署记录与Cloudflare D1 ID不一致，已停止');
}
export function assertStagingKeys(data){
 const required=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_LICENSE_PUBLIC_KEY_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN','DUDU_ADMIN_TOKEN_SHA256'];
 if(!data||required.some(k=>!data[k]))throw Error('Staging授权密钥文件缺少必要字段');
 return true;
}
function ensureStagingKeys(){
 if(existsSync(keysPath)){
  const data=JSON.parse(readFileSync(keysPath,'utf8'));assertStagingKeys(data);
  return {data,created:false};
 }
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const adminToken=randomBytes(40).toString('hex');
 const data={
  DUDU_SIGNING_PRIVATE_PKCS8_B64:privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),
  DUDU_LICENSE_PUBLIC_KEY_B64:publicKey.export({type:'spki',format:'der'}).toString('base64'),
  DUDU_DEVICE_HMAC_KEY:randomBytes(48).toString('hex'),
  DUDU_CARD_HMAC_KEY:randomBytes(48).toString('hex'),
  DUDU_ADMIN_TOKEN:adminToken,
  DUDU_ADMIN_TOKEN_SHA256:createHash('sha256').update(adminToken).digest('hex')
 };
 writeFileSync(keysPath,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 return {data,created:true};
}
function cmd(args){
 const win=process.platform==='win32';
 const exe=win?'cmd.exe':'npx';
 const argv=win?['/d','/s','/c','npx --yes wrangler '+args.join(' ')]:['--yes','wrangler',...args];
 const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 if(r.error||r.status!==0)throw Error('Staging Wrangler命令失败：'+String(r.stderr||r.error?.message||r.stdout||'').slice(-1200));
 return r.stdout||'';
}
async function main(){
 if(!process.argv.includes('--confirm-staging')){
  process.stdout.write('此操作只会创建/更新独立的 dudu-ai-license-staging Worker 和 dudu-license-staging D1，不会连接生产数据库。确认后运行：npm run deploy:staging -- --confirm-staging\n');
  return;
 }
 mkdirSync(privateDir,{recursive:true,mode:0o700});
 const bootstrapPath=join(privateDir,'staging-bootstrap.toml');
 writeFileSync(bootstrapPath,'name = "'+workerName+'"\nmain = "../src/worker.mjs"\ncompatibility_date = "2026-11-01"\n');
 const bootstrapArgs=['--config','.private/staging-bootstrap.toml'];
 cmd(['whoami',...bootstrapArgs]);
 let list=parseDatabaseList(cmd(['d1','list','--json',...bootstrapArgs]));
 let found=list.find(x=>x.name===dbName);
 if(!found){
  process.stdout.write('未找到独立测试库，创建 '+dbName+'（不会使用生产库）...\n');
  cmd(['d1','create',dbName,...bootstrapArgs]);
  list=parseDatabaseList(cmd(['d1','list','--json',...bootstrapArgs]));
  found=list.find(x=>x.name===dbName);
 }
 if(!found||!uuid.test(found.id))throw Error('无法创建或确认独立 staging D1 数据库');
 const localConfig=existsSync(localConfigPath)?readFileSync(localConfigPath,'utf8'):'';
 const deploymentInfo=existsSync(infoPath)?JSON.parse(readFileSync(infoPath,'utf8')):null;
 assertStagingDatabaseIdentity({databaseId:found.id,localConfig,deploymentInfo});
 writeFileSync(localConfigPath,renderStagingConfig(readFileSync(join(root,'wrangler.staging.toml'),'utf8'),found.id));
 process.stdout.write('初始化独立 staging D1 表结构...\n');
 cmd(['d1','execute',dbName,'--remote','--file=schema.sql','--yes','--config','wrangler.staging.local.toml']);
 const {data}=ensureStagingKeys();
 const secretsPath=join(privateDir,'staging-deploy-secrets.json');
 const names=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN_SHA256'];
 writeFileSync(secretsPath,JSON.stringify(Object.fromEntries(names.map(k=>[k,data[k]]))),{mode:0o600});
 let output='';
 try{
  process.stdout.write('部署独立 staging Worker...\n');
  output=cmd(['deploy','--secrets-file','.private/staging-deploy-secrets.json','--config','wrangler.staging.local.toml']);
 }finally{
  if(existsSync(secretsPath))unlinkSync(secretsPath);
 }
 const url=(output.match(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev\b/)||[])[0];
 if(!url)throw Error('Staging Worker已提交部署，但未从Wrangler输出识别 workers.dev 地址；请在Cloudflare Workers后台查看 '+workerName);
 const health=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});
 if(!health.ok||(await health.json()).status!=='ok')throw Error('Staging /health 检查未通过，请查看Cloudflare日志');
 writeFileSync(infoPath,JSON.stringify({url,publicKey:data.DUDU_LICENSE_PUBLIC_KEY_B64,d1Id:found.id},null,2)+'\n',{mode:0o600});
 process.stdout.write('Staging部署成功：'+url+'\n');
 process.stdout.write('管理后台：'+url+'/admin\n');
 process.stdout.write('Staging D1：'+dbName+' / '+found.id+'\n');
 process.stdout.write('Staging管理员令牌保存在本机：'+keysPath+'（不要上传或发给他人）\n');
 process.stdout.write('生产 Worker、生产 D1、生产密钥均未修改。\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{process.stderr.write('Staging部署停止：'+(error.message||String(error))+'\n');process.exitCode=1});
}
