// One-time private service bridge between dudu-ai-license and dudu-ai-content.
// Generates a random secret locally; only the raw token and its SHA-256 hash are uploaded as Worker secrets.
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const licenseDir=join(root,'license-service'),contentDir=join(root,'cloud-content');
const licenseConfig=join(licenseDir,'wrangler.local.toml');
const privateDir=join(contentDir,'.private'),contentConfig=join(privateDir,'bridge.wrangler.toml');
function run(cwd,args,input){
 const win=process.platform==='win32';
 const exe=win?'cmd.exe':'npx';
 const argv=win?['/d','/s','/c','npx --yes wrangler '+args.map(x=>'"'+String(x).replace(/"/g,'\\"')+'"').join(' ')]:['--yes','wrangler',...args];
 const r=spawnSync(exe,argv,{cwd,encoding:'utf8',input,timeout:120000,maxBuffer:1024*1024,windowsHide:true});
 if(r.error||r.status!==0)throw Error(String(r.stderr||r.error?.message||r.stdout||'Wrangler命令失败').slice(-1000));
 return r.stdout||'';
}
function ensureLicenseConfig(){
 if(existsSync(licenseConfig))return;
 const publicFile=join(licenseDir,'.private','deployment-public.json');
 if(!existsSync(publicFile))throw Error('未找到 license-service/wrangler.local.toml。请先完成原授权服务部署，或运行 npm run deploy:check 生成本地配置。');
 const id=JSON.parse(readFileSync(publicFile,'utf8')).d1Id;
 if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))throw Error('本地部署记录中没有有效D1数据库ID');
 const template=readFileSync(join(licenseDir,'wrangler.toml'),'utf8');
 writeFileSync(licenseConfig,template.replace('REPLACE_WITH_YOUR_D1_ID',id),'utf8');
}
async function main(){
 ensureLicenseConfig();
 mkdirSync(privateDir,{recursive:true});
 writeFileSync(contentConfig,'name = "dudu-ai-content"\nmain = "../src/worker.js"\ncompatibility_date = "2026-11-12"\nworkers_dev = true\n','utf8');
 const token=randomBytes(48).toString('base64url');
 const hash=createHash('sha256').update(token).digest('hex');
 try{
  console.log('正在设置授权 Worker 内部连接密钥…');
  run(licenseDir,['secret','put','DUDU_CONTENT_INTERNAL_TOKEN','--config','wrangler.local.toml'],token+'\n');
  console.log('正在设置内容 Worker 内部验证摘要…');
  run(contentDir,['secret','put','INTERNAL_ADMIN_TOKEN_HASH','--config','.private/bridge.wrangler.toml'],hash+'\n');
  console.log('完成：统一运营后台已获得内容服务的私有调用权限。');
  console.log('该随机密钥未写入仓库或本地文件。请勿手动复用或截图密钥。');
 }finally{try{if(existsSync(contentConfig))unlinkSync(contentConfig)}catch{}}
}
main().catch(error=>{console.error('连接设置失败：'+error.message);process.exitCode=1});
