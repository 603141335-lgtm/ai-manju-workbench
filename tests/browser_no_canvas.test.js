const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('True Doubao WebContentsView and persistent per-account browser sessions are preserved',()=>{
 const main=read('src/main.js');
 assert.match(main,/new WebContentsView\(/);
 assert.match(main,/session\.fromPartition\(`persist:doubao_\$\{id\}`\)/);
 assert.match(main,/https:\/\/www\.doubao\.com\/chat\//);
 assert.match(main,/MAX_LIVE_VIEWS=3/);
 assert.match(read('src/index.html'),/id="webHost"/);
 assert.match(read('src/preload.js'),/selectAccount/);
});
test('All canvas UI, code and dependencies removed from production app',()=>{
 assert(!fs.existsSync(path.join(root,'src/canvas')));
 assert(!fs.existsSync(path.join(root,'preview')));
 for(const name of ['src/main.js','src/preload.js','src/renderer.js','src/index.html']){
   assert(!/canvas:|btnCanvas|openCanvas|GraphStore|canvasWin|智能画布|画布工作台/.test(read(name)),name);
 }
});
test('Installer identity matches the actual browser edition, preserving userData',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.name,'doubao-creative-hub');
 assert.equal(pkg.build.productName,'豆包创作舱');
 assert.equal(pkg.build.appId,'com.manju.doubao.creativehub');
 assert.equal(pkg.build.win.target[0].target,'nsis');
 assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);
 assert(!read('src/main.js').includes("app.setPath('userData'"));
});
