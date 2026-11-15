import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnerKeys,backupFolderName,buildBackupManifest} from '../scripts/backup-before-v1.3.mjs';

const id='12345678-1234-1234-1234-123456789abc';
const keys={
 DUDU_SIGNING_PRIVATE_PKCS8_B64:'private',
 DUDU_LICENSE_PUBLIC_KEY_B64:'public',
 DUDU_DEVICE_HMAC_KEY:'device',
 DUDU_CARD_HMAC_KEY:'card',
 DUDU_ADMIN_TOKEN:'admin',
 DUDU_ADMIN_TOKEN_SHA256:'hash'
};

test('backup requires the complete original owner key set without exposing its values',()=>{
 assert.equal(assertOwnerKeys(keys),true);
 assert.throws(()=>assertOwnerKeys({...keys,DUDU_ADMIN_TOKEN:''}),/缺少必要字段/);
 assert.throws(()=>assertOwnerKeys(null),/缺少必要字段/);
});

test('backup folder names are filesystem safe and version scoped',()=>{
 assert.match(backupFolderName(new Date('2026-11-15T12:34:56.789Z')),/^v1\.3-before-2026-11-15T12-34-56-789Z$/);
});

test('backup manifest records D1 identity and verifies nonempty SQL digest metadata',()=>{
 const value=buildBackupManifest({databaseId:id,sqlPath:'dudu-license-full.sql',sqlBytes:1024,sqlSha256:'a'.repeat(64),createdAt:'2026-11-15T12:00:00.000Z',files:['owner-keys.json']});
 assert.equal(value.d1DatabaseId,id);
 assert.equal(value.sqlBytes,1024);
 assert.deepEqual(value.backedUpFiles,['owner-keys.json']);
 assert.throws(()=>buildBackupManifest({databaseId:id,sqlPath:'x.sql',sqlBytes:0,sqlSha256:'a'.repeat(64),createdAt:'now',files:[]}),/导出文件缺失或校验失败/);
 assert.throws(()=>buildBackupManifest({databaseId:'bad',sqlPath:'x.sql',sqlBytes:1,sqlSha256:'a'.repeat(64),createdAt:'now',files:[]}),/数据库ID无效/);
});
