# 独独AI运营管理中心 V1.0 部署与验收清单

## 当前状态

- 管理后台与授权服务：开发分支已实现，需通过 CI 和部署验收。
- 免费卡密申请：设备签名提交、按设备查询、人工审批、通过后可直接绑定设备。
- 卡密中心：复用现有卡密签发、列表、停用和解绑接口。
- 内容管理：通过 Cloudflare Service Binding 代理到现有 `dudu-ai-content` Worker。
- 商品、订单、支付事件、发货队列：已建立增量 D1 表和管理页面。
- 微信支付/支付宝真实收款：当前明确关闭；支付下单、通知验签、退款和自动发货尚未交付，不得启用商品销售。

## 备份与分支

- 原始分支：`feature/dudu-ai-v1.2.1-license-network`
- 备份分支：`backup/pre-operations-center-2026-11-14`
- 开发分支：`feature/dudu-operations-center-v1.0`

## Cloudflare 部署前检查

1. 确认 `dudu-ai-license` 和 `dudu-ai-content` 两个 Worker 均部署在同一个 Cloudflare 账户，且内容 Worker 服务名确实为 `dudu-ai-content`。
2. 确认授权 Worker 的 D1 绑定仍为现有 `dudu-license` 数据库。
3. 先备份 D1 数据库，再应用 `license-service/schema.sql`。本次新增表均使用 `CREATE TABLE IF NOT EXISTS`，不删除或重建现有 devices、license_cards 等表。
4. 配置授权 Worker 的 Service Binding：binding 为 `CONTENT`，service 为 `dudu-ai-content`。
5. 统一管理后台令牌：授权 Worker 的 `DUDU_ADMIN_TOKEN_SHA256` 与内容 Worker 的 `ADMIN_TOKEN_HASH` 应为同一个管理员原始令牌的 SHA-256 小写十六进制摘要。原始令牌只由管理员输入，不写入仓库。
6. 确认 Cloudflare Access 对管理后台路径启用身份保护，并要求管理员账号使用 MFA。
7. 先部署内容 Worker（若有改动），再部署授权 Worker。
8. 验证 `/health`、`/admin`、`/content-admin`、卡密接口和公告内容读取。

## 当前已使用的 Worker Secrets

授权 Worker 原有密钥保持不变：
- `DUDU_SIGNING_PRIVATE_PKCS8_B64`
- `DUDU_DEVICE_HMAC_KEY`
- `DUDU_CARD_HMAC_KEY`
- `DUDU_ADMIN_TOKEN_SHA256`

内容 Worker：
- `ADMIN_TOKEN_HASH`

## 支付接入的后续前置条件

完成官方商户入驻并取得商户参数后，才开始实现与验收支付适配器。

微信支付官方接口预计需要：
- 商户号、应用 ID、商户 API 证书序列号
- 商户 RSA 私钥
- API v3 Key
- 微信支付平台证书/公钥
- HTTPS 支付通知地址

支付宝官方接口预计需要：
- 应用 ID
- 应用 RSA2 私钥
- 支付宝公钥
- HTTPS 异步通知地址

以上全部必须使用 Cloudflare Worker Secrets；不得放入 GitHub Variables、仓库文件、桌面客户端或管理页面。实际字段名与官方 SDK/接口实现需在支付模块开发时固定。当前不要提前配置并启用商品上架。

## 真实支付上线验收

- 创建订单金额由服务器从 products 表读取，忽略客户端传入金额。
- 支付回调验签成功后才标记 paid。
- 校验商户订单号、平台交易号、币种、金额和商户身份。
- 回调幂等：同一支付通知重复到达不得重复发货。
- 发货使用 outbox 状态机与重试机制。
- 退款状态与授权撤销/离线凭证期限规则一致。
- 完成微信与支付宝沙箱/测试环境测试及小额真实交易验收后，才开放 checkoutEnabled。

## 回滚

- 不回滚或删除原有设备、卡密和试用记录。
- 如 Worker 部署失败，先切回旧 Worker 版本；新增表保留，不做破坏性回滚。
- 桌面端不覆盖正式安装包，待 CI 通过、PR 审核和 Windows 实机测试后再发布。
