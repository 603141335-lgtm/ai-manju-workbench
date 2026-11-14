-- License records contain no Doubao account, prompt, media, or Windows login credentials.
CREATE TABLE IF NOT EXISTS devices (
  device_hash TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  trial_started_ms INTEGER,
  trial_ends_ms INTEGER
);
CREATE TABLE IF NOT EXISTS license_cards (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  last_four TEXT NOT NULL,
  issued_ms INTEGER NOT NULL,
  bound_device_hash TEXT,
  activated_ms INTEGER,
  revoked_ms INTEGER,
  FOREIGN KEY (bound_device_hash) REFERENCES devices(device_hash)
);
CREATE INDEX IF NOT EXISTS idx_cards_device ON license_cards(bound_device_hash);
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  card_id TEXT,
  occurred_ms INTEGER NOT NULL
);
