import { describe, expect, test } from 'vitest';
import { decompose, isComplete, shanten, ukeire, waits, type ShapeRules } from '../src/core/hand/index.ts';
import { shuffle } from 'arcade-kit/rng';
import { allTiles, kindOf, KINDS } from '../src/core/tiles/index.ts';
import { counts, rng } from './helpers.ts';

const XZ: ShapeRules = { seven: true, sevenQuads: true, kokushi: false };
const GEN: ShapeRules = { seven: false, sevenQuads: false, kokushi: false };
const RIICHI: ShapeRules = { seven: true, sevenQuads: false, kokushi: true };
const SUITED = Array.from({ length: 27 }, (_, i) => i);
const ALL = Array.from({ length: KINDS }, (_, i) => i);

/** 听牌（不管第五张摸不摸得到） */
function tenpai(c: number[], melds: number, rules: ShapeRules, allowed: number[]): boolean {
  return allowed.some((k) => {
    c[k]!++;
    const ok = isComplete(c, melds, rules);
    c[k]!--;
    return ok;
  });
}

/** 暴力的"一向听"：换一张（打一张、摸一张）就能听 */
function oneAway(c: number[], melds: number, rules: ShapeRules, allowed: number[]): boolean {
  for (let d = 0; d < KINDS; d++) {
    if (!c[d]) continue;
    c[d]!--;
    for (const k of allowed) {
      if (k === d) continue;
      c[k]!++;
      const ok = tenpai(c, melds, rules, allowed);
      c[k]!--;
      if (ok) {
        c[d]!++;
        return true;
      }
    }
    c[d]!++;
  }
  return false;
}

describe('向听数', () => {
  test('常见的牌', () => {
    expect(shanten(counts('123m456m789m11p23s'), 0, XZ)).toBe(0);
    expect(shanten(counts('1112345678999m'), 0, XZ)).toBe(0);
    expect(shanten(counts('11223344556677m'), 0, XZ)).toBe(-1);
    expect(shanten(counts('1122334455667m'), 0, XZ)).toBe(0);
    expect(shanten(counts('147m258p369s1357m'), 0, XZ)).toBeGreaterThanOrEqual(4);
    // 副露：碰了两组，手里 7 张
    expect(shanten(counts('123m45p99s'), 2, XZ)).toBe(0);
  });

  test('七对：川麻四张算两对，日麻不算', () => {
    const c = counts('1111m2233p4455s6s');
    expect(shanten(c, 0, XZ)).toBe(0);
    expect(shanten(c, 0, RIICHI)).toBeGreaterThan(0);
  });

  test('国士（日麻）', () => {
    const c = counts('19m19p19s1234567z');
    expect(shanten(c, 0, RIICHI)).toBe(0);
    expect(waits(c, 0, RIICHI, ALL)).toEqual([]); // 国士的和牌由玩法自己判，isComplete 只管一般型和七对
  });

  test('缺门：拆解时不算，还要算上打掉它们的轮数', () => {
    const dead = [18, 19, 20, 21, 22, 23, 24, 25, 26];
    // 四组 + 一张缺门：要先打掉缺门才能单钓，一向听
    expect(shanten(counts('123m456m789m111p2s'), 0, XZ, dead)).toBe(1);
    // 两张缺门、其他已经三组加一对：至少还要换两轮
    expect(shanten(counts('123m456m789m11p23s'), 0, XZ, dead)).toBe(2);
    // 14 张：这一手先打掉一张缺门，剩一张缺门要再换一轮
    expect(shanten(counts('123m456m789m11p23s5p'), 0, XZ, dead)).toBe(1);
  });

  test('和暴力枚举对得上（随机 13 张，一般型 + 七对）', () => {
    const r = rng('hand-test');
    const wall = allTiles({ suits: [0, 1, 2], honors: false, flowers: false, red: [] });
    for (let n = 0; n < 300; n++) {
      const hand = shuffle(wall, r).slice(0, 13);
      const c = new Array<number>(KINDS).fill(0);
      for (const t of hand) c[kindOf(t)]!++;
      for (const rules of [XZ, GEN]) {
        const s = shanten(c, 0, rules);
        expect(s === 0, `${c}`).toBe(tenpai(c, 0, rules, SUITED));
        if (s > 0) expect(s === 1, `${c}`).toBe(oneAway(c, 0, rules, SUITED));
      }
    }
  });

  test('和暴力枚举对得上（接近听牌的清一色，最容易出错）', () => {
    const r = rng('hand-test-flush');
    const one = allTiles({ suits: [0], honors: false, flowers: false, red: [] });
    for (let n = 0; n < 300; n++) {
      const hand = shuffle(one, r).slice(0, 13);
      const c = new Array<number>(KINDS).fill(0);
      for (const t of hand) c[kindOf(t)]!++;
      const s = shanten(c, 0, XZ);
      expect(s === 0, `${c}`).toBe(tenpai(c, 0, XZ, SUITED));
      if (s > 0) expect(s === 1, `${c}`).toBe(oneAway(c, 0, XZ, SUITED));
    }
  });
});

describe('听牌、和牌、拆法', () => {
  test('九莲宝灯听九面', () => {
    expect(waits(counts('1112345678999m'), 0, XZ, SUITED)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('手里已经四张的不算听（摸不到第五张）', () => {
    expect(waits(counts('1111m234p567s789s'), 0, XZ, SUITED)).not.toContain(0);
  });

  test('拆法列全：111222333m 可以是三个刻子或三个顺子', () => {
    const d = decompose(counts('111222333m456p99s'), 0);
    expect(d.length).toBe(2);
    expect(d.every((x) => x.pair === 26)).toBe(true);
  });

  test('有效牌减去看得见的', () => {
    const c = counts('123m456m789m11p23s');
    const visible = new Array<number>(KINDS).fill(0);
    expect(ukeire(c, 0, XZ, SUITED, visible)).toEqual({ kinds: [18, 21], total: 8 });
    visible[21] = 3;
    expect(ukeire(c, 0, XZ, SUITED, visible).total).toBe(5);
  });
});
