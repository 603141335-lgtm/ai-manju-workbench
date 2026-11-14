# 独独AI工作台 v1.2.0｜独立卡密服务

不依赖豆包账号、Cookies、剧本或媒体。部署到自己的 Cloudflare 账户后才能正式启用；**不要把管理员口令、发卡HMAC密钥或Ed25519签发私钥提交进GitHub**。

## 部署步骤

1. Node.js 22，安装 Wrangler：npx wrangler login；本地运行 npm test。
2. npx wrangler d1 create dudu-license；将 D1 ID 填入 wrangler.toml 的 database_id。
3. npx wrangler d1 execute dudu-license --remote --file=schema.sql。
4. 在本人可信电脑运行 node scripts/generate-keys.mjs；安全保存输出的私钥、管理员token和HMAC秘密。
5. 分别运行 npx wrangler secret put DUDU_SIGNING_PRIVATE_PKCS8_B64、DUDU_DEVICE_HMAC_KEY、DUDU_CARD_HMAC_KEY、DUDU_ADMIN_TOKEN_SHA256。
6. npx wrangler deploy；打开 https://你的workers域名/health 检查服务，再访问 /admin 使用管理员token生成永久免费卡密。
7. GitHub 仓库 Variables 设置 DUDU_LICENSE_URL = https://你的workers域名，DUDU_LICENSE_PUBLIC_KEY_B64 = 第4步生成的公钥（SPKI DER Base64）。执行 v1.2.0 Windows 构建。
8. **不要让新安装包使用示例公钥或空地址**；Windows发布构建必须校验这两个变量。

**授权规则：** 24小时由首次成功请求后服务器记时，同机器重新试用不会重置；永久卡密一机绑定；首次激活要联网，离线凭证最长30天；私钥仅服务器持有；用户到期后保留本地素材与备份能力。管理员需审核系统重装/换机后的密钥变化，可在后台人工解绑卡密。此版未声称已经实现TPM不可导出密钥，默认采用Windows DPAPI保护的Ed25519设备密钥。

**运行保护：** Cloudflare Access/WAF 应保护管理页面及管理员接口；对激活失败设置IP和设备限速；D1与服务器密钥定期备份；妥善处理许可证恢复与隐私告知。无法防范完全控制客户端的高级攻击者。
