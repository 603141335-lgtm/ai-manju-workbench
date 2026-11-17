# v0.6.0 变更
- 基于用户确认的实际浏览器源码 `01_豆包创作舱_v0.5_单独包.zip`，修复此前错误定位。
- 精确删除画布窗口、画布相关页面／JS、IPC 以及画布测试；保留嵌入式豆包 WebContentsView、账号隔离、扫码登录与所有原有漫剧文档和素材功能。
- 新增应用内检查更新按钮。未配置真实 HTTPS 更新源时仅提示手动覆盖更新，不伪称自动更新。
- 把原 portable 构建改为具有固定 appId 的 NSIS 安装版。保留原 name/productName/appId，不清理 userData 文件和账号分区。
- JS 混淆、Electron Fuses、ASAR 完整性校验；商业二进制壳尚未应用。
- Windows EXE 打包未经过本机真机验收；网页登录、跨网页多文件拖拽需在目标电脑真实检查。
