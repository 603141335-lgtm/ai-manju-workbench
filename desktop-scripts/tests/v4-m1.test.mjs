import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const native=fs.readFileSync('desktop-overlay/src-tauri/src/domestic.rs','utf8');
const ui=fs.readFileSync('desktop-overlay/src/ui/DomesticModelPanel.tsx','utf8');
const bridge=fs.readFileSync('desktop-scripts/apply-v4-m1.mjs','utf8');
test('only 1 to 10 browser slots accepted; slot 1 preserves original profile',()=>{
 assert.match(native,/\(1\.\.=10\)\.contains\(&slot\)/);
 assert.match(native,/if slot == 1/);
 assert.match(native,/data_directory\(profile\)/);
 assert.match(ui,/Array\.from\(\{length:10\}/);
});
test('provider whitelist and control view guard',()=>{
 assert.match(native,/member\(&provider\)\.ok_or/);
 assert.match(native,/ensure_control_webview\(&webview\)/);
 assert.match(native,/https:\/\/yuanbao\.tencent\.com\/chat/);
});
test('Yuanbao is web-only and credentials are not stored by UI',()=>{
 assert.match(ui,/m\.id!=='yuanbao'/);
 assert.doesNotMatch(native,/"yuanbao" => Some\("https:\/\/api/);
 assert.match(bridge,/openMemberSlot/);
});
