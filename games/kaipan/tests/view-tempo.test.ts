import { describe, expect, it } from 'vitest';
import { createRun, dispatch, type GameState, type Highlight } from '../src/core/index.ts';
import { bestHighlight, cnNum, flipTone, goalShort, shoutOf, spamLines, spottedText } from '../src/view/tempoText.ts';
import { recapOf } from '../src/view/recap.ts';

/** 0.5 画面层的节奏文字：顶栏目标、翻牌档位、大字、播报、收盘小结第一句。 */
describe('0.5 节奏文字', () => {
  it('顶栏目标短说法：X / Y 和进度条', () => {
    expect(goalShort({ kind: 'limitUp', progress: 0, target: 1 })).toEqual({ text: '抓涨停 0/1 次', frac: 0 });
    expect(goalShort({ kind: 'gain', progress: 1.5, target: 3 }).frac).toBeCloseTo(0.5);
    expect(goalShort({ kind: 'gain', progress: -2, target: 3 }).text).toBe('本月 -2% / 要 3%');
    // 回撤类：进度条是剩下的余量
    const k = goalShort({ kind: 'keep', progress: 1, target: 4 });
    expect(k.text).toBe('最多亏 4%，已亏 1%');
    expect(k.frac).toBeCloseTo(0.75);
    for (const kind of ['shortWin', 'streak', 'themes', 'beat', 'quickWin', 'bigDay'] as const) expect(goalShort({ kind, progress: 1, target: 2 }).text.length).toBeLessThan(18);
  });

  it('翻牌档位：押跌反过来', () => {
    expect(flipTone(10, { limitUp: true, limitDown: false })).toBe('limitUp');
    expect(flipTone(-10, { limitUp: false, limitDown: true })).toBe('limitDown');
    expect(flipTone(6, { limitUp: false, limitDown: false })).toBe('bigUp');
    expect(flipTone(-6, { limitUp: false, limitDown: false })).toBe('bigDown');
    expect(flipTone(1, { limitUp: false, limitDown: false })).toBe('up');
    expect(flipTone(0, { limitUp: false, limitDown: false })).toBe('flat');
    // 押跌：股票跌停你赚（押对了），股票涨停你亏（被轧）
    expect(flipTone(10, { short: true, limitUp: false, limitDown: true })).toBe('shortWin');
    expect(flipTone(-10, { short: true, limitUp: true, limitDown: false })).toBe('squeezed');
    expect(flipTone(6, { short: true, limitUp: false, limitDown: false })).toBe('bigUp');
  });

  it('大字喊话与最精彩的一件事', () => {
    expect(shoutOf({ kind: 'limitUp', text: '韭菜芯片涨停' })?.title).toBe('抓到涨停！');
    expect(shoutOf({ kind: 'limitUp', text: '押跌的韭菜芯片涨停，被轧了' })?.good).toBe(false);
    expect(shoutOf({ kind: 'combo', text: '连续 3 天赚钱' }, 3)?.title).toBe('三连红！');
    expect(shoutOf({ kind: 'headline', text: 'x' })).toBeNull();
    expect(cnNum(10)).toBe('十');
    expect(cnNum(12)).toBe('12');
    const list: Highlight[] = [
      { kind: 'bigLoss', text: '大跌' },
      { kind: 'limitUp', text: '涨停' },
      { kind: 'combo', text: '红包' },
    ];
    expect(bestHighlight(list)?.text).toBe('涨停');
    expect(bestHighlight([])).toBeNull();
  });

  it('播报不出现行话，群友刷屏用群里的人', () => {
    const run = createRun('tempo-view', null, { ext: true });
    const s = run.state;
    const id = s.slots.find((h) => h)?.stockId ?? s.today.recs[0]?.stockId ?? '';
    if (!id) return;
    for (const kind of ['boards', 'blown', 'wild'] as const) {
      const t = spottedText({ kind, stockId: id, move: kind === 'blown' ? -6 : 10, boards: 3, held: true });
      expect(t).not.toMatch(/连板|炸板|妖股/);
      expect(t).toContain('你手里的');
    }
    const lines = spamLines(s, 'up', 3);
    expect(lines).toHaveLength(2);
    const names = new Set(s.friends.map((f) => f.id));
    expect(names.size).toBeGreaterThan(0);
    expect(lines[0]!.text).not.toBe(lines[1]!.text);
  });

  it('收盘小结第一句：有高光时写今天最精彩的事', () => {
    let s: GameState = createRun('tempo-recap', null, { ext: true }).state;
    const r = dispatch(s, { type: 'open' });
    s = r.state;
    const report = s.lastDay;
    expect(report).toBeTruthy();
    if (!report) return;
    const withStar = { ...report, tempo: { quiet: false, highlights: [{ kind: 'limitUp' as const, text: '韭菜芯片涨停' }], combos: [], goal: null, streak: 0 } };
    expect(recapOf(withStar, '今天').star).toBe('今天最精彩：韭菜芯片涨停');
    expect(recapOf({ ...report, tempo: undefined }).star).toBe('');
  });
});
