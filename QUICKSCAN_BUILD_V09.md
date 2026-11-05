# 快递快扫 v0.9 | 成功构建记录

构建日期：2026-11-05

- 仓库：`603141335-lgtm/ai-manju-workbench`
- 维护分支：`quickscan-app`
- 构建源码提交：`b6eddd6bf0ea5d01ba1af993c9262b0d4ac1beb4`
- GitHub Actions：<https://github.com/603141335-lgtm/ai-manju-workbench/actions/runs/41987095602>
- 结果：**success**，Build APK / Verify APK / Upload APK 皆通过
- Artifact ID：`13396996357`，名称：`QuickScan-Android-APK`
- 原始 APK：`app-debug.apk`，26,704,660 bytes
- APK SHA-256：`5397700c8f1d84b487da63393b9853e78d88e0eee666e41780201412dc0c6f7c`
- APK 包名：`com.kuaidi.quickscan.v09`
- 版本：`0.9`

## 本版已实现

- 完整明细 Excel 导出时备注带「已结算」，不修改软件内部原备注；仅单号导出不附加结算列
- 新建日期批次默认为手机本地 `M.d`
- 摄像头框在上、最新识别单号在下、四个小图标操作
- 每次有效新条形码自动留照片；拍照期间暂停识别以防关联错件
- 拍照失败保留单号并支持原记录补拍
- 继承 v0.8 的 1D 条码、中文提示音、照片单/全选删除、全屏查看、Excel 分享

## 现实限制

该 APK 是 GitHub Actions 调试签名测试版，未经过 vivo 真机全功能测试。
由于以新包名安装，可与 v0.8 并存，**两个版本的数据不会自动合并或迁移**。
不要卸载含有重要快递记录、照片的旧版。以后若需要数据连续升级，应设计稳定包名、持久化签名、备份与迁移机制。
