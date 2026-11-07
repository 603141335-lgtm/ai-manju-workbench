import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const get=(p)=>fs.readFileSync(p,'utf8');
const native=get('desktop-overlay/src-tauri/src/domestic.rs');
const ui=get('desktop-overlay/src/ui/DomesticBrowserDock.tsx');
const panel=get('desktop-overlay/src/ui/DomesticModelPanel.tsx');
const bridge=get('desktop-scripts/apply-v4-m2.mjs');

test('native embedded view accepts whitelisted websites and bounded account slots',()=>{
  assert.match(native,/member\(&provider\)\.ok_or/);
  assert.match(native,/account_slot\(slot\)/);
  assert.match(native,/crate::webviews::ensure_control_webview\(&webview\)/);
  assert.match(native,/window\.add_child\(builder,position,size\)/);
  assert.match(native,/WebviewBuilder::new\(&label,WebviewUrl::External\(remote\)\)/);
});
test('native embedded view shares selected account profile without joining popup window',()=>{
  assert.match(native,/domestic-profiles-v4/);
  assert.match(native,/builder\.data_directory\(profile\)/);
  assert.match(native,/get_webview_window\(&independent_window_label\(&provider,slot\)\)/);
  assert.match(native,/dock_profile\(&app,&provider,slot\)/);
});
test('frontend uses real native webview, not iframe or mock chat',()=>{
  assert.match(ui,/host\.domestic\.dockOpen/);
  assert.match(ui,/host\.domestic\.dockBounds/);
  assert.match(ui,/host\.domestic\.dockHide/);
  assert.match(ui,/ResizeObserver/);
  assert.doesNotMatch(ui,/<iframe/);
  assert.match(panel,/在工作台内打开/);
});
test('native commands registered only through local-control permissions',()=>{
  for(const command of ['domestic_dock_open','domestic_dock_bounds','domestic_dock_hide','domestic_dock_close']){
    assert.match(native,new RegExp('pub async fn '+command+'\\('));
    assert.ok(bridge.includes(command));
  }
});
