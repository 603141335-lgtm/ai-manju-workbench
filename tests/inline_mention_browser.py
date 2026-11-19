"""Offline Chromium DOM test for locating image mentions in the top reference block.
This is not a Doubao network/login test and never counts as site compatibility.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
fn=json.loads(Path(__file__).with_name('inline_functions.json').read_text())
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1250,'height':750})
    page.set_content('''<style>.guidance-input-content{width:840px}.tiptap{width:800px;min-height:310px;border:1px solid #aaa}</style>
<div class="guidance-input-content"><div class="tiptap ProseMirror" contenteditable="true">
<p>【蓝色参考图引用区】</p><p>A01</p><p>A01-01</p><p>A15</p><p>B02</p><p>【原始提示词】</p>
<p>需要参考图：A01、A01-01、A15、B02</p><p>连续性参考：不修改原文。</p>
</div></div>''')
    for n,(code,file) in enumerate([('A01','A01.png'),('A01-01','A01-01.png'),('A15','A15.png'),('B02','B02.png')],1):
        a=f'图{n} = {code}（{file}）'
        args={'anchor':code,'code':code,'filename':file,'index':n,'scope':'top-reference'}
        result=page.evaluate('('+fn['focusReferenceSlot']+')',args)
        assert result['ok'],(code,result)
        # Real keyboard editing occurs at the selected caret, not at end.
        page.keyboard.type(' @')
        snap=page.locator('.tiptap p').all_text_contents()
        assert snap[n].endswith(' @'),(code,snap)
        assert not snap[-1].endswith(' @')
        # Simulate website replacing the typed @ with a semantic rich mention.
        page.evaluate('''({index,file})=>{
           const p=document.querySelectorAll('.tiptap p')[index];
           const text=p.textContent;if(!text.endsWith(' @'))throw Error('Cursor wrong');
           p.lastChild.textContent=text.slice(0,-2)+' ';
           const chip=document.createElement('span');chip.className='mention';chip.setAttribute('data-mention','true');chip.contentEditable='false';chip.style.color='blue';chip.textContent='@'+file;
           p.appendChild(chip)
        }''',{'index':n,'file':file})
        check=page.evaluate('('+fn['inspectInlineReference']+')',args)
        assert check['verified'],(code,check)
    # Verify every rich tag is in the top reference block, not in the original prompt.
    for i,c in enumerate(['A01','A01-01','A15','B02'],1):
        assert page.locator('.tiptap p').nth(i).locator('[data-mention]').count()==1
    assert page.locator('.tiptap p').last.locator('[data-mention]').count()==0
    missing=page.evaluate('('+fn['focusReferenceSlot']+')',{'anchor':'图1 = A99（A99.png）'})
    assert not missing['ok']
    # Insert a dangling @ in a new reference and ensure rollback removes only that input.
    page.evaluate('''()=>{const p=document.createElement('p');p.textContent='E11';const marker=[...document.querySelectorAll('.tiptap p')].find(x=>x.textContent==='【原始提示词】');marker.before(p)}''')
    args={'anchor':'E11','code':'E11','filename':'E11.png','scope':'top-reference'}
    assert page.evaluate('('+fn['focusReferenceSlot']+')',args)['ok']
    page.keyboard.type(' @')
    assert page.evaluate('('+fn['clearPendingInlineAt']+')',args)
    assert page.locator('.tiptap p').nth(5).inner_text()=='E11'
    print('PASS Chromium: 4 top-block rich mentions, A01/A01-01 independent, no mentions in original prompt, failed @ rollback')
    browser.close()
