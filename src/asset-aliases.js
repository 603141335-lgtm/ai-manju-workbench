'use strict';

/**
 * Explicit aliases for legacy/reference labels that should resolve to a canonical asset ID.
 * The default I02 -> A02 mapping is user-requested; additional aliases can be edited in
 * %APPDATA%/DoubaoCreativeHubPublic/asset-aliases.json.
 */
const DEFAULT_ALIASES = Object.freeze({
  I02: Object.freeze({ code: 'A02', label: '杜老师' })
});

function keyOf(value) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s＿－–—_]/g, '')
    .replace(/-+/g, '-');
}

function validCode(value) {
  return /^(?:AG|BL|[ABCDEIK])\d{2,3}(?:-\d{2})?$/.test(String(value || ''));
}

let aliases = new Map(Object.entries(DEFAULT_ALIASES).map(([key, value]) => [
  keyOf(key),
  { code: value.code, label: value.label }
]));

function configureAssetAliases(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('资产别名配置必须是对象');
  }
  const next = new Map();
  for (const [rawAlias, rawValue] of Object.entries(input).slice(0, 500)) {
    const alias = keyOf(rawAlias);
    const value = typeof rawValue === 'string' ? { code: rawValue, label: '' } : rawValue;
    const code = keyOf(value?.code);
    if (!validCode(alias) || !validCode(code)) continue;
    const label = String(value?.label || '').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 24);
    next.set(alias, { code, label });
  }
  aliases = next;
  return getAssetAliases();
}

function resolveAssetCode(raw) {
  const key = keyOf(raw);
  return aliases.get(key)?.code || key;
}

function resolveAssetLabel(raw) {
  return aliases.get(keyOf(raw))?.label || '';
}

function getAssetAliases() {
  return Object.fromEntries([...aliases.entries()].map(([key, value]) => [key, { ...value }]));
}

function getDefaultAssetAliases() {
  return Object.fromEntries(Object.entries(DEFAULT_ALIASES).map(([key, value]) => [key, { ...value }]));
}

module.exports = {
  configureAssetAliases,
  resolveAssetCode,
  resolveAssetLabel,
  getAssetAliases,
  getDefaultAssetAliases
};
