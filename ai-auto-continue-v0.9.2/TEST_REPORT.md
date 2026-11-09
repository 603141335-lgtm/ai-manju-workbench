# v0.9.2 测试报告

测试范围：本地模拟 Chrome/Edge 扩展 API、模拟 AI 网页 DOM、桌面与窄屏布局。**不代表真实会员网页的端到端实机验证。**

## 通过项目

| 测试 | 结果 | 说明 |
|---|---|---|
| 顶部批量控制条删除 | PASS | 页面不存在 `.commandbar` |
| 四个平台卡片 | PASS | 正好4张平台卡 |
| 平台卡片比例 | PASS | 桌面模拟宽度下宽高比1.000 |
| 平台卡点击切换 | PASS | 点击 Gemini 卡后选中 `gemini-A` |
| 动态任务实例 | PASS | 同一平台成功创建 `chatgpt-B`、`chatgpt-C` |
| 任务方块 | PASS | 任务 A/B/C 与新任务方块显示正确 |
| 四个卡片动作 | PASS | 每个平台卡显示开始、暂停、继续、重新 |
| 设置分组 | PASS | 基础设置、模型设置、创作指令与图片顺序正确 |
| 旧版数据迁移 | PASS | 旧版历史正文迁移到 aac9 任务 A，旧键不删除 |
| 开始/暂停交互 | PASS | 模拟任务可加入队列并暂停 |
| 后台等待队列 | PASS | 3个运行任务释放一个位置后，动态实例 `deepseek-C` 自动提升；活动数维持3 |
| 模型菜单 DOM 测试 | PASS | 模型扫描、过滤不可选项、切换确认、错误实例拦截 |
| 执行器任务隔离 | PASS | 两个实例独立运行、保存不同结果 |
| 自动恢复安全性 | PASS | 已发送消息证据不足时拒绝重复提交 |
| 手机窄屏 | PASS | 390px视口2列平台卡，宽高比1.000，无页面脚本错误 |
| JS 语法 | PASS | `node --check` 通过 dashboard.js / background.js / runner.js |
| HTML / manifest | PASS | HTML 解析通过，manifest 版本为 0.9.2 |
| 安装 ZIP | PASS | `unzip -t` 通过 |
| 源码 ZIP | PASS | `unzip -t` 通过 |

## 运行命令

```bash
python tests/test_v092_ui.py
node tests/test_background_queue.js
python tests/test_model_dom.py
python tests/test_runner_isolation.py
python tests/test_auto_recovery.py
```

## 未覆盖

- ChatGPT、Gemini、豆包、DeepSeek 真实会员账号的网页 DOM 及按钮兼容性。
- 用户本机已有标签页、登录状态、会员模型菜单的差异。
- 浏览器休眠、系统关机或用户清理扩展数据时的运行连续性。

## 结论

本地模拟测试覆盖本次界面、任务选择、动态 A-Z 实例、后台并发队列和原有执行器回归。真实网站适配仍需用户在 Edge/Chrome 中进行短任务验证。
