# Multi-AI Chat Desktop v3.0｜完整产品、技术与验收规格书

版本：v3.0 设计基线 R1  
编制日期：2026-11-07  
目标平台：Windows 10/11 x64，单机个人使用，Tauri 原生桌面客户端  
目标：把原本分离的原生网页登录、API 模型、私聊、群聊、工作流、成果管理整合为一套真正可以验收的系统。  
**状态说明：这是待实施的设计规格，不是宣称 v3.0 已开发完成。**

---

## 0. 执行摘要与不可妥协的约束

**产品一句话定义：** 像 QQ 一样管理 AI 联系人和群聊；像工作流编排器一样为成员分工、@指定成员、并行回答、顺序交接；同时保留各自的会员官网登录，官方 API 则承担受支持的可靠自动执行。

必须遵守：

1. **原版优先保全。** 继承已验证的 Tauri 原生网页登录、WebView、会话、四方辩论、多方咨询、头脑风暴、Coding、自由聊天，不允许因新功能重构而删减。每次修改有回归清单。
2. **严禁伪造。** 未收到真实回复，不写入“AI 已回答”；未启动实际接口，不显示“已成功执行”；无法判断第三方网站状态，则展示“未知/需人工操作”。
3. **自动执行只走允许且验证过的通道。** 官网页面可留在应用内原生浏览，但不默认有自动收发权限。会员不等于 API； API 有独立 Key、模型和费用。
4. **不静默截断。** 大文件、长剧本和跨步骤传输需要分块/引用，任何无法完整传递的环节都必须暂停并通知；不能把“精简”变成删剧情。
5. **数据第一。** 旧设置、登录资料、历史聊天、任务成果必须备份且可回滚；迁移失败不得破坏原数据。
6. **先验收再交付。** 只有 GitHub 构建 + 自动测试 + Windows 真机核心路径测试全部通过，才可以宣布正式版可用。

### 0.1 确认的基线与现存缺口

当前上游底座：`TED-H-com/multi-ai-chat-desktop` 固定源码提交 `2b87d509b8242c371d492d43aef08cc679a0dddc`，v2.3/v2.4 为 GitHub 分支增量补丁。v2.4 GitHub Actions Run `42348465832` 已成功生成 Windows 构建产物，**不等于国内模型真实账号登录和调用已全面验收**。

具体技术债：

- `shared/types.ts` 中 `AIProvider` 仅为 `chatgpt | claude | gemini | grok | meta`，核心工作流受此枚举限制；国内 AI 现仅旁路面板，未进入统一成员体系。
- 原生控制台有“活跃席位/待机”约束；不能简单放十几个网站 WebView 常驻。必须使用实例池和可用能力状态。
- v2.4 新增 `zh-CN`、`slate` 主要在前端补丁中；上游 Rust `src-tauri/src/settings.rs` 的 `LANGUAGES` / `RESPONSE_LANGUAGES` 列表及前后端主题规范需同步，防止设置保存后重置。
- v2.4 的“国内 AI”窗口与“API 接力”独立于原聊天和流程记录，真实群聊未统一。
- 现有流程的完成与网站响应是不同概念；不得仅凭 UI 的绿色状态判断真正执行。

### 0.2 研发范围与非范围

| 项目 | v3.0 必做（P0） | 后续（P1/P2） |
|---|---|---|
| 桌面版 | 原版登录与原生 WebView 保持；可安装 EXE | Linux/macOS 适配 |
| 私聊/群聊 | 联系人、群、成员、@、多会话、搜索、可见消息状态 | 云端多人协作 |
| 多模型 | 已验证网页成员 + API 成员统一标识与能力矩阵 | 让所有第三方会员网页都能自动调用 |
| 自动接力 | 可运行的 API-to-API、人工网页交接、条件/暂停/恢复 | 未经授权的任意网页 DOM 接管 |
| 数据 | SQLite + 目录内附件 + 备份/回滚 | 多设备云同步 |
| 主题 | 简体中文、浅色/深色/蓝灰、窗口尺寸适配 | 高级皮肤市场 |
| 模式 | 普通、同时回答、讨论、顺序接力、自定义流程 | 任意无限循环或无限上下文 |

## 1. 操作体验与功能总览

### 1.1 入口导航（一级菜单，固定不超过六项）

1. **消息**：私聊、群聊、会话搜索、置顶、草稿、历史、消息状态。
2. **AI 联系人**：模型与接入配置、网页会员、API、账号档案、状态和能力。
3. **工作流**：内置模板、接力编辑器、执行队列、运行历史。
4. **素材与成果**：文件、剧本文档、分镜提示词、阶段结果和版本。
5. **历史/任务**：按状态筛选失败、待人工、执行中、已完成任务。
6. **设置**：语言、主题、布局、存储、备份、日志、更新和安全。

### 1.2 首页布局（最小 1100×720，推荐 1440×900）

