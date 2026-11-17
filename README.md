> **V7 重要修复**：临时构建目录现包含 `INSTALL_Python312.cmd`，解决 `npm run check` 的 ENOENT 失败。参见 `V7_STAGING_TEST_FIX_README.md`。

# 独独AI工作台 V1.3｜独立 Windows EXE 构建工程 V6

本 ZIP 是**完整项目源码 + Windows 自动构建控制中心**，不是已经编译完成的 Windows 安装包。不要把本 ZIP 直接当成给客户的安装程序。

## 建议操作（Windows 10/11 x64）

1. 解压整个 ZIP，进入最里层同时包含 `package.json` 与 `OPEN_DUDUAI_BUILD_CENTER.cmd` 的文件夹。
2. **双击 `OPEN_DUDUAI_BUILD_CENTER.cmd`**，出现“独独AI工作台 V1.3 安装包构建中心”窗口。
3. 按顺序点 **① 环境检查**、**② 源码与安全自检**。检查完窗口依旧保持。
4. 如此前日志显示 Electron 下载 `TypeError: fetch failed`，V6 将自动尝试官方源及备用镜像。若仍失败，在构建中心用「Electron 44.10.2 离线 ZIP」导入从浏览器下载的正版 ZIP，V6 会对照 npm 包内官方 SHA256 自动验真。详见 `ELECTRON_DOWNLOAD_FIX_V6.md`。
5. 窗口已填入你之前提供的**公开** Cloudflare Worker HTTPS 地址和 Ed25519 SPKI 公钥。只有在它们已更换时才需要编辑。绝对不要填管理员令牌或私钥。
6. 点 **③ 正式制作安装 EXE**，确认后会执行 npm ci、Electron、Rust、FFmpeg、12张教程截图、混淆、NSIS、安装包检查。
7. 最终成功后，进入 `release/DuduAI-Workbench-Setup-v1.3.0-x64.exe`，在 Windows 上安装并做功能验收，确认登录、项目和授权可用后再分发。

**如果控制中心无法启动**：先在命令行执行 `py -3.12 --version`，确认 Python 3.12 已安装。也可以双击 `BUILD_CONSOLE_KEEP_OPEN.cmd` 使用命令窗口备用模式（窗口不会自动关闭）。

**如果构建失败**：点击“打开构建日志”，把 `build-logs/gui-日期-release.log` 最后的错误行发给 AI；若中途 PowerShell 闪退，GUI 会仍然停留并显示返回码。单独的 PowerShell 转录日志 `build-*.log` 同样保留。

## 与此前旧版本区别

- 不用再叠加 V2、V3、V4 修复包，所有相关修复已合并到此工程。
- Windows PowerShell 文件采用带 BOM 的 UTF-8 编码；构建依赖清单不依赖旧版中文 `.cmd` 文件名。
- 图形界面直接启动 PowerShell 并实时保存日志；不会在构建脚本异常退出时一闪而过。
- Windows 本机 Python 3.12 检测支持 `py -3.12`；原工程和用户数据保持不变。
- 正式版必须通过授权服务器 `/v1/license/attest` 的 Ed25519 签名校验；不能依赖 localhost 测试环境。
- 临时构建副本在失败时保留，成功后自动清理。

## 真实交付边界

这份源码在 Linux 端执行了 JavaScript、Python 静态和单元测试。当前环境没有 Windows MSVC、Windows Electron 可执行文件和 NSIS，不能替代 Windows x64 实机打包和安装验收，因此**这里没有虚构的 EXE**。完成后的真正安装程序应在你的 Windows 电脑 `release` 目录下出现。

## 安全提醒

这是**源码工程**，不是公开发布给用户的安装包，里面没有额外提供管理员密钥。用户安装包只能包含公开的授权验证公钥，不能包含私钥、卡密管理员令牌、支付证书或本地浏览器登录数据。Windows 安装版不需要客户安装 Node/Python/Rust。


## V8 正式授权网络超时修复
使用 `CHECK_Worker_HTTPS.cmd` 区分 Worker 连接错误与 Node 网络差异；详见 `V8_LICENSE_NETWORK_FIX_README.md`。不跳过 Ed25519 验签。
