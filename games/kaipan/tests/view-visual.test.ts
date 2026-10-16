import { describe, expect, it } from 'vitest';
import { chatShort, pctArrow, shortHint } from '../src/view/labels.ts';
import { shortPart } from '../src/view/recap.ts';

/** 0.5 去文字化：画面上的短话规则（设计稿 docs/design-0.5-visual.md） */
describe('0.5 短话', () => {
  it('群聊短话不超过 10 个字，跳过称呼和股票名', () => {
    expect(chatShort('家人们！AI要起飞了！今晚直播细聊!')).toBe('AI要起飞了');
    expect(chatShort('大消费，不急。')).toBe('大消费，不急');
    expect(chatShort('量子波动，课程学员人手一只', '量子波动')).toBe('课程学员人手一只');
    expect(chatShort('【转发】大消费今天静悄悄')).toBe('大消费今天静悄悄');
    for (const t of ['幼儿园家长群都在聊大消费，应该要涨吧？', '低空经济今天没人玩。', '一二三四五六七八九十十一十二']) expect(Array.from(chatShort(t)).length).toBeLessThanOrEqual(10);
  });
  it('猫的短话不超过 16 个字', () => {
    expect(shortHint('金融热度连涨四天，可以留意一下它的股票。我也是猜的。')).toBe('金融热度连涨四天');
    expect(Array.from(shortHint('一二三四五六七八九十一二三四五六七八九十')).length).toBeLessThanOrEqual(16);
  });
  it('涨跌一律箭头 + 数字', () => {
    expect(pctArrow(7.94, 2)).toBe('↑7.94%');
    expect(pctArrow(-2)).toBe('↓2.0%');
    expect(pctArrow(0.01)).toBe('0.0%');
  });
  it('拆解条短标签取第一个词组', () => {
    expect(shortPart('运气（每天都有的小起伏）让它涨了 5.1%')).toBe('运气');
    expect(Array.from(shortPart('一二三四五六七八九十')).length).toBeLessThanOrEqual(8);
  });
});
