# Multi-AI Chat Desktop v4.0-M1 — 原版内核增量开发

## 已实现源码
- Windows 原生 WebView：豆包、DeepSeek、Kimi、千问、腾讯元宝。
- 每个平台最多 10 个账号位；1 号位沿用 v3 旧窗口及登录数据。
- 2—10 号位使用独立持久化 WebView2 用户数据目录。
- 原版五个候选 AI / 四个活跃席位、六种工作模式和旧版群聊/API 模块继续保留。
- 网页会员与 API Key 分离，腾讯元宝仅作为官网网页，不会进入 API 自动接力选项。

## 没有声称已完成的功能
- 国内平台网页自动发送、自动读取回复、自动切官网模型、统一群聊自动接力。
- 多个国内网页完全嵌入同一主窗格。当前为软件内部独立官网 WebView 窗口。
- Windows 真实账号测试必须由用户在本机完成；静态检查不能证明登录成功。

## GitHub 构建
在仓库 Actions 页面运行 `Build Multi-AI Chat Desktop v4.0 M1 (native multi-account)`。
每个步骤先执行上游补丁，再通过 v4 静态检查、`pnpm verify`、`cargo test` 和 `pnpm tauri build`。
成功后从该运行的 Artifacts 下载 `Multi-AI-Chat-Desktop-v4.0-M1-Windows`，优先执行 NSIS 安装器；不要将测试失败的构建标记为正式版。

## 本机验收
- 登录豆包 1 号位，检查旧会话仍在。
- 登录豆包 2 号位另一个账号，重启后分别检查，确保两个账号不串。
- 分别打开 DeepSeek 与腾讯元宝，确认网页能进入且不要求 API Key。
- 切到原版 Free / Debate / Consult / Coding / Roundtable / Brainstorm，确认没有破坏旧功能。
- 在原有统一群聊内运行两家已有 API 成员，检查真实回复来源、暂停和恢复。

问题记录需包含 GitHub Actions 运行号、Windows 版本、发生页面、复现步骤；绝不提交 Cookie、密钥和聊天内容。
