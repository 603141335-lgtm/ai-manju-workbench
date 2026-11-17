# 代码保护和发布说明

## 实现的加固
1. 在临时构建副本对脚本进行 JS 混淆，禁 Source Map；保留源码仓库里的可读代码。
2. Electron Fuses 禁 Node 调试入口并强制 ASAR，开启 ASAR 完整性验证。
3. Windows NSIS `appId: com.manju.doubao.creativehub`，保持产品名 `豆包创作舱`。
4. 不把豆包 Cookie、账号密码、安装令牌、用户项目或私有文件打进安装包。
5. GitHub Actions 构建后计算 EXE 的 SHA256 并通过 GitHub Releases 分发，绕开已满额的 Actions Artifacts。

## 尚未达到的保护
- 没有 Themida / VMProtect 商业许可证，因此**不是专业商业加壳版**。
- JS 混淆不阻止熟练分析者解包，ASAR 不是加密。
- 还没有把敏感算法迁移到 Rust/C++ DLL。未来如需商业壳，应先迁移关键逻辑并验证 Electron 和原生模块集成，再由授权 Themida / VMProtect 对该 DLL 加壳，在签名前执行。
- Windows 签名证书尚未提供；Windows SmartScreen 可能提示未知发布者。

## 原位升级和登录隔离
- 原产品 appId、package name、productName 保持不变；不调用 `app.setPath('userData')` 改换目录。
- 原 `config.json`、`workspace.json`、`downloads.json` 等非画布用户数据在同一 userData 中，旧的 `canvas-v05.json` 留在磁盘不删除。
- 账号登录来自 `session.fromPartition('persist:doubao_' + accountId)`，升级不得变更分区前缀。
- 从 v0.5 portable 迁移到 NSIS 的“安装条目”是首次建立，登录数据迁移依赖用户数据目录和原 package/productName 不变；实际能否保持网页 Cookie 仍需 Win10/Win11 登录后实机验证。
- 配置在线升级需真实 HTTPS 静态更新源，且 EXE、latest.yml、blockmap 一致；不能把私有 GitHub Token 埋到客户端。未配置不启用联网下载。

## Windows 实机验收
1. 原 v0.5 登录 3 个豆包账号，关闭程序。安装新版后打开逐个切换并检查会话，不能重新生成空目录、丢账目。
2. 导入多集文档并复制全文，编号 A01 / A01-01 / AG14 / BL06 不串号；通过多选图片拖拽进入网页上传区域，并用“备用上传文件夹”确认真实文件。
3. 检查画布按钮和独立画布窗口均不存在；其余功能可用。
4. 关闭/重开检查账号、剧集、完成状态和布局保存；备份与恢复。
5. 使用更高版本同 appId 安装包覆盖安装，不出现第二套快捷方式，不清空 AppData；联网更新必须等 HTTPS 发布源就绪后才测。
6. 针对误报、签名、安装与撤销注册项分别测试。
