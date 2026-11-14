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
const licenseClient=read('src/license-client.js');
const licenseConfig=JSON.parse(read('src/license-config.json'));
if(!licenseClient.includes('_0x'))throw Error('License client not obfuscated');
if(!/^https:\/\//.test(licenseConfig.serviceUrl)||!licenseConfig.publicKey)throw Error('Public release missing license service URL or verification key');
if(/PRIVATE_KEY|ADMIN_TOKEN|CARD_HMAC_KEY/.test(JSON.stringify(licenseConfig)))throw Error('Signing secret found in packaged config');
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
// Verify all 12 tutorial screenshots are really bundled, compressed and image-only.
for(let i=1;i<=12;i++){
 const id=String(i).padStart(2,'0');
 const img=fs.readFileSync(path.join(resources,'tutorial','step-'+id+'.webp'));
 if(img.length<1000||img.length>2*1024*1024||img.toString('ascii',0,4)!=='RIFF'||img.toString('ascii',8,12)!=='WEBP')
  throw Error('Guide screenshot is not a valid compact WebP: '+id);
}
for(const script of ['src/tutorial-content.js','src/tutorial-media.js','src/tutorial-ui.js','src/task-journal.js'])
 if(!read(script).includes('_0x'))throw Error('Production tutorial/background business module is not protected: '+script);
const native=require(binary);
if(typeof native.verifyLicenseToken!=='function')throw Error('Rust license signature verifier is missing');
const size=fs.statSync(binary).size;
console.log('PASS: actual released ASAR extracted; native Rust core present:',size,'bytes');
console.log('PASS: production algorithm missing, main obfuscated, preload and data features retained.');
