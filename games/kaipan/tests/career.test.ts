import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { END_TITLES, STYLE_TITLES, liveSettleStats, titlesJson } from '../src/core/career.ts';
import { runSummary } from '../src/core/index.ts';
import { botByName, playRun } from '../tools/bots.ts';

/** 0.6.5 实盘结回带的战绩小结（平台 5.10）和称号文件。 */
describe('战绩小结', () => {
  it('public/titles.json 和代码里的称号表一致，id 合平台的格式，文件不超过 32 KB', () => {
    const raw = readFileSync('public/titles.json', 'utf8');
    expect(JSON.parse(raw)).toEqual(titlesJson());
    expect(raw.length).toBeLessThan(32 * 1024);
    for (const [id, t] of Object.entries(titlesJson())) {
      expect(id).toMatch(/^[a-z][a-z0-9_]{0,23}$/);
      expect(Array.from(t.name).length).toBeLessThanOrEqual(8);
      expect(t.desc.length).toBeGreaterThan(4);
    }
  });

  it('机器人打出来的称号和打法都在表里；小结合平台的形状、JSON 后 ≤ 256 字节', () => {
    const ids = new Set(Object.keys(titlesJson()));
    for (const bot of ['normal', 'random', 'gambler', 'smart']) {
      for (let i = 0; i < 8; i++) {
        const sum = runSummary(playRun(`career-${bot}-${i}`, botByName(bot), null));
        expect(END_TITLES[sum.title], sum.title).toBeDefined();
        expect(STYLE_TITLES[sum.style.id], sum.style.id).toBeDefined();
        const st = liveSettleStats(sum, 100_000, 30_000);
        expect(st.titles?.every((t) => ids.has(t))).toBe(true);
        expect(st.titles).toHaveLength(2);
        expect(JSON.stringify(st).length).toBeLessThanOrEqual(256);
      }
    }
  });

  it('提前收手（0.6.8）：不给结局称号，只报打法；局数、赢照旧', () => {
    const sum = runSummary(playRun('career-q', botByName('smart'), null));
    const st = liveSettleStats(sum, 10_000, 12_000, true);
    expect(st.titles).toEqual([`s_${sum.style.id}`]);
    expect(st).toMatchObject({ rounds: 1, wins: 1, best: 2_000 });
  });

  it('资产涨了算赢；最大一把 = 结回 − 带入，亏了为 0', () => {
    const sum = runSummary(playRun('career-x', botByName('smart'), null));
    expect(liveSettleStats(sum, 10_000, 15_830)).toMatchObject({ rounds: 1, wins: 1, best: 5_830, max: { bp: 15_830 } });
    expect(liveSettleStats(sum, 10_000, 10_000)).toMatchObject({ wins: 0, best: 0 });
    expect(liveSettleStats(sum, 10_000, 0)).toMatchObject({ wins: 0, best: 0, max: { bp: 0 } });
  });
});
