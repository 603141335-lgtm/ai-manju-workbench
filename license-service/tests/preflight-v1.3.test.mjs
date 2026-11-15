import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {checkKeyPair,verifyBackupManifest,inspectV13Preflight} from '../scripts/preflight-v1.3.mjs';
const id='123e4567-e89b-12d3-a456-426614174000';
const h=x=>createHash('sha256').update(x).digest('hex');
function makeKeys(){
  const pair=generateKeyPairSync('ed25519');
  return {DUDU_SIGNING_PRIVATE_PKCS8_B64:pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),DUDU_LICENSE_PUBLIC_KEY_B64:pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),DUDU_DEVICE_HMAC_KEY:'device',DUDU_CARD_HMAC_KEY:'card',DUDU_ADMIN_TOKEN:'test-token',DUDU_ADMIN_TOKEN_SHA256:h('test-token')};
}
function fixture({backup=true,mismatch=false}={}){
  const dir=mkdtempSync(join(tmpdir(),'v13-preflight-'));
  mkdirSync(join(dir,'.private'),{recursive:true});
  const keys=makeKeys(),bytes=Buffer.from(JSON.stringify(keys));
  writeFileSync(join(dir,'.private','owner-keys.json'),bytes);
  writeFileSync(join(dir,'wrangler.local.toml'),'database_id = "'+id+'"\n');
  writeFileSync(join(dir,'.private','deployment-public.json'),JSON.stringify({d1Id: mismatch?'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa':id}));
  if(backup){
    const bd=join(dir,'.private','backups','v1.3-before-2026-11-15T00-00-00-000Z');
    mkdirSync(bd,{recursive:true});
    const sql=Buffer.from('CREATE TABLE devices (id TEXT);\n');
    writeFileSync(join(bd,'dudu-license-full.sql'),sql);
    writeFileSync(join(bd,'owner-keys.json'),bytes);
    writeFileSync(join(bd,'backup-manifest.json'),JSON.stringify({version:'1.3-predeploy',d1DatabaseId:id,sqlFile:'dudu-license-full.sql',sqlBytes:sql.length,sqlSha256:h(sql),backedUpFiles:['owner-keys.json']}));
  }
  return {dir,keys};
}
test('original keys must match their public key and admin token hash',()=>{
  const keys=makeKeys();assert.equal(checkKeyPair(keys),true);
  assert.throws(()=>checkKeyPair({...keys,DUDU_ADMIN_TOKEN:'wrong'}),/令牌摘要不匹配/);
  assert.throws(()=>checkKeyPair({...keys,DUDU_LICENSE_PUBLIC_KEY_B64:'bad'}),/公私钥不匹配/);
});
test('complete offline backup passes without network or file mutation',()=>{
  const {dir}=fixture();
  try{
    const a=inspectV13Preflight(dir);
    assert.equal(a.ok,true);
    assert.equal(a.checks.filter(c=>c.ok).length,3);
    assert.equal(a.checks.length,5);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('missing backup never produces a ready status',()=>{
  const {dir}=fixture({backup:false});
  try{const a=inspectV13Preflight(dir);assert.equal(a.ok,false);assert.match(a.checks[2].message,/尚未发现/)}finally{rmSync(dir,{recursive:true,force:true})}
});
test('conflicting original database records are rejected',()=>{
  const {dir}=fixture({mismatch:true});
  try{const a=inspectV13Preflight(dir);assert.equal(a.ok,false);assert.match(a.checks[1].message,/不一致/)}finally{rmSync(dir,{recursive:true,force:true})}
});
test('corrupt backup SQL and missing keys prevent green result',()=>{
  const {dir}=fixture();
  try{
    const bd=join(dir,'.private','backups','v1.3-before-2026-11-15T00-00-00-000Z');
    writeFileSync(join(bd,'dudu-license-full.sql'),'tampered');
    const result=inspectV13Preflight(dir);
    assert.equal(result.ok,false);assert.match(result.checks[2].message,/大小异常|SHA-256/);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
test('manifest verification requires fixed path and byte-identical keys',()=>{
  const common={databaseId:id,sqlBytes:3,sqlSha256:h('abc'),keysBytes:Buffer.from('keys'),backupKeysBytes:Buffer.from('keys')};
  const manifest={version:'1.3-predeploy',d1DatabaseId:id,sqlFile:'dudu-license-full.sql',sqlBytes:3,sqlSha256:h('abc'),backedUpFiles:['owner-keys.json']};
  assert.equal(verifyBackupManifest({...common,manifest}),true);
  assert.throws(()=>verifyBackupManifest({...common,manifest:{...manifest,sqlFile:'../evil.sql'}}),/SQL文件名/);
  assert.throws(()=>verifyBackupManifest({...common,manifest,backupKeysBytes:Buffer.from('other')}),/备份密钥/);
});
