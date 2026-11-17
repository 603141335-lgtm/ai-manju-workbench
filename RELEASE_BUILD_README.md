> **V7 重要修复**：临时构建目录现包含 `INSTALL_Python312.cmd`，解决 `npm run check` 的 ENOENT 失败。参见 `V7_STAGING_TEST_FIX_README.md`。

> **V6 更新（Electron 下载失败）：** 已将 `npm exec -- install-electron` 替换为直接调用 lockfile 锁定的 Electron npm 包安装脚本，支持官方源/npmmirror/经官方 SHA-256 验真的浏览器下载 ZIP。详见 `ELECTRON_DOWNLOAD_FIX_V6.md`。本文件原有正式授权与数据保护规则不变。

# 独独AI工作台 V1.3｜Windows 安装包构建工程（已开发）

**工程版本**：V1.3.0（2026-11-16）  
**交付形式**：清理后的完整源码 + Windows 本地一键构建脚本 + 安全检查 + 测试。  
**重要区别**：本 ZIP **不是已经编译好的 EXE**。完成正式授权配置和 Windows 构建以后，才会产生可分享的 `DuduAI-Workbench-Setup-v1.3.0-x64.exe`。用户安装成品时**不需要**开发工具。

## 1. 当前已经完成

- 保留原 Electron 工作台全部业务源码、账户管理、素材与提示词、授权 UI，未重新设计界面。
- 发行版本统一成 `1.3.0`，根 `package.json`、根 `package-lock.json`、界面版本徽标同步。
- 正式安装身份：`com.manju.doubao.creativehub.public`；正式数据仍为 `%APPDATA%\DoubaoCreativeHubPublic`，测试数据仍为 `%APPDATA%\DoubaoCreativeHubLocalTest`。
- 安装包命名采用 ASCII，避免浏览器下载中文乱码；安装后的软件名仍为中文“独独AI工作台”。
- 旧 `BUILD_Windows_EXE.cmd` / `一键打包Windows安装版.cmd` 全部改为指向同一正式构建器，避免旧 V1.0 脚本误打包。
- `scripts/build-release-win.ps1`：临时目录白名单复制、npm 锁定依赖、Electron Windows 运行时、Rust 原生模块、12 页实际 UI 教程生成、FFmpeg LGPL、远程授权签名证明、JS 保护、NSIS 安装、真实 ASAR 检查、SHA256。
- `scripts/release-preflight.js` / `scripts/release-security-scan.js`：阻止工作台身份变化、测试密钥/账户资料/云端后台源进入正式安装包。
- 已去掉上传 ZIP 中的 `license-service/.private`、`license-service/.dev.vars`、所有 `node_modules`、Wrangler 本地状态、历史运行数据；**绝不向客户分享上传的原始 ZIP**。

## 2. 制作完整 Windows 安装程序

请在 **Windows 10/11 x64** 电脑上操作，建议把本 ZIP 解压到短路径，例如：`C:\DuduAI-Release-Build`。这个目录是新的发布开发副本；**不要覆盖现有工作台或 AppData 目录**。

**开发打包电脑先安装以下工具（客户安装 EXE 时不需要）：**

- Node.js 22 或更新版，含 npm（https://nodejs.org）
- Rust stable `x86_64-pc-windows-msvc`（https://rustup.rs）
- Visual Studio 2022 Build Tools 中的 C++ 编译工具和 Windows SDK（https://visualstudio.microsoft.com/visual-cpp-build-tools/）
- Python 3.12（https://www.python.org/downloads/）
- 能访问 npm、Electron/GitHub Releases、Crates.io、Playwright 浏览器下载源与 FFmpeg LGPL 发布源的网络

**遇到 Python 3.12 缺失时（你当前的进度）：**

