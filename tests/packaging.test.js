const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
test('Explicitly approve Electron postinstall for modern npm',()=>{
  const pkg = require(path.join(root,'package.json'));
  assert.equal(pkg.allowScripts.electron,true);
});
test('Repair script can restore missing Electron binary',()=>{
  const s=fs.readFileSync(path.join(root,'REPAIR_Electron.cmd'),'utf8');
  assert.match(s,/ELECTRON_MIRROR=https:\/\/npmmirror.com\/mirrors\/electron\//);
  assert.match(s,/node_modules\\electron\\install\.js/);
  assert.match(s,/electron\\dist\\electron\.exe/);
});
