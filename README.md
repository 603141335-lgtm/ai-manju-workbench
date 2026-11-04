# AI漫剧素材工作台

Windows 本地 AI 漫剧制作辅助工具。此仓库保存 **v1.0 桌面版源码**，供后续增量维护；不是漫剧成片或参考图素材仓库。

## 功能
- 支持一个项目、多集提示词，按片段连续滚动显示原文。
- 解析 A01、A01-01、AG14、BL06、C02、E02-05 等编号，匹配本地图片。
- 片段提示词一键复制；参考图单张、多选、整组原生拖拽。
- 重复编号手工选择版本、缺失图片警告。
- 本地项目自动保存、备份恢复和按集导出文件夹。

## 运行
1. 使用兼容的 Windows x64 Electron 运行环境打开 `app/`（`app/package.json` 指向 `main.js`）。
2. 可通过 `launcher/launcher.go` 对应的 Windows 启动器获取 Electron，但首次下载依赖网络；此仓库不包含 Electron 运行库或 EXE。
3. Windows 实机多文件拖拽到豆包/即梦等网站尚需按目标网站实际上传区域验证。

## 测试
- `node tests/test_parser.js` 检查编号和剧集解析。
- `node tests/test_main_mock.js` 检查主进程模拟行为。
- `tests/test_ui.py` 为界面检查测试，需要其对应环境依赖。
- 真实 Windows 拖拽请在软件的「拖拽验证」页面测试，**模拟测试不等于真实网站兼容**。

## 维护
修改前阅读 [DEVELOPMENT.md](DEVELOPMENT.md) 和 [TESTS.md](TESTS.md)，详见 [CHANGELOG.md](CHANGELOG.md)。
