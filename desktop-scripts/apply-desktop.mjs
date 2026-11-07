// Apply the desktop-only overlay to an exact, clean, pinned upstream checkout.
// Keeps Tauri native webviews, provider logins, sessions and built-in modes intact.
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');
const overlay=path.resolve(process.argv[3]||'desktop-overlay');
const file=(rel)=>path.join(root,rel);
const modifications=new Map();
function once(fileName,from,to){
  const text=modifications.get(fileName)??fs.readFileSync(file(fileName),'utf8');
  const index=text.indexOf(from);
  if(index<0)throw Error('上游源码已变更，请停止构建：'+fileName+' :: '+from.slice(0,90));
  modifications.set(fileName,text.split(from).join(to));
}
function assert(condition,message){if(!condition)throw Error(message);}
assert(JSON.parse(fs.readFileSync(file('package.json'),'utf8')).name==='multi-ai-chat-desktop','必须使用指定 Multi-AI Chat Desktop 原始源码');
assert(!fs.existsSync(file('src/workflow/customRelay.ts')),'不能重复应用补丁');

// Simple Chinese: keep all original translations while adding a new complete locale.
once('src/i18n/resolve.ts',
  "export type LanguageSetting = 'system' | 'en' | 'zh-TW' | 'ja' | 'de';",
  "export type LanguageSetting = 'system' | 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'de';");
once('src/i18n/resolve.ts',
  "export const LANGUAGE_SETTINGS = ['system', 'en', 'zh-TW', 'ja', 'de']",
  "export const LANGUAGE_SETTINGS = ['system', 'en', 'zh-CN', 'zh-TW', 'ja', 'de']");
once('src/i18n/resolve.ts',
  "export const RESPONSE_LANGUAGE_SETTINGS = ['auto', 'en', 'zh-TW', 'ja', 'de']",
  "export const RESPONSE_LANGUAGE_SETTINGS = ['auto', 'en', 'zh-CN', 'zh-TW', 'ja', 'de']");
once('src/i18n/resolve.ts',
  "if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-TW';",
  "if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) return 'zh-TW';\n  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';");
once('src/i18n/t.ts',
  "import { zhTW } from './zh-TW';",
  "import { zhTW } from './zh-TW';\nimport { zhCN } from './zh-CN';");
once('src/i18n/t.ts',
  "  'zh-TW': zhTW,",
  "  'zh-TW': zhTW,\n  'zh-CN': zhCN,");
once('src/ui/SettingsModal.tsx',
  "                  <option value=\"zh-TW\">{t('settings.language.zhTW')}</option>",
  "                  <option value=\"zh-CN\">简体中文</option>\n                  <option value=\"zh-TW\">{t('settings.language.zhTW')}</option>");

// Professional slate theme; keep upstream themes available.
once('src/ui/settingsModel.ts',
  "theme: 'light' | 'dark' | 'ai-sister';",
  "theme: 'light' | 'dark' | 'slate' | 'ai-sister';");
once('src/ui/settingsModel.ts',
  "return value === 'light' || value === 'dark' || value === 'ai-sister' ? value : fallback;",
  "return value === 'light' || value === 'dark' || value === 'slate' || value === 'ai-sister' ? value : fallback;");
once('src/ui/settingsModel.ts',"language: 'system',","language: 'zh-CN',");
once('src/ui/settingsModel.ts',"theme: 'light',","theme: 'slate',");
once('src/ui/SettingsModal.tsx',
  "                  <option value=\"ai-sister\">{t('settings.themeAiSister')}</option>",
  "                  <option value=\"slate\">专业蓝灰</option>\n                  <option value=\"ai-sister\">{t('settings.themeAiSister')}</option>");
once('src/App.tsx',
  "document.documentElement.classList.toggle('ai-sister', appSettings.theme === 'ai-sister');",
  "document.documentElement.classList.toggle('ai-sister', appSettings.theme === 'ai-sister');\n    document.documentElement.classList.toggle('theme-slate', appSettings.theme === 'slate');");

// Custom workflow executor calls original trusted per-provider native webview adapters.
once('src/workflow/graph/registries.ts',
  "import type { HistoryItem, PromptArg, TextCondition, TextRef, TextTemplate, WorkflowGraph } from './types';",
  "import type { HistoryItem, PromptArg, TextCondition, TextRef, TextTemplate, WorkflowGraph } from './types';\nimport { buildRelayPrompt } from '../customRelay';");
once('src/workflow/graph/registries.ts',
  "  'free.input': (args) => arg(args, 0),",
  "  'custom.relay': (args) => buildRelayPrompt(args),\n  'free.input': (args) => arg(args, 0),");
once('src/workflow/index.ts',
  "import type { AIProvider, ChatMode, ModeRoles, WorkflowPresetId } from '../../shared/types';",
  "import type { AIProvider, ChatMode, ModeRoles, WorkflowPresetId } from '../../shared/types';\nimport type { WorkflowGraph } from './graph/types';");
once('src/workflow/index.ts',
  "  responseLanguagePolicy?: ResponseLanguagePolicy;\n}",
  "  responseLanguagePolicy?: ResponseLanguagePolicy;\n  customGraph?: WorkflowGraph;\n}");
once('src/workflow/index.ts',
  "  responseLanguagePolicy,\n}: RunWorkflowParams): Promise<RunWorkflowResult> {",
  "  responseLanguagePolicy,\n  customGraph,\n}: RunWorkflowParams): Promise<RunWorkflowResult> {");
