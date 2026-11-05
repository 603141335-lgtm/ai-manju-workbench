# 快递快扫 v0.10 | 安卓 APK 编译记录

- 日期：2026-11-05
- 维护分支：`quickscan-app`
- 源码提交：`0403f5dd7e6174b1f1bd190dd43dc9e79c3e973c`
- GitHub Actions：https://github.com/603141335-lgtm/ai-manju-workbench/actions/runs/41993632167
- Build APK、Verify APK、Upload APK：全部 `success`
- 构建产物 ID：`13399840582`
- 下载产物：`QuickScan-Android-APK`（压缩包内 `app-debug.apk`）
- APK 大小：26,704,660 字节
- APK SHA256：`d3fbfa0cd424ce063e4ecfbd139da8b0dcb6f1cdb583060a1bcb89acac488942`
- applicationId：`com.kuaidi.quickscan.v010`（独立测试安装）
- versionName：`0.10`
- **未经过真机的准确率、双扫识别和自动拍照性能测试**，仅保证编译通过与安装包文件结构合法。

## 与前版不同的重点
- 只识别 CODE128 / ITF 一维码，不识别 EAN / UPC 等商品码与二维码。
- 拒绝偏离画面中心、尺寸不合理、长度不合理的候选。
- 连续 8 帧且至少 400ms 一致性校验。
- **未按“确认登记并拍照”之前，不会写入新快递单号。**
- 同号再扫检测当前批次中的重复件。
- 拍摄界面上方大取景框、绿色参考网格；下方工具、候选单号与本批扫码列表。
- 首页可直接查询所有批次的单号或末四位。
- 日期批次、Excel 导出备注已结算（仅导出时添加）、自动拍照、照片单/全选删除仍保留。

## 数据保护
本版与 v0.9 包名不同，测试版不会原地替换 v0.9，且数据不自动互通。不要卸载仍保存重要扫码和照片记录的旧版。
