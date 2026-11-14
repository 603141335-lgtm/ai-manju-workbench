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
-- Idempotent replay defense: signing a request does not authorize reusing its nonce.
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

-- Operations center: additive tables only; existing device/card rows are untouched.
CREATE TABLE IF NOT EXISTS license_applications (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  contact TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  card_id TEXT,
  reviewer_note TEXT,
  created_ms INTEGER NOT NULL,
  reviewed_ms INTEGER,
  FOREIGN KEY(device_hash) REFERENCES devices(device_hash),
  FOREIGN KEY(card_id) REFERENCES license_cards(id)
);
CREATE INDEX IF NOT EXISTS idx_applications_status_created ON license_applications(status,created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_applications_device ON license_applications(device_hash,created_ms DESC);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_fen INTEGER NOT NULL CHECK(price_fen>=0),
  delivery_mode TEXT NOT NULL CHECK(delivery_mode IN ('license_auto_bind','license_key')),
  enabled INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  device_hash TEXT,
  contact TEXT NOT NULL DEFAULT '',
  amount_fen INTEGER NOT NULL CHECK(amount_fen>=0),
  payment_channel TEXT NOT NULL CHECK(payment_channel IN ('wechat','alipay')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','closed','refunded')),
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','delivering','delivered','failed')),
  provider_trade_no TEXT,
  card_id TEXT,
  created_ms INTEGER NOT NULL,
  paid_ms INTEGER,
  delivered_ms INTEGER,
  failure_reason TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(device_hash) REFERENCES devices(device_hash),
  FOREIGN KEY(card_id) REFERENCES license_cards(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(payment_status,delivery_status,created_ms DESC);
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  received_ms INTEGER NOT NULL,
  UNIQUE(channel,provider_event_id)
);
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
