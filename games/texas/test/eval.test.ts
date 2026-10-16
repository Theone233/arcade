import { describe, expect, it } from 'vitest';
import { parseCards, type Card } from '../src/core/cards.ts';
import { CATEGORY_NAMES, categoryOf, evalCards, evalMasks } from '../src/core/eval.ts';

const v = (s: string): number => evalCards(parseCards(s));
const cat = (s: string): string => CATEGORY_NAMES[categoryOf(v(s))]!;

describe('牌型', () => {
  it('认得每一种牌型（7 张取最好的 5 张）', () => {
    expect(cat('As Ks Qs Js Ts 2c 3d')).toBe('同花顺');
    expect(cat('Ah 2h 3h 4h 5h Kc Kd')).toBe('同花顺');
    expect(cat('9c 9d 9h 9s 2c 3d 4h')).toBe('四条');
    expect(cat('9c 9d 9h 2s 2c 3d 4h')).toBe('葫芦');
    expect(cat('9c 9d 9h 2s 2c 2d 4h')).toBe('葫芦');
    expect(cat('Ac 9c 7c 4c 2c Kd Kh')).toBe('同花');
    expect(cat('5c 6d 7h 8s 9c Kd 2h')).toBe('顺子');
    expect(cat('Ac 2d 3h 4s 5c Kd 9h')).toBe('顺子');
    expect(cat('9c 9d 9h 2s 5c Kd 4h')).toBe('三条');
    expect(cat('9c 9d 2h 2s 5c Kd 4h')).toBe('两对');
    expect(cat('9c 9d 2h 7s 5c Kd 4h')).toBe('一对');
    expect(cat('9c Jd 2h 7s 5c Kd 4h')).toBe('高牌');
  });

  it('边界：A-2-3-4-5 是最小的顺子、同花顺', () => {
    expect(v('Ac 2d 3h 4s 5c 9d Jh')).toBeLessThan(v('2c 3d 4h 5s 6c 9d Jh'));
    expect(v('Ah 2h 3h 4h 5h 9d Jc')).toBeLessThan(v('2h 3h 4h 5h 6h 9d Jc'));
    // 六张连着的取最大的顺子
    expect(v('5c 6d 7h 8s 9c Td 2h')).toBe(v('6c 7d 8h 9s Tc 2d 2h'));
  });

  it('同牌型比踢脚', () => {
    // 两对比第三张
    expect(v('Kc Kd 9h 9s Ac 2d 3h')).toBeGreaterThan(v('Kc Kd 9h 9s Qc 2d 3h'));
    // 三对时取最大的两对加最大的单张
    expect(v('Kc Kd 9h 9s 2c 2d Qh')).toBe(v('Kc Kd 9h 9s Qc 3d 4h'));
    // 葫芦先比三张那组，再比对子
    expect(v('3c 3d 3h 2s 2c 7d 8h')).toBeGreaterThan(v('2c 2d 2h As Ac 7d 8h'));
    // 四条比踢脚
    expect(v('9c 9d 9h 9s Ac 2d 3h')).toBeGreaterThan(v('9c 9d 9h 9s Kc Qd Jh'));
    // 同花比五张，第五张也算
    expect(v('Ac Kc 9c 7c 3c 2d 4h')).toBeGreaterThan(v('Ac Kc 9c 7c 2c 3d 4h'));
    // 一对比三张踢脚
    expect(v('9c 9d Ah Ks 4c 3d 2h')).toBeGreaterThan(v('9c 9d Ah Qs Jc 3d 2h'));
    // 花色不分大小
    expect(v('Ac Kd 9h 7s 5c 3d 2h')).toBe(v('Ad Kh 9s 7c 5d 3h 2c'));
    // 同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 高牌
    const ladder = [
      '2h 3h 4h 5h 6h Kc Qd',
      'Ac Ad Ah As Kc 2d 3h',
      'Ac Ad Ah Ks Kc 2d 3h',
      'Ac Kc 9c 7c 3c 2d 4h',
      'Ac Kd Qh Js Tc 2d 3h',
      'Ac Ad Ah Ks Qc 2d 4h',
      'Ac Ad Kh Ks Qc 2d 4h',
      'Ac Ad Kh Qs Jc 2d 4h',
      'Ac Kd Qh Js 9c 2d 4h',
    ].map(v);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i - 1]!).toBeGreaterThan(ladder[i]!);
  });
});

