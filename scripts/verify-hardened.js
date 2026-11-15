'use strict';
/* Post-obfuscation checks. Source-based assertions belong to pre-hardening CI;
 * the packaged app is checked by actually requiring obfuscated business code.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'src')).filter(x=>x.endsWith('.js'));
for(const file of files){
 const abs=path.join(root,'src',file);
 const r=cp.spawnSync(process.execPath,['--check',abs],{encoding:'utf8',timeout:30000});
 if(r.status!==0)throw Error(file+' 语法检查失败：'+r.stderr);
}
const protectedFiles=['main.js','parser.js','workspace.js','renderer.js','import-engine.js','import-core.js','reference-labels.js','voice-bindings.js','api-settings.js','tutorial-media.js','tutorial-ui.js','task-journal.js','downloads.js'];
for(const name of protectedFiles){
 const s=fs.readFileSync(path.join(root,'src',name),'utf8');
 if(!s.includes('_0x'))throw Error(name+' 需要在正式包中混淆，但当前未混淆');
}
const exceptions=['inline-mention-page.js','import-page.js','mention-page.js','voice-page.js','video-mode.js'];
for(const name of exceptions){
 const s=fs.readFileSync(path.join(root,'src',name),'utf8');
 if(!s.startsWith("'use strict'"))throw Error(name+' 必须保持可序列化的原生 DOM 帮助函数');
}
console.log('Verified '+files.length+' JS syntax files, '+protectedFiles.length+' obfuscated protected modules, '+exceptions.length+' native DOM helpers.');
