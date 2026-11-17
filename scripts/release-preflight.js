'use strict';
/* Read-only release guard. Intended to run before any dependency download.
   It never touches Cloudflare, D1 or any userData folder. */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const builder=JSON.parse(fs.readFileSync(path.join(root,'release-build.json'),'utf8'));
const fail=(s)=>{throw Error('[RELEASE PREFLIGHT] '+s)};
if(pkg.version!=='1.3.0'||lock.version!==pkg.version||lock.packages?.['']?.version!==pkg.version)fail('V1.3 package / lockfile versions disagree');
if(builder.appId!=='com.manju.doubao.creativehub.public'||pkg.build.appId!==builder.appId)fail('Original installed identity changed');
if(builder.productName!=='独独AI工作台'||builder.win?.executableName!=='独独AI工作台')fail('Workbench identity changed');
if(builder.win?.artifactName!=='DuduAI-Workbench-Setup-v${version}-x64.${ext}')fail('Installer must have an ASCII filename');
if(!builder.win?.target?.some(x=>x.target==='nsis'&&x.arch?.includes('x64')))fail('Windows x64 NSIS installer not configured');
if(builder.nsis?.deleteAppDataOnUninstall!==false||!builder.nsis?.createDesktopShortcut)fail('Uninstall must preserve user data and desktop shortcut');
if(!builder.asar||!builder.asarUnpack?.includes('native/*.node'))fail('ASAR and native addon handling changed');
const included=(builder.files||[]).filter(s=>!s.startsWith('!'));
if(!included.includes('src/**/*')||!included.includes('native/*.node')||included.some(s=>/license-service|node_modules|\.private|\.env|\.dev\.vars|tests|\.wrangler|Cookies|User Data/i.test(s)))
 fail('Release file inclusion list permits unexpected files');
for(const relative of ['src/main.js','src/license-client.js','src/index.html','src/license-config.json','native-core/Cargo.toml','scripts/prepare-license.js','scripts/harden.js','scripts/replace-with-native.js','scripts/verify-package-boundary.js','scripts/build-release-win.ps1','assets/branding/dudu-icon.svg']){
 if(!fs.existsSync(path.join(root,relative)))fail('Missing required original source: '+relative);
}
const src=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
if(!src.includes("'DoubaoCreativeHubLocalTest':'DoubaoCreativeHubPublic'"))fail('Original userData and local test profile paths changed');
if(!src.includes("!app.isPackaged&&process.env.DUDU_LOCAL_TEST_PROFILE==='1'"))fail('Production profile isolation changed');
const guard=fs.readFileSync(path.join(root,'scripts/build-release-win.ps1'),'utf8');
if(!guard.includes("@('run','license:prepare')")||!guard.includes("@('run','verify:release')"))fail('Production authorization or actual ASAR verification missing');
if(!guard.includes('DUDU_LICENSE_PUBLIC_KEY_B64')||!guard.includes('DUDU_LICENSE_URL'))fail('Production license inputs missing');
if(/\bwrangler\s+deploy\b|\bd1\s+(?:create|execute)\s+--remote\b/i.test(guard))fail('Release build must never deploy or mutate production backend');
console.log('PASS: v1.3.0 source, app identity, Windows NSIS, isolated userData, public-only release boundary.');
