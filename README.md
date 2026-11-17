# 独独AI工作台 v1.2.0

**AI 漫剧创作 · 多账号管理 · 提示词与素材一站式工作台**

> 独立第三方工具，不代表豆包官方客户端。网页自动化依赖豆包当前页面，需用户自行遵守平台规则。

## 完整保留的能力

- 默认25个独立豆包账号位、分组及持久登录分区；切换账号与后台页面清理。
- 剧本 TXT/MD 批量导入、分集分段、段落状态、项目备份与恢复。
- 参考图目录、编号匹配、图片批量上传、原文参考图行尾原生蓝色 @ 验证。
- 参考音色绑定、视频下载归档、FFmpeg 尾帧提取和跨段衔接。
- 模型/API 配置、本地 Windows 加密密钥、联网公告与社群弹窗。
- 主要项目数据保存在本地；公开社群公告不读取豆包账号及素材。

## 安装身份不变

- 新显示名称与快捷方式：**独独AI工作台**。
- Electron 内部 appId：`com.manju.doubao.creativehub.public`（故意不改）。
- 旧数据目录：`%APPDATA%\DoubaoCreativeHubPublic`（故意不改）。
- 登录分区名：`persist:doubao_<账号ID>`（故意不改）。
- 旧下载目录保持原名，以免升级后分散历史成品。

## 开发与打包

在 Windows 安装 Node.js 22 后运行：

```powershell
npm install --no-audit --no-fund
npm run brand:generate
npm run check
npm start
```

正式发布使用 `.github/workflows/build-windows.yml`：自动生成原创新 ICO → 完整回归 → 临时工作区加固 → 加固后运行测试 → Windows NSIS EXE → SHA256 → GitHub Release。
本地 `npm run dist:win` 用于开发调试，未必经过 CI 的混淆步骤；不要把未加固的本地包当作正式保护版分发。

## 安全边界

已使用 JS 混淆、ASAR 与 Electron Fuses。**没有 Themida/VMProtect 商业壳**；没有签名证书时**不宣称已经代码签名**。混淆并非源码加密，不能防止所有逆向分析。
豆包原生蓝色 @ 必须在真实登录环境验证；新品牌覆盖安装须额外验收旧账号和项目。

相关：[安全说明](docs/V100_SECURITY.md) · [重构审计](docs/V100_REFACTOR_AUDIT.md) · [历史版说明](docs/archive/README_v0.9.9_prebrand.md)

第三方 FFmpeg LGPL 许可与来源说明见 `docs/FFMPEG_NOTICE.txt`。


## v1.0.1 原生保护边界（新增）

- `native-core/src/lib.rs`：Rust N-API 原生模块，负责参考图编号识别、原文定位、文件编号匹配。Windows 构建会生成 `native/dudu_core.node`。
- `scripts/replace-with-native.js`：只在正式构建工作目录中，将旧 `import-core.js` 的原始参考图算法替换成调用原生模块的桥接代码。源码仓库保留可维护的原实现，正式安装包不携带原实现。
- `scripts/harden.js`：同时混淆主进程和剩余业务模块；避免破坏豆包网页原生 `@` 组件的注入辅助函数。
- `scripts/verify-package-boundary.js`：从真正的 `release/win-unpacked/resources/app.asar` 提取代码并验证已迁移算法不再以明文 JS 形式随安装包发布。
- **提醒：Rust 编译、JS 混淆、ASAR/Fuses 不能保证绝对防逆向**。Windows 数字签名需另外配置证书，当前没有购买/部署 VMProtect 等商业壳。
- 安装器使用官方 NSIS 的 164×314、150×57 24 位 BMP 视觉资源，保留完整安装/卸载逻辑。主界面右上角不再显示数据目录，入口仍保留在「更多 → 项目管理」。

## Windows 构建与回退

1. GitHub Actions 依次执行 JS 完整回归、Cargo 原生测试、N-API 编译、替换核心、混淆、FFmpeg 实测、NSIS 构建和成品 ASAR 反向检查。
2. **保留安装身份** `com.manju.doubao.creativehub.public`、历史数据文件夹 `%APPDATA%\DoubaoCreativeHubPublic`，旧账号登录分区不更名。
3. 升级前建议备份用户数据。若遇到网页原生 `@` 不兼容，请先回退 `dudu-ai-workbench-STABLE-v1.0.0` 所对应安装包，不删除本地账号与项目。
4. Rust 原生模块只负责本地字符串规则，不接触 Cookie、账号、API Key 或参考图原文件内容。

## v1.2.0｜24小时试用与永久卡密（开发分支）

- Windows授权弹窗：首次试用24小时、永久卡密、复制微信 du4du44 / du6du66、未授权时只读进入与项目备份。
- 设备Ed25519密钥使用Windows DPAPI保护，机器标识仅上传SHA256摘要；Rust编译的验证器核对服务器签名与设备标识。
- 服务器使用Cloudflare Workers + D1，支持卡密随机生成、单设备绑定、管理后台撤销及换机解绑，详见 [license-service/README.md](license-service/README.md)。
- **公开发行前必须部署并配置** DUDU_LICENSE_URL、DUDU_LICENSE_PUBLIC_KEY_B64；未提供时GitHub Actions只跑测试，不生成无法激活的安装包。
- v1.1.0稳定分支和%APPDATA%\DoubaoCreativeHubPublic不变。免费试用从服务器首次成功请求计时，不会清空本地历史项目。
- 本版采用DPAPI软件密钥方案，尚未使用TPM硬件不可导出密钥、商业加壳和Windows数字签名，不承诺绝对防破解。
Trigger v1.2.0 Windows release build

## V1.3 开发分支：内置豆包国际版扩展

- 已将「豆包国际版」扩展作为未打包目录放入 `extensions/doubao-international`；正式安装包通过 `extraResources` 放在 `resources/extensions`，供 Electron 每个持久化豆包账号会话加载。
- 扩展在豆包网页导航前加载；每个账号继续使用原有 `persist:doubao_<账号ID>` 会话，不共享 Cookie。
- Electron 未实现 Chrome `downloads` API 的完整兼容，因此内置扩展通过受限消息桥接调用工作台原生下载通道；下载仍走现有 DownloadManager、集段归档和尾帧流程。
- 原数据目录 `%APPDATA%\DoubaoCreativeHubPublic`、应用 ID、账号分区和下载历史路径保持不变。
- 上游：`chuansd/doubao-international`，提交 `75600f49bc307f42b5be818408650889a639ce25`。本分支仅为 Electron 下载兼容增加桥接，不修改你 Edge 中已安装的原扩展。
- Electron 扩展 API 并非完整 Chrome API；最终仍需在 Windows 登录环境实测图片与视频下载。
