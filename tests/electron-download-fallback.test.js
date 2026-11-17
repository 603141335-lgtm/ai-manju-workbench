'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  pinnedInfo, runtimePaths, runtimeReady, offlineCandidates,
  sha256File, installVerifiedOfflineZip, downloadAttempts,
  tryInstallAttempt, ensureElectron,
} = require('../scripts/ensure-electron-win');

function fixture(version = '44.10.2') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dudu-electron-test-'));
  const dir = path.join(root, 'node_modules/electron');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `electron-v${version}-win32-x64.zip`;
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({devDependencies:{electron:version}}));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({version}));
  fs.writeFileSync(path.join(dir, 'checksums.json'), JSON.stringify({[filename]:'a'.repeat(64)}));
  fs.writeFileSync(path.join(dir, 'install.js'), '');
  return {root, dir, filename, cleanup:() => fs.rmSync(root,{recursive:true,force:true})};
}
function fakeValidRuntime(root,version) {
  const p = runtimePaths(root);
  fs.mkdirSync(p.dist, {recursive:true});
  fs.writeFileSync(p.exe,Buffer.alloc(5*1024*1024+1));
  fs.writeFileSync(p.version,version);
  fs.writeFileSync(p.pathTxt,'electron.exe');
}

test('Electron ZIP exact version and SHA256 are pinned in the npm package', () => {
  const f=fixture();try {
    assert.deepEqual(pinnedInfo(f.root), {version:'44.10.2',filename:f.filename,sha256:'a'.repeat(64)});
    const pkg=JSON.parse(fs.readFileSync(path.join(f.dir,'package.json'),'utf8'));
    pkg.version='44.10.1';fs.writeFileSync(path.join(f.dir,'package.json'),JSON.stringify(pkg));
    assert.throws(()=>pinnedInfo(f.root),/版本不一致/);
  } finally {f.cleanup();}
});

test('Electron existing runtime requires executable, version and path marker', () => {
  const f=fixture();try {
    assert.equal(runtimeReady(f.root,'44.10.2'),false);
    fakeValidRuntime(f.root,'44.10.2');
    assert.equal(runtimeReady(f.root,'44.10.2'),true);
    assert.equal(runtimeReady(f.root,'44.10.1'),false);
    fs.writeFileSync(runtimePaths(f.root).pathTxt,'Electron.app');
    assert.equal(runtimeReady(f.root,'44.10.2'),false);
  } finally {f.cleanup();}
});

test('manual downloads search explicit location and Windows Downloads, no need to copy into staging', () => {
  const candidates=offlineCandidates('electron-v44.10.2-win32-x64.zip',{
    DUDU_ELECTRON_ZIP_PATH:'C:/my-file.zip',USERPROFILE:'C:/Users/Public',
  },'/tmp/stage');
  assert.equal(candidates[0],path.resolve('C:/my-file.zip'));
  assert(candidates.some(s=>s.includes('Downloads')));
});

test('downloads use pinned package install.js and official/npmmirror HTTPS', () => {
  const attempts=downloadAttempts({});
  assert.equal(attempts.length,2);
  assert.equal(attempts[0].name,'Electron 官方 GitHub Releases');
  assert.equal(attempts[1].mirror,'https://npmmirror.com/mirrors/electron/');
  assert.equal(attempts[1].customDir,'{{ version }}');
  assert.throws(()=>downloadAttempts({ELECTRON_MIRROR:'http://untrusted.test'}),/HTTPS/);
  const f=fixture();try {
    let called=false;
    const ok=tryInstallAttempt(f.root,attempts[1],{},(exe,args,opts)=>{
      called=true;
      assert.equal(exe,process.execPath);
      assert.equal(args[0],path.join(f.dir,'install.js'));
      assert.equal(opts.env.ELECTRON_CUSTOM_DIR,'{{ version }}');
      assert.equal(opts.env.ELECTRON_INSTALL_PLATFORM,'win32');
      assert.equal(opts.env.ELECTRON_INSTALL_ARCH,'x64');
      return {status:0};
    });
    assert.equal(ok,true);assert.equal(called,true);
  }finally {f.cleanup();}
});

test('offline archive rejects hashes that differ from official embedded checksums', async()=>{
  const f=fixture();try {
    const file=path.join(f.root,f.filename);
    fs.writeFileSync(file,'not-electron');
    assert.equal(await sha256File(file),crypto.createHash('sha256').update('not-electron').digest('hex'));
    await assert.rejects(installVerifiedOfflineZip(f.root,file,'a'.repeat(64),'44.10.2'),/SHA256 不匹配/);
    assert.equal(fs.existsSync(runtimePaths(f.root).exe),false);
  }finally {f.cleanup();}
});

test('already installed Electron short circuits the network, failures surface to caller', async()=>{
  const f=fixture();try {
    fakeValidRuntime(f.root,'44.10.2');
    await ensureElectron(f.root,{DUDU_ELECTRON_ALLOW_TEST_PLATFORM:'1'},()=>{throw Error('network should not be called')});
    fs.rmSync(runtimePaths(f.root).dist,{recursive:true,force:true});
    await assert.rejects(ensureElectron(f.root,{DUDU_ELECTRON_ALLOW_TEST_PLATFORM:'1'},()=>({status:1})),/离线 ZIP 导入/);
  } finally {f.cleanup();}
});
