# 快递快扫 v0.12 | 编译与验证记录

- 日期：2026-11-05
- 源码仓库：`603141335-lgtm/ai-manju-workbench`
- 长期维护分支：`quickscan-app`
- 编译源码提交：`4c17f10a1613a92cb5eac2b534f420af4b051c35`
- GitHub Actions 构建：<https://github.com/603141335-lgtm/ai-manju-workbench/actions/runs/41999016466>
- 云端结果：`success`（Build APK / Verify APK / Upload APK 全部通过）
- Artifact ID：`13401019740`；名称：`QuickScan-Android-APK`
- APK 文件名：`app-debug.apk`
- APK 大小：26,704,656 bytes
- APK SHA-256：`bea5fad8e4a41ec998941bc1205b6e4622437ed5a6d59797281239b41921bd29`
- APK 压缩结构：通过完整性检测；包含 AndroidManifest.xml 和 DEX 文件。
- 版本：`0.12`；包名：`com.kuaidi.quickscan.v012`

## 本版核心更新
- CODE128 连续2帧、ITF 连续3帧，保留中心位置、条码尺寸、跨帧位置一致性检查。
- 事务插入 + SQLite 非空单号按 batch_id/code 的唯一索引，阻止同一批次完全相同的单号重复入库。
- 默认只展示最近14条（搜索最多100条），降低频繁重绘负担。
- 使用低延迟拍照模式、JPEG质量82。
- 照片保存后才播报“成功”，减少听到提示马上移动面单而造成照片串件风险。
- 保留 Excel 仅导出时备注“已结算”（软件内部备注不变）、日期批次、照片查看、删除、分享等。

## 已进行的校验
- GitHub 云端构建成功。
- ZIP 和 APK 文件结构完整性检查通过。
- 通过 SQLite 约束独立测试验证：同一批次重复单号只能保存一次；不同批次可以有相同单号；空单号照片留底记录可以有多条。

## 尚未验证
- vivo 手机的实际识别速度、误扫情况、连续扫码及自动拍照效果。
- 未能提供100%误码率保证：错误识别成另外一个有效单号时，数据库唯一索引无法拦截。
- 本 APK 为独立调试包，不覆盖 v0.11，旧版历史记录/照片不会自动迁移；不要卸载仍有重要数据的旧版。
- 后续稳定升级需要统一包名、持久化签名及数据迁移机制。
