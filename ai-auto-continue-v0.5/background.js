'use strict';
const DASHBOARD = chrome.runtime.getURL('dashboard.html');

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({url: DASHBOARD});
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, {active: true});
    await chrome.windows.update(tabs[0].windowId, {focused: true});
  } else {
    await chrome.tabs.create({url: DASHBOARD});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'MANJU_HELLO') {
    reply({tabId: sender.tab?.id ?? null});
    return false;
  }
  if (msg?.type === 'MANJU_NEW_CHAT') {
    const urls = {chatgpt:'https://chatgpt.com/',gemini:'https://gemini.google.com/app',doubao:'https://www.doubao.com/chat/',deepseek:'https://chat.deepseek.com/'};
    const platform = String(msg.platform || '');
    const url = urls[platform];
    if (!url || !sender.tab?.id) { reply({ok:false,error:'没有可用的聊天标签页'}); return false; }
    chrome.tabs.update(sender.tab.id,{url}).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:String(e.message||e)}));
    return true;
  }
  if (msg?.type === 'MANJU_DOWNLOAD') {
    const filename = String(msg.filename || 'AI漫剧/内容.txt')
      .replace(/[\\:*?"<>|\x00-\x1f]/g, '_')
      .replace(/(^|\/)\.+(?=\/|$)/g, '$1未命名');
    // 下载需由浏览器允许；默认关掉自动下载，数据始终先保存到扩展本地存储。
    const content = String(msg.content || '');
    const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
    chrome.downloads.download({url, filename, saveAs: false, conflictAction: 'uniquify'})
      .then(id => reply({ok: true, id}))
      .catch(err => reply({ok: false, error: String(err.message || err)}));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(async tabId => {
  try {
    const data = await chrome.storage.local.get(['manjuRun', 'manjuControl']);
    if (data.manjuRun?.tabId === tabId && data.manjuRun?.status === 'running') {
      const run = {...data.manjuRun, status: 'paused', updatedAt: Date.now(), reason: 'AI聊天标签页已关闭。请重新打开并手动点击继续。'};
      await chrome.storage.local.set({manjuRun: run, manjuControl: {runId:run.id, desired:'paused', updatedAt:Date.now()}});
    }
  } catch (err) { console.warn('[自动续聊] tab removed:', err); }
});
