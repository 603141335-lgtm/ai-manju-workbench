/* Windows PowerShell 5.1 default script encoding and temporary source-staging regression */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'scripts/build-release-win.ps1'),'utf8');
test('V1.3 Windows PowerShell 5.1 release builder is ASCII-only or UTF-8 BOM',()=>{
 const raw=fs.readFileSync(path.join(root,'scripts/build-release-win.ps1'));
 const bom=raw.length>=3&&raw[0]===0xef&&raw[1]===0xbb&&raw[2]===0xbf;
 assert.ok(bom||raw.every(byte=>byte<128),'PS 5.1 interprets UTF-8 without BOM as ANSI, which corrupts Chinese literals');
});
test('every explicitly required staged top-level file exists',()=>{
 const match=script.match(/foreach\(\$file in @\(([\s\S]*?)\)\) \{ Copy-SafeFile \$file \}/);
 assert.ok(match,'Copy-SafeFile mandatory list was not found');
 const withoutComments=match[1].replace(/^\s*#.*$/gm,'');
 const literals=[...withoutComments.matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.ok(literals.length>=6,'Unexpectedly empty staging file list');
 assert.ok(literals.every(s=>/^[\x20-\x7E]+$/.test(s)),'Required staging filenames must remain ASCII-only');
 for(const relative of literals){
  assert.ok(fs.statSync(path.join(root,...relative.split('/'))).isFile(),'Missing required staged source: '+relative);
 }
});
test('staging copies required directories and excludes production secrets and user data',()=>{
 for(const relative of ['src','scripts','tests','assets','native-core','docs','license-service/src','license-service/scripts','license-service/tests','cloud-content/src']){
  assert.ok(fs.existsSync(path.join(root,...relative.split('/'))),'Missing stage directory: '+relative);
 }
 assert.match(script,/Copy-BuildTree/);
 for(const blocked of ["'.private'","'node_modules'","'build-logs'","'release'","'target'"]){
  assert.ok(script.includes(blocked),'Missing staging exclusion '+blocked);
 }
 assert.match(script,/\.dev\.vars/);
 assert.match(script,/\bCopy-SafeFile\b/);
});

test('staged release tests have their required opt-in Python helper',()=>{
 const match=script.match(/foreach\(\$file in @\(([\s\S]*?)\)\) \{ Copy-SafeFile \$file \}/);
 assert.ok(match,'Cannot locate explicit safe staging manifest');
 const list=match[1].replace(/^\s*#.*$/gm,'');
 assert.match(list,/'INSTALL_Python312\.cmd'/,'The staged npm test suite reads INSTALL_Python312.cmd');
 assert.ok(fs.existsSync(path.join(root,'INSTALL_Python312.cmd')));
 // This build-only helper must never be shipped in the app.
 const installer=JSON.parse(fs.readFileSync(path.join(root,'release-build.json'),'utf8'));
 assert.ok(!installer.files.some(x=>!x.startsWith('!') && /INSTALL_Python312/.test(x)));
});
