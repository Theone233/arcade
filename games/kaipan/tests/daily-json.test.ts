import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_WIN_BASE, dailyScore, dailyScoreView } from '../src/core/index.ts';

/**
 * public/daily.json：平台的每日榜怎么显示开盘的分数（平台 0.10.18 起不再写死开盘的规则，照 titles.json 的路子读这个文件）。
 * 平台的规则：score 从上往下取第一条能用的；没写 from 的总能用，写了 from 的要分数 ≥ from；
 * {n} = 分数 − from（没 from 就是分数本身），按千分位显示。note 可选 ≤ 80 字，text ≤ 30 字，文件 ≤ 32 KB。
 */
interface DailyJson {
  note?: string;
  score: { from?: number; text: string }[];
}

const raw = readFileSync('public/daily.json', 'utf8');
const json = JSON.parse(raw) as DailyJson;

/** 照平台的规则显示一个分数 */
function show(score: number): string | null {
  const rule = json.score.find((r) => r.from === undefined || score >= r.from);
  if (!rule) return null;
  const n = score - (rule.from ?? 0);
  return rule.text.replace('{n}', String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}

describe('public/daily.json（每日榜的分数怎么显示）', () => {
  it('格式和大小合平台的限制', () => {
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(32 * 1024);
    expect(json.note === undefined || Array.from(json.note).length <= 80).toBe(true);
    expect(json.score.length).toBeGreaterThan(0);
    for (const r of json.score) {
      expect(Array.from(r.text).length).toBeLessThanOrEqual(30);
      expect(r.from === undefined || Number.isSafeInteger(r.from)).toBe(true);
    }
    // 最后一条不带 from，什么分数都有得显示
    expect(json.score.at(-1)?.from).toBeUndefined();
  });

  it('和开盘的分数编码一致：通关 = 1e11 + 账户元数，没通关 = 还上了几个月', () => {
    expect(json.score[0]?.from).toBe(DAILY_WIN_BASE);
    expect(show(dailyScore(true, 88_000, 12))).toBe('通关 · ¥88,000');
    expect(show(dailyScore(true, 54_687_100, 12))).toBe('通关 · ¥54,687,100');
    expect(show(dailyScore(true, 0, 12))).toBe('通关 · ¥0');
    expect(show(dailyScore(false, 0, 7))).toBe('还清 7 个月');
    expect(show(dailyScore(false, 0, 0))).toBe('还清 0 个月');
    expect(show(dailyScore(false, 0, 12))).toBe('还清 12 个月');
  });

  it('显示出来的数和游戏自己还原的一致', () => {
    for (const score of [0, 5, 12, DAILY_WIN_BASE, DAILY_WIN_BASE + 1_234_567]) {
      const v = dailyScoreView(score);
      expect(show(score)).toBe(v.won ? `通关 · ¥${v.account.toLocaleString('en-US')}` : `还清 ${v.months} 个月`);
    }
  });
});
