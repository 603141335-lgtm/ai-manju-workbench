'use strict';
/* Public, editable tutorial metadata. Images are downloaded only when viewed.
 * Bundled fallback art is generated from the actual workbench DOM in CI.
 */
const WATERMARK=Object.freeze({
 brand:'独独AI，让制作变得简单。',
 contact:'更多AI软件跟技巧 请添加：du4du44',
 backup:'备用号：du6du66'
});
const DEFAULT_SLIDES=Object.freeze([
 ['01','欢迎使用独独AI工作台','认识左侧账号区、中间豆包网页和右侧提示词与参考图库。','#accountsPanel'],
 ['02','添加并切换独立账号','从左侧账号目录新增账号；各账号保留独立豆包登录会话。','#groupList'],
 ['03','登录豆包与确认视频模式','在中间豆包网页登录，确认视频生成、模型及15秒设置。','#btnVideoRetry'],
 ['04','批量导入剧本','导入 TXT/MD 剧本，自动拆分剧集和段落。','#btnImportText'],
 ['05','选择剧集与分镜段落','通过底部剧集卡片或右侧选择框定位需要制作的段落。','#rightEpisode'],
 ['06','设置参考图文件夹','指定参考图主目录，按 A01、AG18、B15 等编号自动匹配。','#btnChooseAssets'],
 ['07','预检提示词与参考图','先检查缺图、重复编号、图片顺序以及提示词完整性。','#btnImportPreflight'],
 ['08','一键导入图片与原生@','上传图片和音频，在原参考图编号行后尝试蓝色原生@，未验证不算成功。','#btnOneClickImport'],
 ['09','切换账号查看后台任务','账号一上传时可切到账号二；原生@需要焦点时会提示回到原账号。','#btnTaskCenter'],
 ['10','绑定人物声音','将人物编号绑定 WAV/MP3 参考音频，导入时一起核对。','#btnBindVoice'],
 ['11','下载成片与尾帧衔接','下载视频后选择正确成片，提取尾帧用于下一段，保持镜头连续。','#tailframePanel'],
 ['12','使用教程、社群与备份','使用教程随时回看，社群公告联网更新，项目数据仍保留在本机。','#btnTutorial']
].map(([id,title,description,target])=>Object.freeze({id,title,description,target,imageUrl:'',sha256:''})));
module.exports={WATERMARK,DEFAULT_SLIDES};
