// Run locally. Never commit/share the private signing key.
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const secret=randomBytes(40).toString('hex');
console.log('DUDU_SIGNING_PRIVATE_PKCS8_B64 (Cloudflare secret): '+privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));
console.log('DUDU_LICENSE_PUBLIC_KEY_B64 (GitHub variable): '+publicKey.export({type:'spki',format:'der'}).toString('base64'));
console.log('DUDU_DEVICE_HMAC_KEY (Cloudflare secret): '+randomBytes(48).toString('hex'));
console.log('DUDU_CARD_HMAC_KEY (Cloudflare secret): '+randomBytes(48).toString('hex'));
console.log('DUDU_ADMIN_TOKEN (save securely, input at /admin): '+secret);
console.log('DUDU_ADMIN_TOKEN_SHA256 (Cloudflare secret): '+createHash('sha256').update(secret).digest('hex'));
