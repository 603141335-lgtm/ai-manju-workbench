'use strict';
const fs=require('node:fs');const path=require('node:path');
const obfuscator=require('javascript-obfuscator');
const root=path.resolve(__dirname,'..');
for(const rel of ['src/parser.js','src/workspace.js','src/renderer.js']){
 const file=path.join(root,rel),before=fs.readFileSync(file,'utf8');
 const output=obfuscator.obfuscate(before,{
  compact:true,controlFlowFlattening:false,deadCodeInjection:false,
  debugProtection:false,selfDefending:false,renameGlobals:false,
  identifierNamesGenerator:'hexadecimal',sourceMap:false,
  stringArray:true,stringArrayThreshold:0.5,stringArrayEncoding:['base64']
 }).getObfuscatedCode();
 if(output.length<1000)throw Error('Unexpected obfuscator output: '+rel);
 fs.writeFileSync(file,output+'\n');console.log('hardened',rel);
}
