# 豆包创作舱 Windows 发布、安全与升级须知

## 当前已实现
- 工作分支从 `doubao-creative-hub-v0.5` 创建，保留原业务流程；源分支不覆盖。
- 经过源文件扫描，没有独立画布引擎或页面；自动测试防止将节点画布功能重新带入。
- GitHub Actions 构建 Windows x64 NSIS 安装包，包含 SHA256 清单。
- 生产流水线对 `renderer.js`、`parser.js` 做 JavaScript 混淆，排除源码映射和开发测试文件。
- 启用 Electron Fuses（禁用 Node 环境调试入口）和嵌入式 ASAR 完整性校验。
- 保留旧 `com.manju.workbench.desktop` 应用安装身份；老 `workbench.json` 会以非覆盖方式迁移到固定数据目录。
- 软件界面显示「检查更新」。未配置更新源时会提示“尚未配置”，**不会谎称在线更新正常**。
- 配置真实 `DOUBAO_UPDATE_URL` 之后，程序才能读取 HTTPS 的 `latest.yml` 并下载更新。

## 当前未完成（不可伪装成已经交付）
**尚未获得 Themida/VMProtect 商业授权**，且原源码为 Electron JavaScript 工程，并无可供商业二进制保护工具处理的独立关键原生组件。
因此当前产物不是商业加壳版。JS 混淆和 ASAR 无法阻止专业逆向者提取代码。
也没有提供 Windows Authenticode 数字签名证书，默认安装程序可能出现 Windows SmartScreen 警告。

## 商业壳的正确接入顺序
1. 识别高价值算法，迁入 x64 Rust/C++ 原生模块（DLL 或独立辅助 EXE）。
2. Windows 测试该原生模块独立运行和与 Electron IPC/API 的兼容。
3. 用合法授权的 Themida（备选 VMProtect）保护**该模块**，不得直接对整套 Chromium 运行库重壳。
4. 在最终签名**之前**完成保护；构建后扫描可读核心字符串和代码导出风险。
5. 配置 Windows 代码签名证书，并在 CI 秘钥里设置 electron-builder 使用的 `CSC_LINK`、`CSC_KEY_PASSWORD`。
6. 验证安全软件误报、性能、功能、软件关闭/再次启动、安装、升级回滚。
7. 已购商业工具的 CLI /许可证必须仅放在受控 Windows 构建环境，不得提交到此仓库。

## 在线更新源
- 仓库是私有源码库，不可将私有 GitHub Token 打包给用户。
- 在 Actions 仓库变量设置 `DOUBAO_UPDATE_URL`，例如自己的 **真实** HTTPS 静态发布目录（末尾 /）。
- **只填写可用地址**；需要上传本次构建生成的 NSIS EXE、对应 `latest.yml`（及按需 blockmap），且版本保持一致。
- 未配置更新源也可以通过相同 appId 的新版安装包覆盖升级。
- 更新前导出项目 JSON 备份；CI 无法替代 Windows 真机上连续两次升级的演练。

## 交付验收
- node tests/test_parser.js
- node tests/test_main_mock.js
- node tests/test_no_canvas.js
- 生产混淆后再次运行上述测试
- Windows Actions 构建 *.exe、SHA256 清单，实际能解压与启动
- 真机检查 Ctrl/Shift 多选、图片拖拽、提示词复制、目录扫描、导入导出、恢复备份
- 真机从 v1.0.0 原位升级到 v1.1.0 后检查原 workbench.json 与参考图路径
- 有真实 HTTPS 更新源之后测试“检查→下载→安装”；再升级第二次验证不会生成新安装记录