describe('全量和对拍', () => {
  it('全部 133,784,560 手 7 张牌：每种牌型的手数和 4,824 个等价类与公认值一致', () => {
    const count = new Array<number>(9).fill(0);
    const seen = new Uint8Array(9 << 20);
    const m = new Int32Array(4);
    const flip = (c: number): void => {
      m[c & 3]! ^= 1 << (c >> 2);
    };
    let n = 0;
    const started = performance.now();
    for (let a = 0; a < 52; a++) {
      flip(a);
      for (let b = a + 1; b < 52; b++) {
        flip(b);
        for (let c = b + 1; c < 52; c++) {
          flip(c);
          for (let d = c + 1; d < 52; d++) {
            flip(d);
            for (let e = d + 1; e < 52; e++) {
              flip(e);
              for (let f = e + 1; f < 52; f++) {
                flip(f);
                for (let g = f + 1; g < 52; g++) {
                  flip(g);
                  const x = evalMasks(m[0]!, m[1]!, m[2]!, m[3]!);
                  count[x >> 20]!++;
                  seen[x] = 1;
                  n++;
                  flip(g);
                }
                flip(f);
              }
              flip(e);
            }
            flip(d);
          }
          flip(c);
        }
        flip(b);
      }
      flip(a);
    }
    const ms = performance.now() - started;
    console.log(`全量 ${n} 手 ${Math.round(ms)} ms，约 ${Math.round((n / ms) * 1000 / 1e6)} 百万手/秒`);
    expect(n).toBe(133_784_560);
    expect(count).toEqual([23_294_460, 58_627_800, 31_433_400, 6_461_620, 6_180_020, 4_047_644, 3_473_184, 224_848, 41_584]);
    expect(seen.reduce((s, x) => s + x, 0)).toBe(4_824);
  });

  it('和朴素实现（21 个五张组合逐个比）对拍 10 万对', () => {
    let x = 12345;
    const rnd = (n: number): number => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) % n;
    };
    for (let i = 0; i < 100_000; i++) {
      const d = Array.from({ length: 52 }, (_, k) => k);
      for (let k = 0; k < 9; k++) {
        const j = k + rnd(52 - k);
        [d[k], d[j]] = [d[j]!, d[k]!];
      }
      const board = d.slice(4, 9);
      const a = [d[0]!, d[1]!, ...board];
      const b = [d[2]!, d[3]!, ...board];
      expect(Math.sign(evalCards(a) - evalCards(b))).toBe(compare(best7(a), best7(b)));
    }
  });
});

// ---------- 朴素实现：只给对拍用 ----------

function score5(cs: Card[]): number[] {
  const r = cs.map((c) => c >> 2).sort((p, q) => q - p);
  const flush = cs.every((c) => (c & 3) === (cs[0]! & 3));
  const cnt = new Map<number, number>();
  for (const k of r) cnt.set(k, (cnt.get(k) ?? 0) + 1);
  const groups = [...cnt].map(([k, n]) => [n, k] as const).sort((p, q) => q[0] - p[0] || q[1] - p[1]);
  let hi = -1;
  if (cnt.size === 5) {
    if (r[0]! - r[4]! === 4) hi = r[0]!;
    else if (r[0] === 12 && r[1] === 3) hi = 3;
  }
  const key = groups.flatMap(([n, k]) => new Array<number>(n).fill(k));
  if (hi >= 0 && flush) return [8, hi];
  if (groups[0]![0] === 4) return [7, ...key];
  if (groups[0]![0] === 3 && groups[1]![0] === 2) return [6, ...key];
  if (flush) return [5, ...r];
  if (hi >= 0) return [4, hi];
  if (groups[0]![0] === 3) return [3, ...key];
  if (groups[0]![0] === 2 && groups[1]![0] === 2) return [2, ...key];
  if (groups[0]![0] === 2) return [1, ...key];
  return [0, ...r];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return Math.sign(d);
  }
  return 0;
}

function best7(cs: Card[]): number[] {
  let best: number[] | null = null;
  for (let i = 0; i < 7; i++)
    for (let j = i + 1; j < 7; j++) {
      const s = score5(cs.filter((_, k) => k !== i && k !== j));
      if (!best || compare(s, best) > 0) best = s;
    }
  return best!;
}
