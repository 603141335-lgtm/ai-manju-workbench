# 独独AI运营管理中心 V1.3 · 现有授权服务升级

本目录包含独独AI工作台授权服务与运营管理中心。V1.3 在 V1.2 的现有 Worker / D1 上增量增加财务报表、全额退款、退款状态核验和退款成功后撤销本订单授权。

**本升级流程只适用于已经部署 V1.2 的环境。不要用它初始化全新生产数据库。**

## 重要：不要丢失原授权身份

升级必须继续使用原来的：

- `.private/owner-keys.json`：签名私钥、设备 HMAC、卡密 HMAC、管理员令牌
- `.private/deployment-public.json`：原 Worker 地址、公钥和 D1 ID（如果存在）
- `wrangler.local.toml`：原 D1 绑定（如果存在）

根目录 `.gitignore` 已排除 `license-service/.private/` 和 `license-service/wrangler.local.toml`。不要把密钥、备份、管理员令牌或支付商户私钥提交到 GitHub、发到聊天或截图。

如果找不到原 `owner-keys.json`，或无法从原本地配置/部署记录确认 D1 ID，部署脚本会停止；不要重新生成一套密钥，也不要创建同名空库。

## 推荐升级顺序

在原项目的 `license-service` 目录打开 PowerShell：

~~~powershell
npm install
npx wrangler login
npm run check
npm test
npm run deploy:backup -- --confirm-export
~~~

备份脚本会核验原 D1 身份、导出远程 D1 完整 SQL，并在 `.private/backups/` 复制原密钥和部署记录。请把整个备份目录另存到加密离线介质。D1 远程导出期间可能暂时阻塞数据库请求，选择低流量时段执行。

自动化测试和备份完成后，先完成独立测试/支付沙箱验收。**不要因为 GitHub Actions 通过就直接对外开放真实收款。**

## 生产部署（必须由管理员主动触发）

有两种方式，二选一：

### 本机部署

在原部署电脑、原工作目录中，确认离线备份已完成且沙箱验收通过后执行：

~~~powershell
npm run deploy:setup
~~~

该命令会复用现有 `dudu-license` D1、执行增量表结构并更新现有 `dudu-ai-license` Worker。它不会创建替代数据库或重新生成授权密钥。

### GitHub Actions 手动部署

工作流：`.github/workflows/deploy-license.yml`

需要在 GitHub Environment `production-license` 配置：

- Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- Variable：`DUDU_D1_DATABASE_ID`（原 `dudu-license` 的 UUID）

从 `feature/dudu-ai-v1.2.0-license` 分支手动运行。必须确认已完成密钥离线备份和 D1 全量导出，并输入 `DEPLOY_PRODUCTION_V1_3`。工作流会再次核验 D1 名称和 UUID、运行测试、应用增量 schema，再部署 Worker。它不会轮换原 Worker Secrets。

部署后检查：

- `/health` 返回 `status: ok`
- `/manifest.json` 返回公告 JSON
- `/admin` 能用原管理员令牌登录

## 支付与退款验收

支付密钥只配置在 Cloudflare Worker Secrets，不放在源码、GitHub Variables、浏览器或 Electron 客户端。

正式环境需要本人合法商户主体及已签约产品：

- 微信支付 Native：商户号、AppID、API 证书私钥、APIv3 密钥、微信支付公钥及公钥 ID
- 支付宝电脑网站支付：应用 ID、应用私钥、支付宝公钥、收款方 UID

后台「支付配置」显示已配置，只代表必需 Secret 存在；本地密钥自检也不代表商户平台在线验收通过。先用沙箱或测试商户验证支付、退款回调、退款查单和授权撤销，再开放真实收款。

当前退款仅支持管理员发起全额原路退款。只有支付平台明确确认退款成功，订单才会标记为已退款并撤销该订单发放的卡密；处理中或结果不确定时不会提前撤销，也不会允许重复退款或补发。

完整操作步骤、支付 Secret 名称及退款流程见 [OPS_CENTER_SETUP.md](./OPS_CENTER_SETUP.md)。

## GitHub CI 与自动化

- `.github/workflows/ops-center-ci.yml`：运行授权、财务、退款、Worker、桌面端语法及 D1 schema 测试。
- `.github/workflows/deploy-license.yml`：仅手动触发，受 `production-license` Environment 审批、备份确认、口令确认和 D1 身份核验保护。
- 不要把 Cloudflare API Token、支付商户密钥、授权私钥或管理员令牌放进普通仓库变量或源码。

## 当前功能范围

- 运营总览、免费申请审批、卡密、商品、订单、公告与教程。
- 微信/支付宝支付状态监控、订单核验、自动发货补偿。
- 财务报表：实收、成功退款、净现金流、渠道统计和商品排行。
- 全额原路退款：退款状态查询、重复退款保护、失败记录。
- 退款成功后只撤销对应订单发放的授权，不影响用户其他卡密。
- 暂未支持部分退款、用户自助退款、退款自动定时查单、操作员分级权限和财务账单自动对账。
