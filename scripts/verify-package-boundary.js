'use strict';
/* Post-NSIS build security gate: EXTRACT the actual packaged ASAR.
 * "Ran obfuscator" is not a valid release criterion.
 */
const fs=require('node:fs'),path=require('node:path');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const resources=path.join(root,'release','win-unpacked','resources');
const archive=path.join(resources,'app.asar');
const binary=path.join(resources,'app.asar.unpacked','native','dudu_core.node');
if(!fs.existsSync(archive))throw Error('Missing actual packaged app.asar');
if(!fs.existsSync(binary)||fs.statSync(binary).size<10000)throw Error('Rust native core not bundled in app.asar.unpacked');
const read=pathInPackage=>asar.extractFile(archive,pathInPackage).toString('utf8');
const core=read('src/import-core.js');
const main=read('src/main.js');
const preload=read('src/preload.js');
const html=read('src/index.html');
if(core.includes('const CODE = /')||core.includes('const REFHEADER=')){
 throw Error('Original readable reference matching algorithm unexpectedly shipped in ASAR');
}
if(!core.includes('_0x')||core.length>35000)throw Error('Production Rust bridge is not protected or has unexpectedly large plaintext core');
if(!main.includes('_0x'))throw Error('Main Electron process is not obfuscated');
if(!preload.includes("contextBridge"))throw Error('Preload binding missing');
if(!html.includes('独独AI工作台'))throw Error('New brand missing from packaged HTML');
const actions=html.match(/<div class="topactions">([\s\S]*?)<\/div>/);
if(!actions||actions[1].includes('btnData'))throw Error('Deprecated top-right data directory button still packaged');
if(!html.includes('id="btnData"'))throw Error('Data directory feature removed rather than relocated');
const size=fs.statSync(binary).size;
console.log('PASS: actual released ASAR extracted; native Rust core present:',size,'bytes');
console.log('PASS: production algorithm missing, main obfuscated, preload and data features retained.');
