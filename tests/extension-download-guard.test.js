'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isAllowedExtensionPage,isAllowedExtensionMediaUrl,sanitizeExtensionFilename}=require('../src/extension-download-guard');
test('only real secure Doubao and Dola pages may request downloads',()=>{
  for(const u of ['https://www.doubao.com/chat/','https://www.dola.com/'])assert.equal(isAllowedExtensionPage(u),true,u);
  for(const u of ['http://www.doubao.com/chat','https://doubao.com','https://www.doubao.com.evil.org/x','https://www.doubao.com:444/x','https://evil.org','file:///x','not a url'])assert.equal(isAllowedExtensionPage(u),false,u);
});
test('media download destinations are locked to HTTPS approved origins',()=>{
  for(const u of ['https://v.ibyteimg.com/file.mp4?token=a','https://video.bytecdn.cn/v','https://www.doubao.com/file.mp4'])assert.equal(isAllowedExtensionMediaUrl(u),true,u);
  for(const u of ['https://ibyteimg.com.evil.org/x','http://ibyteimg.com/x','https://localhost/x','https://127.0.0.1/x','https://example.com/x','file:///etc/passwd','https://user:pass@ibyteimg.com/x','blob:https://www.doubao.com/x'])assert.equal(isAllowedExtensionMediaUrl(u),false,u);
});
test('generated media filenames cannot contain paths or executable extensions',()=>{
  assert.equal(sanitizeExtensionFilename('nested\\folder/视频.mp4'),'视频.mp4');
  assert.equal(sanitizeExtensionFilename('foo?bar.MP4'),'foo_bar.MP4');
  for(const s of ['../bad.exe','nested/bad.js','bad.html','unknown','../'])assert.throws(()=>sanitizeExtensionFilename(s));
});
