"""Synthetic content-script tests. Not a test of logged-in ChatGPT/Gemini/DeepSeek DOM."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
source=ROOT.joinpath('runner.js').read_text(encoding='utf-8')
source=source.replace('const host = location.hostname;', "const host = 'chatgpt.com';")

async def one_job(browser,name,tid):
 page=await browser.new_page()
 cfg={'platform':'chatgpt','projectName':name,'mode':'episodes','firstPrompt':f'{name} 第一集','nextPrompt':'继续 {集数}','total':1,'rounds':[],
      'chatMode':'same','includePrevious':True,'autoDownload':False,'modelChoice':'auto','workMode':'auto','modelLock':False,
      'images':{'first':[],'next':[],'rounds':[]},'quietSeconds':5,'timeoutMinutes':1,'selectors':{'editor':'','send':'','reply':''}}
 iid='chatgpt-'+name;rid='run-'+name;key=lambda t:'aac9:instance:'+iid+':'+t
 run={'id':rid,'instanceId':iid,'platform':'chatgpt','tabId':tid,'nextEpisode':1,'status':'running','phase':'ready','updatedAt':0}
 seed={key('cfg'):cfg,key('run'):run,key('control'):{'runId':rid,'desired':'running'},key('results'):{},key('logs'):[]}
 await page.set_content('''<html><body><main id="conversation"></main><div class="composer"><div id="prompt-textarea" contenteditable="true" role="textbox"></div><button id="composer-submit-button" aria-label="Send message">发送</button></div><script>
 window.recordedPrompts=[];
 document.querySelector('#composer-submit-button').onclick=()=>{
 const editor=document.querySelector('#prompt-textarea'),value=editor.innerText.trim();if(!value)return;
 window.recordedPrompts.push(value);editor.textContent='';
 const u=document.createElement('div');u.className='user';u.innerText=value;document.querySelector('#conversation').append(u);
 const stop=document.createElement('button');stop.setAttribute('data-testid','stop-button');stop.textContent='停止';document.querySelector('.composer').append(stop);
 setTimeout(()=>{
  stop.remove();const article=document.createElement('article');article.dataset.testid='conversation-turn-1';
  const wrap=document.createElement('div');wrap.setAttribute('data-message-author-role','assistant');
  const md=document.createElement('div');md.className='markdown';md.innerText='完成'+value+'。这是一篇完整的小说正文，包含人物动作与必要台词。';
  const copy=document.createElement('button');copy.setAttribute('data-testid','copy-turn-action-button');copy.textContent='复制';
  wrap.append(md,copy);article.append(wrap);document.querySelector('#conversation').append(article);
 },700);
 };
 </script></body></html>''')
 __imported_json__=__import__('json').dumps(seed,ensure_ascii=False)
 script=f'''
 (()=>{{
 const seed={__imported_json__}; const db=window.__testDB=seed, listeners=[];
 window.chrome={{
 storage:{{local:{{get:async keys=>{{const z={{}};for(const k of (typeof keys==='string'?[keys]:keys))if(Object.hasOwn(db,k))z[k]=structuredClone(db[k]);return z;}},set:async obj=>{{const changes={{}};for(const[k,v] of Object.entries(obj)){{changes[k]={{oldValue:db[k],newValue:structuredClone(v)}};db[k]=structuredClone(v)}}queueMicrotask(()=>listeners.forEach(f=>f(changes,'local')));}}}},onChanged:{{addListener:f=>listeners.push(f)}}}},
 runtime:{{sendMessage:async msg=>{{if(msg.type==='AAC9_HELLO')return {{tabId:{tid},instanceId:'{iid}'}};return {{ok:true}};}},onMessage:{{addListener:fn=>{{window.__extensionReceiver=fn;}}}}}}
 }};
 }})();
 '''.replace('__imported_json__',__import__('json').dumps(seed,ensure_ascii=False))
 await page.evaluate(script)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 await page.add_script_tag(content=source)
 await page.wait_for_function("Object.values(window.__testDB).some(v=>v&&v.status==='finished')",timeout=27000)
 output=await page.evaluate('({prompts:recordedPrompts,run:__testDB["'+key('run')+'"],results:__testDB["'+key('results')+'"],allKeys:Object.keys(__testDB)})')
 assert len(output['prompts'])==1,output
 assert output['prompts'][0].startswith(name),output
 assert output['run']['status']=='finished',output
 assert output['results']['1']['content'].startswith('完成'),output
 assert not any(k.startswith('aac7:') for k in output['allKeys']),output
 assert not errors,errors
 await page.close();return output

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  a,b=await asyncio.gather(one_job(browser,'A',101),one_job(browser,'B',102))
  assert a['prompts'][0]!=b['prompts'][0]
  print('PASS: same-site A/B simultaneous synthetic generation, independent run IDs, separate result keys, correct completion/save')
  await browser.close()
if __name__=='__main__':asyncio.run(main())
