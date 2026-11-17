# CloudBase 静态站点入口

2026-11-17，用户提供的 CloudBase「静态网站托管 → 文件管理」截图显示根目录没有任何文件。此目录是新建的入口页源码，不是从原站点恢复的旧页面。

把 `index.html` 上传到 CloudBase 静态网站托管的**根目录**后，访问 `https://marginal-wildfowl-d9dw2q0e469ceb-1526863510.tcloudbaseapp.com/` 会自动跳转到已部署的 Cloudflare 运营后台 `/admin`。浏览器未自动跳转时也有手动按钮。

此页不接收或保存管理员令牌；授权接口、卡密、公告和数据仍由现有 Cloudflare Worker 及 D1 提供。上传前确认地址与实际运营后台一致。
