# 豆包国际版（独独AI工作台内置版）

此目录基于上游开源项目 `chuansd/doubao-international` 的 main 分支制作，采用上游提交：`75600f49bc307f42b5be818408650889a639ce25`。

上游项目 README 声明 MIT License；上游仓库当前未提供独立 LICENSE 文件。保留上游作者与项目来源信息。

## 集成改动

- 保留上游豆包 / Dola 页面解析、图片原图 URL 提取、视频无水印 URL 解析和 15 秒请求改写逻辑。
- 版本标记为 1.0.1（独独工作台集成版）。
- Edge / Chrome 环境仍优先使用 `chrome.downloads`。
- Electron 环境不依赖未受支持的 `chrome.downloads` API；改由 `chrome.tabs.sendMessage` 转交当前页面，再通过独独AI工作台的受限 preload IPC 下载桥交给主进程。
- 主进程只接受豆包 / Dola 页面发起的请求，并校验 HTTPS 媒体域名白名单；下载文件继续走现有 DownloadManager，按项目、集、段、账号归档，并沿用现有尾帧处理。

## 上游

- https://github.com/chuansd/doubao-international
- https://github.com/chuansd/doubao-international/commit/75600f49bc307f42b5be818408650889a639ce25
