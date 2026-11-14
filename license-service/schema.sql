-- Additive schema for Dudu AI Operations Center v1.0.
-- Existing devices, license_cards, request_nonces and admin_audit are intentionally untouched.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_fen INTEGER NOT NULL DEFAULT 0,
  entitlement_type TEXT NOT NULL DEFAULT 'permanent',
  delivery_mode TEXT NOT NULL DEFAULT 'bind',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS license_applications (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_ms INTEGER NOT NULL,
  reviewed_ms INTEGER,
  review_note TEXT NOT NULL DEFAULT '',
  card_id TEXT,
  card_last_four TEXT,
  approval_lock TEXT
);
CREATE INDEX IF NOT EXISTS idx_applications_status_time ON license_applications(status,created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_applications_device_time ON license_applications(device_hash,created_ms DESC);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  device_hash TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  provider TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  provider_transaction_id TEXT,
  pay_payload TEXT NOT NULL DEFAULT '',
  expires_ms INTEGER NOT NULL,
  created_ms INTEGER NOT NULL,
  paid_ms INTEGER,
  updated_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_device_time ON orders(device_hash,created_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_time ON orders(payment_status,created_ms DESC);
CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL,
  provider TEXT NOT NULL,
  received_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_deliveries (
  order_no TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  delivery_mode TEXT NOT NULL,
  delivered_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_audit_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  occurred_ms INTEGER NOT NULL
);
INSERT OR IGNORE INTO products
(id,name,description,price_fen,entitlement_type,delivery_mode,enabled,created_ms,updated_ms)
VALUES
('dudu-ai-workbench-permanent','独独AI工作台永久授权','单台设备永久授权，付款成功后自动绑定当前电脑。',0,'permanent','bind',0,unixepoch()*1000,unixepoch()*1000);
