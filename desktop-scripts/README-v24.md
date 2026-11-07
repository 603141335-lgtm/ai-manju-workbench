# Multi-AI Chat Desktop v2.4（Windows 桌面版）

## 来源与兼容性
- 桌面底座使用 MIT 开源 [TED-H-com/multi-ai-chat-desktop](https://github.com/TED-H-com/multi-ai-chat-desktop)，固定提交 `2b87d509b8242c371d492d43aef08cc679a0dddc`。完整构建仍保留上游版权和许可证。
- 在 v2.3 增量升级基础上加入国内 AI 原生会员窗口与 API 接力；不再切换成浏览器本地网站。
- 与原版网页适配器兼容的 ChatGPT / Gemini / Claude / Grok / Meta AI 保持原接口；原有辩论、咨询、头脑风暴等内置流程保留。
- 新版不会修改旧版在你本机已经保存的登录 Cookie 文件，但 Tauri WebView 会话仍可能遇到服务提供商的登录策略变化；**不保证跨版本/账号的登录状态一定不失效**。

## 用法
1. 在 GitHub Actions 的 `Build Multi-AI Chat Desktop v2.4` 运行中，从底部 Artifacts 下载 Windows ZIP。
2. 解压并优先使用 NSIS 安装器（如有）。安装前备份旧版数据，保留原有 EXE 备用。
3. 软件侧栏 `国内 AI · 会员网页 / 官方 API` → `展开接入`。点击豆包 / DeepSeek / Kimi / 千问卡片。会新建一个 **Windows 原生 WebView 窗口**，登录、模型选择与聊天在该网站页面完成。它们尚未作为内置四方辩论参与者自动收发。
4. 使用 `API 顺序接力`：输入原始任务；为每个步骤选择提供商、职责、详细指令和官方模型 ID；填写 API Key；手动确认费用；开始。软件保留每一步完整文本并将其附在下一步输入后面。失败、中断或文本超过限制会停止，不会伪造回复。
5. 可新增到 8 个 API 步骤。本机保存步骤及成果，**不会将 API Key 写入本地设置/历史**。密钥只在这次软件窗口内存中使用，重新启动需重新填写。

## 会员与 API 区别
- 网站会员/Plus/Pro 由网站自身控制，不能直接当 API Token 使用。
- 网页成员的 `工作模式`、`深度思考`、`Pro` 等档位，应在官网原生窗口手动选择；当前新增窗口不自动点击这些档位，也不自动抓取内容。
- 自动 API 接力只有填写有效 Key、模型 ID 和具备额度时才可以真实执行，并可能单独计费。
- 如果你使用的模型不支持 OpenAI-compatible `chat/completions`，该步骤会显示真实错误，不会转为假回复。

## API 官方地址（由软件固定白名单控制）
- DeepSeek: `https://api.deepseek.com/chat/completions`
- 豆包 / 火山方舟: `https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- Kimi / Moonshot: `https://api.moonshot.cn/v1/chat/completions`
- 千问 / 阿里云百炼: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`

为避免模型版本变更，软件不替你猜测型号；在对应官方 API 控制台复制**当前可用的 Model ID**。

## 必须做的本机验收
1. 官网窗口四家分别打开、登录、退出软件后再次打开，验证会话保留情况。
2. 原生 ChatGPT、Gemini 登录状态及四方辩论正常，无明显回归。
3. 不配置 Key 时，API 接力明确阻止开始。
4. 分别测试 DeepSeek/豆包两个有效 API 账号；检查原始任务→前序输出→后一阶段是否正确交接。
5. 测试 API 失败时不继续扣费调用下一阶段、完成结果可复制及读取本地历史。
6. 安装前备份，确认新版本数据能正确加载。

## 有意未实现
- 自动操控或自动抓取全部第三方网页会员聊天输出（未验证各平台是否允许及技术稳定性）。
- 将国内四个原生窗口直接加入原版四方辩论/群聊的自动网页接力。
- 长期加密保存 API Key（本版为内存临时输入）。
- Windows 程序的代码签名；首次运行可能出现 SmartScreen 提示。

项目状态以实际 GitHub Actions 构建结果和本机验收为准。源码提交不等于第三方会员实测成功。
