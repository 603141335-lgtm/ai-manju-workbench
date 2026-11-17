'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const j=p=>JSON.parse(read(p));

test('v1.3 release version is aligned in both npm manifest and lockfile',()=>{
 const p=j('package.json'),l=j('package-lock.json');
 assert.equal(p.version,'1.3.0');assert.equal(l.version,p.version);assert.equal(l.packages[''].version,p.version);
});
test('installer identity and user data directory remain unchanged',()=>{
 const p=j('package.json'),b=j('release-build.json');
 assert.equal(p.build.appId,'com.manju.doubao.creativehub.public');
 assert.equal(b.appId,p.build.appId);assert.equal(b.nsis.deleteAppDataOnUninstall,false);
 assert.equal(b.win.artifactName,'DuduAI-Workbench-Setup-v${version}-x64.${ext}');
 assert.match(read('src/main.js'),/DoubaoCreativeHubPublic/);
 assert.match(read('src/main.js'),/DoubaoCreativeHubLocalTest/);
});
test('installer is release-only and never creates production keys or deploys the cloud backend',()=>{
 const s=read('scripts/build-release-win.ps1');
 assert.match(s,/Run-Checked \$npm @\('run','license:prepare'\)/);
 assert.match(s,/Run-Checked \$npm @\('run','verify:release'\)/);
 assert.match(s,/release:guard/);
 assert.match(s,/New-Guid|NewGuid|Guid\]::NewGuid/);
 assert.doesNotMatch(s,/\bwrangler\s+deploy\b|d1\s+create\b/);
 assert.match(s,/DUDU_LICENSE_URL/);
 assert.match(s,/DUDU_LICENSE_PUBLIC_KEY_B64/);
 assert.match(s,/Copy-BuildTree/);
});
test('published EXE boundary excludes backend, local credentials and personal data',()=>{
 const b=j('release-build.json');
 assert(!b.files.some(s=>!s.startsWith('!')&&/license-service|\.dev\.vars|\.private|node_modules|Cookies|User Data/.test(s)));
 const scan=read('scripts/release-security-scan.js');
 for(const name of ['license-service','test-owner-keys','\.dev','workspace','config','publicKey','serviceUrl']){
  assert(scan.includes(name.replace('\\',''))||scan.includes(name),'missing scan rule '+name);
 }
});
test('legacy one-click entry now forwards to isolated V1.3 builder',()=>{
 const s=read('BUILD_Windows_EXE.cmd');assert.match(s,/scripts\\build-release-win\.ps1/);
 assert.doesNotMatch(s,/v1\.0\.0/);
});

// Python 3.12 build prerequisite should be opt-in and not reset existing data.
test('Python 3.12 detection accepts both Python Launcher and direct interpreter',()=>{
 const resolver=read('scripts/find-python312.ps1');
 assert.match(resolver,/Find-DuduPython312/);
 assert.match(resolver,/python3\.12\.exe/);
 assert.match(resolver,/py\.exe/);
 assert.match(resolver,/--version/);
 assert.doesNotMatch(resolver,/DUDU_PY312_OK/);
 assert.match(read('scripts/build-release-win.ps1'),/Find-DuduPython312/);
 assert.match(read('scripts/check-build-environment.ps1'),/Find-DuduPython312/);
});
test('Python optional installer requires explicit confirmation and never silently installs',()=>{
 const installer=read('scripts/install-python312.ps1');
 assert.match(installer,/Read-Host/);
 assert.match(installer,/-cne 'YES'/);
 assert.match(installer,/Python\.Python\.3\.12/);
 assert.match(installer,/--scope user/);
 assert.doesNotMatch(read('scripts/build-release-win.ps1'),/winget\.exe/);
 assert.match(read('INSTALL_Python312.cmd'),/install-python312\.ps1/);
 const stageManifest=read('scripts/build-release-win.ps1').match(/foreach\(\$file in @\(([\s\S]*?)\)\) \{ Copy-SafeFile \$file \}/);
 assert.ok(stageManifest,'Explicit source staging list missing');
 assert.match(stageManifest[1],/'INSTALL_Python312\.cmd'/,'npm tests also execute inside staging');
});
