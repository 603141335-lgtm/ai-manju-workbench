import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDatabaseList,renderLocalConfig,assertExistingDeploymentIdentity} from '../scripts/setup-cloudflare.mjs';

const id='12345678-1234-1234-1234-123456789abc';

test('deployment database discovery parses Wrangler JSON output',()=>{
  assert.deepEqual(parseDatabaseList(JSON.stringify([{name:'dudu-license',uuid:id}])),[{name:'dudu-license',id}]);
  assert.throws(()=>parseDatabaseList('not-json'),/没有返回数据库列表/);
});

test('local Wrangler config is rendered only from the explicit D1 placeholder',()=>{
  assert.match(renderLocalConfig('database_id = "REPLACE_WITH_YOUR_D1_ID"',id),new RegExp(id));
  assert.throws(()=>renderLocalConfig('database_id = "old"',id),/占位符/);
});

test('upgrade refuses a different local D1 identity',()=>{
  assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'database_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"'}),/D1 ID与Cloudflare同名数据库不一致/);
});

test('upgrade refuses a different previously recorded deployment D1 identity',()=>{
  assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,deploymentInfo:{d1Id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}}),/deployment-public.json记录的D1 ID/);
});

test('upgrade accepts matching D1 identities and does not invent a replacement',()=>{
  assert.doesNotThrow(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:`database_id = "${id}"`,deploymentInfo:{d1Id:id}}));
});