```
┌─ 侧边导航 ─┬── 会话与群组（可收起） ──┬──────── 统一聊天 ────────┬─ 工作流/群成员（可收起）─┐
│ 消息      │ 搜索联系人/群          │ 群名 | 模式 | 成员状态    │ 成员名单、能力标志     │
│ AI联系人  │ +新建私聊 +创建群      │ 我：@Gemini 完成剧本     │ ① Gemini · 编剧        │
│ 工作流    │ 置顶：漫剧制作群        │ Gemini：剧本已完成       │ ② ChatGPT · 分镜       │
│ 成果      │ 剧本审核群              │ 系统：已交接给 ChatGPT   │ ③ 豆包 · 优化          │
│ 任务      │ Gemini 私聊            │ ChatGPT：生成分镜…      │ 状态/暂停/重试/费用    │
│ 设置      │ 豆包 私聊              │ 📎 附件 | @成员 | 输入    │ 编辑流程/历史成果      │
└───────────┴────────────────────────┴──────────────────────────┴───────────────────────┘
```

- **左侧**不展示网页或大模式卡片，专心找对象；**中间**以 QQ 式气泡/角色标记展示真实回复；**右侧**默认只在群聊工作流时展开。
- 顶部仅展示“协作模式、当前连接方式、当前使用的模型/档位、成员状态”；展开设置才显示高级项。
- 视图：标准聊天 / 紧凑聊天 / 多 AI 并排 / 制作工作台；视图只改变布局，不改变消息数据。
- 主题：浅色、深色、专业蓝灰。颜色、字体、间距通过 Design Tokens 统一控制，避免旧版深色背景和白卡片冲突。
- 鼠标和键盘可用：`Ctrl+K` 搜索、`Ctrl+N` 新会话、`Ctrl+Enter` 发送（可配置）、`Esc` 关闭弹层，`@` 弹出成员列表。

## 2. 完整页面清单（按 P0 和 P1）

| 编号 | 页面/弹层 | 必须交互 | 完成定义 |
|---|---|---|---|
| UI-01 | 消息首页 | 切换私聊/群聊、查看状态、搜索 | 真实数据来自本地库，不是静态演示 |
| UI-02 | 私聊窗口 | 选成员、发送、附件、会话重命名 | 结果来源有 API 或网页来源标识 |
| UI-03 | 创建/编辑群 | 群名、添加/移除成员、@权限 | 保存后再次打开仍保持正确 |
| UI-04 | 群聊主界面 | 手动@、全员、接力、引用回复 | 群内显示分角色消息和运行事件 |
| UI-05 | AI 联系人库 | 搜索、添加、复制成员档案 | 同一提供商可配置多独立成员 |
| UI-06 | AI 成员详情 | 名称、角色、连接方式、模型、能力 | 不支持的按钮会禁用及说明原因 |
| UI-07 | 会员原生网页 | 登录、登出、会话选择、原生模式 | 保持独立登录资料目录；失败有提示 |
| UI-08 | API 账号配置 | Key、安全保存、测试连接、模型 ID | 测试发送成功且可撤销密钥 |
| UI-09 | 协作模式下拉 | 普通、同时回答、辩论、接力、自定义 | 与具体模型推理档位独立 |
| UI-10 | 工作流编辑器 | 增删、排序、分工、分支、确认点 | 保存后运行的是同一流程版本 |
| UI-11 | 运行监控侧栏 | 执行状态、当前成员、耗时、费用 | 每一步状态与真实事件对应 |
| UI-12 | 人工网页交接 | 复制输入、打开官网、粘贴回复、确认 | 没有人工确认不能自动跳下一步 |
| UI-13 | 成果中心 | 原始稿、各步骤文本、附件、导出 | 完整保留原文及来源版本 |
| UI-14 | 历史与搜索 | 会话、任务、时间、关键字筛选 | 数据库重启后搜索结果不丢 |
| UI-15 | 备份/恢复中心 | 导出、校验、恢复、回滚 | 不覆盖原数据；支持先预演 |
| UI-16 | 错误诊断 | 连接失败、受限网页、日志、复制错误 | 不输出 Cookie、Token、API Key |
| UI-17 | 更新与关于 | 查看版本、回退、检查更新 | 下载的文件带版本号和校验值 |
| UI-18 | 技能/规则模板管理 | 导入文本、版本、作用域、预览 | P1：群规则与私聊规则严格隔离 |

### 2.1 创建群聊的完整操作

点击 `+ 创建群聊` → 填写群名 → 从 AI 联系人库选择成员 → 对每位成员设置“群内职责/使用连接方式/默认模型” → 选择协作模式 → 保存 → 自动创建空会话 → 用户输入消息或@指定成员。

一个成员可以存在于多个群，但每个群的 `member_assignment` 分别保存职责与提示词。创建新群不会自动继承上个群中的临时技能；可主动选择全局模板或复制旧群配置。

### 2.2 会话与消息行为

- 用户和各 AI 使用独立 ID。所有消息有 `message_id / conversation_id / sender_member_id / turn_id / role / content_ref / source / created_at / status`。
- 状态区分 `草稿、待发送、已发送、生成中、已完成、失败、被取消、需要人工`；前端不根据文字猜测状态。
- 人工粘贴的官网回复显示“人工导入 · 来源：Gemini 官网（用户确认）”，不能标记为自动抓取。
- 修改历史消息会新建版本；已交给后续 AI 的旧版本保留，以便查清发生过的行为。
- `@AI` 只决定路由候选目标；如果当前成员不具备自动调用能力，弹出“打开官网/人工交接”而不是假装成功。

## 3. 三层模式选择（不能混为一谈）

