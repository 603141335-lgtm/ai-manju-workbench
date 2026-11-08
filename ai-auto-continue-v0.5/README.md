# AI 自动续聊助手 v0.5 · 薄荷绿主题

**完整源码已备份**。本分支用于保存 AI自动续聊助手，独立于 AI漫剧素材工作台、扫码系统及其他软件项目，不修改主分支。

## 源码备份（完整）

**[下载 v0.5 完整扩展源码 ZIP](./AI_Auto_Continue_v0.5_MintTheme_Edge_Chrome.zip)**

- 文件：`AI_Auto_Continue_v0.5_MintTheme_Edge_Chrome.zip`
- 大小：64,016 字节
- SHA-256：`ab2126bf5b4c9e2a1d0ede0498ddeb56f1f8e381fa03b3280a33d99be6deb306`
- Git Blob SHA：`7e9749ea5b7150af8cf46fdf676032596ceb9aa7`
- 版本：`0.5.0`
- 备份日期：2026-11-08

ZIP 内含 16 个文件（全部可以完整解压），包括：
- `manifest.json`
- `dashboard.html`, `dashboard.js`, `style.css`
- `background.js`, `runner.js`, `icons.js`
- `icons/` 中的 SVG 和各尺寸 PNG
- `README_安装说明.txt`, `CHANGELOG.txt`, `CORE_CODE_SHA256.txt`

部分配置与页面源码也直接展示在本目录，方便在线预览。**完整版本以 ZIP 为准**。

## 功能保持

- ChatGPT / Gemini / 豆包 / DeepSeek 网页会话适配
- 小说逐集续写与自定义多轮发送
- Skill 导入、保存和切换
- 回复完成检测、自动存档、暂停与恢复
- v0.5 薄荷绿色界面主题（原自动续聊引擎保持 v0.4 逻辑）

## 下次继续开发

从此分支下载 ZIP 后解压，用解压目录作为 v0.6 开发起点。改代码前先保存一个新版本，避免覆盖已测试的 v0.5。不要将此独立分支直接合并到主分支，除非明确需要。

## 安装

在 Edge 的 `edge://extensions` 或 Chrome 的 `chrome://extensions` 打开开发者模式，选择“加载已解压的扩展程序”，加载 ZIP 解压后包含 manifest.json 的目录。
