# 豆包创作舱 v0.9.0｜图号前置、批量上传、跨段尾帧

以 `release/doubao-browser-oneclick-import-v0.8.0` 分支为底座，保留 **WebContentsView、账号独立 persistent sessions、appId、剧集提示词、图片库、下载管理**，不增加画布。

## 已开发
- `import-core.composeText`：自动图号映射**紧跟在需要参考图栏目后**，不再添加到尾部；原文仍存独立的 workspace.json，不做改写、删减。
- `import-page.selectImageBatch`：为可用 `input[multiple][type=file]` 创建真实多文件 `FileList`，发出单次 `input` / `change`，受限于豆包网页自身上传能力。
- `import-engine`：优先整批文件操作，逐批检查附件文件名和顺序；不支持 `multiple` 则逐张，未知或无匹配进入核对/停止而不报成功。
- `TailFrameStore`：上一段最终成片自动提取最后有效非黑帧；使用**独立** PNG，按上一段ID绑定到下一段第一张参考图；本地绑定记录持久化。
- 下载完成：第一次视频成片自动记为最终版；后续同段生成更多视频**不覆盖**已绑定版本。可以在下一段点「选择上一段成片」修正。
- Windows 构建打包 FFmpeg 的 LGPL 版独立执行程序，保留第三方许可说明。

## 预检和限制
- 本集第1段无上一段。跨集默认不承接。
- 未生成上一段视频时普通参考图可正常使用；尾帧生成中、文件丢失、成片被替换时提示风险，阻止错误绑定。
- 参考图最多9张，尾帧算1张，超过立即阻止，不私自删图。
- 原始文本保留不变，图号表只在导入草稿时生成；网页自动排序改变时核对顺序。
- 真实豆包网页版的批量文件上传和原生 @ 必须由 Windows 已登录账号测试，本测试环境仅完成模拟网页上传实验，不冒充正式兼容验收。

## 研发验证
- `npm run check` Node.js 回归测试。
- `CHROMIUM_BIN=/usr/bin/chromium python tests/import_browser_offline.py` 验证**模拟**网页的一次多图 `DataTransfer + change` 与文字回读。
- `tests/v090.test.js` 运行 FFmpeg 真实生成并提取尾帧测试（具备 FFmpeg 环境下），以及跨段绑定、版本变化检测。
- GitHub Actions 运行 Windows 打包和 SHA256 检查，真实豆包上传、@ 引用、25账号重启保留仍需用户现场验收。

## 更新说明
新版本保留 `appId=com.manju.doubao.creativehub`、数据目录、登录 session partition，不重置登录。建议先备份后覆盖安装。