**层 A——协作模式：** 普通私聊、指定成员、全员同时回答、四方辩论、多方咨询、头脑风暴、Coding、顺序接力、自定义流程。

**层 B——成员接入方式：** 官方网页会员、官方 API、两者都有（独立配置），不可用/需登录/授权不足。

**层 C——平台的模型与推理模式：** 提供商实际支持的模型 ID、思考程度、工作/Agent 档位、Pro/High/Medium 等；来源和可验证程度必须标明。

- 网页会员：官网内自行选择具体模型及档位；若无获授权的可靠读取方法，软件显示 `当前官网档位未知` 或 `用户手动设置`，不伪造已切换。
- API：从官方模型列表或控制台录入模型 ID、参数与能力，并做连接测试；名称不能直接当计费模型 ID。
- 群内成员如 `Gemini（编剧）` 与 `Gemini（审核）` 可以引用不同的账户、模型、API 端点，但必须在联系人资料里可追踪。

## 4. 统一成员与连接器架构

### 4.1 核心对象

- `ProviderCatalogEntry`：提供商 ID、显示名、官方网页、官方 API 白名单、支持类型、原生适配器版本。
- `ConnectionProfile`：用户登录资料配置，类型 `web_membership | api | manual`，关联具体提供商与配置版本。
- `AiMember`：群聊中的逻辑 AI 联系人，引用提供商+连接配置，允许自定义昵称、头像、默认角色。
- `CapabilitySnapshot`：标明 `canOpenWeb, canManualChat, canAutoSend, canAutoReceive, canUpload, canReadStatus, supportsThinking, supportsTools, maxContext, verifiedAt`；所有能力分为 `supported / unsupported / unknown / degraded`。
- `ConversationMember`：某一群内成员的角色、规则、模型配置、活跃状态，与其他群隔离。

### 4.2 统一调用接口（TypeScript 概念）

```ts
type ConnectionKind = 'api' | 'web_native' | 'manual';
type Capability = 'supported' | 'unsupported' | 'unknown' | 'degraded';

type MemberRuntime = {
  memberId: string;
  providerId: string;
  connectionId: string;
  kind: ConnectionKind;
  canAutoSend: Capability;
  canAutoReceive: Capability;
  modelId?: string;
};

type RunStepRequest = {
  runId: string;
  stepId: string;
  idempotencyKey: string;
  memberId: string;
  originalArtifactId: string;
  dependencyArtifactIds: string[];
  instructionVersionId: string;
};

type StepResult =
  | { status: 'completed'; artifactId: string; source: 'official_api' | 'verified_web'; providerRequestId?: string }
  | { status: 'waiting_manual'; handoffId: string }
  | { status: 'failed'; errorCode: string; retryable: boolean }
  | { status: 'unknown_completion'; providerRequestId?: string };
```

统一 `MemberExecutor` 隔离 UI 与执行通道。群聊或工作流只向统一路由发请求，不直接碰官网 DOM，也不直接在 UI 组件里调用第三方 API。

### 4.3 国内 AI 的接入策略

| 平台 | 原生网页窗口 | API | 自动加入群聊的条件 |
|---|---|---|---|
| ChatGPT | 保留上游原生 WebView | 按已授权官方 API 配置 | 具备可用的可靠自动调用路径 |
| Gemini | 保留上游原生 WebView | 官方 Gemini API | 同上 |
| Claude、Grok | 保留原版接入 | 官方接口（实际验证后） | 同上 |
| 豆包 | 已新增独立原生窗口 | 火山方舟或豆包助手官方接口 | API 实际测试通过；网页人工交接可参与 |
| DeepSeek | 已新增独立原生窗口 | 官方 DeepSeek API | 同上 |
| Kimi | 已新增独立原生窗口 | Moonshot API | 同上 |
| 千问 | 已新增独立原生窗口 | 阿里云百炼 API | 同上 |
| 其他 | 先作为人工官网入口 | 按官方 API 能力逐一适配 | 不做“仅填 URL 即自动接力”的承诺 |

**严格验证项：** 每个平台分开检查导航、登录、登录留存、原生聊天、发送能力、回复捕获权限、付费模式、可用模型、API 参数和限流。功能矩阵必须来自实测与明确支持，而不能根据平台知名度推断。

### 4.4 登录资料与多账号

- 原版已经使用 WebView2/原生 Tauri WebView。继承这一设计，会员账号在各自原生窗口登录，避免跳出普通浏览器。
- 一个 `provider + accountProfileId` 绑定一个独立数据目录（Cookies、缓存由 WebView 管理）；重启后尽可能保持会话，不保证永不过期。
- 不读取 Edge 里现有 Cookie、不复制会员 Token，不允许不同账号共享同一个资料目录。
- 同一资料目录的同时打开实例需互斥，减少 WebView2 锁冲突；同一提供商多账号要显式切换配置。
- 账号失效显示“需重新登录”；不得弹出输入密码的仿官网界面。
- WebView 实例池设置最大活跃数、闲置回收、恢复打开状态。人数多不代表所有网站后台常驻。

## 5. 真正的自动 @接力与状态机

### 5.1 用户预期与调度真相

