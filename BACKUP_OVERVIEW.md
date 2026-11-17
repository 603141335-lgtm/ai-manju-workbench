# 独独AI工作台 V1.3 私有源码备份

本仓库保存 2026-11-17 的可恢复源码快照。它包含 Windows 工作台、当前线上授权服务和运营后台页面的源码、数据库结构、构建脚本、部署配置、文档及测试。

## 代码位置

| 部分 | 位置 |
| --- | --- |
| Windows 工作台 | `src/`、`native-core/`、`assets/` |
| 当前 Cloudflare 授权服务 | `license-service/src/worker.mjs`、`license-service/src/ops-service.mjs` |
| 当前运营后台网页 | `license-service/src/admin-ui.mjs` |
| 数据库结构 | `license-service/schema.sql` |
| 构建与部署 | `scripts/`、`.github/workflows/`、`license-service/wrangler.toml` |
| 旧版独立公告服务代码 | `cloud-content/`，仅作历史参考；当前安装包使用上面的授权服务 `/manifest.json` |

当前工作台连接的授权服务是 `https://dudu-ai-license.dushuaishuai089.workers.dev`，运营后台是该地址的 `/admin`，公告接口是 `/manifest.json`。源码中的 `src/license-config.json` 和 `src/public-config.json` 可能是构建模板；正式安装包使用构建时写入的公开地址和验证公钥。

## 备份范围

仓库只保存源码和公开配置。管理员令牌、签名私钥、支付密钥、Cloudflare 凭据、实时 D1 数据、用户电脑上的项目与账号数据、构建缓存和安装包均未上传。恢复正式服务时，需要从另行保管的安全备份恢复这些私密数据，并按 `license-service/OPS_CENTER_SETUP.md` 核对部署。**不要重新生成签名密钥来替代原有密钥，否则已发放的授权无法正常续签。**

腾讯云 CloudBase 静态托管地址是 `https://marginal-wildfowl-d9dw2q0e469ceb-1526863510.tcloudbaseapp.com/`；用户提供的存储标识是 `aa86-static-marginal-wildfowl-d9dw2q0e469ceb-1526863510`。2026-11-17 用户提供的文件管理截图显示根目录为空，之前访问首页也返回 404，说明没有旧网页文件可导出。`cloudbase-site/index.html` 是新建的入口页，上传到 CloudBase 根目录后会打开当前 Cloudflare 运营后台。当前可用的后台网页源码在 `license-service/src/admin-ui.mjs`，并随 Cloudflare Worker 部署。

## 恢复入口

1. Windows 工作台：查看根目录 `README.md` 和 `RELEASE_BUILD_README.md`。
2. 授权服务与运营后台：查看 `license-service/README.md` 和 `license-service/OPS_CENTER_SETUP.md`。
3. 源码和服务测试：根目录 `npm run check`；`license-service` 目录 `npm test`。

此快照包含激活时区分“管理 ID”和完整卡密、保留真实失败提示的源码修正；此前已分发的 v1.3.0 安装包尚未包含这些提示修正。
