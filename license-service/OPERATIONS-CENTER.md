# 独独AI运营管理中心 V1.0 部署说明

本版本在原有 dudu-ai-license 与 dudu-ai-content 两个 Cloudflare Worker 上增加统一电脑网页后台。不会重建 D1，不删除原有授权表，也不会修改用户本地工作区、豆包账号 Cookie、剧本和参考图。

## 1. 入口

部署完成后，统一后台入口为：

`https://<现有授权Worker域名>/admin`

旧卡密页面保留在 `/admin-legacy` 作为回退入口。原内容 Worker 的旧管理页面也保留，但日常统一使用授权 Worker 的 `/admin`。

管理员仍使用现有 `DUDU_ADMIN_TOKEN`。令牌只在后台页面内存中使用，不写入 localStorage、不进入安装包。建议在该 Worker 前配置 Cloudflare Access、双因素验证和频率限制。

## 2. 本地备份与增量迁移

在已登录 Cloudflare 的开发电脑上：

1. 进入仓库的 `license-service` 目录。
2. 确保已有 `wrangler.local.toml`。若没有，先用已有部署记录执行 `npm run deploy:check`。
3. 安装依赖：`npm install`。
4. 执行：`npm run ops:migrate`。

该命令先执行 `wrangler d1 export dudu-license --remote`，把完整线上 D1 SQL 导出到 `license-service/backups/`，然后才执行 `schema.sql` 的增量建表，并检查原授权表和新业务表。备份目录已加入 .gitignore，不会提交到 GitHub。请把生成的 SQL 备份另存到安全位置。

迁移仅新增以下业务表：products、license_applications、orders、payment_events、order_deliveries、admin_audit_v2，以及对应索引。原 devices、license_cards、request_nonces、admin_audit 不删除、不重建。

## 3. 连接原公告/教程 Worker

确保 Cloudflare 中已有 Worker 名称为 `dudu-ai-content`，并且授权 Worker 的 D1 本地配置可用。

在 `license-service` 目录执行：

`npm run ops:bridge`

该命令在本机生成一次性随机桥接密钥，分别将原始密钥和 SHA-256 摘要写入两个 Worker Secret：

- 授权 Worker：`DUDU_CONTENT_INTERNAL_TOKEN`
- 内容 Worker：`INTERNAL_ADMIN_TOKEN_HASH`

原有内容管理员令牌 `ADMIN_TOKEN_HASH` 不会被替换。后台通过 Cloudflare Service Binding 在 Worker 之间私有调用，不让浏览器直接持有内容服务管理员令牌。

## 4. 微信支付官方商户接口

在 Cloudflare Dashboard → Workers & Pages → dudu-ai-license → Settings → Variables and Secrets 中添加以下 **Secret**：

- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_CERT_SERIAL`
- `WECHAT_PAY_PRIVATE_KEY_PEM`
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_PLATFORM_PUBLIC_KEY_PEM`
- `WECHAT_PAY_PLATFORM_SERIAL`
- `WECHAT_PAY_NOTIFY_URL`

通知地址：

`https://<授权Worker域名>/v1/payments/wechat/notify`

商户平台使用普通商户 Native 支付产品，配置该异步通知地址。商户 API 私钥、平台公钥/证书序列号和 APIv3 密钥必须来自商户平台，不要使用示例值。

## 5. 支付宝官方 RSA2 接口

在同一 Worker 的 Secrets 中添加：

- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY_PEM`
- `ALIPAY_PUBLIC_KEY_PEM`
- `ALIPAY_NOTIFY_URL`

通知地址：

`https://<授权Worker域名>/v1/payments/alipay/notify`

可选：`ALIPAY_GATEWAY`。未配置时使用官方网关 `https://openapi.alipay.com/gateway.do`。

请使用支付宝开放平台对应应用的 RSA2 应用私钥和支付宝公钥，并在应用中配置异步通知地址。密钥不要放进 GitHub Variables、源码或桌面安装包。

## 6. 配置商品售价

打开 `/admin` → 输入现有管理员令牌 → 商品设置：

1. 设置「独独AI工作台永久授权」售价（人民币元）。
2. 勾选上架销售。
3. 保存商品。

商品默认是下架、0元，防止支付商户尚未配置时误收款。用户端只有在至少一个支付渠道完整配置后才显示可用支付方式。第一期订单采用付款成功后自动绑定当前设备的交付方式。

## 7. 发布授权 Worker 与客户端

- 授权 Worker 部署必须使用带 Service Binding 的 `license-service/wrangler.toml`。
- 内容 Worker 使用更新后的 `cloud-content/src/worker.js`，保留现有 KV、R2 和 `ADMIN_TOKEN_HASH`。
- 数据库迁移成功、桥接 Secret 配置完成、支付商户真实测试通过后，再构建新的 Windows 安装包。
- 新客户端通过原有 `license-config.json` 的服务地址和 Ed25519 公钥连接原授权服务；旧版试用、永久卡密激活和离线签名验证接口保持兼容。

## 8. 支付验收

正式上架前至少完成：

1. 微信支付 Native 测试订单，确认生成二维码。
2. 支付成功后验证微信回调签名、平台证书序列号、AES-256-GCM 解密和金额。
3. 支付宝预下单测试，确认生成二维码。
4. 支付宝异步通知 RSA2 验签、应用 ID 和金额校验。
5. 同一支付通知重复发送多次，只生成一张卡密并只绑定一次。
6. 支付金额不一致、签名无效、订单号不存在时不得发货。
7. 退款/撤销尚未接入自动退款 API；当前不要把后台订单列表中的状态当作退款操作入口。

## 9. 数据范围与安全

本后台只保存授权设备哈希、用户主动填写的申请联系方式/原因、商品和订单记录。不会读取或上传豆包 Cookie、提示词、剧本、参考图、视频成片或本地账号配置。

支付商户密钥仅存在 Cloudflare Worker Secrets。卡密仍以 HMAC 摘要存储；自动购买发货时服务端创建一张永久卡并绑定付款设备，不把完整卡密返回给客户端。