1. 双击 `INSTALL_Python312.cmd`，它会检查 Python 3.12 是否已经安装；仅在你键入 `YES` 后才调用 Windows Package Manager 安装 **Python.Python.3.12**（仅当前 Windows 用户）。
2. 若电脑没有 `winget` 或网络不可访问，可从 [Python 官方 Windows 下载页](https://www.python.org/downloads/windows/) 安装 **3.12.x 64 位**；不需要卸载你现有的 Python 版本。
3. 新开一个命令提示符，执行 `py -3.12 --version` 或重新运行 `CHECK_Build_Tools.cmd`。如果 `python` 仍打开微软商店，是 Windows 应用执行别名问题；新版构建脚本会优先直接定位真正的 Python 3.12，无需全局关闭安全设置。
4. 全部显示 `[OK]` 后再次双击 `BUILD_Windows_EXE.cmd`。正式授权网址与 Ed25519 **公开验证公钥**仍是最终生成可分享安装包的必需条件。

**注意**：Python 只安装在你的打包电脑上，客户使用最终 EXE 不需要安装 Python。Python 安装脚本不会变更现有源码、授权后台、卡密、D1 或支付配置。

**操作：**

1. 解压本 ZIP，双击 `CHECK_Build_Tools.cmd` 查看依赖检查结果。
2. 双击 `BUILD_Windows_EXE.cmd`（或中文版 `一键打包Windows安装版.cmd`）。
3. 按提示只输入 **正式 Cloudflare Worker 的 HTTPS 根地址** 和 **原 Ed25519 SPKI Base64 公钥**。这两项是公开校验信息，**不要输入管理员令牌、商户密钥或签名私钥**。
4. 构建器会自动检测原有授权 Worker 的 `/v1/license/attest` 是否真的使用该公钥对应的签名私钥。失败就停止，不会生成错误的正式安装包。
5. Windows 构建、业务测试与成品 ASAR 检查全部通过后，生成：

```
release/
  DuduAI-Workbench-Setup-v1.3.0-x64.exe
  SHA256SUMS.txt
  RELEASE_NOTES.txt
build-logs/
  build-YYYYMMDD-HHMMSS.log
```

安装客户只需下载并运行 EXE。正式安装包不需要在客户电脑上运行本机 Worker、Node.js、npm、Rust、Python、GitHub Actions 或批处理启动器。

### 不知道授权网址、公钥在哪里？

请在你原来**部署了正式授权 Worker** 的电脑/Cloudflare 控制台中查询原部署记录，例如 `license-service/.private/deployment-public.json`（如果原来存在）。公钥也可能保存在你自己的 GitHub Actions Variables `DUDU_LICENSE_PUBLIC_KEY_B64` 中。**绝对不要把 `.private/owner-keys.json`、`.dev.vars` 或 D1 数据库发给任何人**。公开版不允许使用 `127.0.0.1:8788` 测试 Worker。没有正式 Worker 时，安装包构建会按设计停止；先完成服务器备份和部署验收，不能通过更换新密钥来绕过。

### CMD 窗口显示错误怎么办？

打开 `build-logs` 中最后生成的日志。日志内可能含路径、公开的 Worker 域名，但不应包含任何管理员令牌。若 Windows 反病毒软件拦截 Electron、Rust 或 NSIS，先检查杀毒隔离记录，不应关闭系统防护来强行打包。

## 3. 安装后必须实际验收

1. **纯净 Windows**：不用安装 Node/Python/Rust，双击 EXE 成功安装并正常显示窗口。
2. **数据兼容**：备份正式目录 `%APPDATA%\DoubaoCreativeHubPublic`，覆盖升级后历史账号、剧本、参考图、提示词和已完成状态仍存在。
3. **授权**：首次试用、卡密激活、服务器无响应、网络中断及授权过期都可正确处理。
4. **工作流**：25个账号位、网页登录会话、切换不终止后台任务、图片编号与原生蓝色 @、视频下载和 FFmpeg 尾帧实际验证。
5. **卸载**：验证卸载不会删除用户历史数据。
6. **支付**：正式微信/支付宝回调和自动发卡必须独立做受控商户验收；代码测试通过并不等于真实收款已验收。

尚未完成的 Windows GUI/生产支付验收不得作为“已通过”向客户宣传。

## 4. 安全与维护说明

- 原源码和原上传 ZIP 应由管理员私有保留；这个文件夹是开发/打包文件，不发给普通客户。
- 临时构建目录位于 Windows `%TEMP%`，所有原生桥接替换和混淆仅修改临时副本。
- 客户发行文件只应包括 EXE、SHA256SUMS 和简要使用说明；切勿发行本源码 ZIP。
- 已内置英文命名减少中文 ZIP 文件名问题；Windows 安装 UI 继续显示中文软件名。
- **没有 Windows 签名证书时**，生成的 EXE 不会被声称已签名，Windows SmartScreen 可能警告。
- 在线自动更新只有具备可信的 HTTPS 更新源和签名校验后才开放；默认保留手动下载安装更新方式。

## 5. 本轮已执行的测试（当前 Linux 工作环境）

- `node --test tests/*.test.js`：**140 项，其中 137 通过、0 失败、3 跳过**（跳过项为未构建的 Rust Windows `.node` 等环境相关项目）。
- `node --test license-service/tests/*.test.mjs`：**59 通过、0 失败**。
- `node scripts/release-preflight.js`：通过；新增发布专项 `node --test tests/release-package.test.js`：5 通过、0 失败。
- 缺少 Windows 原生编译工具与外网依赖下载，**没有执行真实 Windows NSIS 打包，尚无 EXE，更没有做 GUI 双击安装验收**。

该报告只记录真实执行结果，不代表 Windows 实际构建已经验证成功。
