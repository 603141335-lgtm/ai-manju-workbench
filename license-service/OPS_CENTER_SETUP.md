# 独独AI运营管理中心 V1.0 部署说明

## 1. 先保护现有授权数据和密钥

本版本只对 license-service/schema.sql 执行 CREATE TABLE IF NOT EXISTS 增量迁移，不删除现有 devices、license_cards、request_nonces、admin_audit 数据。

**必须继续使用原来部署授权服务时的本机工作目录**，保留：

- license-service/.private/owner-keys.json
- license-service/.private/deployment-public.json（如果存在）
- license-service/wrangler.local.toml（可重新生成，但不要手工换 D1 ID）

不要删除 .private，不要重新生成一套签名密钥，也不要把这些文件提交到 GitHub。

## 2. 拉取新开发分支

在 GitHub Desktop：
1. 点击 Fetch origin。
2. 左上角 Current branch 选择 feature/ops-center-v1.0。
3. 点击 Pull origin。
4. 在资源管理器中打开仓库的 license-service 目录。

## 3. 本机检查并部署

在 license-service 文件夹地址栏输入 cmd 回车，然后逐条执行：

~~~powershell
npm install
npm run check
npm test
npm run deploy:setup
~~~

deploy:setup 会复用已有的 dudu-license D1 数据库，执行增量表结构，再部署更新后的 dudu-ai-license Worker。部署后检查：

- https://你的Worker域名.workers.dev/health 返回 status: ok
- https://你的Worker域名.workers.dev/manifest.json 返回公开公告 JSON
- https://你的Worker域名.workers.dev/admin 打开新版运营管理中心

管理员令牌仍使用原来 .private/owner-keys.json 中的 DUDU_ADMIN_TOKEN。不要把令牌粘贴到 GitHub Actions Variables。

如果你之前已经部署公告 Worker，且 GitHub Actions Variables 中存在 DUDU_CONTENT_URL，请先把它复制到 Cloudflare Worker 的可选变量，便于自动迁移原公告：

~~~powershell
npx wrangler secret put DUDU_LEGACY_CONTENT_URL --config wrangler.local.toml
~~~

按提示粘贴旧的 DUDU_CONTENT_URL。新 Worker 第一次读取 /manifest.json 或后台打开「公告与教程」时，会尝试读取旧清单并写入新的 D1；迁移成功后后续读取都使用新 D1。没有旧公告服务则跳过这一步。

## 4. 官方支付商户配置

支付密钥只配置为 Cloudflare Worker Secrets。不要放在 GitHub 源码、GitHub Variables、浏览器、Electron 客户端或普通配置文件里。

### 微信支付（Native 扫码支付）

在微信支付商户平台完成 Native 支付产品开通，并选择微信支付公钥验签模式，准备：

- 商户号：WECHATPAY_MCHID
- 商户 AppID：WECHATPAY_APPID
- 商户 API 证书序列号：WECHATPAY_SERIAL_NO
- 商户 API 私钥 PEM：WECHATPAY_PRIVATE_KEY_PEM
- APIv3 密钥（32字节）：WECHATPAY_API_V3_KEY
- 微信支付公钥 PEM（SPKI 格式）：WECHATPAY_PLATFORM_PUBLIC_KEY_PEM
- 对应的微信支付公钥 ID（PUB_KEY_ID_...）：WECHATPAY_PLATFORM_SERIAL

回调地址为：

https://你的Worker域名.workers.dev/v1/payments/wechat/notify

### 支付宝（电脑网站支付）

在支付宝开放平台创建并审核网站应用，确认该应用已开通「电脑网站支付」能力，准备：

- 应用 ID：ALIPAY_APP_ID
- 应用私钥 PEM：ALIPAY_PRIVATE_KEY_PEM
- 支付宝公钥 PEM：ALIPAY_PUBLIC_KEY_PEM
- 收款方支付宝 UID：ALIPAY_SELLER_ID

回调地址为：

https://你的Worker域名.workers.dev/v1/payments/alipay/notify

