# 独独AI工作台 × 运营管理中心连接说明

## 已连接的功能

- 工作台授权中心通过同一个 Cloudflare Worker 接口申请 24 小时试用、提交免费授权申请、查询商品、创建订单、刷新授权和查询订单。
- 运营管理中心使用同一个 Worker 与 D1 数据库，管理卡密、免费申请、商品、订单、退款、支付监控、公告和操作日志。
- 工作台的“运营管理中心”按钮只打开同源 `/admin` 页面；管理员令牌仍只在浏览器页面内存中输入，不写入工作台、不保存在 localStorage。
- 工作台不上传豆包 Cookie、账号密码、剧本、提示词、参考图或视频素材。授权服务只处理设备证明、授权、申请和订单元数据。

## Windows 本机隔离联调（推荐先做）

1. 关闭旧的本机 Worker 窗口（监听 8788 端口）；如果端口已经被同一测试密钥的服务占用，启动器会自动识别并复用。
2. 将整个 GitHub ZIP **完整解压到新文件夹**，在项目根目录双击 `START_DUDUAI_LOCAL_TEST.bat`。不要在旧 ZIP 或子文件夹里面运行。
3. 启动器检查 Node.js 22+；根目录没有 `package-lock.json` 时使用 `npm install`，存在锁文件时使用 `npm ci`。后台目录则按其锁文件安装。
4. 它执行语法检查和自动测试，修复必要的 Workerd 原生依赖；随后在本机启动后台，等待授权服务实际返回**匹配本机测试密钥的 Ed25519 签名证明**，通过后才打开桌面工作台。不再固定等待10秒。
5. 工作台与生产版使用**完全不同的本地用户目录**：`%APPDATA%\DoubaoCreativeHubLocalTest`。正式版仍使用 `%APPDATA%\DoubaoCreativeHubPublic`，原豆包登录、项目、授权缓存和账号设置不自动迁移、不会覆盖。
6. 在工作台打开“授权中心”，点击“运营管理中心”，浏览器打开 `http://127.0.0.1:8788/admin`。管理员测试令牌只在**当前本机命令行**显示，输入到后台网页登录框；截图前必须遮住令牌。
7. 如果显示 `trial_expired`，说明测试 D1 已经记录该设备领取过试用；不要尝试重置正式授权记录。可以在本机测试后台生成测试卡密后再激活。

本机联调严格限制在 `127.0.0.1:8788`，只使用独立本机 D1、独立测试签名密钥和虚构商品。不会连接 Cloudflare 远程 D1，不部署 Worker，不调用微信或支付宝，不产生真实扣款或退款。测试 HTTP 仅在未打包的开发版、显式 `localTestMode=true` 时允许；正式安装包拒绝该配置。

**启动失败诊断：** 启动器将错误输出保留在当前命令窗口。若提示 Node、npm、Electron、Workerd 或测试数据库异常，截取错误附近内容即可。不要发送 `.private/test-owner-keys.json`、`.dev.vars`、管理员令牌或生产 SQL。若自动测试失败，启动器会阻止进入工作台，避免带病运行。Windows GUI、账号网页登录、后台多开及实际豆包上传仍必须在本机实测。

**根目录注意：** 本仓库根目录暂未提交 `package-lock.json`；不要对根目录手工执行 `npm ci`。真正的锁文件在 `license-service/package-lock.json`。新版一键启动器会自动识别并选择正确的安装方式。

## 正式线上连接

正式版仍使用 HTTPS Worker 地址和固定 Ed25519 公钥。只有在 V1.3 生产 Worker 完成原密钥/原 D1 备份、线上核验和支付验收后，才设置 GitHub 仓库变量：

- `DUDU_LICENSE_URL`：正式 Worker 的 HTTPS 根地址。
- `DUDU_LICENSE_PUBLIC_KEY_B64`：与 Worker 签名私钥配对的 Ed25519 SPKI 公钥 Base64。

Windows 发布工作流运行 `npm run license:prepare`，会访问 `/v1/license/attest` 验证云端签名密钥与客户端公钥一致后，才把公开配置写入安装包。管理员令牌、签名私钥、HMAC 密钥和支付商户密钥绝不能放进工作台客户端或普通 GitHub Variables。

**本机联调通过不等于生产服务已部署。** 在正式发布前，仍需按 `license-service/OPS_CENTER_SETUP.md` 完成生产部署审批和支付渠道验收。
