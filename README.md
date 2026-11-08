# 豆包创作舱 v0.9.3 · 浏览器登录版
以 \`release/doubao-browser-voicebind-v0.9.2\` 为基础升级，保留原有 Electron WebContentsView 豆包登录、多账号独立持久分区、人物声音绑定、素材文件夹、一次批量上传与跨段 FFmpeg 尾帧。

## 本次变更
- 识别 \`A01小李、A01-01小李、A15杜不凡\`；素材只按精确编号匹配，发送稿加入人名，错误/冲突提示。
- 右侧「原始提示词 / 发送稿预览」一键切换；声音绑定变化立即更新预览；只同步完整文字时不重新上传图片/声音。
- 原生网页导入开始即通过一个编辑器写入操作填好完整发送稿，并回读校验。后续上传或原生@失败也会显示文字已同步；绝不自行生成假蓝色引用。
- 下方一行一集、展开多行分段；已完成按钮收起成小卡并支持撤销；保留旧版锁定、隐藏状态于「更多 → 高级项目管理」。
- 安装身份 \`com.manju.doubao.creativehub\` 未更改；账号和工作区数据保留。

## 验收
\`npm run check\` 及可选 \`python tests/ui_v093_browser.py\`（需要 Chromium 和 Playwright）验证，离线 UI 测试只使用模拟豆包，不能证明真实豆包原生@与音频接口兼容。
正式 Windows 构建：GitHub Actions .github/workflows/build-windows.yml。
开发环境无商业 Themida 加壳，安装包也未签名（若未配置 Windows 证书）。