群里输入：“@Gemini 写故事 → @ChatGPT 制作分镜 → @豆包 优化 → @DeepSeek 审核”。软件记录步骤规则后，由本地调度器依次发起实际调用。**即使 AI 回答里包含 `@ChatGPT`，也不能单凭自然语言文本触发下一步**；必须由用户批准的工作流图和完成事件控制，防止模型输出诱导额外调用或产生费用。

### 5.2 状态机

```
DRAFT → VALIDATING → READY → RUNNING
                         ├─ COMPLETED → next step
                         ├─ WAITING_MANUAL → user confirms → COMPLETED
                         ├─ RETRY_WAIT → retry (within budget)
                         ├─ PAUSED → RESUMING → RUNNING
                         ├─ UNKNOWN_COMPLETION → manual reconcile
                         ├─ FAILED → retry from step / stop
                         └─ CANCELLED
all steps completed → FINALIZING → COMPLETED
```

每一步有唯一 `run_id + step_id + attempt_no`；写入开始事件和结束事件使用事务；客户端断电重启时读取持久化检查点恢复。可能已经计费但没有确认结果的网络超时，标记 `UNKNOWN_COMPLETION`，**不能自动重试**以免重复调用计费。

### 5.3 结果传递

- 保存完整原始任务文件 `artifact_original`；每一步输出单独生成不可变 `artifact_step_n`。
- 下一步读取：原始任务 + 相关完整阶段结果的 artifact IDs + 本步规则版本；构建提示词前统计大小。
- 优先传完整文本；超上下文时分块并通过明确的编排逐块处理，保留索引和原文，用户可以核对每一段是否覆盖。
- 图片附件按能力矩阵处理。无多模态 API 的步骤不得声称已经看图；明确提示转人工或换支持视觉的模型。
- 上传的文档、图片与产物保留原文件、哈希、元数据和引用路径；导出时能重建整份成果。

### 5.4 人工网页节点的真实体验

1. 调度器生成完整待处理任务，状态 `WAITING_MANUAL`。
2. 弹出“复制本步任务”“打开对应官网”“粘贴完整真实回复”“确认完成”。
3. 用户粘贴后先展示文本长度与预览，确认后保存并记录来源 `user_imported_web`。
4. 只有确认完成才进入下一步；断电/重启后仍停留在该节点。
5. 如果用户未处理，不会偷偷使用模拟文本继续任务。

### 5.5 并行与轮流讨论

- **同时回答：** 向 2–4 个确实可自动调用的 AI 扇出，分别显示加载、成功、失败；按成员 ID 保存结果，不能把某一位的文字算成另一位。
- **辩论：** 可指定正反方、裁判、总结。固定轮数上限，不能无限相互回复；每一轮保留引用对象。
- **接力：** 串行默认；只有用户明确选择并行分支时才并发。
- API 并发受提供商实际限流与用户设置约束，默认每提供商 1 路，允许用户调节但不能保证突破官方限额。
- 每个执行前提供费用上限、预计调用数/可用额度提示；未知价格时提示“费用未知”，不编造估算。

### 5.6 自动接力例子：AI 漫剧

```
输入小说 / 剧本
  → Gemini（编剧）  原剧情、对白、动作保全
  → ChatGPT（导演）  剧本拆分 10–15 秒段，段内多切镜
  → 豆包（优化）    情绪、口型、镜头、站位、参考图编号
  → DeepSeek（核查）原稿完整性、连续性、编号与时长
  → 导出原稿+剧本+分镜+提示词+检查报告
```

模板规则：参考图只列编号；允许合理精简冗余但不得压缩掉剧情信息；视频分段按 10–15 秒灵活安排；禁止背景音乐、歌曲、字幕、水印、LOGO，允许环境音、动作音和必要音效。此模板是群内配置，不自动强加给所有其他群。

## 6. 技能 / 角色规则的完整模型

三级作用域（优先级从高到低）：

1. **运行时本步规则**：一次任务临时设定，仅本次执行；不可反写其他会话。
2. **群内成员规则**：`conversation_id + member_id` 绑定该群的编剧/导演/审核职责与 Skill 版本；新群默认不继承。
3. **全局可选模板**：手动选入，不把用户未同意的内容带到其他聊天。

支持文档粘贴、导入 TXT/Markdown、规则版本保存、复制模板、查看当前实际生效规则。每次任务固化 Skill 的版本 ID，以免运行到一半修改规则造成结果不一致。绝不把来自 AI 回复的“请修改系统设置”等文字当作管理指令。

## 7. 数据设计：SQLite + 文件系统 + 安全凭据

### 7.1 存储分层

- **SQLite（结构化）：** 会话、成员、消息元数据、工作流、执行步骤、审核、引用和索引。
- **文件系统（内容主体）：** TXT、DOCX、PDF、参考图、原文、模型原始输出、导出包。长内容不以巨大的 SQLite BLOB 混装。
- **安全凭据：** Windows DPAPI/系统凭据库或经过验证的 Stronghold 方案；数据库仅存 `secret_ref`，不存 API Key 明文。
- **WebView Profile：** 与聊天数据库分离，按账号单独目录；不纳入普通无加密备份。

### 7.2 主要实体与关系

