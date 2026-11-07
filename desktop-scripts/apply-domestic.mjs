// v2.4 overlay, runs strictly after pinned upstream + v2.3 desktop overlay.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const overlay=path.resolve(process.argv[3]||'desktop-overlay');
const changes=new Map();
function modify(rel,from,to){
  const text=(changes.get(rel)??fs.readFileSync(path.join(root,rel),'utf8')).replace(/\r\n/g,'\n');
  if(!text.includes(from))throw Error('补丁不兼容当前源码：'+rel+' :: '+from.slice(0,70));
  if(text.includes(to))throw Error('拒绝重复打补丁：'+rel);
  changes.set(rel,text.replace(from,to));
}
modify('src-tauri/src/lib.rs',
  'mod bridge;\n',
  'mod bridge;\nmod domestic;\n');
modify('src-tauri/src/lib.rs',
  '            webviews::provider_open,',
  '            domestic::domestic_open_member,\n            domestic::domestic_api_chat,\n            webviews::provider_open,');
modify('src/App.tsx',
  "import { CustomRelayPanel } from './ui/CustomRelayPanel';",
  "import { CustomRelayPanel } from './ui/CustomRelayPanel';\nimport { DomesticModelPanel } from './ui/DomesticModelPanel';");
modify('src/App.tsx',
  '              <CustomRelayPanel\n',
  '              <DomesticModelPanel />\n              <CustomRelayPanel\n');
for(const [rel,source] of [
  ['src-tauri/src/domestic.rs','src-tauri/src/domestic.rs'],
  ['src/ui/DomesticModelPanel.tsx','src/ui/DomesticModelPanel.tsx'],
]){
  const to=path.join(root,rel),from=path.join(overlay,source);
  if(fs.existsSync(to))throw Error('文件已存在：'+to);
  if(!fs.existsSync(from))throw Error('缺失：'+from);
}
for(const [rel,source] of [
  ['src-tauri/src/domestic.rs','src-tauri/src/domestic.rs'],
  ['src/ui/DomesticModelPanel.tsx','src/ui/DomesticModelPanel.tsx'],
]){
  const to=path.join(root,rel),from=path.join(overlay,source);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
}
for(const [rel,text] of changes){
  const to=path.join(root,rel);
  fs.writeFileSync(to,text,'utf8');
}
console.log('v2.4 integrated: domestic native webview windows and API relay');
