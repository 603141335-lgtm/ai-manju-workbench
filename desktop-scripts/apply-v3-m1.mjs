// v3 M0/M1/M2 migration on pinned upstream AFTER v2.3 and v2.4 patches.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const overlay=path.resolve(process.argv[3]||'desktop-overlay');
const changed=new Map();
function patch(rel,from,to){
 const text=(changed.get(rel)??fs.readFileSync(path.join(root,rel),'utf8')).replace(/\r\n/g,'\n');
 if(!text.includes(from))throw Error('Upstream mismatch: '+rel+' / '+from.slice(0,75));
 if(text.includes(to))throw Error('Already patched: '+rel);
 changed.set(rel,text.replace(from,to));
}
patch('src-tauri/src/settings.rs',
 'const LANGUAGES: &[&str] = &["system", "en", "zh-TW", "ja", "de"];',
 'const LANGUAGES: &[&str] = &["system", "en", "zh-CN", "zh-TW", "ja", "de"];');
patch('src-tauri/src/settings.rs',
 'const RESPONSE_LANGUAGES: &[&str] = &["auto", "en", "zh-TW", "ja", "de"];',
 'const RESPONSE_LANGUAGES: &[&str] = &["auto", "en", "zh-CN", "zh-TW", "ja", "de"];');
patch('src-tauri/Cargo.toml','thiserror = "2.0.9"',
 'thiserror = "2.0.9"\nrusqlite = { version = "0.35", features = ["bundled"] }');
patch('src-tauri/src/lib.rs','mod domestic;\n','mod domestic;\nmod workbench_v3;\n');
patch('src-tauri/src/lib.rs','            domestic::domestic_api_chat,',
 ['            domestic::domestic_api_chat,',
  '            workbench_v3::wb_state,',
  '            workbench_v3::wb_create,',
  '            workbench_v3::wb_set_conversation,',
  '            workbench_v3::wb_set_members,',
  '            workbench_v3::wb_set_member,',
  '            workbench_v3::wb_messages,',
  '            workbench_v3::wb_message,',
  '            workbench_v3::wb_save_run,',
  '            workbench_v3::wb_recent_run,',
  '            workbench_v3::wb_backup,'].join('\n'));
patch('src/host/index.ts',
 "import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';",
 "import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';\nimport type { WorkspaceState,Message,Member,RelayCheckpoint,StoredRun,ChatMode } from '../workbench_v3/logic';");
patch('src/host/index.ts','  app: {\n',[
 '  workbench: {',
 "    state: ():Promise<WorkspaceState>=>invoke('wb_state'),",
 "    create: (v:{id:string;title:string;kind:'private'|'group';memberIds:string[]}):Promise<void>=>invoke('wb_create',v),",
 "    setConversation: (id:string,title:string,mode:ChatMode):Promise<void>=>invoke('wb_set_conversation',{id,title,mode}),",
 "    setMembers: (conversationId:string,assignments:{memberId:string;role:string}[]):Promise<void>=>invoke('wb_set_members',{conversationId,assignments}),",
 "    setMember: (member:Member):Promise<void>=>invoke('wb_set_member',{member}),",
 "    messages: (conversationId:string):Promise<Message[]>=>invoke('wb_messages',{conversationId}),",
 "    message: (message:Omit<Message,'createdAt'>):Promise<void>=>invoke('wb_message',{message}),",
 "    saveRun: (run:{id:string;conversationId:string;status:string;state:RelayCheckpoint}):Promise<void>=>invoke('wb_save_run',{run}),",
 "    recentRun: (conversationId:string):Promise<StoredRun|null>=>invoke('wb_recent_run',{conversationId}),",
 "    backup: ():Promise<string>=>invoke('wb_backup'),",
 '  },','  app: {'].join('\n'));
patch('src/App.tsx',
 "import { CustomRelayPanel } from './ui/CustomRelayPanel';",
 "import { CustomRelayPanel } from './ui/CustomRelayPanel';\nimport { UnifiedChatWorkspace } from './ui/UnifiedChatWorkspace';");
patch('src/App.tsx',
 "  const [relayActive, setRelayActive] = useState<RelayWorkflow | undefined>(loadActiveRelay);",
 "  const [relayActive, setRelayActive] = useState<RelayWorkflow | undefined>(loadActiveRelay);\n  const [unifiedChatOpen,setUnifiedChatOpen]=useState(false);");
patch('src/App.tsx',
 '  return (\n    <main className="app-shell h-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">',
 [
 '  if (unifiedChatOpen) return <UnifiedChatWorkspace onClose={()=>{',
 '    setUnifiedChatOpen(false);',
 '    void Promise.allSettled(openProviders.map(provider=>host.provider.show(provider,false)));',
 '  }}/>;',
 '  return (',
 '    <main className="app-shell h-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">',
 '      <button type="button" disabled={isProcessing}',
 '        title="AI 私聊 / 群聊 / @成员 / 自动接力"',
 '        onClick={async()=>{',
 "          await Promise.allSettled((['chatgpt','claude','gemini','grok','meta'] as AIProvider[]).map(p=>host.provider.hide(p)));",
 '          setUnifiedChatOpen(true);',
 '        }}',
 '        className="fixed bottom-5 left-[95px] z-[80] rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-indigo-700 disabled:opacity-50">',
 '        💬 统一 AI 群聊',
 '      </button>'
 ].join('\n'));
const commands=['wb_state','wb_create','wb_set_conversation','wb_set_members','wb_set_member',
 'wb_messages','wb_message','wb_save_run','wb_recent_run','wb_backup'];
const capability='src-tauri/capabilities/default.json';
const original=(changed.get(capability)??fs.readFileSync(path.join(root,capability),'utf8')).replace(/\r\n/g,'\n');
const anchor='"allow-domestic-api-chat"';
if(!original.includes(anchor))throw Error('Missing v2.4 command capability anchor');
changed.set(capability,original.replace(anchor,anchor+',\n'+commands.map(c=>'    "allow-'+c.replaceAll('_','-')+'"').join(',\n')));
const files=['src-tauri/src/workbench_v3.rs','src/workbench_v3/logic.ts',
 'src/workbench_v3/useUnifiedChat.ts','src/workbench_v3/__tests__/logic.test.ts',
 'src/ui/UnifiedChatWorkspace.tsx'];
for(const rel of files){
 if(fs.existsSync(path.join(root,rel))||!fs.existsSync(path.join(overlay,rel)))throw Error('Missing/duplicate file: '+rel);
}
for(const [rel,text] of changed){fs.writeFileSync(path.join(root,rel),text,'utf8');}
for(const rel of files){
 const dst=path.join(root,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.copyFileSync(path.join(overlay,rel),dst);
}
for(const c of commands){
 const rel='src-tauri/permissions/autogenerated/'+c+'.toml';
 const out=path.join(root,rel);fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,'[[permission]]\nidentifier = "allow-'+c.replaceAll('_','-')+'"\ndescription = "Main-only unified chat command"\ncommands.allow = ["'+c+'"]\n');
}
console.log('v3 unified conversations/SQLite/relay applied; existing account and WebView modules untouched.');