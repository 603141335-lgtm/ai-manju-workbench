/* AI自动续聊助手 v0.9.2: quiet auto-continue; unconfirmed submissions are never blindly retried. */
(() => {
  'use strict';
  if (window.__AAC9_LOADED__) return;
  window.__AAC9_LOADED__ = true;

  let tabId = null;
  let instanceId = null;
  let working = false;
  let heartbeat = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getAll = async () => {if(!keys||!instanceId)return {cfg:null,run:null,control:null,results:{},logs:[]};const d=await chrome.storage.local.get(Object.values(keys));return {cfg:d[keys.cfg],run:d[keys.run],control:d[keys.control],results:d[keys.results]||{},logs:d[keys.logs]||[]};};
  const pick = (obj, prop, fallback) => obj?.[prop] === undefined ? fallback : obj[prop];

  function isNewChatLanding() {
    const p=location.pathname.replace(/\/$/,'')||'/';
    switch(platformOfUrl()) {
      case 'chatgpt': return p==='/';
      case 'gemini': return p==='/app';
      case 'doubao': return p==='/chat';
      case 'deepseek': return p==='/';
      default: return false;
    }
  }
  const platformOfUrl = () => {
    const host = location.hostname;
    if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
    if (host === 'gemini.google.com') return 'gemini';
    if (host === 'doubao.com' || host === 'www.doubao.com') return 'doubao';
    if (host === 'chat.deepseek.com') return 'deepseek';
    return '';
  };

  const own = platformOfUrl();
  let keys = null;
  const boundKeys=id=>({cfg:`aac9:instance:${id}:cfg`,run:`aac9:instance:${id}:run`,control:`aac9:instance:${id}:control`,results:`aac9:instance:${id}:results`,logs:`aac9:instance:${id}:logs`});

  const preset = {
    chatgpt: {
      editor: ['#prompt-textarea[contenteditable="true"]', 'div.ProseMirror[contenteditable="true"][data-composer-markdown]', '#prompt-textarea', '[data-testid="chat-input"] [contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', 'textarea[name="prompt-textarea"]', 'textarea[placeholder]'],
      send: ['#composer-submit-button', 'form button[data-composer-submit]', 'button[data-testid="send-button"]', 'form button[type="submit"]', 'button[aria-label="Send prompt"]', 'button[aria-label="发送"]', 'button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
      reply: ['[data-message-author-role="assistant"]', '[data-turn-key$=":assistant"]', '[data-markdown-text-style="assistant-message"]'],
      stop: ['button[data-testid="stop-button"]','[data-testid*="stop-button"]','button[aria-label*="Stop" i]','button[aria-label*="停止"]','button[aria-label*="中止"]','button[title*="Stop" i]','button[title*="停止"]','[data-testid*="composer-stop"]']
    },
    gemini: {
      editor: ['rich-textarea .ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', '.ql-editor[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', '[contenteditable="true"][aria-label*="prompt" i]'],
      // Gemini 2026 使用 gem-icon-button 自定义元素；旧版仅匹配 button，会导致“填入但无法发送”。
      send: ['gem-icon-button.send-button button', 'gem-icon-button.send-button', 'gem-icon-button[aria-label*="Send" i]', 'gem-icon-button[arialabel*="Send" i]', '[data-test-id="send-button-container"] gem-icon-button', '[data-test-id="send-button-container"] button', 'button.send-button', '[data-test-id="send-button-container"] [role="button"]', '[aria-label*="send message" i][role="button"]', 'button[aria-label*="Send message" i]', 'button[aria-label*="发送消息"]', 'button[aria-label*="发送"]', '.send-button-container button', '.send-button button'],
      reply: ['model-response', 'message-content', '[data-test-id="model-response"]', '.model-response-text', '.response-container'],
      stop: ['button[aria-label*="Stop" i]', 'gem-icon-button[aria-label*="Stop" i]', 'button[aria-label*="停止"]', '.stop-button']
    },
    deepseek: {
      editor: ['textarea#chat-input','textarea[placeholder*="DeepSeek" i]','textarea[placeholder*="发送"]','textarea[placeholder*="消息"]','textarea','[contenteditable="true"][role="textbox"]'],
      send: ['button[aria-label="Send message"]','button[aria-label*="发送"]','button[title*="发送"]','button[title*="Send" i]','button[data-testid="send-button"]','button[data-testid*="submit" i]','button[type="submit"]','[role="button"][aria-label*="send" i]','[role="button"][title*="send" i]'],
      reply: ['[data-message-author-role="assistant"]','.ds-markdown','[class*="AssistantMessage"]','[class*="markdown-body"]'],
      stop: ['button[aria-label*="stop" i]','button[aria-label*="停止"]','[aria-label*="Stop generation" i]']
    },
    doubao: {
      editor: ['textarea[data-testid="chat_input_input"]','[data-testid="chat_input"] textarea','.tiptap.ProseMirror[contenteditable="true"]','div.yc-editor[contenteditable="true"]','[contenteditable="true"][data-placeholder]', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]', 'textarea[placeholder]'],
      send: ['#sendBtn','button[data-testid="sendBtn"]','button[data-testid*="send" i]','button[class*="send" i]', '[class*="send-btn"]', 'button[aria-label*="发送"]','button[title*="发送"]','button[aria-label*="send" i]','button.bg-dbx-text-highlight'],
      reply: ['[data-role="assistant"]', '[data-message-role="assistant"]', '[class*="assistant-message"]', '[class*="assistantMessage"]', '[class*="message_content"]'],
      stop: ['button[aria-label*="停止"]', '[class*="stop-generation"]', '[class*="stopGeneration"]']
    }
  };

  function modelTrigger(){
    const p=platformOfUrl();
    const selectors={
      chatgpt:['[data-testid="model-switcher-dropdown-button"]','button[data-testid*="model-switcher"]','button[aria-label*="model" i]'],
      gemini:['[data-test-id="model-switcher"]','button[aria-label*="model" i]','.model-selector button','[data-test-id*="model" i] button'],
      doubao:['[data-testid*="model-select"]','button[aria-label*="模型"]'],
      deepseek:['[data-testid*="model"]','button[aria-label*="模型"]']
    };
    const found=firstVisible(selectors[p]||[]);
    if(found) return found;
    if(p==='gemini'){
      // 2026 Gemini header displays e.g. 'Gemini Flash ▾' without a model test id.
      const candidates=safeSelector('button,[role="button"],gem-icon-button').filter(isVisible)
        .filter(el=>/^Gemini\s+(Flash|Pro|Thinking|Advanced|Ultra|Argon)\b/i.test(String(el.innerText||el.getAttribute('aria-label')||'').trim()))
        .filter(el=>el.getBoundingClientRect().top<360);
      return candidates[0]||null;
    }
    return null;
  }
  function detectedGeminiMode(){
    const candidates=safeSelector('button,[role="tab"],[role="radio"]').filter(isVisible)
      .filter(el=>/^(对话|任务|Chat|Task)$/i.test(String(el.innerText||el.getAttribute('aria-label')||'').trim()));
    const active=candidates.find(el=>el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true'||el.getAttribute('data-state')==='active'||/(^|\s)(selected|active|checked)(\s|$)/i.test(el.className||''));
    if(active) return String(active.innerText||active.getAttribute('aria-label')||'').trim();
    // The active Gemini tab is often rendered with a white pill background;
    // no reliable DOM state means unknown instead of claiming a mode.
    const painted=candidates.filter(el=>{
      const color=getComputedStyle(el).backgroundColor;
      return color==='rgb(255, 255, 255)'||color==='rgba(255, 255, 255, 1)';
    });
    return painted.length===1?String(painted[0].innerText||painted[0].getAttribute('aria-label')||'').trim():'';
  }
  function modelProbe(){
    const platform=platformOfUrl(),button=modelTrigger();
    const currentModel=button ? String(button.innerText||button.getAttribute('aria-label')||'').trim().slice(0,80) : '';
    const composer=editorOf({})?.closest('form,[data-testid*="composer"],.composer');
    const toolbar=composer || document.querySelector('main,[role="main"]')||document;
    const buttons=[...toolbar.querySelectorAll('button,[role="switch"],[aria-pressed]')].filter(isVisible).slice(-70);
    const modes=buttons.map(b=>[b.getAttribute('aria-label'),b.innerText,b.getAttribute('title')].filter(Boolean).join(' ')).filter(x=>/深度思考|联网搜索|thinking|search|instant|medium|high|fast|expert|专家|快速/i.test(x));
    return {platform,currentModel,currentMode:platform==='gemini'?detectedGeminiMode():(modes.length?modes.slice(0,3).join(' / ').slice(0,120):''),options:[],hasPicker:!!button};
  }
  const normalizedLabel=text=>String(text||'').trim().replace(/\s+/g,' ').toLowerCase();
  function modelOptionNodes(){
    // Inspect only visible controls in the newly opened model menu, never scrape arbitrary page buttons.
    const roots=safeSelector('[role="listbox"],[role="menu"],[data-testid*="model-menu" i],[data-testid*="model-picker" i],.mat-mdc-menu-panel,[data-radix-popper-content-wrapper]')
      .filter(isVisible);
    const ignore=/^(更多|设置|帮助|反馈|升级|取消|关闭|manage|upgrade|settings|help|learn more|more|close|cancel|create|new chat)$/i;
    let out=[];
    for(const root of roots){
      const controls=[...root.querySelectorAll('[role="option"],[role="menuitemradio"],[role="menuitem"],button,[data-testid*="model-option" i]')].filter(isVisible);
      for(const node of controls){
        const label=String(node.innerText||node.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ');
        if(!label||label.length>76||ignore.test(label)||/订阅|升级|upgrade|了解更多|试用|membership|登录|download|上传/i.test(label))continue;
        const disabled=node.disabled||node.hasAttribute('disabled')||node.getAttribute('aria-disabled')==='true';
        out.push({node,label,disabled});
      }
    }
    return [...new Map(out.map(v=>[normalizedLabel(v.label),v])).values()];
  }
  async function inspectModels(){
    const result=modelProbe(),trigger=modelTrigger();
    result.options=[];result.source='live-dom';
    if(!trigger){result.error='网页当前没有可识别的模型选择菜单';return result;}
    try{
      trigger.click();await sleep(550);
      const choices=modelOptionNodes();
      // Do not present the trigger label as an available account option by itself.
      result.options=choices.map(x=>({id:x.label,label:x.label,disabled:!!x.disabled})).slice(0,32);
      if(!result.options.length)result.error='未从网页模型菜单读取到选项，可在网页手动选择后重新扫描';
    }catch(e){result.error=String(e.message||e);}finally{
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      if(trigger.isConnected&&(trigger.getAttribute('aria-expanded')==='true'||modelOptionNodes().length>0))trigger.click();
    }
    return result;
  }
  async function modelApply(request){
    const desired=String(request.model||'auto').trim();const mode=String(request.mode||'auto').trim();
    let before=modelProbe();
    if(desired==='auto' && mode==='auto')return {ok:true,detail:'跟随网页当前设置，不自动切换模型。',...before};
    if(desired!=='auto' && !normalizedLabel(before.currentModel).includes(normalizedLabel(desired))){
      const trigger=modelTrigger();
      if(!trigger)return {ok:false,detail:'当前网页模型菜单无法自动识别，请先手动选择模型。',...before};
      try{
        trigger.click();await sleep(300);
        const matched=modelOptionNodes().filter(x=>!x.disabled&&normalizedLabel(x.label)===normalizedLabel(desired));
        if(matched.length!==1){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return {ok:false,detail:`找不到唯一的模型选项“${desired}”，请在AI网页手动切换。`,...before}}
        matched[0].node.click();await sleep(600);
      }catch(err){return {ok:false,detail:`网页拒绝自动切换：${String(err.message||err)}`,...before}}
    }
    const after=modelProbe();
    const modelOk=desired==='auto'||normalizedLabel(after.currentModel).includes(normalizedLabel(desired));
    const modeOk=mode==='auto'||normalizedLabel(after.currentMode).includes(normalizedLabel(mode));
    if(modelOk&&modeOk)return {ok:true,detail:`已从网页确认：模型 ${after.currentModel||'跟随网页'}；模式 ${after.currentMode||'跟随网页'}。`,...after};
    return {ok:false,detail:`尚未确认切换成功，当前模型 ${after.currentModel||'未知'}，模式 ${after.currentMode||'未知'}。请在AI网页手动选择后重新检测。不会误发。`,...after};
  }
  function safeSelector(s) {
    try { return [...document.querySelectorAll(s)]; }
    catch { return []; }
  }
  function isVisible(el) {
    if (!el?.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return !!el.getClientRects().length && !el.closest('[aria-hidden="true"]');
  }
  function firstVisible(selectors) {
    for (const s of selectors) {
      const elements = safeSelector(s).filter(isVisible);
      if (elements.length) return elements[elements.length - 1];
    }
    return null;
  }
  function allVisible(selectors) {
    for (const s of selectors) {
      const elements = safeSelector(s).filter(isVisible);
      if (elements.length) return elements;
    }
    return [];
  }
  function selectors(run, type) {
    const extra = String(run?.selectors?.[type] || '').trim();
    return extra ? [extra] : preset[platformOfUrl()]?.[type] || [];
  }
  function snapshot(run) {
    const nodes = allVisible(selectors(run, 'reply'));
    const texts = nodes.map(node => {
      // ChatGPT 的 markdown 节点比整个气泡更干净；其他平台保留气泡原文。
      const content = platformOfUrl() === 'chatgpt'
        ? (node.querySelector('.markdown') || node.querySelector('[class*="markdown"]') || node)
        : node;
      return String(content.innerText || content.textContent || '').trim();
    }).filter(Boolean);
    return {count:nodes.length, text:texts.at(-1) || ''};
  }
  function hasStop(run) {
    if (firstVisible(selectors(run, 'stop'))) return true;
    if (platformOfUrl() !== 'chatgpt') return false;
    // 新版ChatGPT可能把同一个composer按钮从发送箭头换成绿色停止方块。
    const composer=document.querySelector('#composer-submit-button');
    if(composer && isVisible(composer) && composer.querySelector('svg rect'))return true;
    // ChatGPT 的绿色方形停止键可能与发送键复用同一位置；检查实际可见语义与状态。
    for (const el of safeSelector('button,[role="button"]')) {
      if (!isVisible(el)) continue;
      const label = [el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid')].filter(Boolean).join(' ');
      if (/stop|cancel|停止|中止/i.test(label)) return true;
    }
    return false;
  }
  function busySignal(run) {
    if (hasStop(run)) return true;
    const platform = platformOfUrl();
    if (platform === 'chatgpt') {
      if (firstVisible(['.result-streaming','[data-is-streaming="true"]','[data-streaming="true"]','[data-testid="thinking-indicator"]','[data-testid*="streaming-indicator"]'])) return true;
      // 只检查当前回复区域，避免历史轮次的“思考了 X 秒”误判。
      const turn = latestAssistantTurn(run);
      if (turn && firstVisibleInside(turn,['[aria-busy="true"]','[data-state="loading"]','.streaming'])) return true;
      if (turn && /正在思考|正在搜索|Thinking\.\.\.|Generating\.\.\./i.test(turn.innerText||'')) return true;
    }
    if (platform === 'gemini' && firstVisible(['model-response[aria-busy="true"]','[data-test-id="stop-button"]','.loading-indicator'])) return true;
    return false;
  }
  function firstVisibleInside(root, sels) {
    for (const sel of sels) { try { const node=[...root.querySelectorAll(sel)].find(isVisible); if(node) return node; } catch {} }
    return null;
  }
  function latestAssistantTurn(run) {
    const nodes = allVisible(selectors(run,'reply'));
    const node = nodes.at(-1);
    return node?.closest('article,[data-testid^="conversation-turn"],[data-message-author-role="assistant"],model-response') || node || null;
  }
  function completionSignal(run) {
    const turn=latestAssistantTurn(run);
    if(!turn) return false;
    // ChatGPT 的最后一条 assistant 消息出现 Copy 操作是较强的结束信号；
    // 必须属于这条消息，不能误读上一条的操作按钮。
    const scope=turn.closest('article,[data-testid^="conversation-turn"]')||turn;
    // ChatGPT 会将操作按钮隐藏至鼠标悬停，不能单看 opacity:0。
    for(const selector of ['[data-testid="copy-turn-action-button"]','button[data-testid*="copy-turn"]','button[aria-label="Copy"]','button[aria-label="复制"]','[data-testid="copy-message-button"]']){
      try {for(const el of scope.querySelectorAll(selector)){
        if(el.isConnected && el.getClientRects().length && !el.closest('[aria-hidden="true"]'))return true;
      }} catch {}
    }
    return false;
  }
  function editorOf(run) { return platformOfUrl()==='deepseek' && !run?.selectors?.editor ? deepseekEditor(run) : firstVisible(selectors(run,'editor')); }
  function editorValue(el) { return !el ? '' : (el.matches('textarea,input') ? el.value : (el.innerText || el.textContent || '')); }
  function isSendEnabled(el) {
    if (!el || !isVisible(el)) return false;
    const host = el.closest?.('gem-icon-button');
    const actual = el.matches?.('button') ? el : el.querySelector?.('button');
    const targets = [el,host,actual].filter(Boolean);
    for (const node of targets) {
      if (node.disabled === true || node.hasAttribute?.('disabled') || node.getAttribute?.('aria-disabled') === 'true') return false;
      if (getComputedStyle(node).pointerEvents === 'none') return false;
    }
    const attrs = targets.map(x => [x.getAttribute('aria-label'),x.getAttribute('title'),x.getAttribute('class')].filter(Boolean).join(' ')).join(' ').toLowerCase();
    if (/stop|cancel|停止|中止/.test(attrs)) return false;
    return true;
  }
  function doubaoGeometricSender(run){
    if(platformOfUrl()!=='doubao' || run?.selectors?.send) return null;
    const ed=editorOf(run);
    if(!ed || !editorValue(ed).trim())return null;
    const er=ed.getBoundingClientRect();
    if(er.width<40||er.height<15)return null;
    const choices=safeSelector('button,[role="button"]').filter(isSendEnabled)
      .map(el=>{
        const rect=el.getBoundingClientRect();
        if(rect.width<12||rect.height<12||rect.width>220||rect.height>140)return null;
        const name=[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.getAttribute('id'),String(el.className||'')].filter(Boolean).join(' ').toLowerCase();
        if(/stop|cancel|停止|新建|新对话|麦克|语音|上传|附件|图片|视频|录音|截图|更多|search|搜索/.test(name))return null;
        const near=rect.left>=er.left+er.width*.42 && rect.left<=er.right+130 && Math.abs(rect.top+rect.height/2-(er.top+er.height/2))<Math.max(er.height/2+60,85);
        if(!near)return null;
        let score=0;
        if(/send|发送|提交|发消息/.test(name))score+=170;
        if(/bg-dbx-text-highlight/.test(name))score+=140;
        if(/arrow-up|arrowup|up-arrow/.test(name))score+=120;
        if(el.querySelector('svg'))score+=15;
        if(rect.left>=er.right-115)score+=40;
        return score>=155?{el,score}:null;
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
    // Never click a guessing-only icon; require an identifiable send clue.
    return choices.length && (choices.length===1||choices[0].score>choices[1].score+40)?choices[0].el:null;
  }
  function deepseekEditor(run){
    if(platformOfUrl()!=='deepseek')return null;
    const nodes=safeSelector('#chat-input,textarea,[contenteditable="true"][role="textbox"]').filter(isVisible);
    return nodes.find(n=>n.id==='chat-input') || nodes.find(n=>/DeepSeek|发送|消息/.test(n.getAttribute('placeholder')||'')) || nodes.filter(n=>n.getBoundingClientRect().top>innerHeight*.35).at(-1)||null;
  }
  function deepseekSender(run){
    if(platformOfUrl()!=='deepseek'||run?.selectors?.send)return null;
    const editor=deepseekEditor(run);
    if(!editor || !editorValue(editor).trim())return null;
    const er=editor.getBoundingClientRect();
    const ancestors=[];
    for(let a=editor.parentElement; a&&ancestors.length<6;a=a.parentElement){
      const rect=a.getBoundingClientRect();
      if(rect.width > er.width+20 && rect.width < Math.max(900,innerWidth*.9))ancestors.push(a);
    }
    const scope=ancestors.find(a=>a.querySelectorAll('button,[role="button"]').length>=1) || editor.parentElement;
    if(!scope)return null;
    const candidates=[...scope.querySelectorAll('button,[role="button"]')].filter(isSendEnabled).map(el=>{
      const rect=el.getBoundingClientRect();
      if(rect.width<12||rect.width>150||rect.height<12||rect.height>130)return null;
      if(rect.left<er.left+er.width*.43||rect.left>er.right+85)return null;
      if(Math.abs(rect.bottom-er.bottom)>160)return null;
      const metadata=[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.getAttribute('data-state'),el.getAttribute('id'),String(el.className||'')].filter(Boolean).join(' ').toLowerCase();
      if(/stop|cancel|停止|附件|attach|upload|file|搜索|search|联网|thinking|think|深度|麦克|mic|voice|录音|more|更多|plus|添加|new.chat|登录/.test(metadata))return null;
      const svg=el.querySelector('svg');
      const svgMeta=svg?[svg.getAttribute('data-lucide'),svg.getAttribute('class'),svg.getAttribute('aria-label'),svg.innerHTML].filter(Boolean).join(' ').toLowerCase():'';
      let score=0;
      if(/send|发送|submit|提交/.test(metadata))score+=220;
      if(/arrow.up|arrowup|upward|up.arrow|send|发送/.test(svgMeta))score+=150;
      const shape=svg?.querySelector('path,polyline,line');
      const path=shape?.getAttribute('d')||shape?.getAttribute('points')||'';
      // Only recognize an up-arrow by a strong semantic indicator or an SVG
      // geometry containing both shaft and arrow-head instructions.
      const arrowShape=/M\s*\d+[\s,]+(?:1[5-9]|2[0-4])[\s\S]{0,80}(?:V\s*[0-9]|v\s*-\d+)/i.test(path)
        && /(?:[lL]\s*-?\d+[\s,]+-?\d+){2}/.test(path);
      if(arrowShape)score+=95;
      if(score<90)return null;
      if(rect.left>=er.right-120)score+=25;
      return {el,score};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    // If multiple similar controls exist, stop rather than guessing.
    return candidates.length&&(candidates.length===1||candidates[0].score>candidates[1].score+55)?candidates[0].el:null;
  }
  function deepseekSemanticSender(run){
    const editor=deepseekEditor(run);
    if(!editor||!editorValue(editor).trim())return null;
    const er=editor.getBoundingClientRect();
    // Some DeepSeek versions render the action bar next to, not inside, the textarea ancestor.
    const candidates=safeSelector('button,[role="button"]').filter(isSendEnabled).map(el=>{
      const rect=el.getBoundingClientRect();
      if(rect.width<12||rect.height<12||rect.width>130||rect.height>110)return null;
      const distanceX=Math.abs((rect.left+rect.right)/2-er.right);
      const distanceY=Math.abs((rect.top+rect.bottom)/2-er.bottom);
      if(distanceX>165||distanceY>135||rect.left<er.left+er.width*.48)return null;
      const text=[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.getAttribute('id'),String(el.className||''),el.querySelector('svg')?.getAttribute('data-lucide'),el.querySelector('svg')?.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
      if(/stop|cancel|停止|录音|mic|voice|attachment|upload|file|图片|附件|联网|搜索|think|思考|new.chat|登录|历史/.test(text))return null;
      const attr=/(send|发送|submit|arrow.up|arrowup|向上|上箭头)/.test(text);
      const svg=!!el.querySelector('svg');
      const enabled=el.getAttribute('aria-disabled')!=='true'&&!el.disabled;
      if(!enabled)return null;
      return {el,score:(attr?220:0)+(svg?20:0)+(rect.left>er.right-130?60:0),hasSemantic:attr};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    if(!candidates.length)return null;
    // Don't click an unlabeled icon when other comparable controls exist.
    if(candidates[0].hasSemantic && (candidates.length===1||candidates[0].score>candidates[1].score+50))return candidates[0].el;
    if(candidates.length===1 && candidates[0].score>=80 && candidates[0].el.querySelector('svg'))return candidates[0].el;
    return null;
  }
  function deepseekSenderHints(run){
    const editor=deepseekEditor(run),button=deepseekSender(run)||deepseekSemanticSender(run);
    if(!editor)return {editorFresh:false,senderKind:'missing-editor'};
    return {editorFresh:!!editor.isConnected,senderKind:button?'confirmed':'not-identified',senderEnabled:!!button};
  }
  function senderOf(run) {
    // DeepSeek is restricted to the active composer. Generic page-wide submit
    // buttons may belong to login dialogs or unrelated panels.
    if(platformOfUrl()==='deepseek' && !run?.selectors?.send)return deepseekSender(run)||deepseekSemanticSender(run);
    for (const selector of selectors(run,'send')) {
      for (const el of safeSelector(selector)) {
        if (!isSendEnabled(el)) continue;
        // Angular custom element may only forward clicks from its inner native button.
        const inner = el.matches('button') ? el : el.querySelector?.('button');
        if (inner && isSendEnabled(inner)) return inner;
        if (!inner) return el;
      }
    }
    if (platformOfUrl() === 'gemini' && !run?.selectors?.send) {
      for (const icon of safeSelector('mat-icon[data-mat-icon-name="send"], mat-icon[fonticon="send"], mat-icon[data-mat-icon-name="send_spark"], mat-icon[data-mat-icon-name="arrow_upward"]')) {
        const host = icon.closest('gem-icon-button,button,[role="button"]');
        if (isSendEnabled(host)) return host.querySelector?.('button') || host;
      }
    }
    return deepseekSender(run) || doubaoGeometricSender(run);
  }
  function sendDiagnostics(run) {
    const editor=editorOf(run); const s=senderOf(run);
    return {platform:own,url:location.origin+location.pathname,hasEditor:!!editor,editorKind:editor?.tagName||'',hasSend:!!s,editorChars:editorValue(editor).trim().length,replyCount:snapshot(run).count,busy:busySignal(run),completed:completionSignal(run),model:modelProbe()};
  }
  function userMessageSnapshot(run){
    const platform=platformOfUrl();
    const patterns=platform==='deepseek'
      ? ['[data-message-author-role="user"]','[data-testid="user-message"]','.ds-user-message','[class*="user-message"]','[class*="UserMessage"]','[class*="ds-message"] [data-role="user"]']
      : platform==='gemini'
        ? ['user-query','[data-test-id="user-query"]','[data-testid="user-message"]','[data-message-author-role="user"]','.user-query','[class*="user-query"]']
        : platform==='chatgpt' ? ['[data-message-author-role="user"]','[data-testid="user-message"]']
        : ['[data-role="user"]','[data-message-role="user"]','[class*="user-message"]'];
    const nodes=allVisible(patterns).filter(n=>!n.closest('form,[data-testid*="composer"],rich-textarea'));
    const messages=nodes.map(el=>String(el.innerText||el.textContent||'').trim()).filter(Boolean);
    return {count:messages.length,text:messages.at(-1)||''};
  }
  function matchingUserMessage(run,before,prompt){
    const current=userMessageSnapshot(run);
    if(!current.count)return false;
    const norm=t=>String(t||'').replace(/\s+/g,'').replace(/[\u200b-\u200f]/g,'');
    const mark=norm(prompt).slice(0,Math.min(36,norm(prompt).length));
    if(!mark || !norm(current.text).includes(mark))return false;
    return current.count>before.count || current.text!==before.text;
  }
  function nudgeEditor(editor) {
    editor.focus();
    // Some frameworks only enable Send after a real editing transaction. A no-op
    // dispatch is never considered proof that the site accepted the text.
    editor.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:null}));
    editor.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:' ',code:'Space'}));
  }
  function keyboardSubmit(editor) {
    // Last resort for Gemini/ChatGPT keyboard-driven composers. Synthetic Enter
    // may be rejected by the site. We always verify acceptance, never assume it.
    const init={bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13,which:13};
    const ev = new KeyboardEvent('keydown',init);
    return editor.dispatchEvent(ev) === false || ev.defaultPrevented;
  }
  function sanitizeFileName(v) { return String(v).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,65) || 'AI漫剧'; }

  async function getEditor(run) {
    const until = Date.now() + 20000;
    let el;
    while (Date.now() < until) {
      el = editorOf(run);
      if (el) return el;
      if (await controlFor(run.id) !== 'running') return null;
      await sleep(700);
    }
    throw new Error('没有找到输入框。请先登录并打开聊天页，再尝试开始；也可以在高级设置填输入框CSS。');
  }
  function enterText(editor, text) {
    editor.focus();
    if (editor.matches('textarea,input')) {
      const proto = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if (!setter) throw new Error('输入框无法写入，网页结构可能已变更。');
      setter.call(editor,text);
      editor.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:text}));
      editor.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }
    const selection=getSelection(); const range=document.createRange();
    range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
    // ExecCommand remains the compatibility path which invokes rich editor input
    // transactions; setting textContent alone produces a fake visual input.
    if (!document.execCommand('insertText',false,text)) {
      throw new Error('AI输入框不接受自动输入。为避免文字看起来存在但实际无法发送，已停止。请刷新网页后再试。');
    }
  }
  // Each website/tab owns a separate persistent job; no shared single-run state.
  async function log(runId, message, severity='info') {
    const o=await chrome.storage.local.get(keys.logs);
    const logs=Array.isArray(o[keys.logs])?o[keys.logs]:[];
    logs.push({at:Date.now(),runId,message,severity});
    await chrome.storage.local.set({[keys.logs]:logs.slice(-250)});
  }
  async function updateRun(runId, patch) {
    const o=await chrome.storage.local.get(keys.run);
    if(o[keys.run]?.id!==runId||o[keys.run]?.instanceId!==instanceId)return null;
    const run={...o[keys.run],...patch,updatedAt:Date.now()};
    await chrome.storage.local.set({[keys.run]:run});
    return run;
  }
  async function controlFor(runId) {
    const d=await chrome.storage.local.get([keys.run,keys.control]);
    const r=d[keys.run],c=d[keys.control];
    if(!r||r.id!==runId||r.tabId!==tabId||r.instanceId!==instanceId||r.status==='finished'||r.status==='error')return 'stop';
    return c?.runId===runId?c.desired:'paused';
  }
  function assemblePrompt(run,cfg,results) {
    const n=run.nextEpisode;
    const text=cfg.mode==='rounds'?String((cfg.rounds||[])[n-1]||''):(n===1?String(cfg.firstPrompt||''):String(cfg.nextPrompt||''));
    const last=String(results[String(n-1)]?.content||'');
    const context=cfg.mode==='rounds'&&n>1&&cfg.chatMode==='new'&&cfg.includePrevious!==false&&last?
      `上一轮的输出（新会话上下文）：\n${last.slice(-16000)}\n\n---\n\n`:'';
    return context+text.replaceAll('{集数}',String(n)).replaceAll('{轮次}',String(n)).replaceAll('{上一集结尾}',last.slice(-800));
  }
  function imageIdsForStep(cfg,n){
    const images=cfg.images||{};
    if(cfg.mode==='rounds')return Array.isArray(images.rounds?.[n-1])?images.rounds[n-1]:[];
    if(n===1)return Array.isArray(images.first)?images.first:[];
    return (cfg.nextImagesEvery!==false || n===2)&&Array.isArray(images.next)?images.next:[];
  }
  function attachmentPreview(root){
    const scope=root?.closest('form,[data-testid*="composer"],.composer,.input-container')||root?.parentElement?.parentElement||document;
    const chips=[...scope.querySelectorAll('[data-testid*="attachment" i],[class*="attachment" i],[class*="preview" i] img,[class*="upload" i] img,[aria-label*="image" i] img')].filter(isVisible);
    return {scope,chips,count:chips.length,text:String(scope.innerText||'').slice(-1200)};
  }
  function fileInputForImages(editor){
    const inputs=safeSelector('input[type="file"]').filter(x=>{
      const accept=String(x.accept||'').toLowerCase();return !accept || accept.includes('image') || accept.includes('.png') || accept.includes('*');
    });
    if(!inputs.length)return null;
    const near=inputs.filter(el=>{
      const shell=el.closest('form,[data-testid*="composer"],.composer')||el.parentElement;
      return shell?.contains(editor) || editor?.parentElement?.parentElement?.contains(el);
    });
    return near[0]|| (inputs.length===1?inputs[0]:null);
  }
  async function receiveImage(id){
    const r=await chrome.runtime.sendMessage({type:'AAC9_GET_IMAGE',id,instanceId});
    if(!r?.ok||!r.base64)throw Error(r?.error||'图片文件未找到。请重新添加图片。');
    const raw=atob(r.base64);const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new File([bytes],r.name||'reference.png',{type:r.mime||'image/png'});
  }
  async function attachImages(run,cfg,ids){
    if(!ids.length)return;
    if(run.autoImagesVerifiedFor===run.nextEpisode){return;}
    let editor=await getEditor(run);
    if(!editor)throw Error('图片发送前无法识别输入框。');
    // Only a positive file input association is eligible for automatic attachment.
    const control=fileInputForImages(editor);
    if(!control){
      await updateRun(run.id,{phase:'awaiting_images',status:'error',reason:'未发现可安全操作的图片上传控件，本轮没有发送。'});
      throw Error('网页当前无法自动附加图片。已暂停本轮以避免遗漏附件；可调整图片配置后新建任务。');
    }
    const prior=attachmentPreview(editor);
    try{
      const files=[];
      for(const id of ids)files.push(await receiveImage(id));
      const dt=new DataTransfer();for(const f of files)dt.items.add(f);
      control.files=dt.files;
      control.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
      control.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      let verified=false,last=0,steady=0;
      const names=files.map(f=>f.name);
      for(let j=0;j<30;j++){
        await sleep(400);
        const fresh=editorOf(run)||editor;
        const view=attachmentPreview(fresh);
        const nameCount=names.filter(n=>view.text.includes(n)).length;
        const previews=view.count-prior.count;
        if(nameCount===names.length || previews>=files.length){
          const now=view.count+nameCount;if(now===last)steady++;else steady=0;last=now;
          if(steady>=3){verified=true;break;}
        }
      }
      if(!verified){
        await updateRun(run.id,{phase:'awaiting_images',status:'error',reason:'图片上传状态未获得网页确认，本轮已安全暂停。'});
        throw Error('网页未能自动确认所有图片已就绪。已暂停，不发送缺少附件的指令。');
      }
      await log(run.id,`第${run.nextEpisode}步：确认${ids.length}张图片已就绪。`);
    }catch(err){
      await updateRun(run.id,{phase:'awaiting_images',status:'error'});
      throw err;
    }
  }
  async function ensureModelForStep(cfg,run){
    if(!cfg.modelLock)return;
    const model=String(cfg.modelChoice||'auto').trim(),mode=String(cfg.workMode||'auto').trim();
    if(model==='auto'&&mode==='auto')return;
    const before=modelProbe();
    const mOk=model==='auto'||normalizedLabel(before.currentModel).includes(normalizedLabel(model));
    const wOk=mode==='auto'||normalizedLabel(before.currentMode).includes(normalizedLabel(mode));
    if(mOk&&wOk)return;
    const switched=await modelApply({model,mode});
    if(!switched.ok)throw Error('模型/工作模式锁定失败：'+String(switched.detail||'请先手动切换模型并重新检测。'));
    const confirm=modelProbe();
    if(model!=='auto'&&!normalizedLabel(confirm.currentModel).includes(normalizedLabel(model)))throw Error('目标模型未被网页确认。暂停发送。');
    if(mode!=='auto'&&!normalizedLabel(confirm.currentMode).includes(normalizedLabel(mode)))throw Error('目标工作模式未被网页确认。暂停发送。');
    await log(run.id,`第${run.nextEpisode}步模型锁定已确认：${confirm.currentModel||'跟随网页'}。`);
  }

  async function sendEpisode(run,cfg,results) {
    const prompt=assemblePrompt(run,cfg,results);
    if(!prompt.trim())throw Error('本轮指令为空。');
    const imageIds=imageIdsForStep(cfg,run.nextEpisode);
    if(imageIds.length)await attachImages(run,cfg,imageIds);
    // Attachment insertion may replace the entire composer. Never reuse its old editor reference.
    const editor=await getEditor(run);
    if(!editor||!editor.isConnected)throw Error('没有找到有效的聊天输入框，任务已暂停。');
    const before=snapshot(run),userBefore=userMessageSnapshot(run);
    await updateRun(run.id,{phase:'ready',baseline:before,userBefore,sentAt:null,prompt,reason:''});
    enterText(editor,prompt);
    await sleep(550);
    if(!editor.isConnected)throw Error('输入框在输入过程中被网站替换，未发送；请刷新网页后检查。');
    const val=editorValue(editor).replace(/\s+/g,'');
    if(!val.includes(prompt.replace(/\s+/g,'').slice(0,Math.min(30,prompt.replace(/\s+/g,'').length))))throw Error('网页没有接收到指令输入，已安全停止。');
    let btn=senderOf(run);
    for(let j=0;!btn&&j<18;j++) {
      if(j===6)nudgeEditor(editor);
      await sleep(350);btn=senderOf(run);
    }
    if(await controlFor(run.id)!=='running')return false;
    if(!btn&&own==='deepseek'){
      await updateRun(run.id,{phase:'ready',status:'error',baseline:before,prompt,sentAt:null,reason:'DeepSeek 的发送按钮未被确认，本轮没有点击发送。'});
      throw Error('DeepSeek 未识别到可靠的发送按钮，本轮已停止。可以刷新网页后安全重试。');
    }
    if(!btn&&!['gemini','chatgpt'].includes(own))throw Error('未检测到已启用的发送按钮，任务自动停止。');
    // Submission intent recorded before click: a crash will never blindly resend.
    await updateRun(run.id,{phase:'submitting',sentAt:Date.now()});
    if(btn)btn.click();else keyboardSubmit(editor);
    const strict=['gemini','deepseek'].includes(own);
    let accepted=false;
    for(let i=0;i<30;i++) {
      await sleep(450);
      if(strict) {
        if(matchingUserMessage(run,userBefore,prompt)){accepted=true;break;}
      } else {
        const now=editorOf(run),snap=snapshot(run);
        if(!editorValue(now).trim()||snap.count>before.count||(snap.text&&snap.text!==before.text)){accepted=true;break;}
      }
    }
    if(!accepted){
      throw Error('发送结果未获得网页确认。任务已暂停且不会自动重发，以免重复发送。');
    }
    await updateRun(run.id,{phase:'waiting'});
    await log(run.id,`第${run.nextEpisode}${cfg.mode==='rounds'?'轮':'集'}：已提交，正在等待完整回复。`);
    return true;
  }
  async function waitReply(run,cfg) {
    const timeout=Math.max(1,Number(cfg.timeoutMinutes)||12)*60000;
    const quiet=Math.max(5,Number(cfg.quietSeconds)||8)*1000;
    const since=Date.now(),base=run.baseline||{count:0,text:''};
    let text='',changed=Date.now(),busySeen=false,candidate=0;
    while(Date.now()-since<timeout) {
      const ctrl=await controlFor(run.id);
      if(ctrl==='stop')return null;
      const snap=snapshot(run),busy=busySignal(run);
      if(busy)busySeen=true;
      const newAnswer=snap.count>base.count||(snap.text&&snap.text!==base.text);
      if(newAnswer&&snap.text&&text!==snap.text){text=snap.text;changed=Date.now();candidate=0;}
      if(busy)candidate=0;
      // ChatGPT must have a positive completion signal. Other sites use busy-off
      // plus conservative quiet period; missing signals time out rather than guess.
      const positive=own==='chatgpt'?completionSignal(run):(busySeen?!busy:Date.now()-changed>=Math.max(quiet,16000));
      if(newAnswer&&text.length>=10&&!busy&&positive&&Date.now()-changed>=quiet) {
        if(!candidate)candidate=Date.now();
        if(Date.now()-candidate>=2500) {
          const verify=snapshot(run);
          if(verify.text===text&&!busySignal(run)&&(own!=='chatgpt'||completionSignal(run)))return text;
        }
      }else candidate=0;
      await sleep(950);
    }
    throw Error('无法确认本轮回复已经完成，已安全暂停；不会抢发下一轮。');
  }
  async function saveEpisode(run,cfg,text) {
    const d=await chrome.storage.local.get([keys.run,keys.results,keys.control]);
    const actual=d[keys.run];
    if(actual?.id!==run.id||actual.instanceId!==instanceId||actual.nextEpisode!==run.nextEpisode)return;
    const results={...(d[keys.results]||{})};
    const n=run.nextEpisode;
    results[String(n)]={episode:n,content:text,at:Date.now(),status:'done',prompt:actual.prompt||'',platform:own};
    await chrome.storage.local.set({[keys.results]:results});
    await log(run.id,`第${n}${cfg.mode==='rounds'?'轮':'集'}：保存成功（${text.length}字）。`,'success');
    if(cfg.autoDownload) {
      try{await chrome.runtime.sendMessage({type:'AAC9_DOWNLOAD',filename:`AI自动续聊/${sanitizeFileName(cfg.projectName)}/${own}_第${String(n).padStart(2,'0')}${cfg.mode==='rounds'?'轮':'集'}.txt`,content:text});}
      catch{await log(run.id,'自动下载失败，正文仍在扩展本地存储。','warn');}
    }
    const next=n+1,finished=next>cfg.total;
    const stillPaused=d[keys.control]?.desired==='paused';
    await updateRun(run.id,{nextEpisode:next,phase:'ready',status:finished?'finished':stillPaused?'paused':'running',reason:'',baseline:null,sentAt:null,prompt:''});
    if(finished)await log(run.id,`全部${cfg.total}${cfg.mode==='rounds'?'轮':'集'}完成。`,'success');
  }
  async function fail(runId,error) {
    const reason=String(error?.message||error||'未知错误');
    await updateRun(runId,{status:'error',reason});
    await chrome.storage.local.set({[keys.control]:{runId,desired:'paused',updatedAt:Date.now()}});
    await log(runId,'已安全暂停：'+reason,'error');
  }
  async function drive() {
    if(working)return;
    working=true;
    try{
      while(true){
        const d=await getAll(),r=d.run,cfg=d.cfg;
        if(!r||!cfg||r.tabId!==tabId||r.platform!==own||r.instanceId!==instanceId||r.status==='finished'||r.status==='error')break;
        if(d.control?.runId!==r.id||d.control?.desired!=='running'){
          if(r.status==='running'&&r.phase!=='waiting')await updateRun(r.id,{status:'paused'});
          break;
        }
        if(r.nextEpisode>cfg.total){await updateRun(r.id,{status:'finished'});break;}
        try{
          if(r.phase==='waiting'){
            const text=await waitReply(r,cfg);if(!text)break;
            await saveEpisode(r,cfg,text);
            const after=await getAll();
            if(cfg.mode==='rounds'&&cfg.chatMode==='new'&&after.run?.nextEpisode<=cfg.total&&after.control?.desired==='running'){
              await updateRun(r.id,{phase:'navigating'});
              const change=await chrome.runtime.sendMessage({type:'AAC9_NEW_CHAT',platform:own,instanceId});
              if(!change?.ok)throw Error('无法新建聊天：'+String(change?.error||''));
              break;
            }
          }else if(r.phase==='navigating')break;
          else if(r.phase==='submitting'){
            const confirmed=matchingUserMessage(r,r.userBefore||{count:0,text:''},r.prompt||'');
            if(!confirmed)throw Error('无法自动确认上次消息是否送达，已停止以避免重复发送。');
            await updateRun(r.id,{phase:'waiting'});
          }
          else{
            await ensureModelForStep(cfg,r);
            const sent=await sendEpisode(r,cfg,d.results);
            if(!sent)break;
          }
        }catch(err){await fail(r.id,err);break;}
        await sleep(500);
      }
    }catch(err){console.error('[AAC7] runner error:',err);}
    finally{working=false;}
  }
  async function recoverPending(){
    const d=await getAll(),r=d.run;
    if(!r||r.instanceId!==instanceId||r.tabId!==tabId||r.status==='finished')return {ok:false,error:'没有可恢复的原任务'};
    const cfg=d.cfg;
    if(!cfg)return {ok:false,error:'未读取到任务设置'};
    if(['submitting','manual_send'].includes(r.phase)||r.sentAt!=null&&r.phase!=='waiting'){
      if(!r.userBefore||!r.prompt||!matchingUserMessage(r,r.userBefore,r.prompt))return {ok:false,error:'未找到本轮已发送消息的可靠证据，自动停止，禁止重复提交。'};
      await updateRun(r.id,{status:'running',phase:'waiting',reason:'消息已自动确认，正在监听回复。'});
    }else if(r.phase==='waiting'){
      const snap=snapshot(r),base=r.baseline||{count:0,text:''};
      if(!(snap.count>base.count||(snap.text&&snap.text!==base.text)))return {ok:false,error:'尚无可识别的新回复，保留暂停状态以避免误续发。'};
      await updateRun(r.id,{status:'running',reason:'已自动检测到新回复，继续监听完整结束。'});
    }else if(r.phase==='awaiting_images'){
      return {ok:false,error:'图片未被网页确认上传成功，禁止在缺少附件时继续发送。'};
    }else if(r.phase==='ready'&&r.sentAt==null){
      await updateRun(r.id,{status:'running',reason:'未发送本轮消息，自动重新尝试。'});
    }else return {ok:false,error:'当前阶段无法安全自动恢复；请创建新任务。'};
    await chrome.storage.local.set({[keys.control]:{runId:r.id,desired:'running',updatedAt:Date.now()}});
    drive();
    return {ok:true,phase:r.phase};
  }
  async function hello(){
    try{
      const response=await chrome.runtime.sendMessage({type:'AAC9_HELLO'});
      tabId=response?.tabId??null;
      instanceId=response?.instanceId||null;
      if(!instanceId || instanceId.split('-')[0]!==own)return;
      keys=boundKeys(instanceId);
      const d=await getAll();
      if(d.run?.tabId===tabId&&d.control?.desired==='running'){
        if(d.run.phase==='navigating'){
          if(!isNewChatLanding()){
            await fail(d.run.id,Error('页面导航未进入新聊天，已暂停防止发送到旧对话。'));return;
          }
          await updateRun(d.run.id,{phase:'ready'});
        }
        drive();
      }
    }catch(err){console.warn('[AAC7] init',err);}
  }
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(msg?.type==='AAC9_BIND'){hello().then(()=>reply({ok:!!instanceId,instanceId}));return true;}
    if(msg?.type==='AAC9_PING'||msg?.type==='AAC9_DIAG'){
      if(!instanceId||msg.instanceId!==instanceId){reply({ok:false,error:'该聊天窗口尚未绑定此任务'});return false;}
      reply({ok:true,...sendDiagnostics(msg.run||{}),deepseek:own==='deepseek'?deepseekSenderHints(msg.run||{}):null});return false;
    }
    if(msg?.type==='AAC9_MODEL_PROBE'){
      if(!instanceId||msg.instanceId!==instanceId){reply({ok:false,error:'模型扫描绑定不匹配'});return false;}
      (msg.inspectOptions?inspectModels():Promise.resolve(modelProbe())).then(v=>reply({ok:true,...v})).catch(e=>reply({ok:false,error:String(e)}));return true;
    }
    if(msg?.type==='AAC9_MODEL_APPLY'){
      if(!instanceId||msg.instanceId!==instanceId){reply({ok:false,error:'模型切换绑定不匹配'});return false;}
      modelApply(msg).then(reply).catch(e=>reply({ok:false,error:String(e)}));return true;
    }
    if(msg?.type==='AAC9_RECOVER'){
      if(!instanceId||msg.instanceId!==instanceId){reply({ok:false,error:'任务绑定不匹配'});return false;}
      recoverPending().then(reply).catch(e=>reply({ok:false,error:String(e.message||e)}));return true;
    }
    if(msg?.type==='AAC9_RUN'){const ok=!!instanceId&&msg.instanceId===instanceId;reply({ok});if(ok)drive();return false;}
    return false;
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&keys&&changes[keys.control]?.newValue?.desired==='running')drive();
  });
  hello();
})();
