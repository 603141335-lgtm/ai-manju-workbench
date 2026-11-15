-- Local-only fixture. No production users, devices, cards, orders, or payment secrets.
INSERT INTO products(product_id,name,description,price_cents,entitlement_type,enabled,sort_order,created_ms,updated_ms)
VALUES('v13-test-product','V1.3 本机测试商品','仅用于本机模拟支付和退款，不产生真实资金',990,'permanent',1,0,0,0)
ON CONFLICT(product_id) DO UPDATE SET
  name=excluded.name,
  description=excluded.description,
  price_cents=excluded.price_cents,
  entitlement_type=excluded.entitlement_type,
  enabled=excluded.enabled,
  sort_order=excluded.sort_order,
  updated_ms=0;
