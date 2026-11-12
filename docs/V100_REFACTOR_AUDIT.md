# 独独AI工作台 v1.0.0｜代码整理审计

基础：`doubao-creative-hub-STABLE-v0.9.9`。只在 `feature/dudu-ai-workbench-v1.0.0` 进行重构。

## 逐模块结论

| 模块 | 处理 | 理由 |
|---|---|---|
| `src/main.js` | 复用 `activeDoubaoContext` | 两套导入器的活动 WebContents 选择代码重复；复用函数不改行为 |
| `src/parser.js` | 保留 | 负责多集分段解析、兼容旧编号，不等同于新导入器 |
| `src/import-core.js` | 保留 | 导入器的引用栏目解析与原始行锚点独立使用 |
| `src/reference-labels.js` | 保留 | 原文人物名称提取，不能直接删除 |
| `src/import-engine.js` | 保留、加固 | 当前批量上传、原生 @ 绑定与音频协调核心 |
| `src/mention-runner.js` | 保留兼容 | 旧隐藏入口仍被 `renderer.js` 初始化，直接删除会影响功能 |
| `src/import-page.js`、`src/inline-mention-page.js`、`src/mention-page.js` | 保留原生函数 | 需被序列化注入豆包网页，不进行破坏性的源代码混淆 |
| `src/video-mode.js`、`src/voice-page.js` | 保留 | 网页脚本与音频网页控件，需原生可执行序列化 |
| `src/renderer.js` | 保留结构、加固 | 事件和界面状态复杂，跨模块重写风险高 |
| `src/workspace.js`、`src/store.js` | 保留、加固 | 旧项目迁移和分组/用户设置依赖它们 |
| `src/downloads.js`、`src/tailframe.js` | 保留、加固 | 下载归档与跨段尾帧不可丢失 |
| `src/notice-service.js`、`src/api-settings.js` | 保留、加固 | 公告在线配置、Win 用户级 API Key 保护 |
| `src/thumbnail-cache.js`、`src/voice-bindings.js` | 保留、加固 | 原图预览缓存和参考音频关联 |
| `release-build.json` | 与 `package.json` 保持同步 | 实际发布时由 `scripts/prepare-feed.js` 从 `package.json#build` 生成 |
| `REPAIR_Electron.cmd`、演示授权目录 | 保留为开发工具、正式包排除 | 不属于运行时源码，不应打入公开安装包 |

## 实际完成的清理

- 多账号在双导入流程中的当前 WebContents 获取复用，减少实现重复。
- 版本与安装配置以 `package.json#build` 为上游来源；`prepare-feed.js` 生成发布配置。
- 统一 UI 名称、安装器产品名、版本显示及错误弹窗名称。
- `assets/branding/dudu-icon.svg` 为唯一品牌图标源；构建自动生成 16–256px ICO 与 PNG。
- 混淆范围分级：增加业务模块保护，但不混淆网页 DOM 注入函数，以免破坏蓝色原生 @。
- 编写独立 v1.0.0 新旧账号、图号、打包及混淆后行为测试。

## 必须保留的兼容标识

- `appId = com.manju.doubao.creativehub.public`
- `%APPDATA%\DoubaoCreativeHubPublic`
- `persist:doubao_<accountId>`
- 旧下载、参考图及用户文件夹路径。

## 故意不做的危险删除

旧版 JS 隐藏入口、迁移格式解析、`store.js`、网页原生操作帮助函数不得仅凭文件名删除；须先有替代实现、调用关系覆盖及真实浏览器测试。

## 尚需真实 Windows 用户验收

- 从 v0.9.9 覆盖安装后是否保留全部登录会话、项目、布局与历史下载。
- 豆包真实网页蓝色原生 @ 是否正确位于每行引用位置。
- 生成中账号、下载和批量导入不会因后台清理受到干扰。
- 安装包的 Windows Defender/SmartScreen 表现、代码签名状态。
