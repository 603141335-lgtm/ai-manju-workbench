'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractCodes,normCode,detectSegmentCodes,parseMultiEpisode,parseFilenameCode}=require('../src/parser');
test('旧 v3.2 编号解析：A01 与 A01-01 必须精确区分',()=>{
 assert.deepEqual(extractCodes('A01 A01-01 AG14 BL06 C02 E02-05'),['A01','A01-01','AG14','BL06','C02','E02-05']);
 assert.equal(normCode('A1-1'),'A01-01');assert.equal(normCode('B1'),'B01');
 assert.equal(parseFilenameCode('A01-01_侧脸.png'), 'A01-01');
 assert.equal(parseFilenameCode('A01_正面.png'), 'A01');
 assert.equal(parseFilenameCode('图片.png',['BL06 宴会层']), 'BL06');
});
test('只从参考图栏目识别编号，台词中的代码不污染',()=>{
 const r=detectSegmentCodes('第5段｜道具与对白\n需要参考图：A02、A15、B11、C02\n连续性参考：杜不凡立在原位。\n0—5秒｜画面墙上显示 A37 的字样');
 assert.deepEqual(r.codes,['A02','A15','B11','C02']);assert.equal(r.method,'栏目识别');
});
test('多集多段完整原文：长台词、站位、音效与限制仍保留',()=>{
 const prompt='第10集｜五万块开店\n第1段｜开局｜15秒\n需要参考图：A01、C02\n站位：左侧。\n0—4秒｜杜不凡：“起锅，烧油！”\n限制：禁止背景音乐。\n音效：锅底轻响。\n第2段｜转折｜10秒\n需要参考图：A01-01\n老关：“这屋有故事。”\n第11集｜夜谈\n第1段｜夜景｜12秒\n需要参考图：BL06\n镜头：推近安安。';
 const result=parseMultiEpisode(prompt,'全剧.txt');
 assert.equal(result.length,2);assert.equal(result[0].segments.length,2);assert.equal(result[1].segments.length,1);
 assert.equal(result[0].segments[0].text.includes('禁止背景音乐'),true);
 assert.equal(result[0].segments[0].text.includes('起锅，烧油！'),true);
 assert.deepEqual(result[0].segments[1].codes,['A01-01']);
 assert.equal(result[1].segments[0].text.includes('推近安安'),true);
});
