'use strict';
// Called once during a PUBLIC build. Only the JSON URL is bundled; there are never credentials.
const fs=require('node:fs'),path=require('node:path');
const {safeHttps}=require('../src/notice-service');
const input=(process.env.DOUBAO_NOTICE_URL||'').trim();
if(input&&!safeHttps(input))throw Error('DOUBAO_NOTICE_URL must be a public HTTPS URL without credentials.');
const config={noticeUrl:input};
fs.writeFileSync(path.join(__dirname,'../src/public-config.json'),JSON.stringify(config,null,2)+'\n');
console.log(input?'Public notice endpoint configured.':'No public notice URL: offline placeholder mode.');
