// Read-only V1.3 preflight. Never contacts Cloudflare or writes deployment data.
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {createHash, createPrivateKey, createPublicKey} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_FIELDS = ['DUDU_SIGNING_PRIVATE_PKCS8_B64','DUDU_LICENSE_PUBLIC_KEY_B64','DUDU_DEVICE_HMAC_KEY','DUDU_CARD_HMAC_KEY','DUDU_ADMIN_TOKEN','DUDU_ADMIN_TOKEN_SHA256'];
const REQUIRED_BACKUP_FILES = ['owner-keys.json','dudu-license-full.sql','backup-manifest.json'];
const sha256 = data => createHash('sha256').update(data).digest('hex');
function readJson(file, description){
  try{return JSON.parse(readFileSync(file, 'utf8'))}
  catch{throw Error(description + ' 无法解析，请从原部署备份恢复')}
}
function getConfigId(content){
  const value = content.match(/^\s*database_id\s*=\s*"([^"]+)"/m)?.[1];
  return value && UUID.test(value) ? value : null;
}
export function checkKeyPair(keys){
  if (!keys || KEY_FIELDS.some(k => typeof keys[k] !== 'string' || !keys[k])) throw Error('原授权密钥字段不完整，禁止重新生成');
  let pub;
  try{
    const key = createPrivateKey({key:Buffer.from(keys.DUDU_SIGNING_PRIVATE_PKCS8_B64, 'base64'),format:'der',type:'pkcs8'});
    pub = createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');
  }catch{throw Error('原授权签名私钥格式无效')}
  if (pub !== keys.DUDU_LICENSE_PUBLIC_KEY_B64) throw Error('原授权签名公私钥不匹配');
  if (sha256(keys.DUDU_ADMIN_TOKEN) !== keys.DUDU_ADMIN_TOKEN_SHA256) throw Error('原管理员令牌摘要不匹配');
  return true;
}
export function verifyBackupManifest({manifest, databaseId, sqlBytes, sqlSha256, keysBytes, backupKeysBytes}){
  if(!manifest || manifest.version !== '1.3-predeploy') throw Error('备份清单版本不匹配');
  if(!UUID.test(databaseId || '') || manifest.d1DatabaseId !== databaseId) throw Error('备份D1 ID与原部署ID不一致');
  if(manifest.sqlFile !== 'dudu-license-full.sql') throw Error('备份SQL文件名不一致');
  if(!Number.isSafeInteger(sqlBytes) || sqlBytes <= 0 || manifest.sqlBytes !== sqlBytes) throw Error('备份SQL文件大小异常');
  if(!/^[0-9a-f]{64}$/i.test(sqlSha256 || '') || manifest.sqlSha256 !== sqlSha256) throw Error('备份SQL SHA-256校验失败');
  if(!Array.isArray(manifest.backedUpFiles) || !manifest.backedUpFiles.includes('owner-keys.json')) throw Error('备份清单没有原授权密钥');
  if(!keysBytes || !backupKeysBytes || !Buffer.from(keysBytes).equals(Buffer.from(backupKeysBytes))) throw Error('备份密钥与当前原授权密钥不一致');
  return true;
}
export function inspectV13Preflight(serviceRoot){
  const root = resolve(serviceRoot);
  const privateDir = join(root, '.private');
  const checks=[];
  const add=(name, ok, message)=>checks.push({name,ok,message});
  let keysBytes=null, databaseId=null;
  const keyPath = join(privateDir,'owner-keys.json');
  if(!existsSync(keyPath)) add('原授权密钥',false,'原 .private/owner-keys.json 不存在；不要新建替代密钥');
  else{
    try{
      keysBytes = readFileSync(keyPath);
      checkKeyPair(readJson(keyPath,'原授权密钥'));
      add('原授权密钥',true,'公私钥与管理员令牌摘要一致');
    }catch(e){add('原授权密钥',false,e.message); keysBytes=null}
  }
  const cfgPath=join(root,'wrangler.local.toml');
  const infoPath=join(privateDir,'deployment-public.json');
  const configured=existsSync(cfgPath)?getConfigId(readFileSync(cfgPath,'utf8')):null;
  let recorded=null, infoError=null;
  if(existsSync(infoPath)){
    try {const info=readJson(infoPath,'原部署记录');recorded=typeof info.d1Id==='string' && UUID.test(info.d1Id)?info.d1Id:null}
    catch(e){infoError=e.message}
  }
  if(infoError)add('原D1身份',false,infoError);
  else if(!configured && !recorded)add('原D1身份',false,'没有找到有效的原 D1 UUID；不要按数据库名称猜测');
  else if(configured && recorded && configured!==recorded)add('原D1身份',false,'本机两份原 D1 身份记录不一致');
  else{databaseId=configured||recorded;add('原D1身份',true,'本机原 D1 身份记录一致（尚未联网核验）')}

  const backupsRoot=join(privateDir,'backups');
  let candidates=[];
  if(existsSync(backupsRoot)){
    try{candidates=readdirSync(backupsRoot,{withFileTypes:true}).filter(x=>x.isDirectory() && /^v1\.3-before-\d{4}-/.test(x.name)).map(x=>x.name).sort().reverse()}
    catch{add('SQL与密钥备份',false,'无法读取备份目录')}
  }
  if(!checks.some(x=>x.name==='SQL与密钥备份')){
    if(!candidates.length)add('SQL与密钥备份',false,'尚未发现 V1.3 备份；先执行原部署备份命令');
    else{
      try{
        const dir=join(backupsRoot,candidates[0]);
        for(const name of REQUIRED_BACKUP_FILES)if(!existsSync(join(dir,name))) throw Error('最新备份缺少 '+name);
        const manifest=readJson(join(dir,'backup-manifest.json'),'备份清单');
        const sqlPath=join(dir,'dudu-license-full.sql');
        const sql=readFileSync(sqlPath);
        verifyBackupManifest({manifest,databaseId,sqlBytes:statSync(sqlPath).size,sqlSha256:sha256(sql),keysBytes,backupKeysBytes:readFileSync(join(dir,'owner-keys.json'))});
        add('SQL与密钥备份',true,'最新备份文件及 SHA-256 校验通过（未证明离线复制）');
      }catch(e){add('SQL与密钥备份',false,e.message)}
    }
  }
  add('Cloudflare线上验证',false,'尚未联网核对 D1 和 Worker；本工具不执行网络操作');
  add('商户沙箱验收',false,'须另行完成微信及支付宝支付、退款、回调、授权撤销测试');
  return {ok:checks.filter(x=>!['Cloudflare线上验证','商户沙箱验收'].includes(x.name)).every(x=>x.ok),checks};
}
const filePath=fileURLToPath(import.meta.url);
if(process.argv[1] && resolve(process.argv[1])===filePath){
  const serviceRoot=resolve(dirname(filePath),'..');
  const result=inspectV13Preflight(serviceRoot);
  console.log('\n独独AI V1.3 本机只读安全检查（不会连接 Cloudflare）');
  for(const x of result.checks)console.log((x.ok?'[通过] ':'[待处理] ')+x.name+'：'+x.message);
  console.log(result.ok?'本机检查通过，但仍需线上核对和商户沙箱验收':'本机检查未通过；禁止部署生产 Worker');
  if(!result.ok)process.exitCode=1;
}
