/**
 * 电脑（DESIGN.md 第 5 节）：任何局面、任何该出手的座位都出合法的操作；单次决定的耗时有上限；按场地分强弱；每场的状态让同一个电脑这场和下场不一样。
 */
import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { decide } from '../src/ai/index.ts';
import { pickPersonas, PERSONAS } from '../src/ai/personas.ts';
import { HEAT, STRESS } from '../src/core/cards.ts';
import { apply, begin, current, pending } from '../src/core/rules.ts';
import { LEVELS, type Opts, type State } from '../src/core/types.ts';
import { view } from '../src/core/view.ts';
import { FIXED } from '../src/track/fixed.ts';
import { actors, keyOf, race, step } from './helpers.ts';

/** 这一刻所有该出手的座位：交计划时是全部没交的，之后是轮到回答的那一辆 */
function everyone(s: State): number[] {
  if (s.phase === 'plan') return pending(s);
  const c = current(s);
  return c === null ? [] : [c];
}

describe('合法', () => {
  it('三条赛道、各种强弱，每一刻每个该出手的座位，电脑给的操作规则都收', () => {
    let checked = 0;
    for (const t of FIXED)
      for (const level of LEVELS)
        for (let n = 0; n < 3; n++) {
          const key = keyOf(300 + n);
          const cars = 2 + ((n * 2 + t.spaces) % 5);
          const opts: Opts = { track: t.id, laps: 1, cars, level };
          let s = begin(key, opts, Array(cars).fill('ai'), pickPersonas(stream(key, 'persona'), level, cars));
          for (let i = 0; i < 3_000 && s.phase !== 'over'; i++) {
            for (const seat of everyone(s)) {
              const r = apply(s, seat, decide(view(s, seat), seat));
              if ('error' in r) throw new Error(`${t.id} ${level} seat ${seat} round ${s.round}: ${r.error}`);
              checked++;
            }
            s = step(s, actors(s)[0]!);
          }
          expect(s.phase).toBe('over');
        }
    expect(checked).toBeGreaterThan(5_000);
  });
});

describe('CPU', () => {
  /** 最费的局面：手里 7 张各不相同（含两张手抖）、挂 2 挡（能挂 1–4 挡）、引擎有热量，组合最多、手抖要卷积 */
  function worst(): State {
    const s = begin(keyOf(41), { track: 'hillcity', laps: 2, cars: 6, level: 'hard' }, Array(6).fill('ai'), [5, 6, 5, 6, 5, 6]);
    const c = s.cars[0]!;
    const hand = [1, 2, 3, 4, 5, STRESS, STRESS];
    const deck = Array.from({ length: 12 }, (_, i) => 1 + (i % 4));
    c.kinds = [...hand, ...deck, ...Array(6).fill(HEAT)];
    c.hand = hand.map((_, i) => i);
    c.deck = deck.map((_, i) => hand.length + i);
    c.engine = Array.from({ length: 6 }, (_, i) => hand.length + deck.length + i);
    c.discard = [];
    c.gear = 2;
    return s;
  }

  it('最费的局面单次决定 < 5 毫秒（取 3 遍里最好的一遍的 p99），一回合六台电脑加起来 < 20 毫秒', () => {
    const s = worst();
    const v = view(s, 0);
    expect(v.me!.hand.filter((h) => h.kind === STRESS).length).toBe(2);
    const p99 = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.99)]!;
    let best = Infinity;
    for (let k = 0; k < 3 && best >= 5; k++) {
      const ms: number[] = [];
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        decide(v, 0);
        ms.push(performance.now() - t0);
      }
      best = Math.min(best, p99(ms));
    }
    expect(best).toBeLessThan(5);
    expect(best * 6).toBeLessThan(20);
  });

  it('跑完整场，所有决定的 p99 < 2 毫秒', () => {
    const ms: number[] = [];
    let s = begin(keyOf(42), { track: 'harbor', laps: 1, cars: 6, level: 'mix' }, Array(6).fill('ai'), [0, 1, 2, 3, 4, 5]);
    while (s.phase !== 'over') {
      const seat = actors(s)[0]!;
      const v = view(s, seat);
      const t0 = performance.now();
      const a = decide(v, seat);
      ms.push(performance.now() - t0);
      s = step(s, seat, a);
    }
    ms.sort((a, b) => a - b);
    expect(ms[Math.floor(ms.length * 0.99)]!).toBeLessThan(2);
  });
});

