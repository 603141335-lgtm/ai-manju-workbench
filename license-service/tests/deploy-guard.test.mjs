import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDatabaseList,renderLocalConfig,assertExistingDeploymentIdentity,assertDeploymentConfirmations,assertVerifiedBackup} from '../scripts/setup-cloudflare.mjs';

const id='12345678-1234-1234-1234-123456789abc';

test('deployment database discovery parses Wrangler JSON output',()=>{
  assert.deepEqual(parseDatabaseList(JSON.stringify([{name:'dudu-license',uuid:id}])),[{name:'dudu-license',id}]);
  assert.throws(()=>parseDatabaseList('not-json'),/没有返回数据库列表/);
});

test('local Wrangler config is rendered only from the explicit D1 placeholder',()=>{
  assert.match(renderLocalConfig('database_id = "REPLACE_WITH_YOUR_D1_ID"',id),new RegExp(id));
  assert.throws(()=>renderLocalConfig('database_id = "old"',id),/占位符/);
});

test('upgrade refuses missing original D1 identity records',()=>{
  assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'',deploymentInfo:null}),/缺少原部署D1身份记录/);
});

test('upgrade refuses a different local D1 identity',()=>{
  assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'database_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"'}),/D1 ID与Cloudflare同名数据库不一致/);
});

test('upgrade refuses a different previously recorded deployment D1 identity',()=>{
  assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,deploymentInfo:{d1Id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}}),/deployment-public.json记录的D1 ID/);
});

test('upgrade accepts matching D1 identities and does not invent a replacement',()=>{
  assert.doesNotThrow(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:\`database_id = "\${id}"\`,deploymentInfo:{d1Id:id}}));
  assert.doesNotThrow(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'',deploymentInfo:{d1Id:id}}));
});

test('local production deploy requires offline backup, sandbox acceptance and exact production confirmation',()=>{
  assert.throws(()=>assertDeploymentConfirmations([]),/生产部署已阻止/);
  assert.throws(()=>assertDeploymentConfirmations(['--confirm-backup-copied','--confirm-sandbox-passed']),/DEPLOY_PRODUCTION_V1_3/);
  assert.throws(()=>assertDeploymentConfirmations(['--confirm-backup-copied','--confirm-production=wrong']),/沙箱支付/);
  assert.doesNotThrow(()=>assertDeploymentConfirmations([
    '--confirm-backup-copied','--confirm-sandbox-passed','--confirm-production=DEPLOY_PRODUCTION_V1_3'
  ]));
});

test('local production deploy validates backup D1 identity, SQL digest and unchanged owner keys',()=>{
  const manifest={
    version:'1.3-predeploy',d1DatabaseId:id,sqlFile:'dudu-license-full.sql',
    sqlBytes:1024,sqlSha256:'a'.repeat(64),backedUpFiles:['owner-keys.json']
  };
  const valid={manifest,databaseId:id,sqlBytes:1024,sqlSha256:'a'.repeat(64),backupKeysSha256:'b'.repeat(64),currentKeysSha256:'b'.repeat(64)};
  assert.equal(assertVerifiedBackup(valid),true);
  assert.throws(()=>assertVerifiedBackup({...valid,databaseId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}),/D1 ID/);
  assert.throws(()=>assertVerifiedBackup({...valid,sqlBytes:2048}),/文件大小/);
  assert.throws(()=>assertVerifiedBackup({...valid,sqlSha256:'c'.repeat(64)}),/SHA-256/);
  assert.throws(()=>assertVerifiedBackup({...valid,backupKeysSha256:'c'.repeat(64)}),/密钥与当前部署密钥不一致/);
  assert.throws(()=>assertVerifiedBackup({...valid,manifest:{...manifest,backedUpFiles:[]}}),/缺少原授权密钥文件/);
});
