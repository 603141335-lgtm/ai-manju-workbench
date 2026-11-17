"""Optional Chromium UI interaction smoke test. Runs without Electron; never checks Doubao login/upload."""
import json
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
segments = lambda n, e: [dict(id=f'{e}-s{i}',n=i,title=['五万块租金，杜不凡不敢相信','三年凶宅，安安倒先点了头','不懂合同，懂五万块','钥匙到手，糖葫芦也得兑现','这哪里凶宅，这是块宝','孩子睡着了，后厨却响了','蹲开后厨，抓到偷吃的老头','第8段的悬念'][i-1],text=f'第{i}段｜这是完整提示词，不删台词和限制。\n需要参考图：A02、A15、B08、B11、BL03、C02、C11\n镜头：侧拍、正反打。\n限制：禁止字幕、禁止水印。\n台词：杜不凡说，这锅我接了。',codes=['A02','A15','B08','B11','BL03','C02','C11'],selectedPaths=[],status='done' if i<=4 else ('redo' if i==7 else 'pending'),hidden=False,locked=False) for i in range(1,n+1)]
data=dict(version=2,title='捡了个食神小祖宗',assetFolder='',episodes=[dict(id='e1',number=1,title='第1集｜开局只有两毛三',hidden=False,locked=False,segments=segments(8,'e1')),dict(id='e10',number=10,title='第10集｜五万块盘下三年凶宅',hidden=False,locked=False,segments=segments(7,'e10'))],activeEpisodeId='e10',activeSegmentId='e10-s5',treeExpandedEpisodeId='e10',showHidden=False,layout=dict(bottomHeight=255,bottomCollapsed=False,rightWidth=440))
groups=[dict(id='g1',name='浏览器组 A',edgeProfile='Default'),dict(id='g2',name='浏览器组 B',edgeProfile='Profile 1')]
accounts=[dict(id=f'a{i}',groupId='g1' if i<=5 else 'g2',name=f'豆包{i:02}',done=0) for i in range(1,11)]
config=dict(groups=groups,accounts=accounts,activeAccountId='a1',target=2)
mock = f'''(() => {{
let cfg={json.dumps(config,ensure_ascii=False)};
let wd={json.dumps(data,ensure_ascii=False)};
const state=()=>({{workspace:wd,assets:{{recognized:200}}}});
const find=(eid,sid)=>[wd.episodes.find(e=>e.id===eid),wd.episodes.find(e=>e.id===eid)?.segments.find(s=>s.id===sid)];
const visible=()=>wd.episodes.flatMap(e=>e.segments.filter(s=>wd.showHidden||(!e.hidden&&!s.hidden)).map(s=>[e,s]));
const moveVisible=()=>{{let [e,s]=find(wd.activeEpisodeId,wd.activeSegmentId);if(!e||(!wd.showHidden&&(e.hidden||s.hidden))){{let rows=visible();if(rows.length){{wd.activeEpisodeId=rows[0][0].id;wd.activeSegmentId=rows[0][1].id;}}}}}};
window.bridge={{
getCfg:async()=>cfg,wsState:async()=>state(),wsImages:async()=>[],
selectAccount:async id=>{{cfg.activeAccountId=id;return {{id}};}},
wsSelect:async(e,s)=>{{wd.activeEpisodeId=e;wd.activeSegmentId=s;wd.treeExpandedEpisodeId=e;return state();}},
wsHidden:async(e,s,h)=>{{let [ep,seg]=find(e,s);(s?seg:ep).hidden=h;moveVisible();return state();}},
wsLocked:async(e,s,l)=>{{let [ep,seg]=find(e,s);(s?seg:ep).locked=l;return state();}},
wsShowHidden:async h=>{{wd.showHidden=h;moveVisible();return state();}},
wsHideDone:async()=>{{let n=0;for(let e of wd.episodes)for(let s of e.segments)if(s.status==='done'&&!s.hidden){{s.hidden=true;n++}}moveVisible();return {{hidden:n,state:state()}};}},
wsTreeEpisode:async e=>{{wd.treeExpandedEpisodeId=e;return state();}},
wsSetStatus:async(e,s,status)=>{{let [ep,seg]=find(e,s);if(ep.locked||seg.locked)throw Error('已锁定');seg.status=status;return state();}},
wsEditText:async(e,s,text)=>{{let [ep,seg]=find(e,s);if(ep.locked||seg.locked)throw Error('已锁定');seg.text=text;return state();}},
wsSetSelection:async()=>state(),wsLayout:async()=>true,
downloadState:async()=>({{root:'D:/AI漫剧/豆包下载',history:[]}}),
extensionStatus:async()=>({{candidate:null,loaded:null}}),
copyText:async()=>true,openEdge:async()=>true,
wsRescan:async()=>({{}}),wsImportText:async()=>({{}}),
copyImage:async()=>true,wsRename:async n=>{{wd.title=n;return state();}},
wsEditCodes:async()=>state(),
onStatus:()=>{{}},onToast:()=>{{}},onLayout:()=>{{}},onDownloadChange:()=>{{}},
bounds:()=>{{}},setOverlay:()=>{{}},
}};
}})();'''
server=ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':1600,'height':950},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    html=(root/'src/index.html').read_text(encoding='utf8')
    import re
    html=re.sub(r'<meta[^>]+Content-Security-Policy[^>]*>', '', html)
    html=html.replace('<link rel="stylesheet" href="./style.css"/>', '').replace('<script src="./renderer.js" defer></script>','')
    page.set_content(html)
    page.add_style_tag(content=(root/'src/style.css').read_text(encoding='utf8'))
    page.evaluate(mock)
    page.add_script_tag(content=(root/'src/renderer.js').read_text(encoding='utf8'))
    page.wait_for_timeout(500)
    assert not errors, errors
    assert '第10集' in page.locator('#episodeMiniStat').text_content() or '7段' in page.locator('#episodeMiniStat').text_content()
    page.locator('#btnEpisodeTree').click()
    assert page.locator('#episodeTreePanel').is_visible()
    assert page.locator('#episodeTreeList').locator('.treeEpisode').count()==2
    assert page.locator('#episodeTreeList').get_by_text('第5段',exact=False).count()>=1
    page.screenshot(path=str(root/'UI_v0.3_interaction_preview.png'),full_page=True)
    page.locator('#btnEpisodeTree').click()
    page.locator('#btnLockSegment').click()
    assert page.locator('#promptText').is_disabled()
    assert page.locator('#btnCopyText').is_enabled()
    page.locator('#btnLockSegment').click()
    assert page.locator('#promptText').is_enabled()
    page.locator('#btnHideDone').click()
    assert page.locator('#segmentStrip').locator('.segmentCard').count()==3
    page.locator('#btnShowHidden').click()
    assert page.locator('#segmentStrip').locator('.segmentCard').count()==7
    page.locator('#btnEpisodeTree').click()
    page.locator('#episodeTreeList').locator('[data-tree-action="expand"][data-eid="e1"]').click()
    page.locator('#episodeTreeList').locator('[data-tree-action="segment"][data-sid="e1-s3"]').click()
    assert page.locator('#promptText').input_value().startswith('第3段')
    assert not errors, errors
    print('PASS: 首屏、树形剧集、段落跳转、锁定只读、隐藏已完成、恢复显示；无页面脚本异常')
    browser.close()
server.shutdown()
