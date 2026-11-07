'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const targets=['app/index.html','app/renderer.js','app/main.js','app/style.css','app/preload.js','app/package.json'];
// Do not ban ordinary HTML DOM nodes or user-facing words like '工作流程'.
const pattern=/无限画布|切换画布|画布视图|画布模式|ReactFlow|@xyflow|react-flow|canvasView|canvasMode|nodeGraph|flow-editor|edgeHandles|canvasNodes/i;
for(const filename of targets){
 const body=fs.readFileSync(path.join(root,filename),'utf8');
 assert(!pattern.test(body),'Canvas entry point remains: '+filename);
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8'));
assert.equal(pkg.name,'ai-manju-workbench');
assert(!Object.keys({...pkg.dependencies,...pkg.devDependencies}).some(x=>/react-flow|xyflow|rete/i.test(x)));
const builder=fs.readFileSync(path.join(root,'electron-builder-doubao.yml'),'utf8');
assert.match(builder,/appId: com\.manju\.workbench\.desktop/);
assert.match(builder,/deleteAppDataOnUninstall: false/);
assert.match(builder,/onlyLoadAppFromAsar: true/);
console.log('PASS no canvas UI/dependencies + stable NSIS installation identity');
