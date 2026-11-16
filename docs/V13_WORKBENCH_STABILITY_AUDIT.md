# 独独AI工作台 V1.3 — 稳定性审查与保护清单

> 范围：Windows Electron 工作台、账号与数据存储、AI 上传任务相关入口、Cloudflare V1.3 独立本机测试连接、CI/发布安全边界。开发分支：`feature/v13-workbench-stability-audit`。本文不宣称零缺陷或已通过真实 Windows GUI 全流程验收。

## 一、已从源码确认并修复的高风险点

| 严重程度 | 问题 | 修复方式 | 相关文件 |
| --- | --- | --- | --- |
| 阻断 | 根目录没有 `package-lock.json`，原启动器直接执行 `npm ci`，导致 EUSAGE | 按实际锁文件存在性选择 `npm install` 或 `npm ci`；保留独立后台的锁定依赖 | `scripts/start-local-dev.cjs` |
| 阻断 | Electron 44 的原生运行文件不随 `npm install` 下载，`npm rebuild electron` 不负责下载 | 调用 Electron 42+ 官方 `install-electron` 内置命令并验证文件体积，失败则提示网络/杀毒软件问题 | `scripts/start-local-dev.cjs`、`tests/local-dev-startup.test.js` |
| 阻断 | 固定等待 10 秒，旧 Worker 或后台没启动时仍打开工作台 | 检查端口并通过 Ed25519 签名证明验证 **实际本机测试密钥**；只有确认服务就绪才启动桌面端 | `scripts/start-local-dev.cjs` |
| 高 | 多层 CMD 引号拼接，Windows 文件路径含空格和括号时不可靠 | 启动器改为 Node 子进程和明确参数；本机 Wrangler 使用 Node argv，不拼接 CMD 命令 | `START_DUDUAI_LOCAL_TEST.bat`、`license-service/scripts/run-local-test.mjs` |
| 高 | 测试版与正式工作台原先共用 %APPDATA% 用户目录 | 开发测试显式标记 `DUDU_LOCAL_TEST_PROFILE=1` 并独立使用 `DoubaoCreativeHubLocalTest`；正式打包版始终保持 `DoubaoCreativeHubPublic` | `src/main.js`、`license-service/scripts/prepare-local-test.mjs` |
| 高 | 账号配置损坏时可能自动重新初始化空白账号 | 不覆盖损坏文件，保留原文件及损坏备份；升级不兼容时停止并提示；保存前保留上一个版本 | `src/account-config-store.js`、`src/main.js` |
| 中 | 账号编辑失败但内存状态已变化 | 失败时恢复本次修改前的内存数据；删除账号前验证账号/运行任务 | `src/main.js` |
| 中 | 人物音频绑定同时保存导致临时文件竞争；损坏文件可能被覆盖 | 串行化保存、写入前快照、前一版备份、损坏原文件阻止覆盖 | `src/voice-bindings.js` |
| 中 | 导入任务状态并发刷新同一临时文件 | 任务记录排队保存，保留写入失败原因 | `src/task-journal.js` |
| 中 | 加密 API 配置损坏后可能被默默清空 | 原文件隔离备份并拒绝覆盖、前端显示警告、排队保存并保留前一版 | `src/api-settings.js`、`src/renderer.js` |
| 高 | 实验集成分支推送可能触发正式安装包发布工作流 | 正式发布工作流只监听稳定发布分支；独立审查工作流只做测试，不发布 | `.github/workflows/build-windows.yml`、`.github/workflows/workbench-stability-checks.yml` |

## 二、已核对但本轮不改动的模块

- 参考图编号解析、上传计划和蓝色 @ 原生验证：`src/parser.js`、`src/import-engine.js`、`src/import-core.js`、`src/mention-runner.js`。为避免破坏已有网页兼容性，不对豆包 DOM 选择器做无证据重写。
- 多账号与 Electron WebContentsView：`src/main.js`，保留 `persist:doubao_<账号ID>` 格式（**测试版通过独立 userData 目录隔离**）。
- 分集/分段和参考图库：`src/workspace.js`，现有 JSON 版本、写入队列、.bak 与旧版迁移行为保持。
- 视频成品下载、尾帧、FFmpeg：`src/downloads.js`、`src/tailframe.js`，保持原有归档和尾帧关联。
- 授权与管理员后台：原 D1 ID、原签名密钥、原设备及卡密记录、生产 Worker 不变；测试模拟支付与退款不涉及真实资金。

## 三、验证级别与剩余风险

- 已完成：重要 CommonJS 源文件的 JavaScript 语法解析检查；独立内存文件系统下验证账号配置初始写入、原文件保留、损坏拒绝覆盖、备份行为。
- 用户之前提供的 V1.3 旧版测试日志为 59/59 通过；这**不等于**此次改动后已经重新通过。
- 已新增自动化回归：账号配置损坏与备份、本机 ZIP 安装路径选择、Ed25519 签名验证、测试用户目录隔离、音频/API/任务并发写入。
- **尚未完成**：变更后整套 Node 测试在 Windows 上运行；Electron GUI 启动、25个豆包账号登录保持、后台切换、真实网页上传/@验证、下载/尾帧、覆盖安装、微信/支付宝商户回调的真机验收。
- GitHub Actions 若未分配 Runner/不提供有效日志，不视为通过；不得仅凭提交成功就合并/上线/宣布可分发安装包。

## 四、Windows 验收入口

用 GitHub 浏览器下载整个本分支 ZIP、完整解压到**新目录**，保留原版程序和个人数据不删。

1. 双击项目根目录 `START_DUDUAI_LOCAL_TEST.bat`。
2. 启动器自动安装并运行桌面和后台检查；有错误会停止，命令窗口保持打开。
3. 通过 Ed25519 本机后台签名核对后，才启动独立测试配置的工作台。
4. 分别检查授权试用、永久卡密、`/admin`、`/__test` 支付和退款状态。
5. 再分别验证参考图、分集分段、历史提示词、豆包账号会话及后台窗口交互。

本机管理员测试令牌、.dev.vars、owner-keys.json 绝不能发到聊天或 GitHub。**正式工作台和原数据库均不修改。**
