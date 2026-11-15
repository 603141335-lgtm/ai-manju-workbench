# 独独AI工作台 × 运营管理中心连接说明

## 已连接的功能

- 工作台授权中心通过同一个 Cloudflare Worker 接口申请 24 小时试用、提交免费授权申请、查询商品、创建订单、刷新授权和查询订单。
- 运营管理中心使用同一个 Worker 与 D1 数据库，管理卡密、免费申请、商品、订单、退款、支付监控、公告和操作日志。
- 工作台的“运营管理中心”按钮只打开同源 `/admin` 页面；管理员令牌仍只在浏览器页面内存中输入，不写入工作台、不保存在 localStorage。
- 工作台不上传豆包 Cookie、账号密码、剧本、提示词、参考图或视频素材。授权服务只处理设备证明、授权、申请和订单元数据。

## Windows 本机隔离联调（推荐先做）

1. 关闭之前打开的本机 Worker 命令窗口。
2. 在项目根目录双击 `START_DUDUAI_LOCAL_TEST.bat`。
3. 启动器会打开一个单独的 Worker 窗口，并在当前窗口启动工作台开发版。
4. 在工作台打开“授权中心”。本机测试配置由测试启动脚本写入 `%APPDATA%\DoubaoCreativeHubPublic\license-config.local.json`，只供未打包的开发版读取。
5. 点击“运营管理中心”，浏览器会打开 `http://127.0.0.1:8788/admin`。管理员令牌只在 Worker 窗口显示，粘贴到后台登录框。
6. 如当前测试设备已显示 `trial_expired`，这是本机测试 D1 已记录该设备领取过试用。不要重置正式设备记录；可在本机后台“卡密管理”生成一张测试永久卡密，再回到工作台激活。

本机联调严格限制在 `127.0.0.1:8788`，只使用独立本机 D1、独立测试签名密钥和虚构商品。不会连接 Cloudflare 远程 D1，不部署 Worker，不调用微信或支付宝，不产生真实扣款或退款。测试 HTTP 仅在未打包的开发版、显式 `localTestMode=true` 时允许；正式安装包拒绝该配置。

## 正式线上连接

正式版仍使用 HTTPS Worker 地址和固定 Ed25519 公钥。只有在 V1.3 生产 Worker 完成原密钥/原 D1 备份、线上核验和支付验收后，才设置 GitHub 仓库变量：

- `DUDU_LICENSE_URL`：正式 Worker 的 HTTPS 根地址。
- `DUDU_LICENSE_PUBLIC_KEY_B64`：与 Worker 签名私钥配对的 Ed25519 SPKI 公钥 Base64。

Windows 发布工作流运行 `npm run license:prepare`，会访问 `/v1/license/attest` 验证云端签名密钥与客户端公钥一致后，才把公开配置写入安装包。管理员令牌、签名私钥、HMAC 密钥和支付商户密钥绝不能放进工作台客户端或普通 GitHub Variables。

**本机联调通过不等于生产服务已部署。** 在正式发布前，仍需按 `license-service/OPS_CENTER_SETUP.md` 完成生产部署审批和支付渠道验收。
