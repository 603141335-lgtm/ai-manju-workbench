"""v0.9.4 offline Chromium smoke test for the two-level square directory.
Requires Python playwright and local chromium. No Doubao account needed.
"""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
old=(Path(__file__).parent/'ui_e2e_mock.py').read_text(encoding='utf8')
ns={'__file__':__file__}
exec(compile(old[:old.index('server=ThreadingHTTPServer')],__file__,'exec'),ns)
root=Path(__file__).resolve().parents[1]
mock=ns['mock']
mock=mock.replace('onStatus:()=>{},','onVideoStatus:()=>{},onStatus:()=>{},')
mock=mock.replace('wsLayout:async()=>true', 'wsLayout:async patch=>{wd.layout={...wd.layout,...patch};return true}')
mock=mock.replace('wsTreeEpisode:async e=>', '''wsDelete:async(eid,sid)=>{
  wd.trash=wd.trash||[];
  const idx=wd.episodes.findIndex(e=>e.id===eid);
  const ep=wd.episodes[idx];let item,kind,position;
  if(sid){kind='segment';position=ep.segments.findIndex(x=>x.id===sid);item=ep.segments.splice(position,1)[0]}
  else{kind='episode';position=idx;item=wd.episodes.splice(idx,1)[0]}
  const entry={id:'trash-'+wd.trash.length,kind,episodeId:eid,position,item};
  wd.trash.push(entry);
  const next=wd.episodes.find(e=>e.segments.length);
  wd.activeEpisodeId=next?.id||null;
  wd.activeSegmentId=next?.segments[0]?.id||null;
  wd.treeExpandedEpisodeId=next?.id||null;
  return {state:state(),entryId:entry.id};
},
wsRestore:async id=>{
  const i=wd.trash.findIndex(x=>x.id===id),entry=wd.trash.splice(i,1)[0];
  if(entry.kind==='episode')wd.episodes.splice(entry.position,0,entry.item);
  else wd.episodes.find(e=>e.id===entry.episodeId).segments.splice(entry.position,0,entry.item);
  return state();
},
wsTreeEpisode:async e=>''')
mock=mock.replace('wsEditCodes:async()=>state(),','''wsEditCodes:async()=>state(),
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
 page.wait_for_timeout(500)
 assert not errors,errors
 assert page.locator('.episodeRail .episodeSquare').count()==2
 assert page.locator('.segmentSquareGrid .segmentSquare').count()==7
 page.locator('[data-tree-action="delete-segment"][data-sid="e10-s5"]').click()
 page.locator('dialog[open] button.primary').click()
 page.wait_for_timeout(150)
 assert page.locator('.segmentSquareGrid .segmentSquare').count()==6
 page.locator('[data-tree-action="restore"]').click()
 page.wait_for_timeout(150)
 assert page.locator('.segmentSquareGrid .segmentSquare').count()==7
 page.locator('[data-tree-action="expand"][data-eid="e1"]').click()
 page.wait_for_timeout(150)
 assert page.locator('.segmentSquareGrid .segmentSquare').count()==8
 page.screenshot(path=str(root/'v094_ui_preview.png'),full_page=True)
 assert not errors,errors
 browser.close()
print('PASS: horizontal episode rail, segment square grid, delete and undo; offline DOM mock')
