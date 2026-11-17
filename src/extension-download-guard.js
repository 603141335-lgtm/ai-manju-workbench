'use strict';
// Only allow signed media downloads from known Doubao infrastructure.
const PAGE_HOSTS=new Set(['www.doubao.com','www.dola.com']);
const MEDIA_SUFFIXES=Object.freeze([
  'doubao.com','dola.com','byteimg.com','ibyteimg.com','ciciai.com',
  'bytecdn.cn','byteoversea.com','bytedance.com','bytedance.net','snssdk.com',
  'bytedapm.com','tiktokcdn.com','tiktokcdn-us.com','volces.com','volcengine.com','bytegoofy.com'
]);
const FILE_TYPES=new Set(['.mp4','.mov','.webm','.mkv','.png','.jpg','.jpeg','.webp','.gif']);
function isAllowedExtensionPage(raw){
  try {
    const u=new URL(String(raw));
    return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&PAGE_HOSTS.has(u.hostname);
  } catch{return false}
}
function isAllowedExtensionMediaUrl(raw){
  try {
    const u=new URL(String(raw));
    return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&
      MEDIA_SUFFIXES.some(s=>u.hostname===s||u.hostname.endsWith('.'+s));
  } catch{return false}
}
function sanitizeExtensionFilename(value){
  const basename=String(value||('doubao_'+Date.now()+'.mp4')).split(/[\\/]/).pop()||'';
  const safe=basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,160).replace(/[. ]+$/,'');
  const ext=safe.toLowerCase().match(/\.[a-z0-9]{1,9}$/)?.[0];
  if(!FILE_TYPES.has(ext))throw Error('扩展下载文件类型不受支持');
  return safe;
}
module.exports={isAllowedExtensionPage,isAllowedExtensionMediaUrl,sanitizeExtensionFilename};
