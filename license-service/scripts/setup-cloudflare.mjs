// Owner-only deployment assistant. Cloudflare credentials and private keys stay local.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync,readdirSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join,basename} from 'node:path';
import {ensureOwnerKeys} from './generate-keys.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=join(root,'.private'),database='dudu-license';
const ownerKeysPath=join(privateDir,'owner-keys.json');
const localConfigPath=join(root,'wrangler.local.toml');
const deploymentInfoPath=join(privateDir,'deployment-public.json');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const productionConfirmation='--confirm-production=DEPLOY_PRODUCTION_V1_3';

export function parseDatabaseList(output){
 const s=String(output),i=s.indexOf('['),j=s.lastIndexOf(']');
 if(i<0||j<i)throw Error('Wrangler没有返回数据库列表；为避免重复创建已停止');
 const list=JSON.parse(s.slice(i,j+1));
 if(!Array.isArray(list))throw Error('D1列表数据不合法');
 return list.map(x=>({name:x.name||x.database_name,id:x.uuid||x.id})).filter(x=>typeof x.name==='string'&&typeof x.id==='string');
}
export function renderLocalConfig(template,id){
 if(!uuid.test(id))throw Error('D1数据库ID必须为UUID');
 if(!template.includes('REPLACE_WITH_YOUR_D1_ID'))throw Error('未找到D1配置占位符');
 return template.replace('REPLACE_WITH_YOUR_D1_ID',id);
}
export function assertExistingDeploymentIdentity({databaseId,localConfig='',deploymentInfo=null}){
 if(!uuid.test(databaseId||''))throw Error('D1数据库ID无效');
 const configured=localConfig.match(/^database_id\\s*=\\s*"([^"]+)"/m)?.[1]||'';
 const recorded=typeof deploymentInfo?.d1Id==='string'?deploymentInfo.d1Id:'';
 const hasLocal=uuid.test(configured),hasRecorded=uuid.test(recorded);
 if(!hasLocal&&!hasRecorded)throw Error('无法确认这是原有D1数据库：缺少原部署D1身份记录；请恢复原 wrangler.local.toml 或 deployment-public.json，禁止猜测数据库');
 if(hasLocal&&configured!==databaseId)throw Error('检测到本机 wrangler.local.toml 的D1 ID与Cloudflare同名数据库不一致；为保护原授权数据，已停止部署');
 if(hasRecorded&&recorded!==databaseId)throw Error('deployment-public.json记录的D1 ID与当前数据库不一致；为保护原授权数据，已停止部署');
}
export function assertDeploymentConfirmations(args){
 const flags=new Set(args);
 const missing=[];
 if(!flags.has('--confirm-backup-copied'))missing.push('备份已复制到加密离线介质（--confirm-backup-copied）');
 if(!flags.has('--confirm-sandbox-passed'))missing.push('微信/支付宝沙箱支付、退款及授权撤销验收已通过（--confirm-sandbox-passed）');
 if(!flags.has(productionConfirmation))missing.push('明确生产部署确认（'+productionConfirmation+'）');
 if(missing.length)throw Error('生产部署已阻止，缺少以下明确确认：'+missing.join('；'));
 return true;
}
export function assertVerifiedBackup({manifest,databaseId,sqlBytes,sqlSha256,backupKeysSha256,currentKeysSha256}){
 if(!manifest||manifest.version!=='1.3-predeploy')throw Error('备份清单缺失或版本不正确');
 if(manifest.d1DatabaseId!==databaseId)throw Error('备份中的D1 ID与当前Cloudflare原数据库不一致');
 if(manifest.sqlFile!=='dudu-license-full.sql')throw Error('备份SQL文件名不符合预期');
 if(!Number.isInteger(sqlBytes)||sqlBytes<=0||manifest.sqlBytes!==sqlBytes)throw Error('备份SQL文件大小与清单不一致');
 if(!/^[a-f0-9]{64}$/i.test(sqlSha256||'')||manifest.sqlSha256!==sqlSha256)throw Error('备份SQL SHA-256校验失败');
 if(!Array.isArray(manifest.backedUpFiles)||!manifest.backedUpFiles.includes('owner-keys.json'))throw Error('备份中缺少原授权密钥文件');
 if(!backupKeysSha256||backupKeysSha256!==currentKeysSha256)throw Error('备份密钥与当前部署密钥不一致');
 return true;
}
function sha256(value){return createHash('sha256').update(value).digest('hex')}
function verifyLatestBackup(databaseId){
 const backupsRoot=join(privateDir,'backups');
 if(!existsSync(backupsRoot))throw Error('未找到 V1.3 备份目录；请先执行 npm run deploy:backup -- --confirm-export');
 const candidates=readdirSync(backupsRoot,{withFileTypes:true})
  .filter(x=>x.isDirectory()&&x.name.startsWith('v1.3-before-'))
  .map(x=>x.name).sort().reverse();
 if(!candidates.length)throw Error('未找到 V1.3 备份目录；请先执行 npm run deploy:backup -- --confirm-export');
 const backupDir=join(backupsRoot,candidates[0]);
 const manifestPath=join(backupDir,'backup-manifest.json');
 const keysPath=join(backupDir,'owner-keys.json');
 if(!existsSync(manifestPath)||!existsSync(keysPath))throw Error('最新备份缺少 backup-manifest.json 或 owner-keys.json；停止部署');
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 if(typeof manifest.sqlFile!=='string'||basename(manifest.sqlFile)!==manifest.sqlFile)throw Error('备份清单SQL文件路径不安全');
 const sqlPath=join(backupDir,manifest.sqlFile);
 if(!existsSync(sqlPath))throw Error('最新备份缺少D1 SQL导出文件；停止部署');
 const sql=readFileSync(sqlPath);
 const backupKeys=readFileSync(keysPath);
 const currentKeys=readFileSync(ownerKeysPath);
 assertVerifiedBackup({
  manifest,databaseId,sqlBytes:statSync(sqlPath).size,sqlSha256:sha256(sql),
  backupKeysSha256:sha256(backupKeys),currentKeysSha256:sha256(currentKeys)
 });
 return {backupDir,manifest};
}
function cmd(args,{input}={}){
 const win=process.platform==='win32';
 const exe=win?'cmd.exe':'npx';
 const argv=win?['/d','/s','/c','npx --yes wrangler '+args.join(' ')]:['--yes','wrangler',...args];
 const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',input,timeout:120000,maxBuffer:2*1024*1024});
 if(r.error||r.status!==0)throw Error('Wrangler执行失败：'+String(r.stderr||r.error?.message||r.stdout||'').slice(-900));
 return r.stdout||'';
}
async function main(){
 if(!process.argv.includes('--apply')){
  console.log('预览模式：生产部署必须通过 npm run deploy:setup -- --confirm-backup-copied --confirm-sandbox-passed '+productionConfirmation);
  return;
 }
 // Stop before network calls or file writes unless the owner explicitly confirms all production prerequisites.
 assertDeploymentConfirmations(process.argv.slice(2));
 if(!existsSync(ownerKeysPath))throw Error('缺少原部署密钥文件 .private/owner-keys.json。为避免更换签名密钥并导致既有授权失效，部署已停止；请先从原部署电脑恢复该文件。');
 const {data,path:keyPath,created}=ensureOwnerKeys();
 if(created)throw Error('检测到部署密钥意外新建，已停止部署；不得用新密钥覆盖既有授权服务。');
 const required=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_LICENSE_PUBLIC_KEY_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN','DUDU_ADMIN_TOKEN_SHA256'];
 if(required.some(k=>!data[k]))throw Error('原部署密钥文件缺少必要字段，已停止部署；请恢复完整备份。');
 mkdirSync(privateDir,{recursive:true,mode:0o700});
 writeFileSync(join(privateDir,'bootstrap.toml'),'name = "dudu-ai-license"\\nmain = "../src/worker.mjs"\\ncompatibility_date = "2026-11-01"\\n');
 const base=['--config','.private/bootstrap.toml'];
 try{cmd(['whoami',...base])}catch{throw Error('请先运行 npx wrangler login 登录原Cloudflare账户')}
 const list=parseDatabaseList(cmd(['d1','list','--json',...base]));
 const found=list.find(x=>x.name===database);
 if(!found)throw Error('Cloudflare账户中未找到原有 dudu-license D1 数据库；为防止创建空库并造成授权数据分叉，已停止部署。请确认登录的是原Cloudflare账户。');
 if(!uuid.test(found.id))throw Error('Cloudflare D1数据库ID无效');
 const localConfig=existsSync(localConfigPath)?readFileSync(localConfigPath,'utf8'):'';
 const deploymentInfo=existsSync(deploymentInfoPath)?JSON.parse(readFileSync(deploymentInfoPath,'utf8')):null;
 assertExistingDeploymentIdentity({databaseId:found.id,localConfig,deploymentInfo});
 const backup=verifyLatestBackup(found.id);
 console.log('已验证原D1备份与密钥校验：'+backup.backupDir);
 writeFileSync(localConfigPath,renderLocalConfig(readFileSync(join(root,'wrangler.toml'),'utf8'),found.id));
 const cfg=['--config','wrangler.local.toml'];
 console.log('初始化远程D1增量表结构（保留既有授权数据）');
 cmd(['d1','execute',database,'--remote','--file=schema.sql','--yes',...cfg]);
 const localSecrets=join(privateDir,'deploy-secrets.json');
 const names=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN_SHA256'];
 writeFileSync(localSecrets,JSON.stringify(Object.fromEntries(names.map(n=>[n,data[n]]))),{mode:0o600});
 console.log('部署Cloudflare Worker与原有4项保护密钥...');
 let result;
 try{result=cmd(['deploy','--secrets-file','.private/deploy-secrets.json',...cfg])}
 finally{if(existsSync(localSecrets))unlinkSync(localSecrets)}
 const url=(result.match(/https:\/\/[A-Za-z0-9.-]+\\.workers\\.dev\\b/)||[])[0];
 if(!url)throw Error('Worker已部署，但未自动解析域名；请在Cloudflare后台复制原有workers.dev HTTPS地址');
 const resp=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});
 if(!resp.ok||(await resp.json()).status!=='ok')throw Error('远程/health未通过检查，请查看Cloudflare日志');
 const pub={url,publicKey:data.DUDU_LICENSE_PUBLIC_KEY_B64,d1Id:found.id};
 writeFileSync(deploymentInfoPath,JSON.stringify(pub,null,2)+'\\n',{mode:0o600});
 console.log('部署成功，云端地址：'+url);
 console.log('GitHub Variable DUDU_LICENSE_URL = '+url);
 console.log('GitHub Variable DUDU_LICENSE_PUBLIC_KEY_B64 = '+data.DUDU_LICENSE_PUBLIC_KEY_B64);
 console.log('GitHub Variable DUDU_D1_DATABASE_ID = '+found.id);
 console.log('卡密后台：'+url+'/admin');
 console.log('私钥和后台口令在：'+keyPath+'；请离线备份，不要发给其他人。');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('部署停止：'+e.message);process.exitCode=1});
}
