> **V7 重要修复**：临时构建目录现包含 `INSTALL_Python312.cmd`，解决 `npm run check` 的 ENOENT 失败。参见 `V7_STAGING_TEST_FIX_README.md`。

## V6 - Electron 下载失败诊断及镜像/离线 ZIP 回退（2026-11-16）

- 修复 `npm exec --no -- install-electron` 的 `TypeError: fetch failed` 下载阻断：改为固定版本的原生安装脚本，并提供官方/npmmirror 回退。
- 新增 `scripts/ensure-electron-win.js`：精确版本检查、离线 ZIP 官方 SHA-256 校验、可恢复下载与可读错误说明。
- 图形化构建中心新增离线 Electron ZIP 选择栏，环境检查与源码自检不再错误显示“EXE 已生成”。
- 原授权、公钥、产品身份和正式 AppData 路径保持不变，不上传测试身份或客户数据。
- 测试：Node 150 pass / 4 skip，Python GUI 11 pass（以本轮复测结果为准），Windows EXE 未构建。

# 更新记录

## V1.3 工作台稳定性加固（开发分支，未发布）
- 修复 Electron 44 运行文件缺失：通过官方内置 `install-electron` 显式下载并校验，不再误用 `npm rebuild electron`。
- 修复完整 ZIP 根目录缺少 package-lock.json 导致 npm ci 直接报 EUSAGE。
- 启动本机后台时验证 Ed25519 签名与测试公钥一致，不再固定等待10秒，保留失败错误输出。
- Windows 本机测试与正式账号、Cookie、项目和授权缓存隔离；生产版用户目录及 Cloudflare D1 不变。
- 账号配置、人物音频、任务状态、加密 API Key 的异常保存/并发写入增加保护与前一版备份。
- 分离 Windows 自动化检查与正式安装包发布入口，实验开发分支不会自动发布生产包。
- 新增回归用例；实际 Windows GUI、多账号、豆包网页上传及支付仍需实机验收。详情：docs/V13_WORKBENCH_STABILITY_AUDIT.md。

## v1.0.0 — 2026-11-04
- 建立 Windows Electron 桌面工作台源码基线。
- 多集/多段连续滚动、提示词复制、素材识别、原生多文件拖拽接口。
- 加入本地项目保存、重复编号版本选择、缺图提示、按集导出、测试入口。
- 当前仍需 Windows 实机验证与豆包/即梦网页实际拖拽验证。
- 历史 HTML 整集工具 v3.2 的识别逻辑作为后续回归标准。
