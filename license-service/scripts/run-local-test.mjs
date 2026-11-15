import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureLocalTestSecrets} from './prepare-local-test.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const configPath=join(root,'wrangler.test.toml');
const statePath='.private/test-state';
const config=readFileSync(configPath,'utf8');
const required=[
  'name = "dudu-ai-license-v13-test"',
  'database_name = "dudu-license-v13-test"',
  'database_id = "00000000-0000-4000-8000-000000000013"',
  'DUDU_TEST_MODE = "local-only"'
];
if(required.some(value=>!config.includes(value))||config.includes('database_name = "dudu-license"')||config.includes('name = "dudu-ai-license"')){
  throw Error('wrangler.test.toml 未通过本机隔离配置检查；已停止，未连接 Cloudflare');
}
if(!existsSync(join(root,'node_modules','wrangler'))) throw Error('未找到本地 Wrangler，请先在 license-service 目录运行 npm ci');
const {keys}=ensureLocalTestSecrets();

function runWrangler(args){
  const command='npx wrangler '+args.map(value=>'"'+String(value).replace(/"/g,'\\"')+'"').join(' ');
  const executable=process.platform==='win32'?'cmd.exe':'/bin/sh';
  const argv=process.platform==='win32'?['/d','/s','/c',command]:['-lc',command];
  const result=spawnSync(executable,argv,{cwd:root,stdio:'inherit'});
  if(result.error||result.status!==0) throw Error('本机 Wrangler 命令失败；未运行任何远程部署命令');
}

console.log('\n[1/3] 初始化本机 D1（显式 --local，不连接远程 D1）');
runWrangler(['d1','execute','dudu-license-v13-test','--local','--persist-to',statePath,'--file=schema.sql','--config','wrangler.test.toml']);
console.log('\n[2/3] 写入虚构测试商品（仅本机测试数据库）');
runWrangler(['d1','execute','dudu-license-v13-test','--local','--persist-to',statePath,'--file=scripts/seed-local-test.sql','--config','wrangler.test.toml']);
console.log('\n[3/3] 启动本机 Worker');
console.log('地址：http://127.0.0.1:8788/admin');
console.log('模拟台：http://127.0.0.1:8788/__test');
console.log('本机测试管理员令牌（不要分享）：'+keys.DUDU_ADMIN_TOKEN);
console.log('按 Ctrl+C 停止。此命令不部署 Worker、不创建 Cloudflare D1、不调用微信或支付宝。');
const command='npx wrangler dev --config wrangler.test.toml --persist-to '+statePath+' --ip 127.0.0.1 --port 8788';
const executable=process.platform==='win32'?'cmd.exe':'/bin/sh';
const argv=process.platform==='win32'?['/d','/s','/c',command]:['-lc',command];
const result=spawnSync(executable,argv,{cwd:root,stdio:'inherit'});
if(result.error||result.status!==0) process.exitCode=1;
