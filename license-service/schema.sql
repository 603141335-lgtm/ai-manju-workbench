-- Existing license tables are preserved. Operations-center additions are additive only.
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
  batch_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  FOREIGN KEY (bound_device_hash) REFERENCES devices(device_hash)
);
CREATE INDEX IF NOT EXISTS idx_cards_device ON license_cards(bound_device_hash);
CREATE INDEX IF NOT EXISTS idx_cards_issued ON license_cards(issued_ms DESC);
CREATE TABLE IF NOT EXISTS request_nonces (
  device_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  PRIMARY KEY(device_hash,nonce)
);
CREATE INDEX IF NOT EXISTS idx_nonce_age ON request_nonces(created_ms);
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  card_id TEXT,
  occurred_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS license_applications (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approving','approved','rejected')),
  created_ms INTEGER NOT NULL,
  reviewed_ms INTEGER,
  review_note TEXT NOT NULL DEFAULT '',
  card_id TEXT,
  FOREIGN KEY (device_hash) REFERENCES devices(device_hash),
  FOREIGN KEY (card_id) REFERENCES license_cards(id)
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON license_applications(status,created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_applications_device ON license_applications(device_hash,created_ms DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_application_per_device ON license_applications(device_hash) WHERE status='pending';
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_fen INTEGER NOT NULL DEFAULT 0 CHECK(price_fen>=0),
  delivery_mode TEXT NOT NULL DEFAULT 'license' CHECK(delivery_mode IN ('license','manual')),
  license_type TEXT NOT NULL DEFAULT 'permanent',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  device_hash TEXT,
  product_id TEXT NOT NULL,
  amount_fen INTEGER NOT NULL CHECK(amount_fen>=0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  payment_provider TEXT NOT NULL DEFAULT '',
  provider_trade_no TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunding','refunded','closed','failed')),
  delivery_status TEXT NOT NULL DEFAULT 'waiting' CHECK(delivery_status IN ('waiting','processing','delivered','failed','manual')),
  card_id TEXT,
  created_ms INTEGER NOT NULL,
  paid_ms INTEGER,
  delivered_ms INTEGER,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (card_id) REFERENCES license_cards(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status,delivery_status);
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_ms INTEGER NOT NULL,
  processed_ms INTEGER,
  result TEXT NOT NULL DEFAULT 'received',
  UNIQUE(provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS admin_audit_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT 'owner',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  occurred_ms INTEGER NOT NULL
);
