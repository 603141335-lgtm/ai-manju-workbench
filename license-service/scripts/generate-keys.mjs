// This script never prints owner secrets. Run locally and keep the output offline.
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..','.private');
const outfile=join(root,'owner-keys.json');
export function ensureOwnerKeys(){
 mkdirSync(root,{recursive:true,mode:0o700});
 if(existsSync(outfile)){
  const data=JSON.parse(readFileSync(outfile,'utf8'));
  if(!data.DUDU_SIGNING_PRIVATE_PKCS8_B64||!data.DUDU_LICENSE_PUBLIC_KEY_B64)throw Error('旧密钥文件损坏，不能自动更换，否则已发放授权无法续签');
  return {path:outfile,data,created:false};
 }
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const adminToken=randomBytes(40).toString('hex');
 const data={
  DUDU_SIGNING_PRIVATE_PKCS8_B64:privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),
  DUDU_LICENSE_PUBLIC_KEY_B64:publicKey.export({type:'spki',format:'der'}).toString('base64'),
  DUDU_DEVICE_HMAC_KEY:randomBytes(48).toString('hex'),
  DUDU_CARD_HMAC_KEY:randomBytes(48).toString('hex'),
  DUDU_ADMIN_TOKEN:adminToken,
  DUDU_ADMIN_TOKEN_SHA256:createHash('sha256').update(adminToken).digest('hex')
 };
 writeFileSync(outfile,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 return {path:outfile,data,created:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const x=ensureOwnerKeys();
 console.log('本地密钥'+(x.created?'已安全生成':'已存在，未更改')+'：'+x.path);
 console.log('GitHub Variable DUDU_LICENSE_PUBLIC_KEY_B64：'+x.data.DUDU_LICENSE_PUBLIC_KEY_B64);
 console.log('不要复制私钥、管理员口令或HMAC密钥到GitHub源码或聊天记录。');
}
