// Keep legacy overlay sources unchanged while applying their v3/v4 migration scripts.
// This protects the v3 per-group plans and SQLite schema as v5 UI moves to upstream bridge.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const base='d1f8cf9d73c7c5aa7d07dae84c036cb23527fe91';
const from=path.resolve('desktop-overlay');
const to=path.resolve('legacy-overlay-v5');
if(fs.existsSync(to))throw Error('legacy staging already exists');
fs.cpSync(from,to,{recursive:true});
const restore=[
 'src-tauri/src/workbench_v3.rs',
 'src/workbench_v3/logic.ts',
 'src/workbench_v3/useUnifiedChat.ts',
 'src/ui/UnifiedChatWorkspace.tsx',
];
for(const rel of restore){
  const source='desktop-overlay/'+rel;
  const text=execFileSync('git',['show',base+':'+source],{encoding:'utf8',maxBuffer:5_000_000});
  const destination=path.join(to,rel);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,text,'utf8');
}
console.log('Pinned v4.0-M2 overlay restored for backwards-compatible v3 patches');
