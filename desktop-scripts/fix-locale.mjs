import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
function fix(rel,anchor,replacement){
  const file=path.join(root,rel);
  const text=fs.readFileSync(file,'utf8');
  if(!text.includes(anchor))throw new Error('上游变化，无法定位 '+rel+': '+anchor);
  if(text.includes(replacement))return;
  fs.writeFileSync(file,text.replace(anchor,replacement),'utf8');
}
fix('src/workflow/responseLanguage.ts',
  "  'zh-TW': 'Traditional Chinese (zh-TW)',",
  "  'zh-CN': 'Simplified Chinese (zh-CN)',\n  'zh-TW': 'Traditional Chinese (zh-TW)',");
fix('src/workflow/responseLanguage.ts',
  "['en', 'zh-TW', 'ja', 'de']",
  "['en', 'zh-CN', 'zh-TW', 'ja', 'de']");
fix('src/workflow/graph/registries.ts',
  "const conjunction = locale === 'zh-TW' ? '與' : locale === 'de' ? 'und' : 'and';",
  "const conjunction = locale === 'zh-CN' ? '与' : locale === 'zh-TW' ? '與' : locale === 'de' ? 'und' : 'and';");
fix('src/workflow/graph/registries.ts',
  "const separator = locale === 'zh-TW' ? '、' : ', ';",
  "const separator = (locale === 'zh-TW' || locale === 'zh-CN') ? '、' : ', ';");
console.log('Locale policy fixed for zh-CN');
