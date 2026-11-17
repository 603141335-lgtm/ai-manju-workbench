"""Offline Chromium UI regression for the v0.9.3 desktop shell.
No Doubao sign-in and no external network. Reuses existing mock fixture.
"""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
old=(Path(__file__).parent/'ui_e2e_mock.py').read_text(encoding='utf8')
ns={'__file__':__file__}
exec(compile(old[:old.index('server=ThreadingHTTPServer')],__file__,'exec'),ns)
root=Path(__file__).resolve().parents[1]
mock=ns['mock']
mock=mock.replace('wsLayout:async()=>true', 'wsLayout:async patch=>{wd.layout={...wd.layout,...patch};return true}')
mock=mock.replace('wsEditCodes:async()=>state(),', '''wsEditCodes:async()=>state(),
importDraft:async(e,s,prompt)=>({previewText:'【预览生成】\\n'+prompt,items:[{code:'A01'}],voicePlan:{items:[]},blocked:false}),
importSyncText:async()=>({ok:true,length:100,expected:100}),
voiceList:async()=>({bindings:{}}),tailStatus:async()=>({state:'first',message:'无上段'}),
onImportStatus:()=>{},onMentionStatus:()=>{},onTailUpdated:()=>{},onUpdateStatus:()=>{},
checkUpdate:async()=>({state:'unconfigured',message:'本地测试'}),''')
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1650,'height':960},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 html=(root/'src/index.html').read_text(encoding='utf8')
 html=re.sub(r'<meta[^>]+Content-Security-Policy[^>]*>', '',html)
 html=html.replace('<link rel="stylesheet" href="./style.css"/>','').replace('<script src="./renderer.js" defer></script>','')
 page.set_content(html)
 page.add_style_tag(content=(root/'src/style.css').read_text(encoding='utf8'))
 page.evaluate(mock)
 page.add_script_tag(content=(root/'src/renderer.js').read_text(encoding='utf8'))
 page.wait_for_timeout(650)
 assert not errors, errors
 assert page.locator('#episodeTreePanel').is_visible()
 assert page.locator('.treeEpisode').count()==2
 assert page.locator('.treeEpisode.opened').count()==1
 assert page.locator('.segmentTile.doneCompact').count()==4
 assert page.locator('.segmentTile').count()==7
 assert page.locator('.segmentStrip').is_hidden()
 # Mark selected pending segment done, confirm it collapses and remains in position
 page.locator('[data-tree-action="done"][data-sid="e10-s5"]').click()
 page.wait_for_timeout(180)
 assert page.locator('.segmentTile.doneCompact').count()==5
 assert '5/7' in page.locator('.treeEpisode.opened .treeBadge').inner_text()
 # Reverse without losing the segment
 page.locator('[data-tree-action="done"][data-sid="e10-s5"]').click()
 assert page.locator('.segmentTile.doneCompact').count()==4
 page.locator('[data-tree-action="expand"][data-eid="e1"]').click()
 assert page.locator('.treeEpisode.opened [data-tree-action="segment"]').count()==8
 # Same title toggles collapse and expansion
 page.locator('[data-tree-action="expand"][data-eid="e1"]').click()
 assert page.locator('.treeEpisode.opened').count()==0
 page.locator('[data-tree-action="expand"][data-eid="e1"]').click()
 assert page.locator('.treeEpisode.opened').count()==1
 page.locator('[data-tree-action="segment"][data-sid="e1-s6"]').click()
 assert page.locator('#promptText').input_value().startswith('第6段')
 page.locator('#btnShowDraft').click()
 assert page.locator('#draftPreviewText').is_visible()
 assert page.locator('#draftPreviewText').input_value().startswith('【预览生成】')
 assert page.locator('#promptText').is_hidden()
 page.locator('#btnShowOriginal').click()
 assert page.locator('#promptText').is_visible()
 page.screenshot(path=str(root/'v093_ui_preview.png'),full_page=True)
 assert not errors,errors
 browser.close()
print('PASS: full-row episodes, segment wrap and compact completion, toggle, selection, draft tabs; browser offline mock')
