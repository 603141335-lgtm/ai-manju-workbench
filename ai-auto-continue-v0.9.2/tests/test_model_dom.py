"""Synthetic model-menu DOM scanner regression test; account entitlements still need real-site QA."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.joinpath('runner.js').read_text(encoding='utf-8').replace('const host = location.hostname;',"const host = 'gemini.google.com';")
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1100,'height':820})
  await page.set_content('''<style>button{padding:12px}#model-list{display:none;border:1px solid gray;width:300px;}#model-list.show{display:block}</style>
    <header><button data-test-id="model-switcher" id="choose">Gemini Flash</button></header>
    <div id="model-list" role="menu"><button role="menuitemradio" data-model="Gemini Flash">Gemini Flash</button><button role="menuitemradio" data-model="Gemini Pro">Gemini Pro</button><button role="menuitem">升级会员</button><button role="menuitemradio" disabled>Gemini Experimental</button></div>
    <div contenteditable="true" role="textbox">请输入消息</div>
    <script>const button=document.querySelector('#choose');button.onclick=()=>document.querySelector('#model-list').classList.toggle('show');
     for(const m of document.querySelectorAll('[data-model]'))m.onclick=()=>{button.textContent=m.dataset.model;document.querySelector('#model-list').classList.remove('show')};
    </script>''')
  await page.evaluate('''window.chrome={storage:{local:{get:async()=>({})},onChanged:{addListener:()=>{}}},runtime:{sendMessage:async()=>({tabId:11,instanceId:'gemini-A'}),onMessage:{addListener:f=>window.__receive=f}}};''')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.add_script_tag(content=SOURCE)
  await page.wait_for_function("typeof window.__receive==='function'")
  await page.wait_for_timeout(100)
  result=await page.evaluate('''new Promise(resolve=>window.__receive({type:'AAC9_MODEL_PROBE',instanceId:'gemini-A',inspectOptions:true},null,resolve))''')
  assert result['ok'],result
  opts=result['options'];labels=[o['label'] for o in opts]
  assert 'Gemini Flash' in labels and 'Gemini Pro' in labels,labels
  assert all('升级' not in x for x in labels),labels
  assert next(x for x in opts if x['label']=='Gemini Experimental')['disabled'] is True
  apply=await page.evaluate('''new Promise(resolve=>window.__receive({type:'AAC9_MODEL_APPLY',instanceId:'gemini-A',model:'Gemini Pro',mode:'auto'},null,resolve))''')
  assert apply.get('ok'),apply
  current=await page.locator('#choose').inner_text()
  assert current=='Gemini Pro',current
  rejected=await page.evaluate('''new Promise(resolve=>window.__receive({type:'AAC9_MODEL_APPLY',instanceId:'gemini-B',model:'Gemini Flash'},null,resolve))''')
  assert rejected.get('ok') is False,rejected
  assert not errors,errors
  print('PASS: live DOM model menu scan, disabled/purchase exclusion, verified model switch, wrong-instance command rejected')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
