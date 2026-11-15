'use strict';
// Called once during a PUBLIC build. Only the JSON URL is bundled; there are never credentials.
const fs=require('node:fs'),path=require('node:path');
const {safeHttps}=require('../src/notice-service');
const defaultUrl='https://raw.githubusercontent.com/603141335-lgtm/doubao-creative-hub-notices/main/notice.json';
const input=(process.env.DUDU_CONTENT_URL||process.env.DOUBAO_NOTICE_URL||defaultUrl).trim();
if(input&&!safeHttps(input))throw Error('DUDU_CONTENT_URL must be a public HTTPS URL without credentials.');
const config={noticeUrl:input};
fs.writeFileSync(path.join(__dirname,'../src/public-config.json'),JSON.stringify(config,null,2)+'\n');
console.log('Public remote content endpoint: '+input+' (must be deployed before cloud content is available).');
