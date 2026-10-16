import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { mcIters } from '../src/ai/decide.ts';
import { equity } from '../src/ai/equity.ts';
import { PERSONAS } from '../src/ai/personas.ts';
import { classCards, handClass, preflopEquity } from '../src/ai/preflop.ts';
import { parseCards } from '../src/core/cards.ts';
import { PERSONA_COUNT } from '../src/core/table.ts';
import { runBots } from './bots.ts';
import { SEED } from './helpers.ts';

const eq = (hole: string, board: string, opp: number, iters = 20_000): number =>
  equity(parseCards(hole), parseCards(board), opp, iters, stream(SEED, 'test', opp));

describe('胜率', () => {
  it('和公开的胜率表一致（±2%）', () => {
    expect(eq('As Ah', '', 1)).toBeCloseTo(852, -1.4);
    expect(eq('As Ah', '', 5)).toBeCloseTo(492, -1.4);
    expect(eq('7c 2d', '', 1)).toBeCloseTo(346, -1.4);
    expect(eq('Ks Qs', '', 1)).toBeCloseTo(634, -1.4);
    // 河牌：两张公共牌对子的 AA 对 1 人
    expect(eq('As Ah', 'Kd Kc 2h 7s 9d', 1)).toBeGreaterThan(850);
  });

  it('翻牌前的表和重新算的一致（±1.5%），类别覆盖 169 种', () => {
    const seen = new Set<number>();
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) seen.add(handClass(a, b));
    expect(seen.size).toBe(169);
    for (const k of [0, 168, 12 * 13 + 11, 5 * 13 + 9]) {
      const [a, b] = classCards(k);
      expect(handClass(a, b)).toBe(k);
      for (const opp of [1, 3, 5]) {
        const fresh = equity([a, b], [], opp, 20_000, stream(SEED, 'check', k * 8 + opp));
        expect(Math.abs(preflopEquity(a, b, opp) - fresh)).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('电脑', () => {
  it('性格的个数和规则里的一致', () => {
    expect(PERSONAS.length).toBe(PERSONA_COUNT);
  });

  it('CPU：单次决策 p99 < 2 ms，一批（真人两次说话之间）p99 < 10 ms', () => {
    // 豪华桌最费：翻牌后要按对手的范围重抽底牌（equity.ts 的 floors）
    const st = runBots({ seed: SEED, size: 6, hands: 300, stakes: 'lux', timing: true, chaos: false });
    const p99 = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.99)]!;
    console.log(`决策 ${st.decideMs.length} 次 p99 ${p99(st.decideMs).toFixed(3)} ms；一批 ${st.batchMs.length} 次 p99 ${p99(st.batchMs).toFixed(3)} ms`);
    expect(p99(st.decideMs)).toBeLessThan(2);
    expect(p99(st.batchMs)).toBeLessThan(10);
    expect(mcIters(5)).toBeLessThanOrEqual(mcIters(1));
  });
});
