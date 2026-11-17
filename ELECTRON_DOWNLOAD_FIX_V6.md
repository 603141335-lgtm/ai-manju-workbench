# 独独AI V1.3 | Electron 下载失败修复 V6

## 你之前卡住的地方

运行 `npm ci` 成功后，旧构建器运行 `npm.cmd exec --no -- install-electron`，返回 `TypeError: fetch failed`。这一步与工作台原业务源码无关，它是在下载 Windows 版 Electron 44.10.2 的运行文件。

## 推荐：完整 V6 构建中心

1. 解压 `DuduAI_Workbench_V1.3_Electron_Download_Fix_V6.zip` 到新的英文路径（例如 `D:\DuduAI-V13-V6`）。**不要覆盖原项目工作目录或 AppData。**
2. 双击 `OPEN_DUDUAI_BUILD_CENTER.cmd`，原来的 Windows、Python、Node、Rust 无需重新安装。
3. 授权公开地址和公钥仍然填写你原来已经确认的那一对；**绝对不要输入管理员令牌、支付密钥或 Ed25519 私钥**。
4. 点击「③ 正式制作安装 EXE」。V6 自动按顺序尝试已缓存的 Electron、官方 GitHub Releases、官网文档所列 npmmirror 镜像。
5. 如果网络下载仍失败：使用 Chrome/Edge 浏览器下载下面的 Electron ZIP，保存到电脑的“下载”文件夹。再打开图形构建中心，在「Electron 44.10.2 离线 ZIP」位置点击「浏览文件」，选中刚下载的 ZIP，重复第4步。

**Windows Electron 44.10.2 x64 浏览器下载链接（只能下载精确版本）：**

官方：
https://github.com/electron/electron/releases/download/v44.10.2/electron-v44.10.2-win32-x64.zip

备用：
https://npmmirror.com/mirrors/electron/44.10.2/electron-v44.10.2-win32-x64.zip

V6 会从锁定版本 `node_modules/electron/checksums.json` 获取官方 SHA-256 值，**先核实 ZIP 与原始 Electron 发布文件完全一致，再解压使用**。不必关闭 Windows Defender，也无需手动覆写 `node_modules`。

如果浏览器下载也失败，请换一个能正常访问 GitHub Releases 的网络；不要从不明网站下载未经验证的 EXE。

## 已有 V5 的用户：只覆盖小修复

将 `DuduAI_V1.3_Electron_Network_V6_QuickFix.zip` 里的 `scripts`、`tests` 等文件夹和说明文件直接解压到 **V5 原工程根目录**（与 `package.json` 同一层），选择替换同名文件，再重新双击 `OPEN_DUDUAI_BUILD_CENTER.cmd` 即可。

注意：V6 仅修改本地打包工程，**不会**部署 Cloudflare、不修改卡密数据库、不重置原账号；失败时保留 GUI 日志和临时构建目录。

## 当前确认过的测试与限制

- Windows 系统及构建工具检测：用户的 V5 运行日志中已全部 `[OK]`。
- V6 的 Electron 离线 SHA、镜像选择、版本检查与 GUI 逻辑已完成源码/模拟测试。
- 此 Linux 环境没有 Windows Electron/NSIS，**没有实际编译出 EXE**，因此安装包生成与 Windows 实机安装仍需在你的电脑完成。
- 通过 Electron 阶段后如果仍有新的网络步骤失败，请以 GUI 日志中的具体错误为准，不能预先声称所有后续联网任务都成功。

目标安装包：`release\DuduAI-Workbench-Setup-v1.3.0-x64.exe`
