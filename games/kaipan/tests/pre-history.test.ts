/**
 * 0.5.1 开局前的真实历史（preHistory）：只用行情段开局前 warm 天，第 1 天画面就有走势；不偷看开局以后。
 * 0.5.2 合成行情也补上开局前走势（重放风口预跑 + 另起随机流），不改动对局。
 */
import { describe, expect, it } from 'vitest';
import { createRun, preHistory, type GameState } from '../src/core/index.ts';
import { loadSegment } from '../tools/segments-disk.ts';

function run(): GameState {
  return createRun('pre-history', null, { ext: true, segment: loadSegment('2005-06-flat') }).state;
}

describe('preHistory', () => {
  it('第 1 天就给出开局前 warm 天的大盘、个股、风口热度', () => {
    const s = run();
    const p = preHistory(s);
    expect(p).not.toBeNull();
    const warm = s.real?.warm ?? 0;
    expect(warm).toBeGreaterThanOrEqual(10);
    expect(p!.days).toBe(warm);
    expect(p!.market).toHaveLength(warm);
    for (const id of s.themeIds) {
      const h = p!.heat[id] ?? [];
      expect(h).toHaveLength(warm);
      // 最后一项就是开局时的热度
      expect(h[h.length - 1]).toBe(s.themes[id]?.history.at(-1));
    }
    const rows = Object.values(p!.stocks);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toHaveLength(warm);
  });

  it('只看开局前：把开局以后的行情全改掉，结果不变', () => {
    const s = run();
    const a = preHistory(s)!;
    const real = structuredClone(s.real!);
    const warm = real.warm;
    for (let i = warm; i < real.market.length; i++) real.market[i] = 999;
    for (const st of Object.values(real.stocks)) for (let i = warm; i < st.r.length; i++) st.r[i] = 999;
    for (const th of Object.values(real.themes)) if (th) for (let i = warm; i < th.r.length; i++) (th.r[i] = 999), (th.ex[i] = 9);
    const b = preHistory({ ...s, real })!;
    expect(b.market).toEqual(a.market);
    expect(b.stocks).toEqual(a.stocks);
    expect(b.heat).toEqual(a.heat);
  });

  it('合成行情（离线兜底）也补开局前走势：风口热度接得上开局状态，个股不超涨跌停', () => {
    const s = createRun('pre-history-syn', null, {}).state;
    const p = preHistory(s);
    expect(p).not.toBeNull();
    expect(p!.days).toBe(20);
    expect(p!.market).toHaveLength(20);
    for (const id of s.themeIds) {
      const h = p!.heat[id] ?? [];
      expect(h).toHaveLength(20);
      expect(h[h.length - 1]).toBe(s.themes[id]?.history.at(-1));
    }
    expect(Object.keys(p!.stocks).sort()).toEqual(Object.keys(s.stocks).sort());
    for (const r of Object.values(p!.stocks)) {
      expect(r).toHaveLength(20);
      for (const v of r) expect(Math.abs(v)).toBeLessThanOrEqual(10);
    }
    // 同一种子结果相同；不同种子不同
    const again = createRun('pre-history-syn', null, {}).state;
    expect(preHistory(again)).toEqual(p);
    expect(preHistory(createRun('pre-history-syn-2', null, {}).state)!.market).not.toEqual(p!.market);
  });

  it('合成行情的开局前走势不改动对局状态', () => {
    const s = createRun('pre-history-syn', null, {}).state;
    const before = JSON.stringify(s);
    preHistory(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});
