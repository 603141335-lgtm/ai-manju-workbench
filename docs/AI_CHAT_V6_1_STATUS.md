# Multi-AI v6.1 开发状态（WQ-B）
- 安全增量目录：`tools/multi-ai-v6.1-queue/`，原主分支漫剧素材工作台未删除。
- 新增 OpenAI 兼容 API 模型接力（New API 等上游需要用户自己配置真实 Key），混合阶段与模型选择。
- 新增按阶段真实 Token 用量，明确不伪造金额；API 请求失败或进程崩溃时阻止重复自动发起。
- 保留30集逐集状态、SHA256原文版本保存、人工质量最终确认、暂停、重试与断点恢复。
- Electron 系统托盘运行：关闭窗口隐藏至托盘，退出程序停止任务。
- CI 改为 GitHub Releases 上传试验版安装包，以回避 Actions artifacts 存储限额。

## 未完成
- 目前是逐集任务引擎原型，不是完整的 Chatbox + New API 客户端整合。
- ChatGPT / Google Gemini 会员网页只能手工交接，不支持无人值守抓取。
- 每集剧情语义自动审核和无人工30集完成仍未实现。
- Windows 真机安装及真实上游 API Key 运行未验收（CI 模拟上游响应属于传输测试）。
