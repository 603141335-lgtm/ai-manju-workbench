# 快递快扫 | 后续升级操作说明

## 项目唯一入口
- 仓库：`603141335-lgtm/ai-manju-workbench`
- 长期开发分支：**quickscan-app**
- 代码根目录：**quickscan-android**
- 自动编译工作流：`.github/workflows/quickscan-apk.yml`
- 已知成功版本：v0.8（于 2026-11-05 云端编译，未承诺真机全部功能通过）

## 给下一次 AI 的标准任务
> 从 GitHub `603141335-lgtm/ai-manju-workbench` 仓库的 `quickscan-app` 分支读取 `quickscan-android/` 全部最新源码，继续升级快递快扫。保留原有条码、拍照、照片管理、Excel 导出/分享、声音、批次和查询功能。按我这次提出的需求只做增量修改，记录 CHANGELOG.md，跑 GitHub Actions 生成并验证 APK，给我可下载文件。不要影响 main 分支的 AI 漫剧项目。

## 版本与包名（必须注意）
- `versionCode` 必须每次递增，`versionName` 体现新版本。
- 正式连续升级**必须固定包名和签名密钥**，否则不能在原地更新且保留记录。
- 目前 v0.8 的 `applicationId=com.kuaidi.quickscan.v08`、临时 Debug 签名只适于试用。
- 不得把个人正式签名私钥放进公开源码/Git 提交；建议保存在 GitHub Actions Secrets 并留离线备份。
- 不要为解决签名冲突直接让用户卸载含数据的旧版；优先安排数据导出/迁移。

## 重点回归测试
1. 一维条形码连续扫描准确；不识别二维码。
2. 成功/重复/失败语音及震动是否正确。
3. 模糊条码拍照成功且关联当前批次。
4. 照片打开全屏、双指放大、分享、另存能用。
5. 批次选一张或全选删除照片；确认照片文件实际消失，单号/时间/备注保留。
6. Excel 完整明细与仅单号真实是 xlsx；在 WPS/Excel/腾讯文档打开正常；前导零和长数字不变。
7. 系统选择应用分享时授予临时文件读取权限。
8. 原有数据在升级前后能否继续访问，绝不假设自动迁移。
9. 记录 GitHub Actions 构建运行链接、结果和已知问题。

## 文件安全
- SQLite：`ScanDb.kt` 对应应用内部数据库。
- 图片：`files/photos`。
- 临时分享的 Excel：`cache/exports`。
- 卸载应用会清理该应用私有文件和数据库。Excel 不包含照片文件本身。
- 云端构建的 Artifact 默认 30 天到期；真正需要长期 APK 分发需另建正式发布流程。
