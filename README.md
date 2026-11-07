# 豆包创作舱 · Windows 无画布文档工作台

基于原 `doubao-creative-hub-v0.5` 增量开发。保留提示词、剧集段落、参考图索引及原生拖拽，**不包含节点画布**。

## 主要功能
- 导入整集／多集 TXT、MD 提示词，保留台词和完整原文。
- 解析 A01、A01-01、AG14、BL06、E02-05 编号，匹配参考图。
- 段落浏览、编辑校正、单张及多选图片拖拽。
- 本地自动保存、备份／恢复、按集导出。
- 保留旧版 `com.manju.workbench.desktop` 安装身份以及原有 workbench.json 数据，首次启动有非覆盖式迁移。
- 新增「检查更新」；仅在发布者配置真实公开 HTTPS 更新源时启用在线更新；始终支持同身份 NSIS 安装包覆盖升级。

## 构建
```sh
cd app
npm install
npm test
npm run build:win
```
GitHub Actions 将构建 x64 NSIS 安装包，上传至 Actions Artifacts。
CI 在 **仅有获授权商业工具、签名证书和编译后的原生核心** 时才能运行真正的 Themida/VMProtect 商业加壳。未配置时构建结果只具有 JS 混淆与 Electron Fuses/ASAR 完整性加固，不应宣称商业加壳完成。

在线更新源要求：GitHub Actions repo variable `DOUBAO_UPDATE_URL` 设置为自己的公开 HTTPS 静态文件路径，必须在该路径发布生成的 EXE 与 latest.yml；不要在客户端保存私有 GitHub Token。
商业加壳与签名的集成条件及发布验收见 [docs/RELEASE_SECURITY.md](docs/RELEASE_SECURITY.md)。

## 验证
`node tests/test_parser.js`、`node tests/test_main_mock.js` 和 `node tests/test_no_canvas.js`。Windows 真机拖拽与两次覆盖升级仍需手动验收。
