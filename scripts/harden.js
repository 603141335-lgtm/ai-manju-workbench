'use strict';
/* Build-only obfuscation: run AFTER tests, on an ephemeral CI checkout.
 * JS obfuscation is NOT encryption and is NOT commercial Themida shelling. */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const mod=require(require.resolve('javascript-obfuscator',{paths:[path.join(root,'app')]}));
const targets=['app/renderer.js','app/parser.js'];
for(const target of targets){
 const file=path.join(root,target);
 const source=fs.readFileSync(file,'utf8');
 const result=mod.obfuscate(source,{
  compact:true,
  controlFlowFlattening:false,
  debugProtection:false,
  disableConsoleOutput:false,
  identifierNamesGenerator:'hexadecimal',
  renameGlobals:false,
  selfDefending:false,
  sourceMap:false,
  splitStrings:false,
  stringArray:true,
  stringArrayEncoding:['base64'],
  stringArrayThreshold:0.6
 }).getObfuscatedCode();
 if(result.length<1000)throw Error('Invalid output: '+target);
 fs.writeFileSync(file,result+'\n','utf8');
 process.stdout.write('Hardened '+target+' ('+source.length+' -> '+result.length+' bytes)\n');
}
