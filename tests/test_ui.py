import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path('/mnt/data/manju_workbench/app')
items=[]
for k in ['A01','A01-01','A02','A15','AG14','BL06','B02','B12','C02','C16']:
    items.append({'code':k,'items':[{'id':'a'+k,'name':k+'.png','relative':'人物/'+k+'.png','path':'C:/assets/'+k+'.png','thumb': 'data:image/svg+xml,'+"%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='200'%20height='140'%3E%3Crect%20fill='%23dbe8ff'%20width='200'%20height='140'/%3E%3Ctext%20x='50'%20y='76'%20font-size='24'%3E"+k+'%3C/text%3E%3C/svg%3E','size':1234}]})
prompt='第1段｜厨房开场｜15秒\n需要参考图：A01、A01-01、AG14、B02、C02\n连续性参考：杜不凡站在厨房，安安从门口走入。\n场景与站位：杜不凡在右侧灶台，安安在左后方。\n画风：UE5半写实国漫CG，16:9。\n限制：禁止背景音乐、歌曲、字幕、水印和LOGO。\n0—3秒｜厨师特写。\n3—10秒｜安安快步进入。\n10—15秒｜杜不凡转头回应。'
segment={'id':'s1','n':1,'title':'厨房开场｜15秒','text':prompt,'codes':['A01','A01-01','AG14','B02','C02'],'method':'栏目识别'}
segment2={'id':'s2','n':2,'title':'夜市对话｜14秒','text':'第2段｜夜市对话｜14秒\n需要参考图：A02、A15、B12、C16\n完整台词及分镜……','codes':['A02','A15','B12','C16'],'method':'栏目识别'}
state={'project':{'title':'捡了个食神小祖宗','assetFolder':'D:/AI漫剧/参考图','chosenPaths':{},'episodes':[{'id':'ep1','number':1,'title':'第1集｜捡了个食神小祖宗','preamble':'本集时间：次日上午。','segments':[segment,segment2]}]},'assetList':items,'scanStats':{'total':100,'images':10,'recognized':10,'unique':10,'unrecognized':0,'duplicates':0}}
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=b.new_page(viewport={'width':1440,'height':950},device_scale_factor=1)

    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    html=(root/'index.html').read_text(encoding='utf-8').replace('<link rel="stylesheet" href="style.css">','<style>'+ (root/'style.css').read_text(encoding='utf-8')+'</style>').replace('<script src="renderer.js"></script>','<script>'+ (root/'renderer.js').read_text(encoding='utf-8')+'</script>')
    mock='const state = '+json.dumps(state,ensure_ascii=False)+';window.__dragCalls=[];window.__copied=[];window.manju={getState:async()=>state,onDragError:()=>{},copy:async(t)=>{window.__copied.push(t);return true},startNativeDrag:(o)=>window.__dragCalls.push(o),dragTester:async()=>true,chooseFolder:async()=>state,rescan:async()=>state,importFiles:async()=>null,rename:async()=>state,backup:async()=>null,restore:async()=>state,removeEpisode:async()=>state,exportEpisode:async()=>null,chooseVersion:async()=>state,importText:async()=>({data:state,added:1,segments:2}),editSegment:async()=>state};'
    html=html.replace("<script>'use strict';", "<script>(()=>{"+mock+"})()\n'use strict';")
    page.set_content(html)
    print('DEBUG',page.evaluate('({manju:!!window.manju, app:!!window.state, status:document.querySelector("#status")?.innerText, segments:document.querySelectorAll(".segment").length})'),errors)
    page.locator('.segment').first.wait_for(timeout=3000)
    assert page.locator('.segment').count()==2
    assert page.locator('.image-tile').count()==9
    assert '第1集' in page.locator('#episodeTitle').inner_text()
    page.locator('.segment').first.locator('button',has_text='复制提示词').click()
    assert page.evaluate('window.__copied[0]').endswith('杜不凡转头回应。')
    page.locator('.segment').first.locator('.drag-handle').dispatch_event('dragstart',{'bubbles':True,'cancelable':True})
    assert page.evaluate('window.__dragCalls[0].mode')=='group'
    tiles=page.locator('.segment').first.locator('.image-tile')
    tiles.nth(0).click();tiles.nth(1).click(modifiers=['Control'])
    tiles.nth(0).dispatch_event('dragstart',{'bubbles':True,'cancelable':True})
    assert page.evaluate('window.__dragCalls[1].imageIds.length')==2
    page.screenshot(path='/mnt/data/AI漫剧素材工作台_v1.0_界面预览.png',full_page=False)
    assert errors==[],errors
    print('PASS UI: 2 segments, 9 thumbnails, copy full text, group drag event, multi-select drag event, no JS errors')
    b.close()
