'use strict';
// Explicitly fail closed: never ship a production Windows installer with
// missing public signing key or absent cloud authorization endpoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const serviceUrl=String(process.env.DUDU_LICENSE_URL||'').trim().replace(/\/+$/,'');
const publicKey=String(process.env.DUDU_LICENSE_PUBLIC_KEY_B64||'').trim();
let url;
try{url=new URL(serviceUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.port||url.pathname!=='/')throw Error('invalid')}catch{throw Error('DUDU_LICENSE_URL 必须是已部署的HTTPS服务根地址；禁止发布无法激活的安装包')}
try{const key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'});if(key.asymmetricKeyType!=='ed25519')throw Error('wrong key type')}catch{throw Error('DUDU_LICENSE_PUBLIC_KEY_B64 必须是Ed25519 SPKI DER公钥Base64，不能是私钥')}
const file=path.resolve(__dirname,'../src/license-config.json');
fs.writeFileSync(file,JSON.stringify({serviceUrl:url.origin,publicKey},null,2)+'\n');
console.log('LICENSE CONFIG OK: public server and Ed25519 verify key embedded, never private signing key');
