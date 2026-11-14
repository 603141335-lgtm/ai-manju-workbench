// Owner-only deployment assistant. Cloudflare credentials and private keys stay local.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {ensureOwnerKeys} from './generate-keys.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=join(root,'.private'),database='dudu-license';
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
 mkdirSync(privateDir,{recursive:true,mode:0o700});
 // A separate bootstrap config prevents placeholder D1 UUID errors.
 writeFileSync(join(privateDir,'bootstrap.toml'),'name = "dudu-ai-license"\nmain = "../src/worker.mjs"\ncompatibility_date = "2026-11-01"\n');
 const base=['--config','.private/bootstrap.toml'];
 try{cmd(['whoami',...base])}catch{throw Error('请先运行 npx wrangler login 登录自己的Cloudflare账户')}
 let list=parseDatabaseList(cmd(['d1','list','--json',...base]));
 let found=list.find(x=>x.name===database);
 if(!found){console.log('创建新的D1数据库 dudu-license');cmd(['d1','create',database,...base]);list=parseDatabaseList(cmd(['d1','list','--json',...base]));found=list.find(x=>x.name===database)}
 if(!found||!uuid.test(found.id))throw Error('Cloudflare D1数据库不存在或UUID无效');
 writeFileSync(join(root,'wrangler.local.toml'),renderLocalConfig(readFileSync(join(root,'wrangler.toml'),'utf8'),found.id));
 const cfg=['--config','wrangler.local.toml'];
 console.log('初始化远程D1表结构（不会删除已有授权记录）');
 cmd(['d1','execute',database,'--remote','--file=schema.sql','--yes',...cfg]);
 const {data,path:keyPath}=ensureOwnerKeys();
 const localSecrets=join(privateDir,'deploy-secrets.json');
 const names=['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN_SHA256'];
 writeFileSync(localSecrets,JSON.stringify(Object.fromEntries(names.map(n=>[n,data[n]]))),{mode:0o600});
 console.log('部署Cloudflare Worker与4项保护密钥...');
 let result;
 try{result=cmd(['deploy','--secrets-file','.private/deploy-secrets.json',...cfg])}
 finally{if(existsSync(localSecrets))unlinkSync(localSecrets)}
 const url=(result.match(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev\b/)||[])[0];
 if(!url)throw Error('Worker已部署，但未自动解析域名；请在Cloudflare后台复制自己的workers.dev HTTPS地址');
 const resp=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});
 if(!resp.ok||(await resp.json()).status!=='ok')throw Error('远程/health未通过检查，请查看Cloudflare日志');
 const pub={url,publicKey:data.DUDU_LICENSE_PUBLIC_KEY_B64,d1Id:found.id};
 writeFileSync(join(privateDir,'deployment-public.json'),JSON.stringify(pub,null,2)+'\n',{mode:0o600});
 console.log('部署成功，云端地址：'+url);
 console.log('GitHub Variables DUDU_LICENSE_URL = '+url);
 console.log('GitHub Variables DUDU_LICENSE_PUBLIC_KEY_B64 = '+data.DUDU_LICENSE_PUBLIC_KEY_B64);
 console.log('GitHub Variables DUDU_D1_DATABASE_ID = '+found.id);
 console.log('卡密后台：'+url+'/admin');
 console.log('私钥和后台口令在：'+keyPath+'；请离线备份，不要发给其他人。');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('部署停止：'+e.message);process.exitCode=1});
}