# 豆包创作舱 v0.9.2｜人物图片与音频绑定版

基于 Windows v0.9.1 的内嵌豆包浏览器工作台增量升级，保留登录账号、剧集、参考图库、批量上传、图片顶部内联 @ 尝试、跨段尾帧和下载管理，不恢复画布。

**新增**：每个人物图号绑定 WAV/MP3 角色音色样本（可多选、试听、设默认）；本段一键导入时只自动选择当前参考图涉及的人物音频，检查 Seedance 2.0 的 3段/15秒限制，然后尝试网页音频上传，并把人物图片与音频编号映射放在提示词最上方。豆包网页版若无音频上传控件/原生 @ 菜单，将明确报错或标注未验证，不冒充成功。

详细操作、源码结构、风险和真实网页验收清单：[docs/V092_CHARACTER_VOICE_BINDING.md](docs/V092_CHARACTER_VOICE_BINDING.md)。

## 构建

```sh
npm install
npm run check
npm run dist:win
```

Windows GitHub Actions 会附带 LGPL FFmpeg/ffprobe，正式 NSIS 安装包发布到 GitHub Releases。新版本继续使用原 `com.manju.doubao.creativehub` 安装身份，覆盖升级不清除数据。

> 注意：在本环境可以验证本地音频时长、音色绑定和提示词映射；真实豆包网页版音频上传、原生蓝色 @ 引用仍须用户实测。请勿将自动生成的纯文字关系误认为真实引用。
