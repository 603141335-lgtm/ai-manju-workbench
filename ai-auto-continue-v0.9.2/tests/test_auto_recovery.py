"""Browser-simulated recovery: no manual confirmation and no duplicate submit."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'runner.js').read_text().replace('const host = location.hostname;',"const host = 'chatgpt.com';")

async def scenario(browser,has_user):
 page=await browser.new_page()
 prompt='这条任务指令已经发出'
 cfg={'platform':'chatgpt','projectName':'恢复测试','mode':'episodes','firstPrompt':prompt,'nextPrompt':'继续', 'total':1,'rounds':[], 'chatMode':'same', 'autoDownload':False,'modelLock':False, 'modelChoice':'auto','workMode':'auto','images':{'first':[],'next':[],'rounds':[]},'quietSeconds':5,'timeoutMinutes':1,'selectors':{'editor':'','send':'','reply':''}}
 iid='chatgpt-A';rid='recover-1';key=lambda x:f'aac9:instance:{iid}:{x}'
 run={'id':rid,'instanceId':iid,'platform':'chatgpt','tabId':101,'nextEpisode':1,'status':'error','phase':'submitting','prompt':prompt,'baseline':{'count':0,'text':''},'userBefore':{'count':0,'text':''},'sentAt':1}
 state={key('cfg'):cfg,key('run'):run,key('control'):{'runId':rid,'desired':'paused'},key('results'):{},key('logs'):[]}
 await page.set_content('''<main id="conversation"></main><div class="composer"><div id="prompt-textarea" contenteditable="true" role="textbox"></div><button id="composer-submit-button" aria-label="Send message">发送</button></div><script>
 window.sent=0;document.querySelector('#composer-submit-button').onclick=()=>window.sent++;
 </script>''')
 if has_user:
  await page.evaluate('''prompt=>{
    const user=document.createElement('div');user.setAttribute('data-message-author-role','user');user.innerText=prompt;
    const assistant=document.createElement('article');assistant.dataset.testid='conversation-turn-1';
    const wrap=document.createElement('div');wrap.setAttribute('data-message-author-role','assistant');
    const md=document.createElement('div');md.className='markdown';md.innerText='已经完整完成这一轮。正文内容已写入，包含人物行为和必要台词。';
    const copy=document.createElement('button');copy.dataset.testid='copy-turn-action-button';copy.innerText='复制';
    wrap.append(md,copy);assistant.append(wrap);document.querySelector('#conversation').append(user,assistant);
  }''',prompt)
 script='''(()=>{const db=window.__db=SEED;const listeners=[];window.chrome={storage:{local:{get:async ks=>{let o={};for(let k of (typeof ks==='string'?[ks]:ks))if(k in db)o[k]=structuredClone(db[k]);return o;},set:async o=>{let change={};for(let [k,v] of Object.entries(o)){change[k]={oldValue:db[k],newValue:structuredClone(v)};db[k]=structuredClone(v)}queueMicrotask(()=>listeners.forEach(f=>f(change,'local')));}},onChanged:{addListener:f=>listeners.push(f)}},runtime:{sendMessage:async()=>({tabId:101,instanceId:'chatgpt-A'}),onMessage:{addListener:fn=>window.__receiver=fn}}};})();'''.replace('SEED',json.dumps(state,ensure_ascii=False))
 await page.evaluate(script)
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 await page.add_script_tag(content=source)
 await page.wait_for_function('typeof window.__receiver === "function"')
 result=await page.evaluate('''()=>new Promise(resolve=>window.__receiver({type:'AAC9_RECOVER',instanceId:'chatgpt-A'},{},resolve))''')
 assert result['ok']==has_user,result
 if has_user:
  await page.wait_for_function("__db['aac9:instance:chatgpt-A:run'].status==='finished'",timeout=23000)
  assert (await page.evaluate("__db['aac9:instance:chatgpt-A:results']['1'].content")).startswith('已经完整完成')
 else:
  assert (await page.evaluate("__db['aac9:instance:chatgpt-A:run'].status"))=='error'
 assert await page.evaluate('window.sent')==0, 'Recovery unexpectedly resent a message'
 assert not errors,errors
 await page.close()

async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  await asyncio.gather(scenario(b,True),scenario(b,False))
  await b.close()
 print('PASS: automatically recover confirmed delivery and save, refuse ambiguous delivery, never resend')
if __name__=='__main__':asyncio.run(main())
