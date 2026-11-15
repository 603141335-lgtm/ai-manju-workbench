import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseDatabaseList} from './setup-cloudflare.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertExpectedD1(databases,expectedId){
 if(!uuid.test(expectedId||''))throw Error('DUDU_D1_DATABASE_ID缺失或不是有效UUID');
 const found=databases.find(x=>x.name==='dudu-license');
 if(!found)throw Error('Cloudflare账户中未找到原有 dudu-license D1 数据库，拒绝迁移');
 if(found.id!==expectedId)throw Error('Cloudflare中 dudu-license 的真实ID与 DUDU_D1_DATABASE_ID 不一致，拒绝迁移');
 return found;
}
function main(){
 const expectedId=String(process.env.DUDU_D1_DATABASE_ID||'').trim();
 const output=execFileSync('npx',['wrangler','d1','list','--json','--config','wrangler.local.toml'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const found=assertExpectedD1(parseDatabaseList(output),expectedId);
 process.stdout.write('已核验 Cloudflare 原有 D1：'+found.name+' / '+found.id+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(error){process.stderr.write('D1预检失败：'+(error.message||String(error))+'\n');process.exitCode=1}
}
