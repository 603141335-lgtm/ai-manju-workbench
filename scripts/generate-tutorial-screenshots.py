"""Produce 12 annotated REAL workbench UI screenshots with synthetic demo data.
The actual src/index.html, src/style.css, src/renderer.js are rendered.
No Doubao credentials, browser cookies or user files are used.
"""
import sys
if hasattr(sys.stdout,'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from io import BytesIO
import re
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
text=(ROOT/'src/tutorial-content.js').read_text(encoding='utf-8')
steps=re.findall(r"\['(\d{2})','([^']+)','([^']+)','(#[A-Za-z0-9_-]+)'\]",text)
assert len(steps)==12,f'Expected exactly twelve steps, got {len(steps)}'
# Reuse the established v0.9.4 demo account and episode fixtures.
legacy=(ROOT/'tests/ui_v094_browser.py').read_text(encoding='utf-8')
prefix=legacy[:legacy.index('with sync_playwright()')]
ns={'__file__':str(ROOT/'tests/ui_v094_browser.py')}
exec(compile(prefix,str(ROOT/'tests/ui_v094_browser.py'),'exec'),ns)
mock=ns['mock']
html=(ROOT/'src/index.html').read_text(encoding='utf-8')
html=re.sub(r'<meta[^>]+Content-Security-Policy[^>]*>','',html)
html=re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*></script>','',html)
html=html.replace('<link rel="stylesheet" href="./style.css"/>','')
out=ROOT/'assets'/'tutorial';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--disable-dev-shm-usage','--no-sandbox'])
 page=browser.new_page(viewport={'width':1650,'height':970},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content(html)
 page.add_style_tag(content=(ROOT/'src/style.css').read_text(encoding='utf-8'))
 page.evaluate(mock)
 page.evaluate("""() => {
  const b=window.bridge;
  window.BUNDLED_COMMUNITY_QR='';
  Object.assign(b,{
    listBackgroundTasks:async()=>[{accountId:'a1',state:'waiting-focus',message:'图片已上传，等待切回账号一验证蓝色@',at:Date.now(),active:true},{accountId:'a2',state:'running',message:'正在上传参考图 3 / 6',at:Date.now(),active:true}],
    cancelBackgroundTask:async()=>true,confirmBackgroundTask:async()=>true,
    getNotice:async()=>({currentVersion:'1.1.0',source:'offline',community:{wechat:'du4du44',backupWechat:'du6du66',enabled:false,startup:false,benefits:[],qrActive:false},notice:{},release:{},tutorial:{version:'1',slides:[]}}),
    getNoticePreferences:async()=>({startupEnabled:false}),
    onNoticeUpdated:()=>{},refreshNotice:async()=>({}),openNoticeLink:async()=>false,
    getTutorialImage:async()=>({dataUrl:''}),
    videoEnsure:async()=>({ready:true,message:'演示模式'}),
    videoManualConfirm:async()=>({ready:true,message:'演示模式'}),
    onVideoStatus:()=>{},onImportStatus:()=>{},onMentionStatus:()=>{},onTailUpdated:()=>{},
    onUpdateStatus:()=>{},onTaskUpdated:()=>{},cleanupMemory:async()=>({liveViews:2}),
    voiceList:async()=>({bindings:{}}),
    tailStatus:async()=>({state:'none',message:'演示无尾帧'}),
    importDraft:async(e,s,prompt)=>({previewText:prompt,items:[],voicePlan:{items:[]},blocked:false}),
    perfGet:async()=>({liveViews:2,memoryMb:900,mode:'balanced',limit:3})
  });
 }""")
 page.add_script_tag(content=(ROOT/'src/renderer.js').read_text(encoding='utf-8'))
 page.wait_for_timeout(1150)
 if not page.locator('#topCenter').inner_text().strip() or '正在读取' in page.locator('#topCenter').inner_text():
  raise RuntimeError('Real workbench renderer failed in offline tutorial screenshot fixture: '+repr(errors[:5]))
 # Fixed on-image watermark, pixel-baked by screenshot. No overlay-only tricks.
 page.evaluate("""() => {
   const w=document.createElement('div');w.id='tutorial-baked-watermark';
   Object.assign(w.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'99999',padding:'10px 15px',background:'rgba(9,23,44,.89)',border:'1px solid rgba(150,208,240,.65)',borderRadius:'9px',color:'#fff',fontFamily:'Microsoft YaHei,sans-serif',fontSize:'15px',lineHeight:'1.55',pointerEvents:'none'});
   w.innerText='独独AI，让制作变得简单。\\n更多AI软件跟技巧 请添加：du4du44\\n备用号：du6du66';
   document.body.append(w);
 }""")
 for i,(id,title,description,selector) in enumerate(steps,1):
  target=page.locator(selector).first
  if not target.count():
   raise RuntimeError(f'Guide target missing: {id} {selector}')
  try:target.scroll_into_view_if_needed(timeout=1000)
  except Exception:pass
  page.evaluate("""(args) => {
    let root=document.getElementById('guide-annotation');
    if(root)root.remove();
    const el=document.querySelector(args.selector);
    if(!el)return;
    const b=el.getBoundingClientRect();
    root=document.createElement('div');root.id='guide-annotation';
    Object.assign(root.style,{position:'fixed',left:Math.max(3,b.x-7)+'px',top:Math.max(3,b.y-7)+'px',width:Math.max(40,b.width+14)+'px',height:Math.max(38,b.height+14)+'px',border:'5px solid #ff4c43',borderRadius:'13px',boxShadow:'0 0 0 3px #fff8,0 0 28px #ff554477',zIndex:'99998',pointerEvents:'none'});
    const label=document.createElement('div');label.textContent='第 '+args.n+' 步 · '+args.title;
    Object.assign(label.style,{position:'absolute',left:'-4px',bottom:'calc(100% + 10px)',whiteSpace:'nowrap',padding:'7px 13px',fontWeight:'800',fontSize:'18px',color:'#fff',background:'#e12d30',borderRadius:'9px',boxShadow:'0 3px 15px #0005'});
    root.append(label);document.body.append(root);
  }""",{'selector':selector,'n':i,'title':title})
  page.wait_for_timeout(80)
  screenshot=page.screenshot(type='png',full_page=False)
  bitmap=Image.open(BytesIO(screenshot)).convert('RGB')
  bitmap.thumbnail((1440,880))
  filepath=out/('step-'+id+'.webp')
  bitmap.save(filepath,'WEBP',quality=80,method=4)
  if filepath.stat().st_size>2*1024*1024:raise RuntimeError(f'Tutorial {id} screenshot too large')
  print(f'Tutorial {id}: {title} | {filepath.stat().st_size:,} bytes')
 browser.close()
print('PASS: 12 screenshots of actual workbench UI with demo data, real element highlight and baked footer watermark')