once('src/workflow/index.ts',
  "    if (presetId === 'brainstorm') {",
  `    if (customGraph) {
      const preflight = await preflightGraph(customGraph, undefined, activeProviders);
      if (!preflight.ok) return {ok:false,preflight};
      await executeGraph(customGraph, {text,context,checkpoints,locale,responseLanguagePolicy}, graphOptions);
      return {ok:true};
    }
    if (presetId === 'brainstorm') {`);

// Main app, backwards-compatible with all existing mode presets.
once('src/App.tsx',
  "import { InputBar } from './ui/InputBar';",
  "import { InputBar } from './ui/InputBar';\nimport { CustomRelayPanel } from './ui/CustomRelayPanel';\nimport { compileRelay, loadActiveRelay, saveActiveRelay, type RelayWorkflow } from './workflow/customRelay';");
once('src/App.tsx',
  "  const [presetDetailsId, setPresetDetailsId] = useState<WorkflowPresetId | undefined>();",
  "  const [presetDetailsId, setPresetDetailsId] = useState<WorkflowPresetId | undefined>();\n  const [relayActive, setRelayActive] = useState<RelayWorkflow | undefined>(loadActiveRelay);");
once('src/App.tsx',
  "    const workflowTargets = mode === 'free' && !brainstorm\n      ? preparedWorkflowTargets ?? freeModeTargets(targets, statesRef.current)",
  "    const workflowTargets = !relayActive && mode === 'free' && !brainstorm\n      ? preparedWorkflowTargets ?? freeModeTargets(targets, statesRef.current)");
once('src/App.tsx',
  "autoFocusRunCandidate(brainstormRoles ? Object.values(brainstormRoles)[0] : workflowTargets?.[0]);",
  "autoFocusRunCandidate(relayActive ? relayActive.steps[0].provider : brainstormRoles ? Object.values(brainstormRoles)[0] : workflowTargets?.[0]);");
once('src/App.tsx',
  "setProcessTrace(createProcessTrace(mode, workflowTargets ?? [], localeRef.current, presetId));",
  "setProcessTrace(relayActive ? undefined : createProcessTrace(mode, workflowTargets ?? [], localeRef.current, presetId));");
once('src/App.tsx',
  "const workflowRoles = defaultRolesForPreset(mode, presetId, snapshotSettings.modeRoles);",
  "const workflowRoles = relayActive ? undefined : defaultRolesForPreset(mode, presetId, snapshotSettings.modeRoles);");
once('src/App.tsx',
  "      const result = await runWorkflow({\n        text: trimmed,",
  "      const result = await runWorkflow({\n        customGraph: relayActive ? compileRelay(relayActive) : undefined,\n        text: trimmed,");
once('src/App.tsx',
  "    const participants = workflowRoles\n      ? [...new Set(Object.values(workflowRoles))]",
  "    const participants = relayActive ? [...new Set(relayActive.steps.map(step => step.provider))] : workflowRoles\n      ? [...new Set(Object.values(workflowRoles))]");
once('src/App.tsx',
  "const serialGraph = brainstorm ? workflowGraphs.brainstorm : serialMode ? workflowGraphs[serialMode] : undefined;",
  "const serialGraph = relayActive ? compileRelay(relayActive) : brainstorm ? workflowGraphs.brainstorm : serialMode ? workflowGraphs[serialMode] : undefined;");
once('src/App.tsx',
  "      setPresetDetailsId((current) => (current === nextPreset.id ? undefined : nextPreset.id));",
  "      setPresetDetailsId((current) => (current === nextPreset.id ? undefined : nextPreset.id));\n      setRelayActive(undefined);\n      saveActiveRelay(undefined);");
once('src/App.tsx',
  "              {mode === 'free' && presetId !== 'brainstorm' ? (",
  `              <CustomRelayPanel
                active={relayActive} providers={activeProviders} disabled={isProcessing}
                onActivate={(definition)=>{setRelayActive(definition);saveActiveRelay(definition);setMode('free');setPresetId('free');}}
                onDeactivate={()=>{setRelayActive(undefined);saveActiveRelay(undefined);}}
              />
              {mode === 'free' && presetId !== 'brainstorm' && !relayActive ? (`);

// Do not change any user files until every match succeeds.
const additions=[
  ['src/workflow/customRelay.ts','src/workflow/customRelay.ts'],
  ['src/ui/CustomRelayPanel.tsx','src/ui/CustomRelayPanel.tsx'],
  ['src/i18n/zh-CN.ts','src/i18n/zh-CN.ts'],
];
for(const [destination,src] of additions){
  assert(!fs.existsSync(file(destination)),'文件已经存在，拒绝覆盖：'+destination);
  assert(fs.existsSync(path.join(overlay,src)),'补丁文件缺失：'+src);
}
const cssFile=file('src/styles.css');
const css=fs.readFileSync(cssFile,'utf8');
const cssExtra=fs.readFileSync(path.join(overlay,'src/styles/desktop-modern.css'),'utf8');
assert(!css.includes('html.theme-slate'),'样式已应用，请勿重复安装');
modifications.set('src/styles.css',css+'\n\n'+cssExtra+'\n');
for(const [destination,src] of additions){
  const target=file(destination);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(overlay,src),target);
}
for(const [name,body] of modifications){
  fs.copyFileSync(file(name),file(name)+'.before-v23.bak');
  fs.writeFileSync(file(name),body,'utf8');
}
console.log('PATCH OK: Desktop v2.3 / Chinese / slate / native webview relay. Modified '+modifications.size+' files.');
