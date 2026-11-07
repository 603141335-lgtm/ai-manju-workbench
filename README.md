# 豆包创作舱 v0.6.0 —— 内嵌豆包网页版工作台（无画布）

本版本**真正基于** `01_豆包创作舱_v0.5_单独包.zip` 里的 Electron 源码修改，并非仓库此前误认的 `ai-manju-workbench/app/` 文档程序。

## 保留功能
- 程序中央 WebContentsView 原生嵌入 `https://www.doubao.com/chat/`，按豆包官方网页登录；不会获取或导出账号 Cookie。
- 默认 5 组 25 账号位；每个账号使用 `persist:doubao_<账号ID>` 独立持久化会话，最多 3 个活跃网页视图，换账号不清空登录数据（官方失效除外）。
- 独立账号统计、切换、分组、Edge 备用、网页前进后退与刷新；手动使用豆包官方页面。
- 漫剧剧集、段落、批量导入 TXT/MD、完整提示词、参考图编号识别、拖拽、下载文件归档、隐藏/锁定、备份/恢复、窗口布局保存。
- 原数据文件 `config.json`、`workspace.json`、原账号会话所在 userData 路径**不作主动删除与搬迁**，原应用 `name`、`productName` 和 `appId` 不变。

## 删除内容
`src/canvas/` 及关联的 UI 按钮、窗口、独立 JSON 数据管理和 IPC 逻辑全部移除；原本已存在的旧 `canvas-v05.json` 不会主动删除以避免误删用户数据。

## 防逆向与安装
Windows x64 NSIS 安装包采用 Electron ASAR、Fuses + 完整性验证，并在构建副本里对 `src/renderer.js`、`src/parser.js` 和 `src/workspace.js` 做 JS 混淆；源码保留可维护性。这**不等于 Themida/VMProtect 商业原生加壳**。真正商业壳仍需要原生 DLL、授权工具、签名证书以及 Windows 真机兼容测试，不能绕过这些前提声称已完成。

本版固定：`name = doubao-creative-hub`、`productName = 豆包创作舱`、`appId = com.manju.doubao.creativehub`。因此与以前误做的 `com.manju.workbench.desktop` 文档程序互不覆盖。原版为 portable 可执行文件，没有 Windows NSIS 卸载注册项；新版本是同一产品的**首次正式安装**。后续同 appId 的新版 NSIS 可覆盖升级。

## Windows 本机一键打包
双击仓库根目录 `一键打包Windows安装版.cmd`（需 Windows 网络可访问 npm / Electron 下载源）。第一次构建会安装依赖、运行测试、混淆代码并在 `release/` 产出 `Doubao-Creative-Hub-Setup-v0.6.0-x64.exe`。程序无法在此聊天环境中进行 Windows 真机账号扫码登录验证。

如果配置官方可用的 `DOUBAO_UPDATE_URL`（末尾 `/` 的 HTTPS 静态文件目录）并通过版本发布流程同时上传 exe、`latest.yml` 和 blockmap，则程序内的“检查更新”才会启用。未配置时只支持手动安装新版覆盖。

## 自动测试
`npm test`：原有 25 项非画布测试 + 新增浏览器登录与去画布守卫测试。
`npm run check`：代码语法检查和 Node 回归测试。
`node scripts/harden.js`：在独立副本里进行构建混淆，不要在原版可维护源码中直接运行。
详见 `docs/RELEASE_SECURITY.md`。
