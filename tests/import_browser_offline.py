"""Optional OFFLINE Chromium integration test (pip install playwright + local Chrome/Chromium).
No private user credentials, no calls to Doubao, no uploads to the internet.
Usage: CHROMIUM_BIN=/usr/bin/chromium python tests/import_browser_offline.py
"""
import base64, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
functions=json.loads(subprocess.check_output(['node','-e',"const p=require('./src/import-page');console.log(JSON.stringify(Object.fromEntries(['probe','selectImageFile','selectImageBatch','setPrompt'].map(k=>[k,p[k].toString()]))));"],cwd=root,text=True))
html='''<!doctype html><html><head><meta charset="UTF-8"/><style>.guidance-input-content{width:800px;height:390px}.tiptap{min-height:200px;white-space:pre-wrap}.attachment{display:inline-block;padding:6px;margin:5px}</style></head><body><div class="guidance-input-content"><div id="attachments"></div><div class="tiptap ProseMirror" contenteditable="true"></div></div><input type="file" id="upl" accept="image/png,image/jpeg,image/webp" multiple hidden><script>document.querySelector('#upl').addEventListener('change',e=>{for(const f of e.target.files){let div=document.createElement('span');div.className='attachment';div.title=f.name;div.textContent=f.name;document.querySelector('#attachments').append(div)}});</script></body></html>'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.getenv('CHROMIUM_BIN','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1366,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 names=['A15','A32','AG14','B13','C36','E11']
 files=[{'name':n+'.png','mime':'image/png','base64':base64.b64encode(b'valid-test-data-png-bytes').decode('ascii')} for n in names]
 res=page.evaluate('('+functions['selectImageBatch']+')('+json.dumps({'files':files})+')')
 assert res['ok'] and res['selectedCount']==6,res
 snap=page.evaluate('('+functions['probe']+')()')
 assert snap['names']==[n+'.png' for n in names],snap
 prompt='需要参考图：'+ '、'.join(names)+'\n0—3秒｜保留所有台词动作与时间\n'
 mapped='需要参考图：'+ '、'.join(names)+'\n【图片顺序对应｜实际上传顺序】\n'+'\n'.join(f'图{i+1} = {n}（{n}.png）' for i,n in enumerate(names))+'\n0—3秒｜保留所有台词动作与时间\n' 
 res=page.evaluate('('+functions['setPrompt']+')('+json.dumps({'text':mapped,'replace':True},ensure_ascii=False)+')')
 assert res['ok'],res
 assert page.evaluate('('+functions['probe']+')()')['prompt']==mapped
 assert page.locator('#attachments .attachment').all_inner_texts()==[n+'.png' for n in names]
 assert not errors,errors
 browser.close();print('PASS: single six-image batch File/DataTransfer/change upload + exact full text & mapping (OFFLINE MOCK ONLY)')
