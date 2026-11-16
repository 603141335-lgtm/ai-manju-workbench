'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {generateKeyPairSync,sign}=require('node:crypto');
const {packageInstallMode,verifyAttestation,electronRuntimePresent}=require('../scripts/start-local-dev.cjs');

test('desktop install chooses npm install for ZIPs without a root lockfile',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-start-'));
 try{
  assert.equal(packageInstallMode(dir),'install');
  fs.writeFileSync(path.join(dir,'package-lock.json'),'{}');
  assert.equal(packageInstallMode(dir),'ci');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('backend readiness requires an authentic fresh matching Ed25519 attestation',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pub=publicKey.export({format:'der',type:'spki'}).toString('base64');
 const now=Date.now();
 const claims={schema:1,product:'dudu-ai-workbench',purpose:'license-public-key-v1',issuedAt:now};
 const payload=Buffer.from(JSON.stringify(claims));
 const verified={payload:payload.toString('base64url'),signature:sign(null,payload,privateKey).toString('base64url')};
 assert.equal(verifyAttestation(verified,pub,now),true);
 const other=generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).toString('base64');
 assert.equal(verifyAttestation(verified,other,now),false);
 assert.equal(verifyAttestation(verified,pub,now+180000),false);
 const invalid=Buffer.from(JSON.stringify({...claims,purpose:'anything-else'}));
 assert.equal(verifyAttestation({...verified,payload:invalid.toString('base64url')},pub,now),false);
});
test('local test profile is isolated while installed production retains its existing profile',()=>{
 const root=path.resolve(__dirname,'..');
 const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
 const prepare=fs.readFileSync(path.join(root,'license-service/scripts/prepare-local-test.mjs'),'utf8');
 assert.match(main,/!app\.isPackaged&&process\.env\.DUDU_LOCAL_TEST_PROFILE==='1'/);
 assert.match(main,/localTestProfile\?'DoubaoCreativeHubLocalTest':'DoubaoCreativeHubPublic'/);
 assert.match(main,/if\(localTestProfile\)/);
 assert.match(prepare,/join\(process\.env\.APPDATA,'DoubaoCreativeHubLocalTest'\)/);
 assert.doesNotMatch(prepare,/join\(process\.env\.APPDATA,'DoubaoCreativeHubPublic'\)/);
});
test('Windows startup is ASCII CRLF and keeps diagnostics visible after failure',()=>{
 const root=path.resolve(__dirname,'..');
 const content=fs.readFileSync(path.join(root,'START_DUDUAI_LOCAL_TEST.bat'));
 const body=content.toString('utf8');
 assert.match(body,/node scripts\\start-local-dev\.cjs/);
 assert.match(body,/pause/);
 assert.match(body,/\r\n/);
 assert.equal(/(?<!\r)\n/.test(body),false);
 assert.equal(/[^\x00-\x7F]/.test(body),false);
});
test('local orchestrator does not call remote deployment commands',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../scripts/start-local-dev.cjs'),'utf8');
 assert.doesNotMatch(source,/--remote|wrangler deploy|d1 create/);
 assert.match(source,/packageInstallMode\(root\)/);
 assert.match(source,/DUDU_LOCAL_TEST_PROFILE:'1'/);
});

test('Electron native runtime is explicitly downloaded after installing the npm package',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dudu-electron-bin-'));
 try{
  const binary=path.join(dir,'node_modules','electron','dist','electron.exe');
  assert.equal(electronRuntimePresent(dir,'win32'),false);
  fs.mkdirSync(path.dirname(binary),{recursive:true});
  fs.writeFileSync(binary,'incomplete');
  assert.equal(electronRuntimePresent(dir,'win32'),false);
  fs.truncateSync(binary,6*1024*1024);
  assert.equal(electronRuntimePresent(dir,'win32'),true);
  const source=fs.readFileSync(path.join(__dirname,'../scripts/start-local-dev.cjs'),'utf8');
  assert.match(source,/exec','--no','--','install-electron/);
  assert.doesNotMatch(source,/rebuild','electron'/);
  assert.match(source,/bundledInstaller/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
