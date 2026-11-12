'use strict';
/** Production-only JavaScript obfuscation.
 * Rules:
 * 1. Never obfuscate any module whose exported functions are serialized into
 *    the active Doubao webpage via .toString()/executeJavaScript.
 * 2. Source repository stays readable; only ephemeral CI checkout is mutated.
 * 3. Don't use anti-debugging/self-defending tricks that break Electron.
 * 4. Obfuscation slows casual copying; it is not encryption.
 */
const fs=require('node:fs'),path=require('node:path');
const obfuscator=require('javascript-obfuscator');
const root=path.resolve(__dirname,'..');
const safeModules=[
 'src/parser.js','src/workspace.js','src/renderer.js',
 'src/store.js','src/downloads.js','src/tailframe.js',
 'src/thumbnail-cache.js','src/notice-service.js','src/api-settings.js',
 'src/reference-labels.js','src/voice-bindings.js','src/import-core.js',
 'src/import-engine.js','src/mention-core.js'
];
const neverObfuscate=[
 'src/main.js','src/preload.js','src/video-mode.js',
 'src/import-page.js','src/inline-mention-page.js',
 'src/mention-page.js','src/voice-page.js'
];
for(const file of safeModules){
 if(neverObfuscate.includes(file))throw Error('禁止混淆网页注入模块：'+file);
 const target=path.join(root,file),before=fs.readFileSync(target,'utf8');
 const output=obfuscator.obfuscate(before,{
   compact:true,controlFlowFlattening:false,deadCodeInjection:false,
   debugProtection:false,selfDefending:false,disableConsoleOutput:false,
   renameGlobals:false,identifierNamesGenerator:'hexadecimal',
   sourceMap:false,seed:100,
   stringArray:true,stringArrayThreshold:0.72,
   stringArrayEncoding:['base64'],stringArrayRotate:true,
   stringArrayShuffle:true,stringArrayIndexShift:true
 }).getObfuscatedCode();
 if(output.length<500||output===before)throw Error('混淆失败：'+file);
 fs.writeFileSync(target,output+'\n','utf8');
 console.log('hardened '+file+' ('+before.length+' → '+output.length+' bytes)');
}
console.log('Exempted WebContents .toString modules:',neverObfuscate.join(', '));
