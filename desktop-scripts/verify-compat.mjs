// Update upstream tests for intentionally added zh-CN locale.
// Keep original default settings as 'system'/'light' to avoid migration surprises.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const file=path.join(root,'src/__tests__/i18n.test.ts');
let s=fs.readFileSync(file,'utf8');
const changes=[
  ["['system', 'en', 'zh-TW', 'ja', 'de']","['system', 'en', 'zh-CN', 'zh-TW', 'ja', 'de']"],
  ["['auto', 'en', 'zh-TW', 'ja', 'de']","['auto', 'en', 'zh-CN', 'zh-TW', 'ja', 'de']"],
  ["expect(resolveLocale('system', ['zh'])).toBe('zh-TW');","expect(resolveLocale('system', ['zh'])).toBe('zh-CN');"],
  ["expect(resolveLocale('system', ['zh-CN'])).toBe('zh-TW');","expect(resolveLocale('system', ['zh-CN'])).toBe('zh-CN');"],
];
for(const [from,to] of changes){
  if(!s.includes(from))throw new Error('Upstream test changed: '+from);
  s=s.replace(from,to);
}
s=s.replace(
  "import { zhTW } from '../i18n/zh-TW';",
  "import { zhTW } from '../i18n/zh-TW';\nimport { zhCN } from '../i18n/zh-CN';"
);
s=s.replace(
  "const dictionaries = { en, 'zh-TW': zhTW, ja, de } as const;",
  "const dictionaries = { en, 'zh-CN': zhCN, 'zh-TW': zhTW, ja, de } as const;"
);
fs.writeFileSync(file,s);
console.log('Updated locale tests for zh-CN');
