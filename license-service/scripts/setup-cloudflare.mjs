// Owner-only deployment assistant. Cloudflare credentials and private keys stay local.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {ensureOwnerKeys} from './generate-keys.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=join(root,'.private'),database='dudu-license';
const ownerKeysPath=join(privateDir,'owner-keys.json');
const localConfigPath=join(root,'wrangler.local.toml');
const deploymentInfoPath=join(privateDir,'deployment-public.json');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
 const configured=localConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1]||'';
 const recorded=typeof deploymentInfo?.d1Id==='string'&&uuid.test(deploymentInfo.d1Id)?deploymentInfo.d1Id:'';
 if(!uuid.test(configured)&&!recorded)throw Error('无法确认这是原有D1数据库：缺少有效的 wrangler.local.toml 数据库ID和 deployment-public.json 记录。请从原部署电脑恢复至少一份原始部署记录后再继续。');
 if(uuid.test(configured)&&configured!==databaseId)throw Error('检测到本机 wrangler.local.toml 的D1 ID与Cloudflare同名数据库不一致；为保护原授权数据，已停止部署');
 if(recorded&&recorded!==databaseId)throw Error('deployment-public.json记录的D1 ID与当前数据库不一致；为保护原授权数据，已停止部署');
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
  console.log('执行前请在license-service目录运行 npx wrangler login，再运行 npm run deploy:setup');return;
 }
 // V1.2 is already deployed: never generate a replacement signing key or silently create a new D1.
 if(!existsSync(ownerKeysPath))throw Error('缺少原部署密钥文件 .private/owner-keys.json。为避免更换签名密钥并导致既有授权失效，部署已停止；请先从原部署电脑恢复该文件。');
 const {data,path:keyPath,created}=ensureOwnerKeys();
 if(created)throw Error('检测到部署密钥意外新建，已停止部署；不得用新密钥覆盖既有授权服务。');
 const required=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_LICENSE_PUBLIC_KEY_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN','DUDU_ADMIN_TOKEN_SHA256'];
 if(required.some(k=>!data[k]))throw Error('原部署密钥文件缺少必要字段，已停止部署；请恢复完整备份。');
 mkdirSync(privateDir,{recursive:true,mode:0o700});
 // A separate bootstrap config prevents placeholder D1 UUID errors.
 writeFileSync(join(privateDir,'bootstrap.toml'),'name = "dudu-ai-license"\nmain = "../src/worker.mjs"\ncompatibility_date = "2026-11-01"\n');
 const base=['--config','.private/bootstrap.toml'];
 try{cmd(['whoami',...base])}catch{throw Error('请先运行 npx wrangler login 登录原Cloudflare账户')}
 const list=parseDatabaseList(cmd(['d1','list','--json',...base]));
 const found=list.find(x=>x.name===database);
 // Never create a same-named replacement database during an upgrade.
 if(!found)throw Error('Cloudflare账户中未找到原有 dudu-license D1 数据库；为防止创建空库并造成授权数据分叉，已停止部署。请确认登录的是原Cloudflare账户。');
 if(!uuid.test(found.id))throw Error('Cloudflare D1数据库ID无效');
 const localConfig=existsSync(localConfigPath)?readFileSync(localConfigPath,'utf8'):'';
 const deploymentInfo=existsSync(deploymentInfoPath)?JSON.parse(readFileSync(deploymentInfoPath,'utf8')):null;
 assertExistingDeploymentIdentity({databaseId:found.id,localConfig,deploymentInfo});
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
 const url=(result.match(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev\b/)||[])[0];
 if(!url)throw Error('Worker已部署，但未自动解析域名；请在Cloudflare后台复制原有workers.dev HTTPS地址');
 const resp=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});
 if(!resp.ok||(await resp.json()).status!=='ok')throw Error('远程/health未通过检查，请查看Cloudflare日志');
 const pub={url,publicKey:data.DUDU_LICENSE_PUBLIC_KEY_B64,d1Id:found.id};
 writeFileSync(deploymentInfoPath,JSON.stringify(pub,null,2)+'\n',{mode:0o600});
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
