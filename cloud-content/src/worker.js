import adminPage from './admin-page.js';
// 独独AI public content, no accounts, cookies, scripts or project materials.
const MAX_JSON=65536,MAX_IMAGE=2097152;
const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{...headers,'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'}});
async function sha(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')}
async function matchesHash(value,want){
 if(typeof value!=='string'||value.length<32||value.length>200||!/^[0-9a-f]{64}$/i.test(want||''))return false;
 const got=await sha(new TextEncoder().encode(value)),expected=want.toLowerCase();
 let mismatch=0;for(let i=0;i<64;i++)mismatch|=got.charCodeAt(i)^expected.charCodeAt(i);
 return mismatch===0;
}
async function auth(request,env){
 const internal=request.headers.get('X-Dudu-Internal-Token')||'';
 if(internal&&await matchesHash(internal,env.INTERNAL_ADMIN_TOKEN_HASH))return true;
 const bearer=String(request.headers.get('Authorization')||'').replace(/^Bearer\\s+/i,'');
 return matchesHash(bearer,env.ADMIN_TOKEN_HASH);
}
const clean=(x,max=300)=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const validMedia=(v,origin)=>{try{const u=new URL(v);return u.protocol==='https:'&&u.origin===origin&&/^\/media\/[0-9a-f]{64}$/.test(u.pathname)}catch{return false}};
const publicHttps=v=>{try{const u=new URL(v);return u.protocol==='https:'&&u.port===''&&!u.username&&!u.password&&u.hostname!=='localhost'}catch{return false}};
function validate(d,origin){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('JSON清单无效');
 const c=d.community||{},t=d.tutorial||{},n=d.notice||{},r=d.release||{};
 const slides=Array.isArray(t.slides)?t.slides.slice(0,24).map(x=>({
  id:clean(x.id,30),title:clean(x.title,90),description:clean(x.description,400),
  target:clean(x.target,70),imageUrl:clean(x.imageUrl,400),sha256:clean(x.sha256,64).toLowerCase()
 })).filter(x=>/^[a-z0-9-]{1,30}$/i.test(x.id)&&x.title):[];
 if(!slides.length||new Set(slides.map(x=>x.id)).size!==slides.length)throw Error('教程步骤不能为空或编号重复');
 for(const s of slides)if(s.imageUrl&&(!validMedia(s.imageUrl,origin)||!/^[0-9a-f]{64}$/.test(s.sha256)))throw Error('教程图片必须经过后台上传并带SHA256');
 const qr=clean(c.qrUrl,400);if(qr&&!validMedia(qr,origin))throw Error('二维码需上传到官方媒体服务');
 const output={schemaVersion:2,updatedAt:new Date().toISOString(),
  community:{title:clean(c.title,100),headline:clean(c.headline,100),description:clean(c.description,400),subtitle:clean(c.subtitle,220),wechat:clean(c.wechat,80),backupWechat:clean(c.backupWechat,80),qrUrl:qr,qrExpiresAt:clean(c.qrExpiresAt,42),enabled:c.enabled!==false,startup:c.startup!==false,benefits:(Array.isArray(c.benefits)?c.benefits:[]).slice(0,4).map(x=>clean(x,90))},
  tutorial:{version:clean(t.version,40),title:clean(t.title,90),slides},
  notice:{id:clean(n.id,80),title:clean(n.title,100),body:clean(n.body,1200),showHint:n.showHint===true},
  release:{version:clean(r.version,32),title:clean(r.title,100),notes:clean(r.notes,1200),url:publicHttps(r.url)?r.url:''}};
 if(new TextEncoder().encode(JSON.stringify(output)).byteLength>MAX_JSON)throw Error('清单不能超过64KB');
 return output;
}
function mediaType(buffer){
 const b=new Uint8Array(buffer);if(b.length<12||b.length>MAX_IMAGE)return '';
 if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return 'image/png';
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(new TextDecoder().decode(b.subarray(0,4))==='RIFF'&&new TextDecoder().decode(b.subarray(8,12))==='WEBP')return 'image/webp';
 return '';
}
const defaults={schemaVersion:2,community:{wechat:'du4du44',backupWechat:'du6du66',enabled:true,startup:true},tutorial:{version:'1',slides:[]}};
const current=async env=>JSON.parse(await env.DUDU_KV.get('current')||JSON.stringify(defaults));
export default {async fetch(req,env){
 const u=new URL(req.url),p=u.pathname;
 if(p==='/admin'&&req.method==='GET')return new Response(adminPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'"}});
 if(p==='/manifest.json'&&req.method==='GET')return json(await current(env),200,{'cache-control':'public,max-age=60'});
 if(p.startsWith('/media/')&&req.method==='GET'){
  const id=p.split('/').pop();if(!/^[a-f0-9]{64}$/.test(id))return new Response('Not found',{status:404});
  const object=await env.DUDU_MEDIA.get(id);if(!object)return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'}});
 }
 if(!p.startsWith('/api/admin/'))return new Response('Not found',{status:404});
 if(!await auth(req,env))return json({error:'管理员令牌无效'},401);
 if(req.method==='GET'&&p==='/api/admin/manifest')return json(await current(env));
 if(req.method==='GET'&&p==='/api/admin/history'){
  const result=await env.DUDU_KV.list({prefix:'history-',limit:50});
  return json(result.keys.map(x=>x.name));
 }
 if(req.method==='POST'&&p==='/api/admin/upload'){
  if(Number(req.headers.get('content-length')||0)>MAX_IMAGE)return json({error:'图片超过2MB'},413);
  const bytes=await req.arrayBuffer(),kind=mediaType(bytes);
  if(!kind)return json({error:'只接受2MB以内的PNG、JPEG、WebP'},400);
  const id=await sha(bytes);
  await env.DUDU_MEDIA.put(id,bytes,{httpMetadata:{contentType:kind}});
  return json({url:u.origin+'/media/'+id,sha256:id,size:bytes.byteLength});
 }
 if(req.method==='POST'&&p==='/api/admin/rollback'){
   try{
     const value=await req.json(),key=String(value?.key||'');
     if(!/^history-[0-9]{10,20}$/.test(key))throw Error('版本编号无效');
     const historic=await env.DUDU_KV.get(key);
     if(!historic)throw Error('未找到历史版本');
     const restored=validate(JSON.parse(historic),u.origin);
     const body=JSON.stringify(restored);
     await env.DUDU_KV.put('history-'+Date.now(),await env.DUDU_KV.get('current')||body,{expirationTtl:90*24*3600});
     await env.DUDU_KV.put('current',body);
     return json({ok:true,updatedAt:restored.updatedAt});
   }catch(err){return json({error:err.message},400)}
 }
 if(req.method==='POST'&&p==='/api/admin/publish'){
  if(Number(req.headers.get('content-length')||0)>MAX_JSON)return json({error:'配置超过64KB'},413);
  try{const output=validate(await req.json(),u.origin),body=JSON.stringify(output);
   await env.DUDU_KV.put('history-'+Date.now(),body,{expirationTtl:90*24*3600});
   await env.DUDU_KV.put('current',body);
   return json({ok:true,updatedAt:output.updatedAt,slides:output.tutorial.slides.length});
  }catch(err){return json({error:err.message},400)}
 }
 return new Response('Not found',{status:404});
}};
