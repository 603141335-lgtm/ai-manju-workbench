# V7 — 修复临时构建目录中的 Python 安装辅助脚本缺失

**针对用户日志**：`npm run check` → 154 tests / 1 fail，`ENOENT: ...\INSTALL_Python312.cmd`。

**根因**：`scripts/build-release-win.ps1` 的临时目录复制白名单在 V6 中没有包含 `INSTALL_Python312.cmd`，但 `tests/release-package.test.js` 在临时目录运行时仍会读取此文件。PowerShell 前置检查在原工程通过，并不意味着临时目录有相同文件。

**修复**：将 `INSTALL_Python312.cmd` 加入临时目录的 `Copy-SafeFile` 显式列表；同时增加两处回归断言，未来禁止再次遗漏。`release-build.json` 的 `files` 仍仅打包 `src/**/*`、`assets/branding/**/*`、`native/*.node` 和 `package.json` 等应用资源，**不会将 Python 安装辅助批处理放进用户安装包**。

**已实际验证**（当前 Linux 环境）：
- `node --test tests/*.test.js`：155项，151通过、0失败、4跳过。
- 按 PowerShell 复制白名单模拟独立临时目录后执行 `npm run check`：155项，151通过、0失败、4跳过。
- `node --test license-service/tests/*.test.mjs`：59项通过。
- `node scripts/release-preflight.js`：通过。
- **尚未**在用户 Windows 电脑完成 Electron / Rust / FFmpeg / NSIS 全流程编译；本修复只解决日志中的明确阻断。

## 推荐使用方法：仅修复原来的 V5 + V6 工程

1. 关闭独独AI V1.3 图形化打包中心。
2. 解压 `DuduAI_V13_Staging_Test_V7_QuickFix.zip`。
3. 将补丁里的 `scripts` 和 `tests` 两个文件夹复制到你目前工程的 `DuduAI_V13_Full_Source_V5` 根目录，合并文件夹，提示时点击**替换目标文件**。不要将补丁再额外套一层文件夹。
4. 重新双击原工程根目录的 `OPEN_DUDUAI_BUILD_CENTER.cmd`，点击「源码与安全自检」，通过后点击「正式制作安装 EXE」。
5. 若之后出现新错误，保存 `build-logs` 文件夹中最新的 `gui-*-release.log` 的**最后错误部分**，不要公开任何管理员令牌或私钥。

完整工程替代方案：下载 `DuduAI_Workbench_V1.3_Build_Staging_Fix_V7.zip`，解压后打开 `DuduAI_V13_Full_Source_V7` 文件夹使用，不需要套用以前 V2～V6 的零散补丁。

**重要**：这两份仍是源码构建工程，不是已经完成的 EXE。正式授权 Worker 需要保持在线；打包过程不修改原云端和用户配置。
