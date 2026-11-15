// Explicit owner-run pre-deployment backup. Secrets remain inside the ignored .private folder.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {parseDatabaseList,renderLocalConfig,assertExistingDeploymentIdentity} from './setup-cloudflare.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=join(root,'.private');
const keysPath=join(privateDir,'owner-keys.json');
const infoPath=join(privateDir,'deployment-public.json');
const configPath=join(root,'wrangler.local.toml');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertOwnerKeys(data){
 const required=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_LICENSE_PUBLIC_KEY_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN','DUDU_ADMIN_TOKEN_SHA256'];
 if(!data||required.some(k=>!data[k]))throw Error('原 owner-keys.json 缺少必要字段，不能安全备份或升级');
 return true;
}
export function backupFolderName(date){
 return 'v1.3-before-'+date.toISOString().replace(/[:.]/g,'-');
}
export function buildBackupManifest({databaseId,sqlPath,sqlBytes,sqlSha256,createdAt,files}){
 if(!uuid.test(databaseId||''))throw Error('D1数据库ID无效');
 if(!sqlPath||!Number.isInteger(sqlBytes)||sqlBytes<=0||!/^[a-f0-9]{64}$/i.test(sqlSha256||''))throw Error('D1 SQL导出文件缺失或校验失败');
 return {version:'1.3-predeploy',createdAt,d1DatabaseId:databaseId,sqlFile:sqlPath,sqlBytes,sqlSha256,backedUpFiles:files};
}
function cmd(args){
 const win=process.platform==='win32';
 const exe=win?'cmd.exe':'npx';
 const argv=win?['/d','/s','/c','npx --yes wrangler '+args.join(' ')]:['--yes','wrangler',...args];
 const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 if(r.error||r.status!==0)throw Error('Wrangler备份命令失败：'+String(r.stderr||r.error?.message||r.stdout||'').slice(-1200));
 return r.stdout||'';
}
function main(){
 if(!process.argv.includes('--confirm-export')){
  process.stdout.write('此操作会从远程 D1 导出完整 SQL 数据，并复制原授权密钥到本机 .private\backups。确认在低流量时段执行后，运行：npm run deploy:backup -- --confirm-export\n');
  return;
 }
 if(!existsSync(keysPath))throw Error('缺少原部署 .private/owner-keys.json；不要生成新密钥代替，请从原部署电脑恢复');
 const keyData=JSON.parse(readFileSync(keysPath,'utf8'));assertOwnerKeys(keyData);
 const localConfig=existsSync(configPath)?readFileSync(configPath,'utf8'):'';
 const deploymentInfo=existsSync(infoPath)?JSON.parse(readFileSync(infoPath,'utf8')):null;
 // Require at least one identity copied from the existing V1.2 deployment.
 const configured=localConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1]||'';
 const recorded=typeof deploymentInfo?.d1Id==='string'&&uuid.test(deploymentInfo.d1Id)?deploymentInfo.d1Id:'';
 if(!uuid.test(configured)&&!recorded)throw Error('缺少原 D1 身份记录；请恢复原 wrangler.local.toml 或 deployment-public.json 后再备份');
 const bootstrap=join(privateDir,'bootstrap.toml');
 mkdirSync(privateDir,{recursive:true,mode:0o700});
 writeFileSync(bootstrap,'name = "dudu-ai-license"\nmain = "../src/worker.mjs"\ncompatibility_date = "2026-11-01"\n');
 const bootstrapArgs=['--config','.private/bootstrap.toml'];
 cmd(['whoami',...bootstrapArgs]);
 const list=parseDatabaseList(cmd(['d1','list','--json',...bootstrapArgs]));
 const found=list.find(x=>x.name==='dudu-license');
 if(!found||!uuid.test(found.id))throw Error('当前Cloudflare账户未找到有效的原 dudu-license D1 数据库');
 assertExistingDeploymentIdentity({databaseId:found.id,localConfig,deploymentInfo});
 if(!uuid.test(configured)){
  writeFileSync(configPath,renderLocalConfig(readFileSync(join(root,'wrangler.toml'),'utf8'),found.id));
 }
 const timestamp=new Date().toISOString();
 const backupDir=join(privateDir,'backups',backupFolderName(new Date()));
 mkdirSync(backupDir,{recursive:true,mode:0o700});
 const sqlPath=join(backupDir,'dudu-license-full.sql');
 process.stdout.write('即将导出原 D1 全量数据。导出期间 D1 请求可能暂时受阻，请确保处于低流量时段。\n');
 cmd(['d1','export','dudu-license','--remote','--skip-confirmation','--output',sqlPath,'--config','wrangler.local.toml']);
 if(!existsSync(sqlPath))throw Error('Wrangler未生成D1 SQL备份文件');
 const sqlBytes=statSync(sqlPath).size;
 if(sqlBytes<=0)throw Error('D1 SQL备份文件为空，已停止');
 const files=['owner-keys.json'];
 if(existsSync(infoPath))files.push('deployment-public.json');
 if(existsSync(configPath))files.push('wrangler.local.toml');
 for(const name of files){
  const source=name==='wrangler.local.toml'?configPath:join(privateDir,name);
  copyFileSync(source,join(backupDir,name));
 }
 const sqlSha256=createHash('sha256').update(readFileSync(sqlPath)).digest('hex');
 const manifest=buildBackupManifest({databaseId:found.id,sqlPath:'dudu-license-full.sql',sqlBytes,sqlSha256,createdAt:timestamp,files});
 writeFileSync(join(backupDir,'backup-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 process.stdout.write('备份完成（未修改远程数据库或Worker）：'+backupDir+'\n');
 process.stdout.write('D1 ID：'+found.id+'\nSQL大小：'+sqlBytes+' bytes\nSHA-256：'+sqlSha256+'\n');
 process.stdout.write('请将整个备份目录另存到加密离线介质；不要上传GitHub或发送到聊天。\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(error){process.stderr.write('备份停止：'+(error.message||String(error))+'\n');process.exitCode=1}
}
