import { useEffect, useRef, useState } from 'react';
import { host } from '../host';

export type DomesticWebProvider = 'doubao'|'deepseek'|'kimi'|'qwen'|'yuanbao';

const labels:Record<DomesticWebProvider,string>={
  doubao:'豆包',deepseek:'DeepSeek',kimi:'Kimi',qwen:'千问',yuanbao:'腾讯元宝',
};
const providers=Object.keys(labels) as DomesticWebProvider[];

interface Props {
  provider:DomesticWebProvider;
  slot:number;
  onSelect:(provider:DomesticWebProvider)=>void;
  onSlot:(slot:number)=>void;
  onClose:()=>void;
}

/** A real native Tauri child WebView occupies only the central rectangle.
 * The app-owned toolbar is always outside its native bounds. No HTML iframe or
 * cross-origin DOM scripts are used for the member website. */
export function DomesticBrowserDock({provider,slot,onSelect,onSlot,onClose}:Props) {
  const area=useRef<HTMLDivElement|null>(null);
  const [message,setMessage]=useState('正在打开官网网页…');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let active=true;
    let opened=false;
    let frame=0;
    const element=area.current;
    if(!element)return;
    setReady(false);
    setMessage('正在打开官网网页…');
    const bounds=()=>element.getBoundingClientRect();
    const resize=()=>{
      if(!active||!opened||frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        const rect=bounds();
        if(rect.width>=240&&rect.height>=180) {
          void host.domestic.dockBounds(provider,slot,rect).catch(e=>{
            if(active)setMessage('窗口尺寸同步失败：'+String(e));
          });
        }
      });
    };
    const observer=typeof ResizeObserver!=='undefined' ? new ResizeObserver(resize) : undefined;
    observer?.observe(element);
    window.addEventListener('resize',resize);
    void (async()=>{
      try {
        const rect=bounds();
        if(rect.width<240||rect.height<180)throw Error('主窗口太小，请扩大窗口后重新打开');
        await host.domestic.dockOpen(provider,slot,rect);
        opened=true;
        if(!active) {
          await host.domestic.dockHide(provider,slot);
          return;
        }
        setReady(true);
        setMessage('已加载真实官网；请在网页中登录并选择官网提供的模型、工作模式。');
        resize();
      } catch(error) {
        if(active){setReady(false);setMessage('内嵌网页打开失败：'+String(error));}
      }
    })();
    return ()=>{
      active=false;
      observer?.disconnect();
      window.removeEventListener('resize',resize);
      if(frame)cancelAnimationFrame(frame);
      void host.domestic.dockHide(provider,slot).catch(()=>{});
    };
  },[provider,slot]);

  const external=async()=>{
    if(busy)return;
    setBusy(true);
    try {
      await host.domestic.dockClose(provider,slot);
      await host.domestic.openMemberSlot(provider,slot);
      onClose();
    }catch(error){
      setMessage('切换独立窗口失败：'+String(error));
    }finally{setBusy(false);}
  };

  return <div className="fixed inset-0 z-[110] flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      role="dialog" aria-modal="true" aria-label="软件内真实官网网页">
    <div className="flex min-h-[58px] flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
      <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={onClose}>← 返回工作台</button>
      <label className="text-xs">AI 平台
        <select aria-label="切换国内 AI 平台" className="ml-1 rounded border bg-transparent p-1.5"
          value={provider} onChange={e=>onSelect(e.target.value as DomesticWebProvider)}>
          {providers.map(id=><option key={id} value={id}>{labels[id]}</option>)}
        </select>
      </label>
      <label className="text-xs">账号
        <select aria-label="切换国内 AI 登录账号" className="ml-1 rounded border bg-transparent p-1.5"
          value={slot} onChange={e=>onSlot(Number(e.target.value))}>
          {Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>账号 {i+1}</option>)}
        </select>
      </label>
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
        原生网页：模型、深度思考、搜索等模式请通过官网菜单操作
      </span>
      <button type="button" disabled={busy} onClick={()=>void external()}
        className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-50">独立窗口</button>
    </div>
    <div ref={area} className="relative min-h-0 flex-1 bg-zinc-100 dark:bg-zinc-900">
      {!ready&&<div className="pointer-events-none absolute inset-x-4 top-12 mx-auto max-w-xl rounded-lg bg-white/95 p-4 text-sm shadow dark:bg-zinc-800/95" role="status">
        {message}
      </div>}
    </div>
    <div className="flex min-h-[30px] items-center gap-2 border-t border-zinc-200 bg-white px-3 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
      <span>{labels[provider]} · 账号 {slot}</span>
      <span>真实官网 WebView · 本地登录资料 · 不自动抓取或伪造回复</span>
    </div>
  </div>;
}
