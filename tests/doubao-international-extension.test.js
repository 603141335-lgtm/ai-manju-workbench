'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');

test('bundled Doubao extension is an unpacked MV3 extension limited to Doubao domains',()=>{
  const manifest=JSON.parse(source('extensions/doubao-international/manifest.json'));
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.name,'豆包国际版');
  assert.deepEqual(manifest.host_permissions,['https://www.doubao.com/*','https://www.dola.com/*']);
  assert(!manifest.host_permissions.includes('<all_urls>'));
  assert(manifest.content_scripts.some(x=>x.js.includes('content.js')&&x.world==='MAIN'));
  assert(manifest.content_scripts.some(x=>x.js.includes('forwarder.js')));
});
test('extension is copied outside ASAR for every persistent account session',()=>{
  const pkg=JSON.parse(source('package.json')),release=JSON.parse(source('release-build.json'));
  for(const build of [pkg.build,release])assert(build.extraResources.some(x=>x.from==='extensions/doubao-international'&&x.to==='extensions/doubao-international'));
  const main=source('src/main.js');
  assert.match(main,/persist:doubao_\\$\\{id\\}/);
  assert.match(main,/ensureBundledExtension\\(sess,id\\)/);
  assert.match(main,/wc\\.loadURL\\(DOUBAO_URL\\)/);
  assert.match(main,/DoubaoCreativeHubPublic/);
});
test('Electron download bridge validates page and media hosts, then uses existing download manager',()=>{
  const main=source('src/main.js'),preload=source('src/doubao-preload.js');
  const background=source('extensions/doubao-international/background.js'),forwarder=source('extensions/doubao-international/forwarder.js');
  assert.match(main,/ipcMain\\.handle\\('extension:download'/);
  assert.match(main,/isAllowedExtensionPage\\(pageUrl\\)/);
  assert.match(main,/isAllowedExtensionMediaUrl\\(mediaUrl\\.href\\)/);
  assert.match(main,/event\\.sender\\.downloadURL\\(mediaUrl\\.href\\)/);
  assert.match(main,/takePendingExtensionDownload\\(accountId,item\\.getURL\\(\\)\\)/);
  assert.match(main,/downloads\\.begin\\(requestedName,context,item\\.getURL\\(\\)\\)/);
  assert.match(preload,/ipcRenderer\\.invoke\\('extension:download'/);
  assert.match(background,/chrome\\.tabs\\.sendMessage\\(tabId/);
  assert.match(forwarder,/__DF_nativeDownloadRequest/);
});
test('upgrade keeps application identity, account partitions and user data path unchanged',()=>{
  const main=source('src/main.js'),build=JSON.parse(source('release-build.json'));
  assert.match(main,/com\\.manju\\.doubao\\.creativehub\\.public/);
  assert.match(main,/DoubaoCreativeHubPublic/);
  assert.match(main,/persist:doubao_\\$\\{id\\}/);
  assert.equal(build.appId,'com.manju.doubao.creativehub.public');
  assert.equal(build.nsis.deleteAppDataOnUninstall,false);
});
