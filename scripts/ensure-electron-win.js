'use strict';
/**
 * Windows Electron 44.x runtime acquisition with authenticated offline fallback.
 * 1. Use an already-valid installation in the isolated staging directory.
 * 2. Accept a browser-downloaded official zip only after verifying the SHA256
 *    against electron/checksums.json from the lockfile-pinned npm package.
 * 3. Invoke the PINNED package's own install.js with official then documented
 *    npmmirror sources; do not use npx/npm exec to select another tool/version.
 * Does not write to the user's original repository or production profile.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const OFFICIAL_BASE = 'https://github.com/electron/electron/releases/download/';
const FALLBACK_BASE = 'https://npmmirror.com/mirrors/electron/';

function pinnedInfo(root = DEFAULT_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const installedPkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8'));
  const version = manifest.devDependencies?.electron;
  if (!/^\d+\.\d+\.\d+$/.test(version) || installedPkg.version !== version) {
    throw new Error('Electron 版本不一致：请先运行 npm ci，不允许安装其他版本代替锁定版本。');
  }
  const filename = `electron-v${version}-win32-x64.zip`;
  const checksumFile = path.join(root, 'node_modules/electron/checksums.json');
  const checksums = JSON.parse(fs.readFileSync(checksumFile, 'utf8'));
  const sha256 = checksums[filename];
  if (!/^[a-f0-9]{64}$/.test(sha256 || '')) {
    throw new Error(`缺少 ${filename} 的官方 SHA256 校验值。`);
  }
  return { version, filename, sha256 };
}

function runtimePaths(root = DEFAULT_ROOT) {
  const electronDir = path.join(root, 'node_modules', 'electron');
  return {
    electronDir,
    installer: path.join(electronDir, 'install.js'),
    dist: path.join(electronDir, 'dist'),
    exe: path.join(electronDir, 'dist', 'electron.exe'),
    version: path.join(electronDir, 'dist', 'version'),
    pathTxt: path.join(electronDir, 'path.txt'),
  };
}

function runtimeReady(root, version) {
  const p = runtimePaths(root);
  try {
    return fs.statSync(p.exe).size > 5 * 1024 * 1024 &&
      fs.readFileSync(p.version, 'utf8').trim().replace(/^v/, '') === version &&
      fs.readFileSync(p.pathTxt, 'utf8').trim() === 'electron.exe';
  } catch { return false; }
}

function offlineCandidates(filename, env = process.env, root = DEFAULT_ROOT) {
  const candidates = [];
  if (env.DUDU_ELECTRON_ZIP_PATH) {
    candidates.push(path.resolve(env.DUDU_ELECTRON_ZIP_PATH.trim().replace(/^"|"$/g, '')));
  }
  candidates.push(path.join(path.dirname(root), filename));
  candidates.push(path.join(root, filename));
  if (env.USERPROFILE) candidates.push(path.join(env.USERPROFILE, 'Downloads', filename));
  return [...new Set(candidates)];
}

async function sha256File(filename) {
  return await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filename);
    const hash = crypto.createHash('sha256');
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function installVerifiedOfflineZip(root, filename, expectedHash, version) {
  if (!fs.existsSync(filename)) return false;
  const fullPath = path.resolve(filename);
  const actual = await sha256File(fullPath);
  if (actual !== expectedHash) {
    throw new Error(`[SECURITY] 离线 ZIP SHA256 不匹配：${fullPath}。请删除错误下载，不要跳过验证。`);
  }
  const p = runtimePaths(root);
  const { extract } = require(path.join(root, 'node_modules/@electron-internal/extract-zip'));
  console.log(`[ELECTRON] 离线文件通过官方 SHA256 校验：${path.basename(fullPath)}`);
  await fsp.rm(p.dist, { recursive: true, force: true });
  await fsp.mkdir(p.dist, { recursive: true });
  await extract(fullPath, { dir: p.dist });
  await fsp.writeFile(p.pathTxt, 'electron.exe', 'utf8');
  if (!runtimeReady(root, version)) {
    throw new Error('[ELECTRON] 离线 ZIP 解压后版本或文件不完整，已停止发布。');
  }
  return true;
}

function downloadAttempts(env = process.env) {
  const attempts = [];
  if (env.ELECTRON_MIRROR) {
    if (!env.ELECTRON_MIRROR.startsWith('https://')) {
      throw new Error('自定义 ELECTRON_MIRROR 必须使用 HTTPS。');
    }
    attempts.push({ name: '用户指定镜像', mirror: env.ELECTRON_MIRROR, customDir: env.ELECTRON_CUSTOM_DIR || undefined });
  }
  attempts.push({ name: 'Electron 官方 GitHub Releases', mirror: OFFICIAL_BASE, customDir: 'v{{ version }}' });
  // Electron's official documentation lists npmmirror's version-without-v path.
  attempts.push({ name: '官方文档列出的 npmmirror 镜像', mirror: FALLBACK_BASE, customDir: '{{ version }}' });
  return attempts.filter((item, i, all) => all.findIndex(a => a.mirror === item.mirror && a.customDir === item.customDir) === i);
}

function tryInstallAttempt(root, attempt, env = process.env, spawn = spawnSync) {
  const runtime = runtimePaths(root);
  const childEnv = { ...env, ELECTRON_MIRROR: attempt.mirror, ELECTRON_CUSTOM_DIR: attempt.customDir,
    ELECTRON_INSTALL_PLATFORM: 'win32', ELECTRON_INSTALL_ARCH: 'x64', DEBUG: '@electron/get*' };
  delete childEnv.ELECTRON_CUSTOM_FILENAME;
  delete childEnv.ELECTRON_CUSTOM_VERSION;
  const result = spawn(process.execPath, [runtime.installer], {
    cwd: root, stdio: 'inherit', env: childEnv, timeout: 15 * 60 * 1000,
  });
  return result.status === 0 && !result.error;
}

async function ensureElectron(root = DEFAULT_ROOT, env = process.env, spawn = spawnSync) {
  if (process.platform !== 'win32' && !env.DUDU_ELECTRON_ALLOW_TEST_PLATFORM) {
    throw new Error('此修复仅用于 Windows x64 正式构建。');
  }
  const { version, filename, sha256 } = pinnedInfo(root);
  if (env.DUDU_ELECTRON_ZIP_PATH &&
      !fs.existsSync(path.resolve(env.DUDU_ELECTRON_ZIP_PATH.trim().replace(/^"|"$/g, '')))) {
    throw new Error('指定的 Electron 离线 ZIP 不存在，请重新选择文件或清空该设置。');
  }
  if (runtimeReady(root, version)) {
    console.log(`[ELECTRON] 已存在正确运行文件：v${version} win32-x64`);
    return;
  }
  for (const candidate of offlineCandidates(filename, env, root)) {
    if (fs.existsSync(candidate)) {
      await installVerifiedOfflineZip(root, candidate, sha256, version);
      return;
    }
  }
  const p = runtimePaths(root);
  if (!fs.existsSync(p.installer)) {
    throw new Error('缺少锁定的 node_modules/electron/install.js；请先运行 npm ci。');
  }
  for (const attempt of downloadAttempts(env)) {
    console.log(`[ELECTRON] 正在尝试：${attempt.name}`);
    const success = tryInstallAttempt(root, attempt, env, spawn);
    if (success && runtimeReady(root, version)) {
      console.log(`[ELECTRON] 安装成功并验证版本：v${version} win32-x64`);
      return;
    }
    console.warn(`[ELECTRON] ${attempt.name} 未成功，尝试下一来源。`);
  }
  console.error(`[NEXT] 通过浏览器下载 Electron v${version} Windows x64：`);
  console.error(`https://github.com/electron/electron/releases/download/v${version}/${filename}`);
  console.error(`[NEXT] 保存为 Downloads\\${filename}，然后重新点击 GUI 中的“正式制作安装 EXE”。`);
  console.error('[NEXT] 也可以在图形界面选择离线 ZIP。文件将自动与 Electron npm 包的官方 SHA256 校验，不需要额外手动填哈希。');
  console.error('[NEXT] 若浏览器也无法访问 GitHub，可尝试官网文档中的 npmmirror：');
  console.error(`${FALLBACK_BASE}${version}/${filename}`);
  throw new Error('Electron Windows 运行文件下载失败，已保留日志；请使用浏览器离线 ZIP 导入。');
}

if (require.main === module) {
  ensureElectron().catch((error) => {
    console.error('[ELECTRON FAILED]', error.message);
    process.exitCode = 1;
  });
}
module.exports = { pinnedInfo, runtimePaths, runtimeReady, offlineCandidates, sha256File,
  installVerifiedOfflineZip, downloadAttempts, tryInstallAttempt, ensureElectron };
