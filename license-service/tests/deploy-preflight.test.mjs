import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExistingDeploymentIdentity} from '../scripts/setup-cloudflare.mjs';
import {assertExpectedD1} from '../scripts/verify-existing-d1.mjs';

const id='12345678-1234-1234-1234-123456789abc';

test('upgrade refuses to proceed when neither local config nor prior deployment record identifies the original D1',()=>{
 assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'',deploymentInfo:null}),/无法确认这是原有D1数据库/);
 assert.throws(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'database_id = "REPLACE_WITH_YOUR_D1_ID"',deploymentInfo:{}}),/无法确认这是原有D1数据库/);
});

test('upgrade accepts a matching identity from either trusted local source',()=>{
 assert.doesNotThrow(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:`database_id = "${id}"`,deploymentInfo:null}));
 assert.doesNotThrow(()=>assertExistingDeploymentIdentity({databaseId:id,localConfig:'',deploymentInfo:{d1Id:id}}));
});

test('Cloudflare preflight requires the configured database to exist with the exact expected id',()=>{
 assert.deepEqual(assertExpectedD1([{name:'dudu-license',id}],id),{name:'dudu-license',id});
 assert.throws(()=>assertExpectedD1([],id),/未找到原有 dudu-license/);
 assert.throws(()=>assertExpectedD1([{name:'dudu-license',id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}],id),/真实ID与 DUDU_D1_DATABASE_ID 不一致/);
 assert.throws(()=>assertExpectedD1([{name:'other-db',id}],id),/未找到原有 dudu-license/);
 assert.throws(()=>assertExpectedD1([{name:'dudu-license',id}],''),/缺失或不是有效UUID/);
});