```
Provider 1──n ConnectionProfile 1──n AiMember
Conversation 1──n ConversationMember n──1 AiMember
Conversation 1──n Message 1──n MessageAttachment
WorkflowDefinition 1──n WorkflowVersion 1──n WorkflowStepDefinition
WorkflowRun 1──n StepRun 1──n StepAttempt
StepRun 1──n Artifact ； Message 可引用 StepRun/Artifact
```

建议基础表：`schema_migrations, providers, connection_profiles, ai_members, conversations, conversation_members, messages, message_versions, attachments, artifact_files, workflow_definitions, workflow_versions, step_definitions, workflow_runs, step_runs, step_attempts, run_events, manual_handoffs, skill_templates, skill_bindings, settings, audit_events, backup_manifests`。

### 7.3 关键 SQLite DDL（开发基线）

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS connection_profiles (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('web_membership','api','manual')),
  display_name TEXT NOT NULL,
  profile_dir TEXT,
  secret_ref TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_members (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connection_profiles(id),
  nickname TEXT NOT NULL,
  avatar_path TEXT,
  model_id TEXT,
  default_role TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('private','group')),
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'private',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  member_id TEXT NOT NULL REFERENCES ai_members(id),
  role_name TEXT NOT NULL DEFAULT '',
  skill_version_id TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(conversation_id, member_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_member_id TEXT REFERENCES ai_members(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('user','ai','system')),
  status TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content_path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  workflow_run_id TEXT,
  step_run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  workflow_version_id TEXT NOT NULL,
  original_artifact_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS step_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  step_def_id TEXT NOT NULL,
  status TEXT NOT NULL,
  input_manifest_path TEXT NOT NULL,
  output_artifact_id TEXT,
  attempt_no INTEGER NOT NULL DEFAULT 0,
  provider_request_id TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, step_def_id)
);
CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  step_run_id TEXT,
  event_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, created_at);
```

说明：上述是概念性第一版 DDL。正式实现还需增加 `workflow_versions`、`artifacts`、`attempts` 等引用表，执行迁移前运行 SQLite 完整性和外键检查；不能直接覆盖旧应用数据库。

## 8. 现有版本数据迁移策略（必须 P0）

- **迁移前检查：** 记录旧版应用标识、原 SQLite/JSON/localStorage 位置、WebView 数据目录、各类会话记录和状态。
- **先备份后升级：** 复制原目录到带 UTC 时间与版本号的快照，计算 SHA-256 清单；空间不足时禁止升级。
- **只读导入：** 旧数据先转换为新版中间格式；遇到未知字段保存在 `legacy_json`，不得直接丢弃。
- **迁移演练：** 用副本构建新数据库；校验会话数、消息数、文件哈希、联系人、规则模板、导出样本。
- **原子提交：** 所有核对通过才切到新版；旧目录保留供回滚，遇到失败立刻恢复旧版启动。
- **账号会话：** WebView 登录资料单独保留，迁移后逐账户核验；发生 Cookie/SSO 失效仅提示重新登录，不尝试窃取/复用浏览器 Token。
- **首次启动向导：** 显示旧数据读取路径、备份结果、发现的问题、导入成功数量，用户可先“以旧版模式打开”。
- **重要兼容修复：** Rust 与 TS 对 `zh-CN`、主题枚举等允许值采用一份共享来源或同步生成代码；测试保存、关闭、重启后是否保持。

## 9. 文件导入、参考图与成果管理

- 导入 TXT、MD、DOCX、PDF；保留原文件并记录转换结果，不把提取失败的段落当作不存在。
- 文档分段器生成 `chunk_id`、原文页/行、起止位置、字符/Token 估算，自动分段但不能改变原始顺序；分块边界处适当重复上下文并去重。
- AI 漫剧参考图按照 `A01/AG/B/BL/C/E` 等目录分类，支持文件夹关联、单段最多图片数的显式校验；不声称文本模型看到了未发送的图片。
- 每步成果有原稿引用、执行模型、版本、提示词、输出、时间、状态、错误码；可以导出为 Markdown、TXT 或分章节文件夹 ZIP，后续再增加 DOCX。
- 大文件使用磁盘引用，UI 只加载预览；明确资源上限防止打开 26TB 素材库时占满内存。

## 10. 安全、隐私与权限

1. **Tauri 权限最小化：** 本地主窗口才可调用数据库、密钥和宿主指令；第三方远程网页窗口不授予这些权限。
2. **固定远程地址：** 会员网站白名单和官方 API 地址由连接器定义，禁止 UI 传任意 URL 访问内网或本地服务。
3. **不存明文 API 密钥：** 使用系统安全存储，API Key 不出现在消息、日志、导出或错误上报中。
4. **会员账号密码只由官网接收：** 不制作与官网混淆的模拟登录表单；不伪装会员档位。
5. **操作确认：** 批量 API 调用前确认可能计费、数量和上限；文件覆盖、删除和账户解除绑定要二次确认。
6. **模型输出视为不可信：** 模型给出的 `@成员`、URL、系统命令、工作流修改请求不能直接产生新增执行行为。
7. **诊断脱敏：** 崩溃日志不包含聊天正文（除非用户明确选择附带）、密码、密钥、Cookie、Token。
8. **本地优先：** 首版不开放公网端口、不自建云服务器、默认关闭遥测；只有用户主动连接的 API/会员网站访问外网。

## 11. 技术实现与仓库结构

保留 Tauri v2 + Rust + React + TypeScript + Vite。建议通过有版本号的增量模块重构，原有 `src/workflow`、`src/host` 和网页登录原生模块继续保留，避免硬换底座。

```text
multi-ai-chat-desktop/
├─ src/
│  ├─ app/                 # 全局状态和路由
│  ├─ features/
│  │  ├─ conversations/    # 私聊、群聊、聊天记录
│  │  ├─ members/          # AI 联系人、群内职责
│  │  ├─ composer/         # @提及、附件、发送
│  │  ├─ workflows/        # 编排编辑器、执行追踪
│  │  ├─ connections/      # 账号和API连接配置
│  │  ├─ artifacts/        # 文件与输出版本
│  │  ├─ backup/           # 备份、迁移、恢复
│  │  └─ settings/         # 语言、主题与偏好
│  ├─ services/
│  │  ├─ member-router.ts
│  │  ├─ workflow-controller.ts
│  │  └─ capability-registry.ts
│  ├─ host/                # 唯一 Tauri IPC 入口
│  ├─ i18n/                # zh-CN/en/zh-TW，统一词条
│  └─ ui/                  # 共享组件、主题设计变量
├─ shared/
│  ├─ protocol/            # DTO、事件和类型
│  └─ schemas/             # Zod/JSON Schema 规则
├─ src-tauri/
│  ├─ src/
│  │  ├─ domestic.rs
│  │  ├─ webviews.rs
│  │  ├─ providers.rs
│  │  ├─ persistence/      # SQLite、迁移、磁盘附件
│  │  ├─ secrets/          # 凭据代理
│  │  ├─ workflow/         # 原生执行任务与恢复
│  │  └─ diagnostics/      # 脱敏日志
│  ├─ migrations/         # 0001,0002... 数据库迁移
│  ├─ capabilities/       # 最小权限
│  └─ tauri.conf.json
├─ docs/
│  ├─ PRD-v3.0.md
│  ├─ API-and-Connectors.md
│  ├─ Data-Migration.md
│  ├─ UI-Spec.md
│  ├─ Test-Plan.md
│  └─ Known-Limitations.md
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ migration/
│  ├─ security/
│  └─ windows-smoke/
└─ .github/workflows/
   ├─ validate.yml
   └─ build-windows.yml
