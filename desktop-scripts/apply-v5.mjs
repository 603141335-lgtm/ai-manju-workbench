// Apply after tested v3 M2 safety patch and v4 M2 native account/webview overlay.
// This uses the proven upstream workflow & source of truth for all original providers.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'upstream');
const overlay=path.resolve(process.argv[3]||'desktop-overlay');
const staged=new Map();
function patch(rel,from,to){
 const file=path.join(root,rel);
 const s=(staged.get(rel)??fs.readFileSync(file,'utf8')).replace(/\r\n/g,'\n');
 if(!s.includes(from)||s.includes(to))throw Error('v5 incompatible or previously applied: '+rel+' '+from.slice(0,80));
 staged.set(rel,s.replace(from,to));
}
patch('src-tauri/tauri.conf.json','"version": "4.0.2"','"version": "5.0.0"');
patch('src-tauri/src/workbench_v3.rs',
 '["normal","parallel","relay","debate","consult","coding"].contains',
 '["normal","parallel","relay","debate","consult","coding","roundtable","brainstorm"].contains');
patch('src-tauri/src/workbench_v3.rs',
 '["user","official_api","user_imported_web","system"].contains',
 '["user","official_api","user_imported_web","official_web","system"].contains');
patch('src-tauri/src/workbench_v3.rs',
 '["official_api","user_imported_web"].contains',
 '["official_api","user_imported_web","official_web"].contains');
patch('src/workbench_v3/logic.ts',"'qwen';","'qwen' | 'yuanbao';");
patch('src/workbench_v3/logic.ts',"'coding';","'coding' | 'roundtable' | 'brainstorm';");
patch('src/workbench_v3/logic.ts',
 "'user_imported_web' | 'system'",
 "'user_imported_web' | 'official_web' | 'system'");
patch('src/workbench_v3/logic.ts',
 "'official_api' | 'user_imported_web'",
 "'official_api' | 'user_imported_web' | 'official_web'");

const copies=[
 'src/ui/OfficialProviderPane.tsx',
 'src/ui/UnifiedChatWorkspace.tsx',
 'src/workbench_v3/useUnifiedChat.ts',
];
for(const rel of copies){
 const source=path.join(overlay,rel);
 if(!fs.existsSync(source))throw Error('Missing v5 overlay: '+source);
 const old=path.join(root,rel);
 if(rel.endsWith('OfficialProviderPane.tsx')&&fs.existsSync(old))throw Error('Original provider pane already exists');
}
for(const [rel,body] of staged)fs.writeFileSync(path.join(root,rel),body,'utf8');
for(const rel of copies){
 const target=path.join(root,rel);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(path.join(overlay,rel),target);
}
console.log('v5 merged: original native provider send/response + Chinese chat UI; SQLite plans kept');