describe('按场地分强弱', () => {
  it('每档至少两个性格；新手场、普通场、老手场只从本档挑', () => {
    for (const lv of [0, 1, 2]) expect(PERSONAS.filter((p) => p.level === lv).length).toBeGreaterThanOrEqual(2);
    const lvOf = { easy: 0, normal: 1, hard: 2 } as const;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const got = pickPersonas(stream(keyOf(1), 'persona'), level, 5);
      for (const p of got) expect(PERSONAS[p]!.level).toBe(lvOf[level]);
      // 先挑完本档一轮再重复
      expect(new Set(got.slice(0, 2)).size).toBe(2);
    }
    const mix = pickPersonas(stream(keyOf(2), 'persona'), 'mix', 7);
    expect(new Set(mix).size).toBe(7);
  });

  it('同一条赛道上混跑（2 圈各 70 场）：老手的平均名次好于普通，普通好于新手', () => {
    for (const t of FIXED) {
      const sum = [0, 0, 0];
      const cnt = [0, 0, 0];
      for (let g = 0; g < 70; g++) {
        // 七个性格里轮流挑六个，发车位置跟着座位走
        const personas = PERSONAS.map((_, i) => i).filter((i) => i !== g % PERSONAS.length);
        const { s } = race(7000 + g, { track: t.id, laps: 2, cars: 6, level: 'mix' }, personas);
        s.finished.forEach((seat, rank) => {
          const lv = PERSONAS[personas[seat]!]!.level;
          sum[lv]! += rank + 1;
          cnt[lv]!++;
        });
      }
      const avg = sum.map((x, i) => x / cnt[i]!);
      expect(avg[2]!, `${t.name} 老手 ${avg[2]} 普通 ${avg[1]}`).toBeLessThan(avg[1]!);
      expect(avg[1]!, `${t.name} 普通 ${avg[1]} 新手 ${avg[0]}`).toBeLessThan(avg[0]!);
    }
  });
});

describe('每场的状态', () => {
  it('每个座位开局抽一份，只出现在自己的视图里，换一把密钥就不一样', () => {
    const a = begin(keyOf(51), { track: 'lakeside', laps: 1, cars: 4, level: 'mix' }, Array(4).fill('ai'), [0, 2, 4, 6]);
    const b = begin(keyOf(52), { track: 'lakeside', laps: 1, cars: 4, level: 'mix' }, Array(4).fill('ai'), [0, 2, 4, 6]);
    for (const f of a.form) {
      expect(f[0]).toBeGreaterThanOrEqual(-100);
      expect(f[0]).toBeLessThanOrEqual(100);
      expect(f[1]).toBeGreaterThanOrEqual(-100);
      expect(f[1]).toBeLessThanOrEqual(100);
    }
    expect(JSON.stringify(a.form)).not.toBe(JSON.stringify(b.form));
    expect(view(a, 1).me!.form).toEqual(a.form[1]);
    expect(JSON.stringify(view(a, 1))).not.toContain(JSON.stringify(a.form[2]));
    expect(view(a, null).me).toBeNull();
  });

  it('同一个电脑、同一个局面：冲劲足的这场和稳着开的那场，选法不总一样', () => {
    let differ = 0;
    let s = begin(keyOf(61), { track: 'hillcity', laps: 1, cars: 4, level: 'hard' }, Array(4).fill('ai'), [5, 6, 5, 6]);
    for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
      const seat = actors(s)[0]!;
      if (s.phase === 'plan') {
        const hot = structuredClone(s);
        hot.form[seat] = [100, 100, 1];
        const calm = structuredClone(s);
        calm.form[seat] = [-100, 100, 1];
        if (JSON.stringify(decide(view(hot, seat), seat)) !== JSON.stringify(decide(view(calm, seat), seat))) differ++;
      }
      s = step(s, seat);
    }
    expect(differ).toBeGreaterThan(3);
  });
});
