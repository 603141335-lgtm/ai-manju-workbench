import { useEffect, useRef, useState } from 'react';
import type { AIProvider, ProviderState } from '../../shared/types';
import { host } from '../host';
import { startBridgePull } from '../bridge/pull';

/**
 * Original Multi-AI Chat Desktop native provider WebView. This is NOT an iframe
 * or a second browser profile: opening the same provider reuses ai-{provider},
 * including the upstream login session and native model menu.
 */
export function OfficialProviderPane({provider,enabled=true}:{provider:AIProvider;enabled?:boolean}) {
  const surface=useRef<HTMLDivElement|null>(null);
  const [state,setState]=useState<ProviderState|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!enabled)return;
    const element=surface.current;
    if(!element)return;
    let live=true;
    let frame=0;
    let unlisten:(()=>void)|undefined;
    let stopPull:(()=>void)|undefined;
    setError('');
    setLoading(true);
    const reposition=()=>{
      if(!live||!element||frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        const rect=element.getBoundingClientRect();
        if(rect.width>=280&&rect.height>=240){
          void host.layout.setBounds(provider,rect).catch(()=>{});
        }
      });
    };
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(reposition):undefined;
    observer?.observe(element);
    window.addEventListener('resize',reposition);
    void (async()=>{
      try{
        stopPull=await startBridgePull();
        unlisten=await host.connections.onUpdate(s=>{
          if(live&&s.provider===provider){setState(s);if(s.webview==='loaded')setLoading(false);}
        });
        const snapshot=await host.connections.get();
        const existing=snapshot.find(s=>s.provider===provider);
        if(live&&existing)setState(existing);
        if(!live)return;
        const rect=element.getBoundingClientRect();
        if(rect.width<280||rect.height<240)throw Error('官网区域太小，请增大软件窗口');
        if(existing?.webview==='loaded'){
          await host.layout.setBounds(provider,rect);
          await host.provider.show(provider,false);
        } else {
          await host.provider.open(provider,rect);
        }
        if(live){setLoading(false);reposition();}
        else await host.provider.hide(provider).catch(()=>{});
      }catch(e){
        if(live){setLoading(false);setError(String(e));}
      }
    })();
    return ()=>{
      live=false;
      if(frame)cancelAnimationFrame(frame);
      observer?.disconnect();window.removeEventListener('resize',reposition);
      unlisten?.();stopPull?.();
      void host.provider.hide(provider).catch(()=>{});
    };
  },[provider,enabled]);

  const restore=async()=>{
    try{setError('');await host.provider.openLogin(provider);}catch(e){setError(String(e));}
  };
  return <div className="flex h-full min-h-0 flex-col bg-white text-slate-800" aria-label={provider+' 官网真实网页'}>
    <div className="flex min-h-[48px] flex-wrap items-center gap-2 border-b border-slate-200 px-3 text-xs">
      <span className="font-semibold">{provider.toUpperCase()} · 官网会员</span>
      <span className={state?.login==='logged_in'?'text-emerald-700':'text-amber-700'}>
        {state?.login==='logged_in'?'已登录':state?.login==='logged_out'?'尚未登录':'检查登录中'}
      </span>
      <span className="ml-auto text-slate-500">模型与工作模式在官网选择</span>
      <button type="button" onClick={()=>void restore()} className="rounded-md border px-2 py-1">登录 / 刷新</button>
    </div>
    {error&&<div role="alert" className="border-b bg-amber-50 p-2 text-xs text-amber-900">
      官网打开失败：{error}。可以通过软件右侧设置检查当前平台是否处于备用席位。
    </div>}
    {loading&&<p role="status" className="px-3 py-1 text-xs text-slate-500">正在加载原版真实官网视图…</p>}
    <div ref={surface} className="min-h-[260px] flex-1 bg-slate-50" />
  </div>;
}
