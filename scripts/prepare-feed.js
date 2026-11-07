'use strict';
const fs=require('node:fs'),path=require('node:path');
const pkg=require('../package.json');const config=JSON.parse(JSON.stringify(pkg.build));
const url=(process.env.DOUBAO_UPDATE_URL||'').trim();
if(url){
 const p=new URL(url);
 if(p.protocol!=='https:'||p.username||p.password||p.hash||p.search||!url.endsWith('/'))throw Error('DOUBAO_UPDATE_URL must be a clean HTTPS directory URL ending /');
 config.publish=[{provider:'generic',url}];
 console.log('Public updater configured for:',p.origin);
}else console.log('No public HTTPS update feed: manual in-place upgrade only.');
fs.writeFileSync(path.join(__dirname,'..','release-build.json'),JSON.stringify(config,null,2));
