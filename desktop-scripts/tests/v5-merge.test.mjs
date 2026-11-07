import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const hook=read('desktop-overlay/src/workbench_v3/useUnifiedChat.ts');
const ui=read('desktop-overlay/src/ui/UnifiedChatWorkspace.tsx');
const pane=read('desktop-overlay/src/ui/OfficialProviderPane.tsx');
const migration=read('desktop-scripts/apply-v5.mjs');
test('single real webpage engine, no fake responses',()=>{
 assert.match(hook,/sendAndWait\(member\.provider,prompt\)/);
 assert.match(hook,/providerResponseError/);
 assert.match(hook,/source:'official_web'/);
 assert.match(hook,/checkReady\(members\)/);
 assert.doesNotMatch(hook,/请切回原版操作/);
});
test('restored original six collaboration modes from upstream',()=>{
 for(const name of ['debate','consult','coding','roundtable','brainstorm']){
  assert.ok(ui.includes("id:'"+name+"'"));
 }
 assert.match(hook,/runWorkflow\(/);
 assert.match(hook,/preflightGraph\(/);
 assert.match(hook,/onBridgeMessage\(/);
});
test('native webview reuses original account instead of popup/iframe',()=>{
 assert.match(pane,/host\.provider\.open\(provider,rect\)/);
 assert.match(pane,/host\.layout\.setBounds/);
 assert.match(pane,/host\.provider\.show/);
 assert.match(pane,/startBridgePull/);
 assert.doesNotMatch(pane,/<iframe/);
 assert.match(ui,/OfficialProviderPane/);
});
test('v3 plans / old data retained, v5 source copied after migration',()=>{
 assert.match(hook,/host\.workbench\.plan\(selected\)/);
 assert.match(hook,/host\.workbench\.setPlan/);
 assert.match(hook,/unknown_completion/);
 assert.match(ui,/WorkflowPlanEditor/);
 assert.match(migration,/workbench_v3\/logic\.ts/);
 assert.match(migration,/src-tauri\/src\/workbench_v3\.rs/);
});
