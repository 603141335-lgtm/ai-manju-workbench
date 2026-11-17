# 独独AI工作台 v1.3.1 —— 保留原数据升级说明

## 状态
本分支为 V1.3.1 升级候选版，未完成真实豆包账号/无水印视频 Windows 实机验收。此时不要卸载或覆盖旧版。

## 升级前的数据备份
1. 完全退出旧版「独独AI工作台」。
2. 在 PowerShell 运行：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-workbench-userdata.ps1`
3. 查看脚本输出的备份目录，确认 `config.json`、`workspace.json` 等校验通过。
4. 本脚本只复制 `%APPDATA%\DoubaoCreativeHubPublic`，**不会删除或重置原数据**。外部素材及已下载视频不会被复制，也不会被删除。大批量素材请自行保留原路径。
5. 备份包括账号 Cookie/登录态及 DPAPI 授权缓存，请勿上传到 GitHub 或分享。

## 本次改动
- 插件源码固定于 `extensions/doubao-international`，来自 `chuansd/doubao-international` 的 2026-06-16 版本，附独独 Electron 桥接。
- Electron 每个独立持久会话在打开豆包前加载该扩展。原 Edge 插件不受影响。
- 不依赖 Electron 不支持的 chrome.downloads；经白名单验证后由原生下载通道接管、按集/段/账号归档。
- `src/extension-download-guard.js` 负责页面域名、媒体源域名、文件后缀和路径校验。
- 不改变 appId `com.manju.doubao.creativehub.public`、原用户目录、现有数据文件结构及 `persist:doubao_<账号ID>` 会话名。

## 本地基础测试
`npm install --no-audit --no-fund`
`npm run check:extension`
`npm run check`

## Windows 发布
已添加 `.github/workflows/build-v131-doubao.yml`。要生成实际可激活的安装包，GitHub Actions 必须能分配 Windows runner，并且必须提供已部署且验签通过的 `DUDU_LICENSE_URL` 和 `DUDU_LICENSE_PUBLIC_KEY_B64` 仓库变量。绝不能为让构建通过而绕过原有授权检查。

## 验收清单
- 登录状态和每个账号隔离保持
- 能显示插件已加载，豆包页面出现无水印下载按钮
- 对同一视频，工作台和 Edge 插件下载的视频文件水印状态一致
- 原来第几集/第几段归档和尾帧功能继续工作
- 覆盖安装后原项目、参考图、下载设置和卡密信息不变
- 任一验证失败都保持旧版并回滚升级，而不删除原用户目录
