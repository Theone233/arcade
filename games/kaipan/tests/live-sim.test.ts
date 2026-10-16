import { describe, expect, it } from 'vitest';
import { LIVE_TIERS } from '../src/core/index.ts';
import { liveStats, type LiveStats } from '../tools/live.ts';

/**
 * 0.6.0 实盘的尺度（docs/design-live.md 第 3.3 节，economy.md 第 2 节的三条）：每档 135 局（每段一局），简单打法 normal、乱买乱卖 random。
 * 种子固定，结果是确定的；改了数值（账单、难度、情报、真实行情的放大……）这里红了，就重新量一遍设计稿第 3.3 节的表再改这里。
 */
describe('实盘：各档的结回', () => {
  const runs = 135;
  const rows = new Map<string, LiveStats>();
  const at = (tier: string, bot: string): LiveStats => rows.get(`${tier}|${bot}`) as LiveStats;
  for (const t of LIVE_TIERS) for (const b of ['normal', 'random']) rows.set(`${t.id}|${b}`, liveStats(t.id, b, runs, 'live6'));

  it('小档简单打法小赚，往上逐档变难', () => {
    const normal = LIVE_TIERS.map((t) => at(t.id, 'normal').mean);
    expect(normal[0]).toBeGreaterThan(1.02);
    expect(normal[0]).toBeLessThan(1.15);
    for (let i = 1; i < normal.length; i++) expect(normal[i]).toBeLessThan(normal[i - 1] as number);
    // 豪华档也不至于一边倒（德州豪华桌的目标是小输到打平）
    expect(normal[3]).toBeGreaterThan(0.85);
  });

  it('乱买乱卖每档都输，也都比简单打法差', () => {
    for (const t of LIVE_TIERS) {
      expect(at(t.id, 'random').mean).toBeLessThan(0.95);
      expect(at(t.id, 'random').mean).toBeLessThan(at(t.id, 'normal').mean);
    }
  });

  it('一局的输赢在一份左右：结回落在 0–2 份的局 ≥ 98%，正常打法几乎不破产', () => {
    for (const r of rows.values()) {
      expect(r.within).toBeGreaterThanOrEqual(0.98);
      expect(r.zero).toBeLessThanOrEqual(0.02);
    }
  });
});
