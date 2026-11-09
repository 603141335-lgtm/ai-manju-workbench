# AI自动续聊助手 v0.9.2 源码归档

此目录为 Edge / Chrome Manifest V3 扩展的完整可读核心源码、图标及测试代码。

- 版本：0.9.2
- 平台：ChatGPT、Gemini、豆包、DeepSeek
- 功能：薄荷绿界面、四平台独立任务、同平台多任务实例、点击切换平台与任务、固定最多3个并行任务并自动排队、自动续聊与保存、图片附件、模型检测、历史记录。
- 主要文件：manifest.json、dashboard.html、dashboard.js、style.css、runner.js、background.js、image-store.js。
- tests/：测试用例；CHANGELOG_v0.9.2.md、TEST_REPORT.md：变更与测试记录。

## 安装

1. 从此目录下载完整文件，保持文件夹结构。
2. 在 Edge 打开 `edge://extensions`，开启开发者模式，加载该目录。
3. 在 Chrome 中用 `chrome://extensions` 同样操作。

## 备注

原始安装 ZIP 与包含预览图的源码备份 ZIP 同时保存在用户 ChatGPT 文件库：
`/软件源码备份/AI自动续聊助手/v0.9.2/`。

真实会员网页兼容性会随平台变动；此存档不是官方扩展商店审核发布版本。
本分支独立于其他软件源码和主分支。
