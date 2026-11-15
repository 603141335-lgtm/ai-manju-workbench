import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=join(root,'双击启动V13本机测试环境.bat');
const bytes=readFileSync(file);
const source=bytes.toString('utf8');
const errors=[];
if(source.includes('\uFFFD')) errors.push('invalid UTF-8');
if(!/^[\x00-\x7F]*$/.test(source)) errors.push('launcher must contain ASCII only');
if(/(?<!\r)\n/.test(source)) errors.push('LF-only line ending found');
if(!source.includes('\r\n')) errors.push('CRLF line endings missing');
if(!/\r\npause\r\n/.test(source)) errors.push('pause safety stop missing');
if(errors.length){console.error('Windows launcher validation failed: '+errors.join('; '));process.exitCode=1;}
else console.log('Windows launcher format OK: ASCII, CRLF and pause verified.');