支付宝产品未签约或应用未获得电脑网站支付权限时，代码无法替代平台审批。当前接口使用 alipay.trade.page.pay，付款成功以验签后的异步通知为准，不以浏览器回跳为准。

### 配置命令

每条命令执行后，按 Wrangler 提示粘贴对应密钥内容。示例：

~~~powershell
npx wrangler secret put WECHATPAY_MCHID --config wrangler.local.toml
npx wrangler secret put WECHATPAY_APPID --config wrangler.local.toml
npx wrangler secret put WECHATPAY_SERIAL_NO --config wrangler.local.toml
npx wrangler secret put WECHATPAY_PRIVATE_KEY_PEM --config wrangler.local.toml
npx wrangler secret put WECHATPAY_API_V3_KEY --config wrangler.local.toml
npx wrangler secret put WECHATPAY_PLATFORM_PUBLIC_KEY_PEM --config wrangler.local.toml
npx wrangler secret put WECHATPAY_PLATFORM_SERIAL --config wrangler.local.toml

npx wrangler secret put ALIPAY_APP_ID --config wrangler.local.toml
npx wrangler secret put ALIPAY_PRIVATE_KEY_PEM --config wrangler.local.toml
npx wrangler secret put ALIPAY_PUBLIC_KEY_PEM --config wrangler.local.toml
npx wrangler secret put ALIPAY_SELLER_ID --config wrangler.local.toml
~~~

如果使用支付宝沙箱，可额外设置 ALIPAY_GATEWAY_URL 为官方沙箱网关。正式环境不需要设置，默认使用 https://openapi.alipay.com/gateway.do。

配置完成后打开 /admin →「支付配置」→「重新检测支付配置」。显示「已配置」只代表必需 Secret 存在，不代表商户产品已通过平台验收；正式收款前必须完成真实小额支付测试。

## 5. 管理后台使用

1. 打开 /admin，输入原来的管理员令牌，点击「连接后台」。
2. 「免费申请」：审核用户申请；点击「通过并自动激活」后授权绑定到申请设备。
3. 「商品管理」：创建商品，第一版只允许永久授权，价格以分存储。
4. 「订单管理」：查看待付款、已支付和发货状态；未收到支付回调时可点击「查询支付状态」，后台会向微信支付或支付宝官方接口查单，只有验签并核对订单号、金额后才会补记到账和自动发货；已付款但未发货可点击补发。
5. 「公告与教程」：编辑社群文字、二维码 HTTPS 地址、公告、更新说明和教程步骤 JSON，点击发布。
6. 「支付配置」：确认微信和支付宝必需 Secret 已配置。

卡密完整明文只在手动生成时展示一次。付费订单通过支付通知验签后自动创建永久卡并绑定购买设备，不向后台列表暴露完整卡密。

## 6. 桌面工作台连接

新版本客户端新增：
- 免费永久授权申请（联系方式 + 选填原因）
- 申请状态查询
- 商品列表读取
- 微信 / 支付宝订单创建
- 付款后轮询订单状态并自动刷新授权
- 公开公告从 DUDU_LICENSE_URL/manifest.json 读取

GitHub Actions Variables 保留：
- DUDU_LICENSE_URL：Worker HTTPS 根地址
- DUDU_LICENSE_PUBLIC_KEY_B64：原有 Ed25519 公钥

新构建优先使用授权 Worker 的 /manifest.json，不再要求新版本额外部署第二个公告管理后台。原 cloud-content 源码和 Worker 不删除，旧客户端继续使用原先打包的公告 URL。

## 7. 当前版本边界

- 当前商品授权类型仅支持永久授权；月卡、季卡、年卡需要后续扩展授权凭证到期逻辑后再开放。
- 当前后台支持商品、订单、免费申请、卡密、公告、教程和支付配置状态。
- 退款接口、主动查单补单、自动退款、图片直传 R2、操作员分级权限列为后续阶段，未完成前不在后台显示为已支持。
- 微信支付和支付宝正式收款必须使用本人合法商户主体、已签约产品和真实密钥。不能用测试密钥对外收款。
