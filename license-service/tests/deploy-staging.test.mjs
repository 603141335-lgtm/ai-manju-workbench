import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStagingConfig,assertStagingDatabaseIdentity,assertStagingKeys} from '../scripts/deploy-staging.mjs';

const id='12345678-1234-1234-1234-123456789abc';
const template=`name = "dudu-ai-license-staging"
[[d1_databases]]
database_name = "dudu-license-staging"
database_id = "REPLACE_WITH_DUDU_STAGING_D1_ID"
`;
const keys={
 DUDU_SIGNING_PRIVATE_PKCS8_B64:'private',
 DUDU_LICENSE_PUBLIC_KEY_B64:'public',
 DUDU_DEVICE_HMAC_KEY:'device',
 DUDU_CARD_HMAC_KEY:'card',
 DUDU_ADMIN_TOKEN:'admin',
 DUDU_ADMIN_TOKEN_SHA256:'hash'
};

test('staging config only accepts the staging D1 placeholder and expected resource names',()=>{
 const rendered=renderStagingConfig(template,id);
 assert.match(rendered,new RegExp(id));
 assert.throws(()=>renderStagingConfig(template,'not-a-uuid'),/必须为UUID/);
 assert.throws(()=>renderStagingConfig(template.replace('dudu-license-staging','dudu-license'),id),/名称不正确/);
 assert.throws(()=>renderStagingConfig(template.replace('REPLACE_WITH_DUDU_STAGING_D1_ID','old'),id),/占位符缺失/);
});

test('staging deployment rejects a changed D1 id recorded by a prior staging deployment',()=>{
 assert.doesNotThrow(()=>assertStagingDatabaseIdentity({databaseId:id,localConfig:`database_id = "${id}"`,deploymentInfo:{d1Id:id}}));
 assert.throws(()=>assertStagingDatabaseIdentity({databaseId:id,localConfig:`database_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"`,deploymentInfo:null}),/本地配置与Cloudflare D1 ID不一致/);
 assert.throws(()=>assertStagingDatabaseIdentity({databaseId:id,localConfig:'',deploymentInfo:{d1Id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}}),/部署记录与Cloudflare D1 ID不一致/);
});

test('staging keys must be complete and remain separate from production keys',()=>{
 assert.equal(assertStagingKeys(keys),true);
 assert.throws(()=>assertStagingKeys({...keys,DUDU_CARD_HMAC_KEY:''}),/缺少必要字段/);
 assert.throws(()=>assertStagingKeys(null),/缺少必要字段/);
});