```

**关键架构决策：** GitHub 的打包分支应该从当前验证通过的 v2.4 构建基线创建 v3.0 开发分支，不要直接覆盖 `ai-manju-workbench` 主分支；每一阶段独立提交、独立构建，允许从 v3.0 回滚到 v2.4。

## 12. 前端状态、原生任务与连接器边界

- React 仅负责渲染和用户操作；运行状态由持久化记录驱动，不允许仅保存在某个组件的 `useState` 中。
- 核心工作流执行、数据库写入、API 网络请求由 Rust 后端统一协调；组件层只能通过 `src/host` 中受类型约束的命令接口调用。
- 每个运行事件使用 `event_seq` 严格递增；客户端重连时从最后确认序号补齐，避免漏消息或重复展示。
- 连接器必须有自动测试：可用性、重试、超时、登录过期、无响应、无答案、无法访问网站、模型档位无法识别。
- 同一成员的多个并发任务需要排队或明确隔离会话，禁止把 A 群的提示词送入 B 群。

## 13. 性能、稳定性与异常恢复

- 工作台在不打开任何第三方网页时以轻量本地 UI 启动；WebView 按需创建，切走后按策略停用/收起，不丢弃重要待发送内容。
- 2K 显示器下适配 125%/150% Windows 缩放，禁止原生窗口越界和覆盖发送栏。
- 聊天列表使用虚拟滚动；长消息和附件只加载当前可视部分。
- 网络错误显示分类：`LOGIN_REQUIRED / API_KEY_INVALID / MODEL_UNAVAILABLE / RATE_LIMITED / NETWORK_TIMEOUT / RESPONSE_EMPTY / CAPABILITY_UNSUPPORTED / UNKNOWN_COMPLETION`。
- API 失败的重试必须限次数、指数退避并遵循 `Retry-After`；中途断线可能已计费的不自动重复调用。
- 关键输入每次编辑短延迟自动落盘；只有磁盘确认成功才显示“已保存”。
- 保存写入使用事务/临时文件后原子重命名；磁盘满、文件损坏、断电后必须有明确恢复提示。

## 14. 测试与验收矩阵（禁止跳过）

### 14.1 P0 功能验收用例

| ID | 测试操作 | 明确通过条件 |
|---|---|---|
| AT-01 | 在 Windows 11 双击安装/打开 | 正常出现完整 UI，无闪退和本地服务依赖 |
| AT-02 | 原版 ChatGPT/Gemini/Claude/Grok 页面 | 可正常打开，并按原版能力登录、聊天 |
| AT-03 | 退出并重新打开软件 | 旧群聊、设置、登录资料不被软件错误覆盖 |
| AT-04 | 新建私聊与群聊 | 生成实际会话记录，重启后仍存在 |
| AT-05 | 群聊加入四个 AI | 分别记录成员、职责、模型与连接状态 |
| AT-06 | @仅一个 API 成员 | 只发给该成员，没有误发给其他成员 |
| AT-07 | @两位成员或全员 | 真实返回的结果分别标明来源，失败独立显示 |
| AT-08 | 顺序接力 A→B | B 的实际请求中包含 A 的完整结果和原始任务 |
| AT-09 | 接力 4 步（2 API + 人工网页 + API） | 在人工节点停住，粘贴确认后正确继续 |
| AT-10 | 只有官网会员、没有 API Key | 软件不得声称 API 自动回复成功 |
| AT-11 | API 未配置/额度不足/模型不存在 | 提示真实错误，禁止虚构回复 |
| AT-12 | API 超时结果未知 | 标记“可能已完成/待核查”，不盲目重试收费 |
| AT-13 | 运行中强制关闭再启动 | 按检查点恢复，不重复已经完成的步骤 |
| AT-14 | 同时操作两个不同群 | 两群规则、上下文和产物没有串入 |
| AT-15 | 设置简体中文与蓝灰主题后重启 | 不恢复为繁体/默认主题，Rust 与 TS 一致 |
| AT-16 | 上传含中文的 DOCX/PDF | 原文件保存，提取内容可核对，异常可见 |
| AT-17 | 传入超模型上下文的小说 | 显示分块方案/停止提示，不静默截断 |
| AT-18 | 成果导出和重新导入 | 文本一致，文件校验通过，能定位步骤来源 |
| AT-19 | 本机旧数据迁移 | 备份、导入数量、验证、回滚均成功 |
| AT-20 | 无网络、拒绝连接、网页登录失效 | 不闪退，提示状态，允许本地打开历史 |
| AT-21 | 脱敏日志和错误包 | 不包含 API Key、Cookie、私人令牌 |
| AT-22 | WebView 第三方页面尝试调用本地敏感命令 | 被 Tauri capabilities 拒绝 |
| AT-23 | GitHub Actions Windows 构建 | TypeScript、ESLint、单测、Rust、安装包全部通过 |
| AT-24 | 干净 Windows 虚拟机/真机测试 | 解压或安装后即能打开，缺依赖有明确处理 |
| AT-25 | 旧版回退 | 新版失败时旧版仍可启动，聊天资料可恢复 |

### 14.2 自动化测试分类

- 单元测试：@路由解析、模型能力矩阵、编排图验证、状态转换、费用保护、语言词条覆盖、内容哈希。
- 集成测试：SQLite 事务、版本迁移、文件读取、人工交接、重试、断点恢复、并发群隔离。
- 契约测试：API 官方 schema 与错误码（使用 Mock Server，不消耗真实额度），所有连接器用统一 DTO。
- 真正联调：最少 2 家真实官方 API 串行调用，至少 1 家会员网页的原生登录/聊天；有录屏和脱敏日志。
- Windows UI 测试：窗口缩放、多屏、主题、快捷键、拖文件、输入法、文件名包含中文字符路径。
- 压测：1,000 条消息列表滚动、长任务、重启 10 次、多人连发至少 30 次；任何误路由、假完成、内容丢失均为阻断发布。

### 14.3 发布 Go / No-Go 门槛

**必须全部满足，才能标正式版：** 零已知 P0 数据丢失/账号泄露/误路由/假完成缺陷；上述 AT-01～AT-25 全部通过或有明确平台不适用记录；GitHub 安装产物和 SHA-256 可验证；新版升级旧版数据的备份/回退实测通过；至少一条真实 API→API 自动接力及一条包含人工网页节点的完整流程验收通过。

## 15. GitHub 开发、CI/CD 与交付

分支建议：`main`（原工作台不动）/ `ai-chat-desktop-v2.4`（当前基线）/ `ai-chat-desktop-v3-dev`（新版开发）/ `ai-chat-desktop-v3.0-rc`（候选发布）。

GitHub Actions：

1. 锁定依赖和上游提交，执行 `pnpm install --frozen-lockfile`，检测补丁冲突。
2. `pnpm verify`，TypeScript、ESLint、单测、适配器检查。
3. Rust `cargo test`、`cargo clippy`，原生权限/命令测试，SQLite 迁移测试。
4. Windows x64 `tauri build`，验证主 EXE 与 NSIS 安装程序实际存在。
5. 在 Windows runner 启动程序做烟雾测试、检查日志和进程退出，不能只靠文件存在就宣称软件工作正常。
6. 上传 `installer.exe`、portable EXE（如配置支持）、`SHA256SUMS.txt`、更新说明、验收报告与 SBOM。
7. 安装包若没有数字签名，必须明确标注；若启用自动更新则按 Tauri 的更新签名流程处理，不能使用未签名包做自动更新。
8. GitHub Releases 仅由通过门槛的构建发布，禁止把绿灯仅代表前端通过的作业标成“正式可用”。

最终交付物：Windows 安装包、可移植版（如实现）、完整源码、操作手册、测试报告、问题清单、旧版数据迁移/备份工具、回退说明。

## 16. 分阶段实施计划与止损机制

| 里程碑 | 必做内容 | 当阶段必须交付 | 不通过怎样处理 |
|---|---|---|---|
| **M0 旧版保全** | 固定 v2.4 源码、建立备份、实际启动冒烟测试、修 zh-CN/主题前后端设置 | 旧版功能基线报告 | 不进入后续开发 |
| **M1 统一数据与联系人** | SQLite、连接资料、AI 成员、独立会话、创建群聊 | 真实单机群聊但不假装自动回复 | 数据/迁移失败回滚 |
| **M2 统一消息路由** | @解析、API 成员消息、成员状态、群内统一回显 | 两个真实 API 群内收发 | 有误路由立即停止 |
| **M3 统一工作流** | API 接力、暂停、失败重试、人工网页交接、结果保存 | 真实 3–4 步流程测试报告 | 未验证的连接器不能启用自动执行 |
| **M4 原生会员整合** | 原版 WebView 会话延续、登录状态检查、网页窗口与群聊协作 | 国内/国外成员能力矩阵 | 不支持自动抓取者保持人工节点 |
| **M5 成品与体验** | 全简中、3主题、导入文件、历史、备份、安装器、回滚 | v3.0 RC 安装包与用户验收单 | 任何 P0 缺陷禁止正式发布 |

每个里程碑都独立提交、独立 CI 产物、独立问题清单。禁止一次性完成所有文件后才第一次启动测试。

## 17. 关键风险与明确处理

| 风险 | 等级 | 降低风险的设计 |
|---|---|---|
| 网页会员限制自动操作，或页面大改 | 高 | 不承诺万能网页接管；能力验证与人工节点 |
| 同一账号不同群的上下文串话 | 高 | 会话和连接实例唯一 ID；单会话队列与独立规则 |
| API 扣费重复或失败后再次发送 | 高 | request ID、检查点、UNKNOWN_COMPLETION、重试确认 |
| 旧版 Cookie/聊天记录损坏 | 高 | 备份、只读迁移、账号目录隔离、可回滚 |
| 长剧本在模型限制处被截断 | 高 | 分块任务、段落覆盖索引、原稿哈希与完整性校验 |
| 国内外模型 API 返回格式不同 | 中高 | 连接器适配层、契约测试、能力发现、错误翻译 |
| 新增简体中文/主题重启丢失 | 高 | Rust/TS 共享 schema、读写重启验收 |
| 不同 WebView 资料目录冲突 | 中高 | 单资料目录单写入、按需打开、回收和重试 |
| GitHub 构建能过但用户打不开 | 高 | Windows 真机/虚拟机冒烟、打包依赖校验 |
| 大量窗口导致卡顿 | 中 | 活跃窗口池、按需恢复、虚拟列表、性能预算 |
| 模型提示注入诱导乱@或修改任务 | 高 | 严格图编排，AI 输出当数据，不可直接触发操作 |

## 18. 交付签收清单（用户可以逐项核对）

- [ ] 安装即打开 Windows 软件，不需要输入本地地址或启动 Node/Rust。
- [ ] 能在软件内原生打开 ChatGPT/Gemini/豆包等已支持官网并使用自己账号。
- [ ] 有真实的私聊、群聊、成员添加/移除、@指定成员、会话管理。
- [ ] 群消息全中文显示，知道哪条是谁发送的、通过哪种连接来源。
- [ ] 协作模式和每个模型的 Pro/思考/工作档位分开设置。
- [ ] 两个官方 API 的实际回答能够自动按顺序交接，不用复制粘贴。
- [ ] 仅会员网页的阶段会明确停在人工节点；粘贴确认后可以继续。
- [ ] 剧本、分镜、提示词、审核报告都保留完整文本、版本和来源。
- [ ] 失败后可暂停、重试/恢复，API 可能已计费的情况不会自动重复请求。
- [ ] 旧会话及设置可迁移、可备份、可恢复，不破坏旧版登录资料。
- [ ] 简体中文和主题在软件重启后仍保持。
- [ ] 日志没有密钥，第三方网页没有敏感系统权限。
- [ ] GitHub 有完整源码、EXE、校验值、测试报告和回滚说明。

## 19. 当前可用链接与下一步

- v2.4 已构建成功的 Windows 产物（仍需本机真实功能验收）：https://github.com/603141335-lgtm/ai-manju-workbench/actions/runs/42348465832
- v2.4 开发代码：https://github.com/603141335-lgtm/ai-manju-workbench/tree/ai-chat-desktop-v2.4
- 上游 Tauri 桌面开源项目：https://github.com/TED-H-com/multi-ai-chat-desktop

**下一步不应该直接宣布 v3.0 已做好。** 先实施 M0：备份原版、验收实际登录、修正 Rust/前端设置不一致；再做 M1 统一数据库+联系人+群聊，随后才将 API/会员混合接力接入。所有阶段必须先有可操作的测试版，再合并下一阶段。

## 20. 参考技术依据

- Tauri v2 SQL 插件与数据库迁移：https://v2.tauri.app/plugin/sql/
- Tauri v2 Stronghold 密钥管理：https://v2.tauri.app/plugin/stronghold/
- Tauri v2 Capabilities 安全权限：https://v2.tauri.app/security/capabilities/
- Tauri v2 Windows WebView 数据目录：https://v2.tauri.app/reference/config/
- Tauri v2 Updater 签名与发布：https://v2.tauri.app/plugin/updater/

> 结论：v3.0 的验收核心是“真实消息路由 + 统一成员能力 + 完整持久化 + 可恢复的接力流程 + 原生会员不回退”。没有通过这些验收，任何漂亮界面都不能算完整产品。