/* AI自动续聊助手：仅在目标 AI 页面本地运行；不上传账号凭据。 */
(() => {
  'use strict';
  if (window.__MANJU_ASSISTANT_LOADED__) return;
  window.__MANJU_ASSISTANT_LOADED__ = true;

  let tabId = null;
  let working = false;
  let heartbeat = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getAll = () => chrome.storage.local.get(['manjuRun', 'manjuControl', 'manjuConfig', 'manjuEpisodes', 'manjuLogs']);
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
      editor: ['textarea#chat-input','textarea[placeholder*="DeepSeek" i]','textarea[placeholder*="发送"]','textarea','[contenteditable="true"][role="textbox"]'],
      send: ['button[aria-label="Send message"]','button[aria-label*="发送"]','button[data-testid="send-button"]','button[type="submit"]','[role="button"][aria-label*="send" i]'],
      reply: ['[data-message-author-role="assistant"]','.ds-markdown','[class*="AssistantMessage"]','[class*="markdown-body"]'],
      stop: ['button[aria-label*="stop" i]','button[aria-label*="停止"]','[aria-label*="Stop generation" i]']
    },
    doubao: {
      editor: ['[contenteditable="true"][data-placeholder]', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]', 'textarea[placeholder]'],
      send: ['button[class*="send"]', '[class*="send-btn"]', '[aria-label*="发送"]', 'button[aria-label*="send"]'],
      reply: ['[data-role="assistant"]', '[data-message-role="assistant"]', '[class*="assistant-message"]', '[class*="assistantMessage"]', '[class*="message_content"]'],
      stop: ['button[aria-label*="停止"]', '[class*="stop-generation"]', '[class*="stopGeneration"]']
    }
  };

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
  function editorOf(run) { return firstVisible(selectors(run,'editor')); }
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
  function senderOf(run) {
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
    return null;
  }
  function sendDiagnostics(run) {
    const es = selectors(run,'send');
    let found=0,visible=0,enabled=0;
    for(const selector of es){for(const el of safeSelector(selector)){found++;if(isVisible(el)){visible++; if(isSendEnabled(el))enabled++;}}}
    const ed=editorOf(run);
    const host=platformOfUrl();
    const authWall=!!firstVisible(['input[type="password"]','form[action*="login"]','button[data-testid="login-button"]']);
    return {platform:host,url:location.origin + location.pathname, pageTitle:document.title.slice(0,100), hasEditor:!!ed, editorKind:ed?.tagName||'', hasSend:!!senderOf(run), found,visible,enabled, editorChars:editorValue(ed).trim().length,authWall,replyCount:snapshot(run).count,busy:busySignal(run),completed:completionSignal(run)};
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

  async function log(runId, message, severity='info') {
    const obj = await chrome.storage.local.get('manjuLogs');
    const logs = Array.isArray(obj.manjuLogs) ? obj.manjuLogs : [];
    logs.push({at:Date.now(), message, severity, runId});
    await chrome.storage.local.set({manjuLogs:logs.slice(-200)});
  }
  async function updateRun(runId, patch) {
    const obj = await chrome.storage.local.get('manjuRun');
    if (obj.manjuRun?.id !== runId) return null;
    const run = {...obj.manjuRun, ...patch, updatedAt: Date.now()};
    await chrome.storage.local.set({manjuRun:run});
    return run;
  }
  async function controlFor(runId) {
    const {manjuRun, manjuControl} = await chrome.storage.local.get(['manjuRun','manjuControl']);
    if (!manjuRun || manjuRun.id !== runId || manjuRun.tabId !== tabId) return 'stop';
    if (manjuRun.status === 'finished' || manjuRun.status === 'error') return 'stop';
    return manjuControl?.runId === runId ? manjuControl.desired : 'paused';
  }

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
  function assemblePrompt(run, cfg, episodes) {
    const ep = run.nextEpisode;
    const rounds = Array.isArray(cfg.rounds) ? cfg.rounds : [];
    const isRounds=cfg.mode==='rounds';
    let body;
    if (isRounds) body=String(rounds[ep-1]||'').trim();
    else if (ep===1) body=String(cfg.firstPrompt||'').trim();
    else body=String(cfg.nextPrompt||'').trim();
    const last=String(episodes[String(ep-1)]?.content||'');
    body=body.replaceAll('{集数}',String(ep)).replaceAll('{轮次}',String(ep)).replaceAll('{上一集结尾}',last.slice(-800));
    // 同一窗口首轮发一次规则；切新聊天时每轮重新携带规则。
    const includeSkill=ep===1 || (isRounds && cfg.chatMode==='new');
    const skill=includeSkill?String(cfg.skill||'').trim():'';
    const prefix=skill?`以下为本次任务必须遵守的Skill规则：\n\n${skill}\n\n---\n\n`:'';
    const context=isRounds && ep>1 && cfg.chatMode==='new' && cfg.includePrevious !== false && last ?
      `上一轮完整输出（为新聊天保留上下文）：\n${last.slice(-16000)}\n\n---\n\n` : '';
    return prefix+context+body;
  }
  async function sendEpisode(run, cfg, episodes) {
    const prompt = assemblePrompt(run,cfg,episodes);
    if (!prompt.trim()) throw new Error('发送指令为空，请在控制台填写首次指令或续写指令。');
    const editor = await getEditor(run);
    if (!editor) return false;
    const before = snapshot(run);
    // 发送前先记录待发送内容；只有确认点击后才进入等待回复阶段。
    const stage = await updateRun(run.id, {phase:'ready', baseline:before, sentAt:null, prompt, status:'running', reason:''});
    if (!stage) return false;
    enterText(editor, prompt);
    await sleep(500);
    const entered = editor.matches('textarea,input') ? editor.value : (editor.textContent || editor.innerText || '');
    if (!entered || !entered.replace(/\s+/g,'').includes(prompt.replace(/\s+/g,'').slice(0,Math.min(prompt.replace(/\s+/g,'').length,32)))) {
      throw new Error('输入框没有成功接收指令，已停止，避免发送空白内容。');
    }
    let btn = senderOf(run);
    for(let tries=0; !btn && tries<18; tries++) {
      if (tries===6) nudgeEditor(editor);
      await sleep(350); btn=senderOf(run);
    }
    if (await controlFor(run.id) !== 'running') return false;
    if (!btn && !['gemini','chatgpt'].includes(platformOfUrl())) {
      throw new Error('文字已填入，但网页发送按钮未就绪，内容尚未发送。请打开AI页面检查是否需要登录。');
    }
    // Record possible submission BEFORE any click/key event. A crash during
    // submission must never auto-resend the same prompt.
    await updateRun(run.id,{phase:'submitting',sentAt:Date.now()});
    if (btn) btn.click();
    else {
      keyboardSubmit(editor);
      await log(run.id, `第${run.nextEpisode}集：未找到可用发送按钮，尝试使用键盘Enter提交；若未成功将安全暂停。`,'warn');
    }
    // 发送确认：输入框清空或新增AI回复才算网页接收；如状态不明确则停下来人工核对，绝不盲目重复。
    let accepted = false;
    for (let i=0; i<24; i++) {
      await sleep(400);
      const current = editorOf(run);
      const currentText = current ? (current.matches('textarea,input') ? current.value : (current.innerText || current.textContent || '')) : '';
      const snap = snapshot(run);
      if (!currentText.trim() || snap.count > before.count || (snap.text && snap.text!==before.text)) {
        accepted = true; break;
      }
    }
    if (!accepted) throw new Error('发送未获网页确认，可能是按钮禁用或输入事件未被Gemini接收。请在AI网页检查是否已有回复；确认未发送后再点“重试当前集”，避免重复。');
    await updateRun(run.id,{phase:'waiting'});
    await log(run.id, `第${run.nextEpisode}集：网页已接收发送动作，开始监听 ${cfg.platformLabel || cfg.platform} 回复。`);
    return true;
  }
  async function waitReply(run, cfg) {
    const timeoutMs = Math.max(1, Number(cfg.timeoutMinutes) || 12) * 60 * 1000;
    const stableMs = Math.max(5, Number(cfg.quietSeconds) || 8) * 1000;
    const started = Date.now();
    const base = run.baseline || {count:0,text:''};
    let latest = '';
    let sawBusy = false;
    let lastChange=Date.now();
    let finishedCandidateAt=0;
    const isChatGPT = platformOfUrl()==='chatgpt';
    while (Date.now() - started < timeoutMs) {
      const control=await controlFor(run.id);
      if (control==='stop') return null;
      const snap=snapshot(run);
      const busy=busySignal(run);
      if (busy) sawBusy=true;
      const isNew=snap.count>base.count || (snap.text && snap.text!==base.text);
      if (isNew && snap.text && snap.text!==latest) {latest=snap.text;lastChange=Date.now();finishedCandidateAt=0;}
      if (busy) finishedCandidateAt=0;
      // 关键修复：ChatGPT必须有属于最新assistant回复的明确完成信号，
      // 不能仅凭 7 秒文字未变化就认定已结束。High思考模式会长时间无输出。
      const positive=isChatGPT ? completionSignal(run) : (sawBusy ? !busy : (Date.now()-lastChange>=Math.max(stableMs,16000)));
      if (isNew && latest.length>=10 && !busy && positive && Date.now()-lastChange >= stableMs) {
        if (!finishedCandidateAt) finishedCandidateAt=Date.now();
        if (Date.now()-finishedCandidateAt >= 2500) {
          const check=snapshot(run);
          if (check.text===latest && !busySignal(run) && (!isChatGPT || completionSignal(run))) {
            return latest;
          }
        }
      } else finishedCandidateAt=0;
      await sleep(950);
    }
    throw new Error(isChatGPT
      ? '未收到ChatGPT最新回复的明确完成信号（复制按钮/完成状态），可能仍在思考。已安全暂停，绝不抢发下一条。可手动存档。'
      : '未可靠确认本轮回复完成，已安全暂停，请检查网页并手动存档或恢复。');
  }
  async function saveEpisode(run, cfg, text) {
    const latest = await chrome.storage.local.get(['manjuRun','manjuEpisodes']);
    if (latest.manjuRun?.id !== run.id || latest.manjuRun?.nextEpisode !== run.nextEpisode) return;
    const episodes = latest.manjuEpisodes || {};
    const ep = run.nextEpisode;
    episodes[String(ep)] = {episode:ep, content:text, at:Date.now(), prompt:run.prompt || '', platform:cfg.platform, status:'done'};
    await chrome.storage.local.set({manjuEpisodes:episodes});
    await log(run.id, `第${ep}${cfg.mode==='rounds'?'轮':'集'}：保存成功，共${text.length}字。`, 'success');
    if (cfg.autoDownload) {
      chrome.runtime.sendMessage({type:'MANJU_DOWNLOAD', filename:`AI漫剧自动续聊/${sanitizeFileName(cfg.projectName)}/第${String(ep).padStart(2,'0')}集.txt`, content:text}, response => {
        if (chrome.runtime.lastError || !response?.ok) {
          log(run.id, `第${ep}集：下载文件失败，但内容已保存在扩展本地，可在控制台导出。`, 'warn').catch(()=>{});
        }
      });
    }
    const next = ep + 1;
    const status = next > Number(cfg.total) ? 'finished' : 'running';
    await updateRun(run.id, {nextEpisode:next, phase:'ready', status, baseline:null, sentAt:null, prompt:'', reason:''});
    if (status === 'finished') await log(run.id, `全部${cfg.total}${cfg.mode==='rounds'?'轮':'集'}任务完成。`, 'success');
  }
  async function fail(runId, error) {
    const reason = String(error?.message || error || '未知错误');
    await updateRun(runId, {status:'error', reason});
    await chrome.storage.local.set({manjuControl:{runId, desired:'paused', updatedAt:Date.now()}});
    await log(runId, `已暂停：${reason}`, 'error');
  }
  async function drive() {
    if (working) return;
    working = true;
    try {
      while (true) {
        const state = await getAll();
        const run = state.manjuRun;
        const cfg = state.manjuConfig;
        if (!run || !cfg || run.tabId !== tabId || run.platform !== platformOfUrl()) break;
        if (run.status === 'finished' || run.status === 'error') break;
        if (state.manjuControl?.desired !== 'running' || state.manjuControl?.runId !== run.id) {
          if (run.status !== 'paused' && run.status !== 'finished') await updateRun(run.id,{status:'paused'});
          break;
        }
        if (run.nextEpisode > Number(cfg.total)) {
          await updateRun(run.id,{status:'finished'});
          break;
        }
        try {
          if (run.phase === 'waiting') {
            const text = await waitReply(run,cfg);
            if (!text) break;
            await saveEpisode(run,cfg,text);
            if (cfg.mode==='rounds' && cfg.chatMode==='new' && run.nextEpisode < Number(cfg.total)) {
              await updateRun(run.id,{phase:'navigating'});
              const changed=await chrome.runtime.sendMessage({type:'MANJU_NEW_CHAT',platform:cfg.platform});
              if (!changed?.ok) throw new Error('新建聊天失败：'+(changed?.error||'未知错误'));
              await log(run.id,`第${run.nextEpisode+1}轮：已请求切换新聊天。`);
              break;
            }
          } else if (run.phase === 'navigating') {
            break;
          } else if (run.phase === 'submitting') {
            // 发送状态不明时必须交给人工确认，避免自动重发造成重复剧集。
            throw new Error('上一条指令发送结果未确认，请核对聊天网页。若未发送，点击“重试当前集”；若已发送，请手动存档。');
          } else {
            const ok = await sendEpisode(run,cfg,state.manjuEpisodes || {});
            if (!ok) break;
          }
        } catch(err) {
          await fail(run.id,err);
          break;
        }
        await sleep(500);
      }
    } catch(err) {
      console.error('[自动续聊] 自动任务异常',err);
    } finally {
      working = false;
    }
  }

  async function hello() {
    try {
      const resp = await chrome.runtime.sendMessage({type:'MANJU_HELLO'});
      tabId = resp?.tabId ?? null;
      const {manjuRun, manjuControl} = await chrome.storage.local.get(['manjuRun','manjuControl']);
      if (manjuRun?.tabId === tabId && manjuControl?.desired === 'running') {
        if (manjuRun.phase==='navigating') {
          if (!isNewChatLanding()) {
            await fail(manjuRun.id,new Error('新聊天导航尚未到达空白会话。为避免发进旧对话，已暂停，请人工确认。'));
            return;
          }
          await updateRun(manjuRun.id,{phase:'ready'});
        }
        drive();
      }
    } catch (err) { console.warn('[自动续聊] 初始化：',err); }
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'MANJU_PING') {
      reply({ok:true,...sendDiagnostics(msg.run || {})});
      return false;
    }
    if (msg?.type === 'MANJU_DIAG') { reply({ok:true,...sendDiagnostics(msg.run || {})});return false; }
    if (msg?.type === 'MANJU_RUN') {
      reply({ok:true});
      drive();
      return false;
    }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area === 'local' && changes.manjuControl?.newValue?.desired === 'running') drive();
  });
  hello();
})();
