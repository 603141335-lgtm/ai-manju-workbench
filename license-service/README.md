# 独独AI工作台 v1.2.0 · 永久卡密云端部署

本仓库开发分支已通过自动化测试。授权服务必须在你自己的Cloudflare账户内正式部署，才能向普通用户签发24小时试用和永久卡密。

## 电脑端简化部署

1. 安装Node.js 22+，下载或克隆仓库，打开PowerShell进入 license-service 文件夹。
2. 执行 npm install。
3. 执行 npx wrangler login，通过浏览器授权自己的Cloudflare账户。
4. 执行 npm run deploy:setup。工具自动检查D1数据库（没有时创建）、执行新增表结构、生成本机所有者密钥、将秘密上传到Worker、部署服务并检查 /health。
5. 私钥和管理员口令只存在本机 license-service/.private/owner-keys.json（已在.gitignore排除）；请另行离线备份，绝不上传源码仓库、发到聊天或截图。
6. 工具结束后显示两个GitHub Actions Variables：DUDU_LICENSE_URL（HTTPS服务地址）、DUDU_LICENSE_PUBLIC_KEY_B64（Ed25519公钥）。若要以后从GitHub自动更新Worker，再增加 DUDU_D1_DATABASE_ID。
7. 打开提示的 /admin 地址，输入owner-keys.json中的 DUDU_ADMIN_TOKEN，批量生成免费永久卡密。每张卡原则上绑定一台电脑。

在 GitHub Settings > Secrets and variables > Actions > Variables 添加上述变量。再触发 v1.2.0 Windows 构建以生成可激活安装包。GitHub workflow_dispatch 可能需要工作流文件先存在于默认分支；否则在设置变量后向v1.2.0分支提交一次新改动触发push构建。

## GitHub CI更新云端服务（可选）

使用独立的 deploy-license workflow：管理员在GitHub Secrets中保存 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID，并在GitHub Variables保存 DUDU_D1_DATABASE_ID。建议对production-license环境设置审批。首次Worker Secrets由本机deploy:setup上传，后续CI只更新代码和数据库表，不重新生成签名密钥。

### 安全边界

- 所有卡密由云端安全随机数生成，只储存HMAC摘要；用户卡密仅在管理员创建时显示一次。
- 设备签名请求绑定时间戳与nonce，D1会拒绝重复nonce；不保存豆包Cookie、剧本或媒体。
- Windows设备密钥使用DPAPI加密；永久签名只在云端私钥完成，Windows二进制只带Ed25519公钥；未启用TPM硬件级防复制。
- 24小时试用记录不随应用重装重置，但完整系统重装、设备伪装和虚拟机克隆无法保证绝对识别。
- 卡密撤销后拒绝在线续签，已签发离线凭证可能在剩余离线有效期（默认最长30天）内继续可用。
- 管理接口仍需在Cloudflare配置Access、双因素登录和WAF频率限制。Cloudflare和GitHub私有账户的密码、令牌绝不需要发给助手。
- 免费永久卡密不涉及支付，微信主号du4du44、备用号du6du66。
- 正式发行前应在Windows上测试登录、旧项目升级、多账号后台任务、整段导入和豆包原生@的真实页面兼容性。

## 运营管理中心 V1.0

新版统一管理页面位于 Worker 的 `/admin`，包含运营总览、卡密、免费申请审批、商品、订单、公告教程和支付配置状态。桌面客户端增加免费申请、商品读取、创建支付订单和付款后自动刷新授权。

完整部署、商户 Secret 名称和操作步骤见 [OPS_CENTER_SETUP.md](./OPS_CENTER_SETUP.md)。

注意：正式支付前必须完成微信支付 Native / 支付宝电脑网站支付产品签约并配置本人商户密钥。未配置密钥时，后台会显示未配置，订单创建会被拒绝，不会假装付款成功。
