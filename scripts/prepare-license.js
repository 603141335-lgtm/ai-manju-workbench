'use strict';
// Production build is allowed only if the remote Worker proves its Ed25519
// signing key matches the client-side verification key. Never ships secrets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function validateAttestation(attest,publicKey,now=Date.now()){
 if(typeof attest?.payload!=='string'||typeof attest?.signature!=='string'||attest.payload.length>1024)throw Error('云端公钥证明格式无效');
 const body=Buffer.from(attest.payload,'base64url'),signature=Buffer.from(attest.signature,'base64url');
 if(signature.length!==64||!crypto.verify(null,body,crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'}),signature))
  throw Error('云端签发私钥与当前GitHub公钥不匹配，已阻止制作无法激活的安装包');
 const data=JSON.parse(body.toString('utf8'));
 if(data.schema!==1||data.product!=='dudu-ai-workbench'||data.purpose!=='license-public-key-v1'||!Number.isSafeInteger(data.issuedAt)||Math.abs(now-data.issuedAt)>120000)throw Error('云端公钥证明过期或产品不匹配');
 return true;
}
async function prepare(){
 const serviceUrl=String(process.env.DUDU_LICENSE_URL||'').trim().replace(/\/+$/,'');
 const publicKey=String(process.env.DUDU_LICENSE_PUBLIC_KEY_B64||'').trim();
 let url;
 try{
  url=new URL(serviceUrl);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.port||url.pathname!=='/')throw Error('invalid');
 }catch{throw Error('DUDU_LICENSE_URL 必须是已部署的HTTPS根地址')}
 try{
  const key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'});
  if(key.asymmetricKeyType!=='ed25519')throw Error('wrong type');
 }catch{throw Error('DUDU_LICENSE_PUBLIC_KEY_B64 不是有效Ed25519 SPKI公钥')}
 const r=await fetch(url.origin+'/v1/license/attest',{signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});
 if(!r.ok)throw Error('云端授权签名接口不可用（HTTP '+r.status+'）');
 validateAttestation(await r.json(),publicKey);
 fs.writeFileSync(path.join(root,'src','license-config.json'),JSON.stringify({serviceUrl:url.origin,publicKey},null,2)+'\n');
 console.log('已通过Cloudflare Ed25519签名挑战；验证公钥和真实服务器匹配，生产配置完成。');
}
if(require.main===module)prepare().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={validateAttestation,prepare};
