# 独独AI工作台｜联网教程与社群管理服务

## 功能

- 公开 HTTPS `/manifest.json`：社群宣传、主微信、备用微信、教程12-24步、版本消息。
- 公开 HTTPS `/media/<sha256>`：经过校验的 WebP/JPEG/PNG 图片，长期缓存。
- 管理端 `/admin`：上传二维码、教程截图自动合成水印、编辑顺序和文字、发布及历史回退。
- 每次管理操作须管理员令牌。软件不包含令牌，不需要用户账户或用户素材权限。
- 用户数据仍留在电脑 `%APPDATA%\DoubaoCreativeHubPublic`。

## 部署一次（需要你的 Cloudflare 账户）

1. 安装 Node.js 22；进入 `cloud-content` 目录。
2. 执行 `npx wrangler login`，完成浏览器授权。
3. 执行 `npx wrangler kv namespace create DUDU_KV`，把返回的 ID 填到 `wrangler.toml`。
4. 执行 `npx wrangler r2 bucket create dudu-ai-media`；确认 R2 存储已开通。
5. 自己随机生成一个至少32字符的管理员令牌，计算它的 SHA256 十六进制值，并运行 `npx wrangler secret put ADMIN_TOKEN_HASH`（粘贴 SHA256，不是明文令牌）。
6. 运行 `npx wrangler deploy`。打开部署后地址的 `/admin`，粘贴步骤5生成的**原始令牌**，读取内容。
7. 使用「填入12步教程模板」，上传教程图和新的二维码，填写 `du4du44`、`du6du66`，点击发布。
8. 打开 `https://你的workers域名/manifest.json` 确认内容。
9. 在 GitHub Actions 中配置仓库 Variables `DUDU_CONTENT_URL` = `https://你的workers域名/manifest.json`，重新构建正式 v1.1.0 安装包。此后只修改管理后台，不需要用户重新安装软件。

**限制：** 我在当前环境无法代替你登录 Cloudflare 并部署 Worker；部署成功前软件使用内置12步教程、主微信和备用微信，显示离线状态。不要把管理员令牌写入 GitHub 仓库或发到社群。

## 安全与发布原则

- 远程公开内容仅含纯文本与 HTTPS 图片 URL，不接收 JS/HTML 片段执行。
- 图片最大2MB，教程图在上传前由管理员浏览器烙上右下角品牌语和微信号。
- 客户端按 SHA256 验证教程图片，离线回退本地教学图。
- 使用原子化 KV 发布，历史保留90天；管理员可回退历史版。
- 建议开启 Cloudflare 访问控制或 WAF，保护 `/admin` 管理入口，并启用账户双因素登录。
- GitHub Actions 变量 `DUDU_CONTENT_URL` **仅为公开服务地址**，不要在安装包里内置管理员令牌。

## 旧版兼容

v1.0.1 或更早客户端没有教程图片功能，无法通过远程公告自行增加新页面。需要先安装 v1.1.0。此后更改教程图片、联系人、二维码和公告不再需要升级软件。
