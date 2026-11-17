'use strict';
/** Validate the actual Windows ASAR archive, not the readable source folder. */
const fs=require('node:fs');
const path=require('node:path');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
function validateAsar(archive){
 if(!fs.existsSync(archive))throw Error('Missing packaged app.asar: '+archive);
 const files=asar.listPackage(archive).map(s=>s.replace(/\\/g,'/').replace(/^\/+/,''));
 // electron-builder includes the production dependency tree of electron-updater.
 // Permit only the exact modules observed in that locked runtime tree.
 const runtimeModules=new Set(['argparse','builder-util-runtime','debug','electron-updater',
  'fs-extra','graceful-fs','js-yaml','jsonfile','lazy-val','lodash.escaperegexp',
  'lodash.isequal','ms','sax','semver','tiny-typed-emitter','universalify']);
 const blocked=files.filter(f=>{
  const parts=f.split('/');
  if(parts[0]==='node_modules' && (parts.slice(1).includes('node_modules') ||
      (parts[1] && !runtimeModules.has(parts[1]))))return true;
  return parts.some(x=>/^(?:\.private|\.wrangler|\.git|license-service|test-state|Cookies|User Data)$/i.test(x))||
   /(?:^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?|workspace\.json|config\.local\.json|license-config\.local\.json|owner-keys\.json|test-owner-keys\.json|wrangler\.local\.toml|.*\.(?:sqlite|sqlite3|db|pem|pfx|key))$/i.test(f);
 });
 if(blocked.length)throw Error('Release includes forbidden file(s): '+blocked.slice(0,8).join(', '));
 if(files.some(f=>f.startsWith('tests/')||f.startsWith('scripts/')||f.startsWith('cloud-content/')))
  throw Error('Runtime package must not include build/test/backend source');
 const config=JSON.parse(asar.extractFile(archive,'src/license-config.json').toString('utf8'));
 const u=new URL(config.serviceUrl);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.port||u.pathname!=='/'||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname))
  throw Error('Public installer does not point to a real HTTPS authorization endpoint');
 if(!/^[A-Za-z0-9+/]{50,150}={0,2}$/.test(config.publicKey))throw Error('Public Ed25519 verification key missing');
 if(Object.keys(config).some(x=>!/^(serviceUrl|publicKey)$/.test(x)))throw Error('Unexpected credential-like key in public license config');
 const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString('utf8'));
 // electron-builder removes the build stanza from the packaged package.json.
 const releaseBuild=JSON.parse(fs.readFileSync(path.join(root,'release-build.json'),'utf8'));
 if(pkg.version!=='1.3.0'||releaseBuild.appId!=='com.manju.doubao.creativehub.public')
  throw Error('Version or original appId changed in release package/config');
 const mustExist=['src/main.js','src/license-client.js','src/preload.js','src/renderer.js','src/index.html','src/import-core.js'];
 for(const file of mustExist)if(!files.includes(file))throw Error('Missing runtime file: '+file);
 console.log('PASS: ASAR file allowlist, production public-only config, original app identity; checked '+files.length+' entries');
 return {fileCount:files.length,version:pkg.version};
}
if(require.main===module){validateAsar(path.join(root,'release','win-unpacked','resources','app.asar'))}
module.exports={validateAsar};
