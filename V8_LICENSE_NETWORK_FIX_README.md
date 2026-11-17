# 独独AI工作台 V1.3｜V8 正式授权 Worker 超时修复

本轮针对 `npm run license:prepare` 报错 `The operation was aborted due to timeout`。

## 结论

- `npm run license:check` 59 项通过，只说明**本地授权后台单元测试通过**；不证明线上 Cloudflare Worker 已发布或能访问。
- 旧版 `scripts/prepare-license.js` 对 `GET /v1/license/attest` 设定了 10 秒超时。DNS、网络限制、代理配置或 Worker 故障都会造成这一错误。
- V8 将 Node HTTP 等待上限调整为 20 秒；网络失败时尝试 Windows 内置 `curl.exe` 作为第二个 HTTPS 网络传输方式。两条路径都未返回有效新鲜签名时，一律拒绝打包。**没有跳过签名验证**。
- 若构建机显式设置 `HTTPS_PROXY`/`HTTP_PROXY`，构建脚本为 Node 启用内建代理支持；不会自动添加或寻找代理服务器，不会关闭 HTTPS 证书校验。

## 用 V8 小修复包覆盖旧工程（推荐）

1. 关闭独独AI构建中心。
2. 解压 `DuduAI_V13_License_Timeout_V8_QuickFix.zip`。
3. 复制补丁中的 `scripts`、`tests` 文件夹和 `CHECK_Worker_HTTPS.cmd` 到当前工程根目录（如 `...\DuduAI_V13_Full_Source_V5`），按提示合并并替换同名文件。其他目录和本机数据不修改。
4. **先双击 `CHECK_Worker_HTTPS.cmd`**。它只请求公开的 Worker 签名证明接口，不读取私钥或付款信息。
5. 若 Windows curl HTTP = 200 或 Node HTTP = 200，关闭诊断窗口，双击 `OPEN_DUDUAI_BUILD_CENTER.cmd`，点击「③ 正式制作安装 EXE」。如果只有 curl 成功，V8 的备用 HTTPS 请求会发挥作用。
6. 如果两者都超时，则必须先解决访问 Worker 的网络或部署问题；反复重跑构建不会生成可激活的安装包。

## 诊断结果参考

| 输出 | 意义 / 下一步 |
|---|---|
| `[CURL RESULT] HTTP 200` | 接口可达，但仍需在构建中验证签名与公钥匹配 |
| `[NODE HTTP] 200` | Node 可访问接口，重新运行构建 |
| `curl (6)` | DNS 无法解析，检查 DNS / 网络 |
| `curl (28)` | 连接或读超时，检查网络 / Worker 路由 |
| `curl (60)` | 证书验证失败，不能绕过 TLS 校验 |
| HTTP 403/404/5xx | Worker 路由、访问规则或 Worker 本身错误；查看 Cloudflare Workers 日志 |
| `Node fetch failed` 但 `curl HTTP 200` | 可能是 Node 的网络/代理配置差异，V8 使用 curl 备用通道 |

可在浏览器中打开公开接口：
`https://dudu-ai-license.dushuaishuai089.workers.dev/v1/license/attest`

有效服务应返回 JSON，包含 `payload` 和 `signature` 两个字段。**显示 JSON 不等于已通过签名验证**，仍须通过构建阶段的公钥验签。

### 安全约束

原工作台源码、用户数据 `%APPDATA%\DoubaoCreativeHubPublic`、设备绑定、Cloudflare D1、管理员令牌与真实支付资料均不修改。V8 只增加网络诊断与访问回退，不允许无签名、错公钥或过期签名的应用生成正式发行包。

### 注意

本修复的源码测试、模拟临时目录测试已经在本环境通过；Windows 上真实连接该 Worker 和完整 NSIS EXE 安装验收尚未完成。
