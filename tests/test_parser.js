'use strict';
const assert=require('assert/strict');const p=require('../app/parser');
const formats=[
 ['需要参考图：A08、A15、B02、C02、C16',['A08','A15','B02','C02','C16']],
 ['**需要参考图：** A08、A15、B02、C02、C16',['A08','A15','B02','C02','C16']],
 ['**需要参考图**\n\n- A08\n- A15\n- B02\n- C02\n- C16\n画风：半写实',['A08','A15','B02','C02','C16']],
 ['需要参考图：\nA01 杜不凡\nA02 安安\nB12 前厅\n场景与站位：杜不凡看向安安',['A01','A02','B12']],
 ['#### 需要参考图：\n1. 【A01】\n2. 【A01-01】\n3. 【AG14】\n4. 【BL06】\n5. 【E02-05】',['A01','A01-01','AG14','BL06','E02-05']],
 ['参考图：\n| 编号 | 说明 |\n| A08 | 主演 |\n| B02 | 夜市 |\n限制：无字幕',['A08','B02']],
 ['导演说明：人物使用 A02、镜头场景是 B12。人物连贯。',['A02','B12']],
 ['【需要参考图清单】\n镜头1使用 A08 / B02，镜头2使用 A15',['A08','B02','A15']],
 ['A01、A01-01、AG14、BL06、E02-05',['A01','A01-01','AG14','BL06','E02-05']],
 ['需要参考图：Ａ０１、Ｂ１２',['A01','B12']],
 ['需要参考图：A08、B02\n场景与站位：人物提到 C02 但不是参考图',['A08','B02']]
];for(const [input,codes] of formats){assert.deepEqual(p.detectSegmentCodes(input).codes,codes);}
assert.equal(p.parseFilenameCode('A01-01_侧面.png'),'A01-01');assert.equal(p.parseFilenameCode('无编号.png',['人物','A15_杜不凡']),'A15');
let txt=`第1集｜开头
本集说明
第1段｜开场｜15秒
需要参考图：A01、B02
台词：不删改
第2段｜反转｜14秒
需要参考图：AG14、C02
画风：半写实
第2集｜第二集
第1段｜到家｜15秒
需要参考图：A02、B12
限制：无字幕`;
const eps=p.parseMultiEpisode(txt);assert.equal(eps.length,2);assert.equal(eps[0].segments.length,2);assert.equal(eps[1].segments.length,1);
assert.deepEqual(eps[0].segments[0].codes,['A01','B02']);assert.deepEqual(eps[0].segments[1].codes,['AG14','C02']);
assert(eps[0].segments[0].text.includes('台词：不删改'));assert(eps[1].segments[0].text.includes('限制：无字幕'));
console.log('PASS 11 formats + 2 episode batch + code exactness + full prompt preservation');
