'use strict';
// A feed must be owned by the publisher, must be HTTPS and serve the
// corresponding latest.yml and NSIS EXE. Private GitHub access tokens must
// never be embedded into a client application.
const fs=require('node:fs');const path=require('node:path');
const input=path.resolve(__dirname,'../electron-builder-doubao.yml');
const output=path.resolve(__dirname,'../electron-builder.release.yml');
let yaml=fs.readFileSync(input,'utf8');
const address=(process.env.DOUBAO_UPDATE_URL||'').trim();
if(address){
 const url=new URL(address);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('DOUBAO_UPDATE_URL must be a clean public HTTPS directory URL');
 if(!address.endsWith('/'))throw Error('DOUBAO_UPDATE_URL must end with /');
 yaml+='\npublish:\n  - provider: generic\n    url: '+JSON.stringify(address)+'\n';
 console.log('Enabled HTTPS update channel: '+url.origin);
}else{
 console.log('No HTTPS update feed configured: installer supports in-place manual upgrades only.');
}
fs.writeFileSync(output,yaml);
