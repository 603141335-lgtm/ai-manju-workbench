# 快递快扫 | 安卓快递扫码登记工具

**当前版本：v0.10（严格扫码测试版）**
- 代码位置：`quickscan-android/`
- 开发维护分支：`quickscan-app`
- 编译方式：GitHub Actions → **快递快扫 | 构建安卓 APK**
- 构建工程：Android / Kotlin / CameraX / Google ML Kit / SQLite
- 仓库：`603141335-lgtm/ai-manju-workbench`
- 原漫剧软件位于 `main` 分支；请勿把快递源码误当成漫剧应用。

## 已有功能（v0.8）
1. 仅识别常见快递**一维条形码**，不扫 QR 二维码。
2. 相机连续识别、重复提示、中文语音“成功 / 重复 / 失败”、震动反馈。
3. 每日批次管理，扫码时间精确到秒，完整或末四位搜索。
4. 模糊条形码拍照留底、之后补录；照片保存在本地应用私有目录 `files/photos/`。
5. 照片全屏预览、双击/双指放大、分享和另存手机。
6. 批次内照片管理：单选、全选、取消选择、永久删除选中的原始照片；**保留单号、时间和备注**。
7. Excel `.xlsx`：完整明细 / 仅单号；单号作为文本避免科学计数法；可保存、分享或选应用打开。
8. 蓝色图标和主题、扫码画面中央无遮罩提示字。

## 开发目录
| 文件 | 用途 |
| --- | --- |
| `app/src/main/java/com/kuaidi/quickscan/MainActivity.kt` | 界面、CameraX 扫码、拍照、搜索、分享、删除 |
| `app/src/main/java/com/kuaidi/quickscan/ScanDb.kt` | SQLite 本机批次和记录 |
| `app/src/main/java/com/kuaidi/quickscan/ZoomPhotoView.kt` | 全屏照片缩放 |
| `app/src/main/java/com/kuaidi/quickscan/XlsxWriter.kt` | 原生 xlsx 输出（不依赖付费服务） |
| `app/src/main/res/drawable/` | 软件图标 |
| `app/src/main/AndroidManifest.xml` | 权限与文件共享 Provider |
| `app/build.gradle.kts` | 版本号、应用 ID、Android 编译依赖 |
| `.github/workflows/quickscan-apk.yml` | GitHub 自动生成 APK |
| `CHANGELOG.md` | 每次升级的变更记录 |
| `UPGRADE_GUIDE.md` | 升级、签名和数据安全说明 |

## 以后升级怎么做
直接告诉 ChatGPT：**“继续升级我的 GitHub 快递快扫，仓库 603141335-lgtm/ai-manju-workbench，分支 quickscan-app，代码在 quickscan-android，按我的新需求改完并编译 APK。”**

1. 从 `quickscan-app` 读取最新源码，避免用旧对话中的压缩包覆盖。
2. 修改应用代码 → 递增 `versionCode` / `versionName` → 更新 `CHANGELOG.md`。
3. 提交到 `quickscan-app`，GitHub Actions 自动构建；确认构建为绿色。
4. 从 Actions 的最新成功任务中下载 APK Artifact；实际在手机测试。

## 非常重要：APK 升级与数据
当前 v0.9 属于实验阶段，使用 GitHub Actions **临时调试签名**，包名为 `com.kuaidi.quickscan.v09`。以后即使包名不变，不同构建的临时签名也可能导致覆盖安装失败。

**源码能长期留在 GitHub，不代表 APK 可以不丢数据地覆盖升级。**

要实现真正的“后续直接升级并保留扫码数据”：
- 固定正式 `applicationId`（不每次变成 v09/v10）。
- 在可信环境生成专用签名密钥，并妥善保存，CI 通过 GitHub Secrets 引入；签名密钥不可提交 Git 仓库。
- 对版本升级增加数据库迁移与数据备份/恢复方案。
- 在具备可靠备份前，**不要卸载**已经存储重要单号和照片的旧版软件。
- 文件导出不包括照片二进制；照片需另存/分享才可以离开应用内部目录。
- 旧调试版的原始数据不会自动同步到后续独立安装版。

> 本目录是源代码存档，不是直接打开运行的网页。编译需要 GitHub Actions 或 Android SDK。

## v0.9 新增
- 新批次按本地当日 `M.d` 自动默认命名，重复时选择已有或 `-2` 后缀。
- 镜头在上，最新识别单号在下方；操作收纳为 4 个小图标。
- 成功扫描新单号强制自动拍照并绑定，拍照中暂停识别下一件；失败保留单号。
- 完整明细的 Excel 导出备注自动加“已结算”，但不修改本机 SQLite 备注；仅单号不变。

## v0.10 严谨识别与单页操作

- 仅识别 CODE128 / ITF 快递一维条形码（不识别 QR、EAN/UPC 商品码、CODE39）；经过中心位置、条码尺寸、编号长度和连续八帧一致性检验，待人工再次核对后点击“确认登记并拍照”入库。
- 第一次识别不直接保存，以防一帧误识别造成错单号；复扫同号显示重复，不重复保存或拍照。
- 不能保证摄像头算法绝对无误，**确认前必须与纸面单号核对**；如单号无法读清应拍照留底后手动补录。
- 上方是无遮挡文字的拍摄画面、辅助绿色网格；下方紧接快捷工具、待确认单号和实时列表，输入框可搜本批单号或末四位。首页也支持跨批次查询。
- 严谨入库与用户此前 v0.9 每单自动拍照并不冲突：每次确认通过后仍然自动拍照。
- v0.10 使用独立 applicationId，旧版数据不自动迁移；不要卸载带数据的 v0.9。
