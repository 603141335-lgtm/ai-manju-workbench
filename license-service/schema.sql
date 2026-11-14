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

-- Operations center: additive tables only. Existing device, card, nonce and audit rows stay intact.
CREATE TABLE IF NOT EXISTS license_applications (
  application_id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  contact TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_ms INTEGER NOT NULL,
  reviewed_ms INTEGER,
  review_note TEXT NOT NULL DEFAULT '',
  card_id TEXT,
  FOREIGN KEY(card_id) REFERENCES license_cards(id)
);
CREATE INDEX IF NOT EXISTS idx_applications_status_created
  ON license_applications(status, created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_applications_device_created
  ON license_applications(device_hash, created_ms DESC);

CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents > 0),
  entitlement_type TEXT NOT NULL DEFAULT 'permanent' CHECK(entitlement_type = 'permanent'),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_enabled_sort ON products(enabled, sort_order, created_ms);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  device_hash TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('wechat','alipay')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','closed','refunded')),
  provider_trade_no TEXT,
  checkout_data TEXT NOT NULL DEFAULT '{}',
  created_ms INTEGER NOT NULL,
  paid_ms INTEGER,
  delivered_ms INTEGER,
  refunded_ms INTEGER,
  updated_ms INTEGER NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_device_created ON orders(device_hash, created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_ms DESC);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  order_no TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_no, created_ms DESC);

-- A unique outbox row per paid order makes delivery idempotent under duplicate callbacks.
-- It stores only the card HMAC, never the plaintext card code.
CREATE TABLE IF NOT EXISTS delivery_outbox (
  delivery_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  card_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  last_four TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  delivered_ms INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(order_id) REFERENCES orders(order_id)
);

-- Public workbench content is served by the same Worker as licensing.
-- This avoids a second admin login and keeps the desktop client's public manifest URL stable.
CREATE TABLE IF NOT EXISTS public_content (
  content_id INTEGER PRIMARY KEY CHECK(content_id = 1),
  manifest_json TEXT NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS public_content_history (
  history_id TEXT PRIMARY KEY,
  manifest_json TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_content_history_created
  ON public_content_history(created_ms DESC);

