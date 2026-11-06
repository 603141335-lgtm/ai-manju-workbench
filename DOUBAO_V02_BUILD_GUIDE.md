# 豆包创作舱 v0.2 Windows 构建分支

本分支单独保留，未改动原 `main` 上的 AI漫剧素材工作台。

## 上传源工程并自动生成 Windows EXE

1. 从当前 ChatGPT 对话下载 **Doubao_Creative_Hub_v0.2_Full_Source.zip**。
2. 打开本分支的 GitHub 页面（务必检查右上方分支选择是 `doubao-creative-hub-v0.2`）。
3. 点击 **Add file → Upload files**，把整个 ZIP 上传到 **分支根目录**，保持文件名 `Doubao_Creative_Hub_v0.2_Full_Source.zip` 不变，不需要在网站上解压。
4. 提交该文件以后，GitHub Actions 的 **Build Doubao v0.2 Windows EXE from source ZIP** 将尝试自动执行。
5. 构建运行通过后，到 **Actions → 对应 run → Artifacts** 下载 `DoubaoCreativeHub-v0.2-Windows-x64`，解压获取便携 EXE。

> 注：当前已准备工作流，但源码 ZIP 尚未提交到仓库，本分支暂时没有可下载的 EXE。Windows 的真实豆包登录、跨网页视图多图拖拽上传还需本机验证；构建成功不代表该兼容性测试已通过。

## 关键安全约束

- 无需提交真实账号、Cookie、扫码令牌、脚本原文或参考素材；源码 ZIP 只包含应用代码和空项目样例。
- 旧 v0.1.1 的登录分区存储在本地 Electron userData 中，升级不应清空该目录。
- 本分支工作流只打包源码，不运行视频生成或未授权账号自动化。
