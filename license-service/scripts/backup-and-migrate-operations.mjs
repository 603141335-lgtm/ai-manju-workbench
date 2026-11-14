// Back up the live D1 database locally before applying additive operations-center tables.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config='wrangler.local.toml';
if(!existsSync(join(root,config)))throw Error('缺少 wrangler.local.toml。先运行 npm run deploy:check 生成本地D1配置。');
const backupDir=join(root,'backups');mkdirSync(backupDir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=join(backupDir,'dudu-license-before-ops-'+stamp+'.sql');
function run(args){
 const win=process.platform==='win32',exe=win?'cmd.exe':'npx';
 const command='npx --yes wrangler '+args.map(x=>'"'+String(x).replace(/"/g,'\\"')+'"').join(' ');
 const argv=win?['/d','/s','/c',command]:['--yes','wrangler',...args];
 const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,windowsHide:true});
 if(r.error||r.status!==0)throw Error(String(r.stderr||r.error?.message||r.stdout||'Wrangler执行失败').slice(-1200));
 return r.stdout||'';
}
console.log('第1步：导出线上D1完整结构和数据到本机…');
run(['d1','export','dudu-license','--remote','--output',backup,'--config',config]);
if(!existsSync(backup)||statSync(backup).size<100)throw Error('D1备份文件不存在或体积异常，已停止迁移');
console.log('备份完成：'+backup+' ('+statSync(backup).size+' bytes)');
console.log('第2步：执行仅新增表和索引的SQL迁移…');
run(['d1','execute','dudu-license','--remote','--file=schema.sql','--yes','--config',config]);
console.log('第3步：检查原授权表与新运营表…');
run(['d1','execute','dudu-license','--remote','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('devices','license_cards','request_nonces','admin_audit','products','license_applications','orders','payment_events','order_deliveries','admin_audit_v2') ORDER BY name;",'--config',config]);
console.log('迁移完成。原 devices / license_cards / request_nonces / admin_audit 表未删除；本机SQL备份请另存一份。');
