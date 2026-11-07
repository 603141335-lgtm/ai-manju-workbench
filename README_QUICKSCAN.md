# 快递快扫｜源码长期存档与下次升级入口

**当前已存档版本：v0.15.0**（2026-11-07）  
**GitHub 仓库：** `603141335-lgtm/ai-manju-workbench`  
**长期维护分支：** `quickscan-v0150-fastqueue`  
**Android 源码目录：** `quickscan-android/`  
**发布版本：** https://github.com/603141335-lgtm/ai-manju-workbench/releases/tag/quickscan-v0.15.0-preview  
**升级记录：** https://github.com/603141335-lgtm/ai-manju-workbench/pull/8  
**自动构建：** `.github/workflows/quickscan-apk.yml`

## v0.15.0 已实现
- “失败件”集中查看全部批次拍照但未成功识别的面单，照片缩略图、放大、手动补录并归档到原批次。
- 调整 ML Kit 的几何选择逻辑，允许已成功解码的旋转、竖向和倾斜条码；不再强制横向长方形。
- 长时间没有识别结果时尝试节流重对焦。
- 保留一维码连续扫码、三档识别速度、扫码弹窗、语音/震动、批次、SQLite、成功后自动拍照、照片管理、XLSX 导出。

## 下次升级直接使用
> 请在 GitHub 仓库 `603141335-lgtm/ai-manju-workbench` 的 `quickscan-v0150-fastqueue` 分支、`quickscan-android/` 源码目录中继续开发快递快扫 v0.15.0。务必先完整阅读本文件、`quickscan-android/PROJECT_METADATA.json`、`quickscan-android/CHANGELOG.md` 和 `quickscan-android/UPGRADE_GUIDE.md`。只在独立新分支增量修改，不动 main 的 AI 漫剧工程；保留全部现有数据格式与功能；完成编译、静态检查，提供真实可下载 APK。

## 安装和数据安全
- 当前 `applicationId=com.kuaidi.quickscan.v0141`，数据仅存在对应 Android 应用的私有空间。
- v0.15.0 是调试签名测试版。签名证书如果与手机中的旧 APK 不一致就无法覆盖安装；**不能为此卸载旧版清空数据**。
- SQLite 数据库为 `quickscan_offline.db`，原始照片位于应用私有 `files/photos`；升级需要优先考虑数据备份/迁移。
- 云端构建和 Lint 已通过。实际扫描速度/误识别和照片交互仍要真机验证，不承诺百分百准确。
- 以后每次新版都应先存档旧版分支或发布标记，随后再升级。

原有开发文档：`quickscan-android/README.md`、`quickscan-android/UPGRADE_GUIDE.md`。
