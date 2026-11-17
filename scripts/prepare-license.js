'use strict';
// Release-only HTTPS key attestation. Never produces a release without a fresh,
// valid Ed25519 signature from the exact configured production Worker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const USER_AGENT = 'DuduAI-ReleaseBuilder/1.3 (signed-license-attestation)';

function validateAttestation(attest, publicKey, now = Date.now()) {
  if (typeof attest?.payload !== 'string' || typeof attest?.signature !== 'string' || attest.payload.length > 1024)
    throw Error('云端公钥证明格式无效');
  const body = Buffer.from(attest.payload, 'base64url');
  const signature = Buffer.from(attest.signature, 'base64url');
  if (signature.length !== 64 || !crypto.verify(null, body, crypto.createPublicKey({
    key: Buffer.from(publicKey, 'base64'), type: 'spki', format: 'der'
  }), signature)) throw Error('云端签发私钥与当前GitHub公钥不匹配，已阻止制作无法激活的安装包');
  const data = JSON.parse(body.toString('utf8'));
  if (data.schema !== 1 || data.product !== 'dudu-ai-workbench' ||
      data.purpose !== 'license-public-key-v1' || !Number.isSafeInteger(data.issuedAt) ||
      Math.abs(now - data.issuedAt) > 120000)
    throw Error('云端公钥证明过期或产品不匹配');
  return true;
}

function parseAttestationJson(raw) {
  if (typeof raw !== 'string' || raw.length > 16384) throw Error('Worker 返回内容长度不符合授权证明格式');
  try { return JSON.parse(raw); }
  catch { throw Error('Worker 返回内容不是有效 JSON；可能是访问验证页、故障页或错误地址'); }
}

function requestViaCurl(url, curlRunner = spawnSync) {
  // Available as curl.exe on Windows 10/11. TLS and hostname verification stay ON.
  // No -k / --insecure, no redirect override, no cached or unsigned payload.
  const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const args = ['--silent', '--show-error', '--fail', '--proto', '=https',
    '--connect-timeout', '12', '--max-time', '30', '--header', 'Accept: application/json',
    '--header', 'User-Agent: ' + USER_AGENT, '--url', url];
  const out = curlRunner(bin, args, {encoding:'utf8', windowsHide:true, timeout:35000, maxBuffer:65536});
  if (out.error || out.status !== 0) {
    // Only publish exit status, never proxy URL, credentials or response body.
    const code = out.status === null || out.status === undefined ? 'launch-error' : out.status;
    throw Error('Windows curl HTTPS 请求失败（退出码 ' + code + '）。请先运行 CHECK_Worker_HTTPS.cmd 排查网络、DNS 和代理。');
  }
  return parseAttestationJson(out.stdout);
}

async function requestViaNode(url, fetchImpl = globalThis.fetch, timeoutMs = 20000) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {accept: 'application/json', 'user-agent': USER_AGENT}
  });
  if (!response.ok) throw Error('云端授权签名接口不可用（HTTP ' + response.status + '）。请检查正式 Worker 是否已部署。');
  return parseAttestationJson(await response.text());
}

async function retrieveAttestation(url, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  try {
    return await requestViaNode(url, fetchImpl, deps.timeoutMs || 20000);
  } catch (e) {
    // A real server response with HTTP error or invalid JSON must be shown, not
    // hidden behind a second transport or silently accepted.
    if (/^云端授权签名接口不可用|^Worker 返回内容/.test(e.message || '')) throw e;
    if (typeof deps.notice === 'function') deps.notice('[AUTH NETWORK] Node HTTPS 无响应或连接失败，正在尝试系统 curl HTTPS。');
    try { return requestViaCurl(url, deps.curlRunner || spawnSync); }
    catch (curlError) {
      const nodeCause = String(e?.cause?.code || e?.code || e?.name || 'network-error').slice(0, 64);
      throw Error('正式授权 Worker 无法访问。Node: ' + nodeCause + '；' + curlError.message +
        ' 这不是签名不匹配；在 Worker 连通前不会生成公开安装包。');
    }
  }
}

async function prepare() {
  const serviceUrl = String(process.env.DUDU_LICENSE_URL || '').trim().replace(/\/+$/, '');
  const publicKey = String(process.env.DUDU_LICENSE_PUBLIC_KEY_B64 || '').trim();
  let url;
  try {
    url = new URL(serviceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.port || url.pathname !== '/') throw Error('invalid');
  } catch { throw Error('DUDU_LICENSE_URL 必须是已部署的HTTPS根地址'); }
  try {
    const key = crypto.createPublicKey({key:Buffer.from(publicKey,'base64'), type:'spki', format:'der'});
    if (key.asymmetricKeyType !== 'ed25519') throw Error('wrong type');
  } catch { throw Error('DUDU_LICENSE_PUBLIC_KEY_B64 不是有效Ed25519 SPKI公钥'); }
  const attestation = await retrieveAttestation(url.origin + '/v1/license/attest', {notice: console.log});
  validateAttestation(attestation, publicKey);
  fs.writeFileSync(path.join(root,'src','license-config.json'), JSON.stringify({serviceUrl:url.origin, publicKey},null,2)+'\n');
  console.log('[AUTH OK] 已验证实时 Cloudflare Ed25519 签名；客户端仅保存 HTTPS 地址与公开验证公钥。');
}
if (require.main === module) prepare().catch(e=>{console.error('[AUTH FAILED] '+e.message);process.exitCode=1});
module.exports = {validateAttestation, requestViaCurl, requestViaNode, retrieveAttestation, prepare};
