"""v0.9.2 UI and task-selection smoke test with mocked Chrome APIs.
This does not verify real third-party AI websites.
"""
import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
FAKE=r'''(()=>{
 const db={};window.__AAC9_DB=db;
 db['aac7:chatgpt:cfg']={platform:'chatgpt',projectName:'旧版小说',mode:'episodes',firstPrompt:'第1集',nextPrompt:'继续{集数}',total:3,modelChoice:'auto',images:{first:[],next:[],rounds:[]}};
 db['aac7:chatgpt:results']={'1':{episode:1,status:'done',content:'旧版历史正文'}};
 db['aac7:enabled']=['chatgpt','gemini','doubao','deepseek'];
 const pages=[
  {id:80,windowId:20,title:'ChatGPT',url:'https://chatgpt.com/c/old',active:true},
  {id:81,windowId:21,title:'Gemini',url:'https://gemini.google.com/app',active:true},
  {id:82,windowId:22,title:'Doubao',url:'https://www.doubao.com/chat/',active:true},
  {id:83,windowId:23,title:'DeepSeek',url:'https://chat.deepseek.com/',active:true}
 ];window.__AAC9_PAGES=pages;
 const listeners=[];let nextTab=100,nextWindow=30;
 const get=keys=>{if(typeof keys==='string')keys=[keys];if(!Array.isArray(keys))keys=Object.keys(keys||{});const o={};for(const k of keys)if(Object.hasOwn(db,k))o[k]=structuredClone(db[k]);return o;};
 const set=async patch=>{const changes={};for(const [k,v] of Object.entries(patch)){changes[k]={oldValue:db[k],newValue:structuredClone(v)};db[k]=structuredClone(v);}queueMicrotask(()=>listeners.forEach(fn=>fn(changes,'local')));};
 window.chrome={
  storage:{local:{get:async keys=>get(keys),set},onChanged:{addListener:fn=>listeners.push(fn)}},
  tabs:{
   query:async()=>pages.map(x=>({...x})),
   get:async id=>{const t=pages.find(x=>x.id===Number(id));if(!t)throw Error('tab not found');return {...t};},
   create:async o=>{const t={id:nextTab++,windowId:nextWindow++,url:o.url,title:'new tab',active:true};pages.push(t);return {...t};},
   update:async(id,o)=>{const t=pages.find(x=>x.id===Number(id));if(!t)throw Error('tab not found');Object.assign(t,o);return {...t};},
   sendMessage:async(id,msg)=>{
    if(msg.type==='AAC9_BIND')return {ok:true};
    if(msg.type==='AAC9_PING')return {ok:true,hasEditor:true,hasSend:true,replyCount:0};
    if(msg.type==='AAC9_MODEL_PROBE')return {ok:true,currentModel:'GPT-6 High',options:[{id:'GPT-6 High',label:'GPT-6 High',disabled:false}]};
    if(msg.type==='AAC9_MODEL_APPLY')return {ok:true,detail:'ok'};
    if(msg.type==='AAC9_RUN'||msg.type==='AAC9_RECOVER')return {ok:true};
    return {ok:true};
   }
  },
  windows:{create:async o=>{const id=nextWindow++;const t={id:nextTab++,windowId:id,url:o.url,title:'new window',active:true};pages.push(t);return {id,tabs:[{...t}]};},update:async()=>({})},
  scripting:{executeScript:async()=>[]},
  runtime:{getURL:x=>'chrome-extension://fake/'+x,sendMessage:async m=>m.type==='AAC9_PUMP_QUEUE'?{ok:true}:{ok:true}}
 };
 window.confirm=()=>true;
})();'''

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':1100})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.add_init_script(FAKE);await page.evaluate(FAKE)
  html=(ROOT/'dashboard.html').read_text(encoding='utf-8')
  html=html.replace('<link rel="stylesheet" href="style.css">','').replace('<script src="image-store.js"></script>','').replace('<script src="dashboard.js"></script>','')
  logo=base64.b64encode((ROOT/'icons/icon64.png').read_bytes()).decode()
  html=html.replace('src="icons/icon64.png"',f'src="data:image/png;base64,{logo}"')
  await page.set_content(html,wait_until='load')
  await page.add_style_tag(content=(ROOT/'style.css').read_text(encoding='utf-8'))
  await page.add_script_tag(content=(ROOT/'image-store.js').read_text(encoding='utf-8'))
  await page.add_script_tag(content=(ROOT/'dashboard.js').read_text(encoding='utf-8'))
  await page.wait_for_selector('.platform-card',timeout=10000)
  assert await page.locator('.commandbar').count()==0,'global command bar should be removed'
  assert await page.locator('.platform-card').count()==4,'four platform cards'
  assert await page.locator('.platform-card-actions button').count()==16,'four actions per platform'
  ratio=await page.locator('.platform-card').first.evaluate('(el)=>el.getBoundingClientRect().width/el.getBoundingClientRect().height')
  assert 0.90<=ratio<=1.10, f'platform card should be square, ratio={ratio}'
  # Migration retains old body.
  assert await page.evaluate("__AAC9_DB['aac9:instance:chatgpt-A:results']['1'].content")=='旧版历史正文'
  # Clicking the platform card switches the selected instance.
  await page.locator('.platform-card').nth(1).click()
  assert await page.evaluate('selected')=='gemini-A'
  assert 'Google Gemini' in await page.locator('#editorTitle').inner_text()
  # Add task B and C; dynamic instances must be available beyond the old A/B limit.
  await page.locator('.platform-card').first.click()
  await page.locator('.task-chip-add').click()
  await page.wait_for_timeout(100)
  assert 'chatgpt-B' in await page.evaluate('instances')
  await page.locator('.task-chip-add').click()
  await page.wait_for_timeout(100)
  assert 'chatgpt-C' in await page.evaluate('instances')
  assert await page.locator('#taskSwitcher .task-chip').count()==4
  # Clicking the platform card from Gemini should pick the most recent running task; no run yet, defaults to most recent task.
  await page.locator('.platform-card').nth(1).click()
  assert await page.evaluate('selected')=='gemini-A'
  # Start and pause a platform task through the square card.
  await page.locator('.platform-card').nth(2).locator('button',has_text='开始').click()
  await page.wait_for_timeout(150)
  assert await page.evaluate("__AAC9_DB['aac9:instance:doubao-A:run'].status") in ('running','queued')
  await page.locator('.platform-card').nth(2).locator('button',has_text='暂停').click()
  await page.wait_for_timeout(100)
  assert await page.evaluate("__AAC9_DB['aac9:instance:doubao-A:control'].desired")=='paused'
  # The editor groups are present and correctly ordered.
  labels=await page.locator('.settings-group-head b').all_inner_texts()
  assert labels==['基础设置','模型设置','创作指令与图片'],labels
  assert not errors,errors
  await page.screenshot(path='/mnt/data/AI_Auto_Continue_v092_UI_Preview.png',full_page=True)
  mobile=await browser.new_page(viewport={'width':390,'height':844})
  await mobile.add_init_script(FAKE);await mobile.evaluate(FAKE)
  await mobile.set_content(html,wait_until='load')
  await mobile.add_style_tag(content=(ROOT/'style.css').read_text(encoding='utf-8'))
  await mobile.add_script_tag(content=(ROOT/'image-store.js').read_text(encoding='utf-8'))
  await mobile.add_script_tag(content=(ROOT/'dashboard.js').read_text(encoding='utf-8'))
  await mobile.wait_for_selector('.platform-card',timeout=10000)
  mobile_cols=await mobile.locator('.platform-cards').evaluate('(el)=>getComputedStyle(el).gridTemplateColumns.split(" ").length')
  mobile_ratio=await mobile.locator('.platform-card').first.evaluate('(el)=>el.getBoundingClientRect().width/el.getBoundingClientRect().height')
  assert mobile_cols==2, f'mobile layout should use two columns, got {mobile_cols}'
  assert 0.85<=mobile_ratio<=1.15, f'mobile cards should remain compact squares, ratio={mobile_ratio}'
  await mobile.screenshot(path='/mnt/data/AI_Auto_Continue_v092_Mobile_Preview.png',full_page=True)
  print('PASS: no global command bar; four square cards; card click switches platform; task A/B/C tiles; 4 card actions; settings grouped; legacy content preserved; card start/pause actions work; mobile 2-column layout.')
  print(f'Desktop card aspect ratio: {ratio:.3f}; mobile columns: {mobile_cols}; mobile ratio: {mobile_ratio:.3f}; page errors: {errors}')
  await browser.close()

if __name__=='__main__':asyncio.run(main())
