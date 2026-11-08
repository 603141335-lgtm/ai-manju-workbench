// 本地图标：不加载CDN、不请求外部字体。只使用静态、预设的SVG路径。
const ICONS={
  external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/>',
  activity:'<path d="M3 12h4l3 7 4-14 3 7h4"/>',
  book:'<path d="M12 7v14"/><path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5v14c-3-1.5-6-1.5-9.5.5C9 18.5 6 18.5 3 20z"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/>',
  bot:'<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4m-4 6h0m8 0h0M9 17h6"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  trash:'<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  edit:'<path d="M12 20H4v-8L15.5 3.5a2 2 0 0 1 3 3L7.5 17.5"/><path d="m13.5 5.5 4 4"/>',
  message:'<path d="M20 17a2 2 0 0 1-2 2H7l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 10h8"/>',
  repeat:'<path d="m17 2 4 4-4 4M3 10V7a1 1 0 0 1 1-1h17M7 22l-4-4 4-4M21 14v3a1 1 0 0 1-1 1H3"/>',
  save:'<path d="M4 3h14l3 3v15H3V4a1 1 0 0 1 1-1z"/><path d="M7 3v7h10V3M7 21v-8h10v8"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3.9A8 8 0 0 0 14 5l-.4-2h-4L9 5a8 8 0 0 0-2.4 1.4l-2.2-.9-2 3.4 2 1.5a7 7 0 0 0 0 3.2l-2 1.5 2 3.4 2.2-.9A8 8 0 0 0 9 19l.5 2h4L14 19a8 8 0 0 0 2.5-1.4l2.3.9 2-3.4-2-1.5A7 7 0 0 0 19 12z"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  play:'<path d="m8 4 12 8-12 8V4z" fill="currentColor" stroke="none"/>',
  pause:'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
  sparkle:'<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
  shield:'<path d="M12 2 3 6v6c0 6 4 9 9 10 5-1 9-4 9-10V6l-9-4z"/><path d="m8 12 3 3 5-6"/>',
  chart:'<path d="M4 20V12m5 8V8m5 12V4m5 16v-9"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>'
};
for(const el of document.querySelectorAll('[data-i]')){
 const paths=ICONS[el.dataset.i];if(!paths)continue;
 el.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
 el.classList.add('icon');
}
