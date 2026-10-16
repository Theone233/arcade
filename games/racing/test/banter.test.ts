/** 电脑的互动（src/game/banter.ts，DESIGN.md 6.2）：只看公开快照、编号和对象合法、只替电脑说、可复现、冷却、按脾气回。 */
import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../src/ai/personas.ts';
import { view } from '../src/core/view.ts';
import { EMOTES, PHRASE, prop, sticker } from '../src/game/emotes.ts';
import { Banter, factsOf, react, reply, snapOf, TEMPER, temperOf, urge, type Snap, type Talk } from '../src/game/banter.ts';
import { race } from './helpers.ts';

function snap(over: Partial<Snap>[] = []): Snap[] {
  return Array.from({ length: 4 }, (_, i) => ({ pos: 10 - i, rank: null, spins: 0, slips: 0, stalls: 0, heat: 0, persona: [2, 3, 5, 0][i]!, ...over[i] }));
}

/** 跑一场，每一步都按公开快照让电脑说话，收集所有的话 */
function talksOfRace(n: number, human = 0): Talk[][] {
  const out: Talk[][] = [];
  let prev: Snap[] | null = null;
  race(n, { track: 'harbor', laps: 1, cars: 4, level: 'mix' }, [2, 3, 5, 0], 5_000, (s) => {
    const cur = snapOf(view(s, null).cars);
    out.push(react(factsOf(prev, cur), cur, (seat) => seat !== human, s.n));
    prev = cur;
  });
  return out;
}

describe('性格的脾气', () => {
  it('每个性格都有一份', () => {
    expect(TEMPER.length).toBe(PERSONAS.length);
    expect(temperOf(-1).talk).toBeLessThan(0.5);
  });
});

describe('认出公开的事', () => {
  it('打滑、吸尾流（对着前面那辆）、超车、冲线、熄火、一口气付好多热量', () => {
    const prev = snap();
    const cur = snap([{ pos: 12, slips: 1 }, { spins: 1, pos: 5 }, { rank: 0 }, { stalls: 1, heat: 0 }]);
    cur[0]!.pos = 7;
    cur[3]!.heat = 4;
    const f = factsOf(prev, cur);
    expect(f).toContainEqual({ k: 'spin', seat: 1 });
    expect(f).toContainEqual({ k: 'finish', seat: 2, rank: 0 });
    expect(f).toContainEqual({ k: 'stall', seat: 3 });
    expect(f).toContainEqual({ k: 'burn', seat: 3 });
    expect(f.find((x) => x.k === 'slip')).toBeDefined();
    const pass = factsOf(snap([{ pos: 5 }, { pos: 8 }]), snap([{ pos: 9 }, { pos: 8 }]));
    expect(pass).toContainEqual({ k: 'pass', seat: 0, target: 1 });
  });

  it('没有上一次的快照、车数对不上：什么都不认', () => {
    expect(factsOf(null, snap())).toEqual([]);
    expect(factsOf(snap().slice(0, 3), snap())).toEqual([]);
  });
});

describe('主动说', () => {
  it('跑几场：编号合法、对象是别的车、只替电脑说、一步最多两句，而且真的会说', () => {
    let total = 0;
    for (let n = 0; n < 6; n++)
      for (const step of talksOfRace(600 + n)) {
        expect(step.length).toBeLessThanOrEqual(2);
        for (const t of step) {
          total++;
          expect(t.seat).not.toBe(0);
          expect(Number.isInteger(t.id) && t.id >= 0 && t.id < EMOTES).toBe(true);
          if (t.to !== undefined) {
            expect(t.to).not.toBe(t.seat);
            expect(t.to).toBeGreaterThanOrEqual(0);
            expect(t.to).toBeLessThan(4);
          }
        }
      }
    expect(total).toBeGreaterThan(20);
  });

  it('同一步同样的结果（可复现）', () => {
    expect(JSON.stringify(talksOfRace(700))).toBe(JSON.stringify(talksOfRace(700)));
  });

  it('自己打滑按脾气：冲冲喊"刹不住了"，嘟嘟哭', () => {
    const always = (s: number) => s >= 0;
    let cheeky = 0;
    let meek = 0;
    for (let salt = 0; salt < 200; salt++) {
      for (const t of react([{ k: 'spin', seat: 0 }], snap(), always, salt)) if (t.seat === 0 && t.id === PHRASE.noBrakes) cheeky++;
      for (const t of react([{ k: 'spin', seat: 3 }], snap(), always, salt)) if (t.seat === 3 && t.id === sticker('cry')) meek++;
    }
    expect(cheeky).toBeGreaterThan(100);
    expect(meek).toBeGreaterThan(50);
  });

  it('冷却：同一个电脑几秒内只说一次', () => {
    const b = new Banter(6_000);
    const t: Talk = { seat: 1, id: PHRASE.go };
    expect(b.pass(t, 0)).toBe(true);
    expect(b.pass(t, 3_000)).toBe(false);
    expect(b.pass({ seat: 2, id: PHRASE.go }, 3_000)).toBe(true);
    expect(b.pass(t, 6_500)).toBe(true);
  });
});

describe('回应和催促', () => {
  /** 多试几个种子，看这个性格最常怎么回 */
  function usual(persona: number, id: number): string {
    const seen = new Map<string, number>();
    for (let salt = 0; salt < 300; salt++) {
      const r = reply(1, persona, 0, id, salt);
      if (!r) continue;
      const k = JSON.stringify(r);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'null';
  }

  it('被扔番茄：冲冲扔回来，弯道王狗头，嘟嘟哭', () => {
    expect(usual(2, prop('tomato'))).toBe(JSON.stringify({ seat: 1, id: prop('tomato'), to: 0 }));
    expect(usual(5, prop('tomato'))).toBe(JSON.stringify({ seat: 1, id: sticker('doge'), to: 0 }));
    expect(usual(0, prop('tomato'))).toBe(JSON.stringify({ seat: 1, id: sticker('cry') }));
  });

  it('被夸：回个好的', () => {
    const r = usual(4, PHRASE.niceDrive);
    expect([JSON.stringify({ seat: 1, id: sticker('love'), to: 0 })]).toContain(r);
  });

  it('真人想太久：话最多的电脑催一下，冲线了的不催', () => {
    expect(urge(snap(), 3)).toEqual({ seat: 0, id: PHRASE.hurry, to: 3 });
    expect(urge(snap([{ rank: 0 }]), 3)?.seat).toBe(1);
  });
});
