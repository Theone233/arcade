/** 道具（DESIGN.md 2.6，0.3.0 常用道具可叠加）和体力共用（2.4）：扣体力、不够就拒绝、叠加的规则和上限、特殊道具的次数、伤害倍率、每轮的出手顺序和角度、纸飞机 */
import { describe, expect, it } from 'vitest';
import { COMMONS, DIG_PCT, digRadius, FORK_PCT, FORK_SPREAD, loadout, loadoutCost, loadoutError, MAX_VOLLEYS, PLAIN, shellCount, shotScale, SPECIALS, VOLLEY_PCT, volleys } from '../src/core/items.ts';
import { BODY_CY } from '../src/core/physics.ts';
import { apply, MAX_HP, MAX_STAMINA, previewShot, replay, STEP_COST } from '../src/core/rules.ts';
import { carve, cloneTerrain, dig as digCrater, solidAt } from '../src/core/terrain.ts';
import type { Ev, FireAction, State } from '../src/core/types.ts';
import { blastDamage, weapon } from '../src/core/weapons.ts';
import { flat, KEY, SETUP, slab } from './helpers.ts';

function fire(s: State, a: Omit<FireAction, 't'>): { state: State; events: Ev[] } {
  const r = apply(s, { t: 'fire', ...a });
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** 平地上找一发直接打中对面的力度（角度 45，不受风时） */
function hitPower(s: State, lid = false): number {
  for (let p = 10; p <= 100; p++) if (previewShot(s, 45, p, 1, false, lid).hit === 1) return p;
  throw new Error('打不中');
}

const shots = (ev: Ev[]): Extract<Ev, { t: 'shot' }>[] => ev.filter((e): e is Extract<Ev, { t: 'shot' }> => e.t === 'shot');

describe('体力', () => {
  it('价钱和每颗伤害（README"数值"一节的表），守住任意组合的价钱约束（DESIGN.md 2.6）', () => {
    expect([COMMONS.p1.cost, COMMONS.p2.cost, COMMONS.fork.cost]).toEqual([18, 30, 52]);
    expect([COMMONS.b10.cost, COMMONS.b20.cost, COMMONS.b50.cost]).toEqual([16, 30, 72]);
    expect(VOLLEY_PCT.slice(1)).toEqual([100, 54, 37, 29, 23, 20, 17, 15, 14, 13]);
    expect(VOLLEY_PCT.length).toBe(MAX_VOLLEYS + 1);
    expect(FORK_PCT).toBe(35);
    expect([SPECIALS.plane.cost, SPECIALS.lid.cost]).toEqual([60, 30]);
    expect([SPECIALS.plane.perGame, SPECIALS.lid.perGame]).toEqual([null, 2]);
    // 三岔 > 50；三岔 + 连发 +1 + 连发 +2 ≤ 100；+1 < +2 < 两个 +1；加力 50% > 50
    expect(COMMONS.fork.cost).toBeGreaterThan(50);
    expect(loadoutCost(loadout({ fork: 1, p1: 1, p2: 1 }))).toBeLessThanOrEqual(100);
    expect(COMMONS.p1.cost).toBeLessThan(COMMONS.p2.cost);
    expect(COMMONS.p2.cost).toBeLessThan(2 * COMMONS.p1.cost);
    expect(COMMONS.b50.cost).toBeGreaterThan(50);
    expect([COMMONS.fork.max, COMMONS.b50.max]).toEqual([1, 1]);
    // 100 点体力买得到的最多轮数（三个 +2）在每颗伤害表里
    expect(volleys(loadout({ p2: 3 }))).toBe(7);
    expect(loadoutCost(loadout({ p2: 3 }))).toBeLessThanOrEqual(100);
  });

  it('发射时扣掉道具的体力；爬和道具共用这回合的 100 点', () => {
    let s = flat([1000, 2900]);
    for (let i = 0; i < 10; i++) {
      const r = apply(s, { t: 'move', dir: 1 });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.stamina).toBe(MAX_STAMINA - 10 * STEP_COST);
    // 剩 80：连发 +2 加连发 +1 加加力 20%（78）够
    const ok = apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, p2: 1, p1: 1, b20: 1 });
    expect(ok.ok).toBe(true);
    const ev = ok.ok ? ok.events.find((e) => e.t === 'fire') : null;
    expect(ev).toMatchObject({ cost: 78, loadout: { p1: 1, p2: 1, b20: 1, fork: 0 } });
    // 剩 80：连发 +1 加加力 50%（88）不够，拒绝
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, p1: 1, b50: 1 })).toEqual({ ok: false, error: 'tired' });
  });

  it('用光体力的组合正好能用', () => {
    const s = flat([1000, 2900]);
    s.stamina = 100;
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, fork: 1, p1: 1, p2: 1 }).ok).toBe(true);
    s.stamina = 99;
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, fork: 1, p1: 1, p2: 1 })).toEqual({ ok: false, error: 'tired' });
    // 加力 50% + 20% 是 102，买不起
    s.stamina = 100;
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, b50: 1, b20: 1 })).toEqual({ ok: false, error: 'tired' });
  });
});

describe('叠加', () => {
  it('三岔 + 连发 +1 + 连发 +2 正好 100 体力：4 轮、每轮 3 颗', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 40, facing: 1, fork: 1, p1: 1, p2: 1 });
    expect(shots(r.events).length).toBe(4);
    for (const e of shots(r.events)) expect(e.flights.length).toBe(3);
    expect(r.events.find((e) => e.t === 'fire')).toMatchObject({ cost: 100 });
  });

  it('同一个能选多次、不同的能叠：轮数 = 1 + 连发数，三岔每轮 3 颗，加力加在一起', () => {
    expect(volleys(loadout({ p1: 2 }))).toBe(3);
    expect(volleys(loadout({ p2: 1, p1: 1 }))).toBe(4);
    expect(volleys(loadout({ p2: 2 }))).toBe(5);
    const s = flat([1000, 2900]);
    for (const [l, rounds, per] of [
      [{ p1: 2 }, 3, 1],
      [{ fork: 1, p1: 1 }, 2, 3],
      [{ b10: 3, b20: 1 }, 1, 1],
    ] as const) {
      const r = fire(s, { angle: 45, power: 40, facing: 1, ...l });
      expect(shots(r.events).length).toBe(rounds);
      for (const e of shots(r.events)) expect(e.flights.length).toBe(per);
    }
  });

  it('三岔、加力 50% 一回合最多 1 个（显式校验，不只靠价钱）', () => {
    expect(loadoutError(loadout({ fork: 2 }))).toBe('item');
    expect(loadoutError(loadout({ b50: 2 }))).toBe('item');
    const s = flat([1000, 2900]);
    s.stamina = 1000;
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, fork: 2 })).toEqual({ ok: false, error: 'item' });
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, b50: 2 })).toEqual({ ok: false, error: 'item' });
  });

  it('轮数不另设上限（体力决定），只有防异常的 MAX_VOLLEYS；计数是 0 到上限的整数', () => {
    const s = flat([1000, 2900]);
    s.stamina = 1000;
    expect(MAX_VOLLEYS).toBe(10);
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, p2: 4, p1: 2 })).toEqual({ ok: false, error: 'volleys' });
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, p2: 4, p1: 1 }).ok).toBe(true);
    // 100 体力买得起的最多轮数：三个 +2，7 轮
    const full = flat([1000, 2900]);
    expect(shots(fire(full, { angle: 45, power: 40, facing: 1, p2: 3 }).events).length).toBe(7);
    for (const bad of [{ p1: -1 }, { p1: 1.5 }, { p1: 10 }, { b10: 11 }, { b20: '1' }, { fork: true }, { lid: 1 }])
      expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, ...(bad as object) })).toEqual({ ok: false, error: 'item' });
  });

  it('体力不够：叠到超过这回合剩的就拒绝', () => {
    const s = flat([1000, 2900]);
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, fork: 1, p1: 1, p2: 1, b10: 1 })).toEqual({ ok: false, error: 'tired' });
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, b10: 6 }).ok).toBe(true);
    expect(apply(s, { t: 'fire', angle: 45, power: 40, facing: 1, b10: 7 })).toEqual({ ok: false, error: 'tired' });
  });

  it('纸飞机独占：不能和任何常用道具、锅盖一起用', () => {
    const s = flat([1000, 2000]);
    for (const extra of [{ p1: 1 }, { fork: 1 }, { b10: 1 }, { lid: true }]) {
      expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, plane: true, ...extra })).toEqual({ ok: false, error: 'plane_alone' });
    }
  });

  it('锅盖可以和常用道具叠着用', () => {
    const s = flat([1000, 2900]);
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, p1: 1, b10: 1, lid: true }).ok).toBe(true);
  });
});

describe('特殊道具的次数', () => {
  it('锅盖每局 2 次，用完就拒绝；回合换了也不回来', () => {
    let s = flat([1000, 2900]);
    for (let i = 0; i < 2; i++) {
      s.actor = 0;
      s = fire(s, { angle: 70, power: 10, facing: -1, lid: true }).state;
    }
    s.actor = 0;
    s.stamina = 100;
    expect(s.chars[0]!.special.lid).toBe(0);
    expect(apply(s, { t: 'fire', angle: 70, power: 10, facing: -1, lid: true })).toEqual({ ok: false, error: 'no_lid' });
    expect(s.chars[1]!.special.lid).toBe(2);
  });

  it('纸飞机每局不限次数（0.3.1）：连着用好几回合都行，还是花 60、只能单独用', () => {
    let s = flat([1000, 2900]);
    for (let k = 0; k < 4; k++) {
      s.actor = 0;
      s.stamina = 100;
      const r = apply(s, { t: 'fire', angle: 60, power: 20, facing: 1, plane: true });
      expect(r.ok, `第 ${k + 1} 次`).toBe(true);
      if (r.ok) s = r.state;
    }
    s.actor = 0;
    s.stamina = 59;
    expect(apply(s, { t: 'fire', angle: 60, power: 20, facing: 1, plane: true })).toEqual({ ok: false, error: 'tired' });
    s.stamina = 100;
    expect(apply(s, { t: 'fire', angle: 60, power: 20, facing: 1, plane: true, b10: 1 })).toEqual({ ok: false, error: 'plane_alone' });
  });
});

describe('伤害倍率', () => {
  it('每颗的倍率 = 按总轮数的每颗伤害 × 三岔 × (1 + 加力)', () => {
    expect(shotScale(PLAIN)).toBe(10_000);
    expect(shotScale(loadout({ p1: 1 }))).toBe(VOLLEY_PCT[2]! * 100);
    expect(shotScale(loadout({ p1: 1, p2: 1 }))).toBe(VOLLEY_PCT[4]! * 100);
    expect(shotScale(loadout({ b10: 2, b20: 1 }))).toBe(14_000);
    expect(shotScale(loadout({ fork: 1 }))).toBe(FORK_PCT * 100);
    expect(shotScale(loadout({ fork: 1, p1: 1, b20: 1 }))).toBe((VOLLEY_PCT[2]! * 120 * FORK_PCT) / 100);
    expect(shotScale(loadout({ b50: 1, b20: 1 }))).toBe(17_000);
    for (const l of [loadout({ fork: 1, p2: 2, b10: 3 }), loadout({ p1: 3, b20: 1 })]) expect(Number.isInteger(shotScale(l))).toBe(true);
  });

  it('加力 50% 直接命中多 50%（取整）', () => {
    const w = weapon('steamer');
    const s = flat([1000, 1300]);
    const p = hitPower(s);
    const plain = fire(s, { angle: 45, power: p, facing: 1 }).events.find((e) => e.t === 'hurt' && e.id === 1);
    const boosted = fire(s, { angle: 45, power: p, facing: 1, b50: 1 }).events.find((e) => e.t === 'hurt' && e.id === 1);
    expect(plain).toMatchObject({ dmg: blastDamage(w, w, w.radius, 0) });
    expect(boosted).toMatchObject({ dmg: blastDamage(w, w, w.radius, 0, 15_000) });
    expect((boosted as { dmg: number }).dmg).toBeGreaterThan((plain as { dmg: number }).dmg);
  });

  it('坑按这一手的总颗数缩小：表单调不升、最小 45%，半径是整数，boom 事件（画面照它挖）和规则核心挖的是同一个数', () => {
    expect(DIG_PCT[1]).toBe(100);
    expect(DIG_PCT.length).toBe(MAX_VOLLEYS * 3 + 1);
    for (let n = 2; n < DIG_PCT.length; n++) {
      expect(DIG_PCT[n]!).toBeLessThanOrEqual(DIG_PCT[n - 1]!);
      expect(DIG_PCT[n]!).toBeGreaterThanOrEqual(45);
    }
    const dig = weapon('steamer').dig;
    for (const l of [PLAIN, loadout({ p1: 1 }), loadout({ fork: 1 }), loadout({ fork: 1, p1: 1, p2: 1 }), loadout({ p2: 3 })]) {
      const r = digRadius(dig, l);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBe(Math.floor((dig * DIG_PCT[shellCount(l)]!) / 100));
    }
    expect(shellCount(loadout({ fork: 1, p1: 1, p2: 1 }))).toBe(12);
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 40, facing: 1, fork: 1, p1: 1, p2: 1 });
    const booms = r.events.filter((e): e is Extract<Ev, { t: 'boom' }> => e.t === 'boom');
    expect(booms.length).toBeGreaterThan(0);
    for (const b of booms) expect(b.r).toBe(digRadius(dig, loadout({ fork: 1, p1: 1, p2: 1 })));
    // 按 boom 事件在一份地形上挖，和规则核心的结果一样（画面就是这么做的）
    const t = cloneTerrain(s.terrain);
    for (const b of booms) digCrater(t, b.x, b.y, b.r, b.w);
    expect(Buffer.from(t.cells).equals(Buffer.from(r.state.terrain.cells))).toBe(true);
    // 1 颗的坑不缩
    expect(fire(s, { angle: 45, power: 40, facing: 1 }).events.find((e) => e.t === 'boom')).toMatchObject({ r: dig });
  });

  it('坑的大小不看加力：加力挖的坑和不加力一样大', () => {
    const s = flat([1000, 2900]);
    const a = fire(s, { angle: 45, power: 40, facing: 1 }).state.terrain.cells;
    const b = fire(s, { angle: 45, power: 40, facing: 1, b50: 1, b10: 1 }).state.terrain.cells;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('连发', () => {
  it('连发一轮一个 shot 事件，每颗都挖坑', () => {
    const s = flat([1000, 2900]);
    for (const [l, n] of [[{ p1: 1 }, 2], [{ p1: 2 }, 3], [{ p2: 1, p1: 1 }, 4]] as const) {
      s.stamina = 200;
      const r = fire(s, { angle: 45, power: 40, facing: 1, ...l });
      expect(shots(r.events).length).toBe(n);
      expect(r.events.filter((e) => e.t === 'boom').length).toBe(n);
    }
  });

  it('按顺序一轮一轮算：前一轮的坑会影响后一轮（第二颗落得更深）', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 40, facing: 1, p1: 1 });
    const [a, b] = shots(r.events).map((e) => e.flights[0]!.end!);
    expect(b!.y).toBeGreaterThan(a!.y);
  });

  it('每颗伤害按总轮数取（2 轮）', () => {
    const w = weapon('steamer');
    const s = flat([1000, 1300]);
    s.chars[1]!.hp = 1000;
    const r = fire(s, { angle: 45, power: hitPower(s), facing: 1, p1: 1 });
    const first = r.events.find((e) => e.t === 'hurt' && e.id === 1);
    expect(first).toMatchObject({ dmg: blastDamage(w, w, w.radius, 0, VOLLEY_PCT[2]! * 100) });
  });

  it('自己出局了就不再扔', () => {
    const s = flat([1000, 2900]);
    s.chars[0]!.hp = 1;
    // 墙挡在面前：一出膛就炸到自己
    s.terrain = slab(1018, 1060, 300, 500, s.terrain);
    const r = fire(s, { angle: 20, power: 50, facing: 1, p1: 2 });
    expect(shots(r.events).length).toBe(1);
    expect(r.state.chars[0]!.out).toBe(true);
  });
});

describe('三岔', () => {
  it('三颗同时飞，角度 −6°、0、+6°，每颗伤害再乘 FORK_PCT', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 50, facing: 1, fork: 1 });
    const sh = shots(r.events);
    expect(sh.length).toBe(1);
    expect(sh[0]!.flights.length).toBe(3);
    for (const [i, a] of [45 - FORK_SPREAD, 45, 45 + FORK_SPREAD].entries()) {
      expect(sh[0]!.flights[i]!.path).toEqual(previewShot(s, a, 50, 1, true).path);
    }
    expect(r.events.filter((e) => e.t === 'boom').length).toBe(3);
  });

  it('三岔加连发：每一轮都是三颗、角度一样；一轮之内按落地先后炸（一样快按角度从小到大），炸完、掉完再出下一轮', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 40, power: 45, facing: 1, fork: 1, p1: 1 });
    const sh = shots(r.events);
    expect(sh.length).toBe(2);
    // 第一轮和单独打三岔一样
    const one = fire(s, { angle: 40, power: 45, facing: 1, fork: 1 });
    expect(sh[0]!.flights).toEqual(shots(one.events)[0]!.flights);
    // 第一轮的三个 boom 按落地先后：路线短的先炸
    const booms = r.events.filter((e): e is Extract<Ev, { t: 'boom' }> => e.t === 'boom');
    expect(booms.length).toBe(6);
    const order = sh[0]!.flights.map((f, i) => ({ n: f.path.length, i, end: f.end })).sort((a, b) => a.n - b.n || a.i - b.i);
    expect(booms.slice(0, 3).map((b) => [b.x, b.y])).toEqual(order.map((o) => [o.end!.x, o.end!.y]));
    // 第二轮在第一轮的事件（boom、可能的掉落）之后
    const idx = r.events.indexOf(sh[1]!);
    expect(r.events.slice(0, idx).filter((e) => e.t === 'boom').length).toBe(3);
    // 第二轮三颗的角度也是 34°、40°、46°（路线从第二轮的地形上重算，起点一样）
    for (const [i, f] of sh[1]!.flights.entries()) expect([f.path[0], f.path[1]]).toEqual([sh[0]!.flights[i]!.path[0], sh[0]!.flights[i]!.path[1]]);
  });

  it('角度夹在 0–90°：88° 的三岔另两颗是 82° 和 90°', () => {
    const s = flat([1000, 2900]);
    s.chars[0]!.weapon = 'rocket';
    const r = fire(s, { angle: 88, power: 20, facing: 1, fork: 1 });
    expect(shots(r.events)[0]!.flights[2]!.path).toEqual(previewShot(s, 90, 20, 1, true).path);
  });
});

describe('锅盖', () => {
  it('这一发不受风：大风里的落点和没风时一样；连发每一颗都算', () => {
    const calm = flat([1000, 2900], { wind: 0 });
    const windy = flat([1000, 2900], { wind: 5 });
    const a = fire(calm, { angle: 45, power: 50, facing: 1, p1: 1 });
    const b = fire(windy, { angle: 45, power: 50, facing: 1, p1: 1, lid: true });
    const c = fire(windy, { angle: 45, power: 50, facing: 1, p1: 1 });
    const ends = (r: { events: Ev[] }): unknown => shots(r.events).map((e) => e.flights[0]!.end);
    expect(ends(b)).toEqual(ends(a));
    expect(ends(c)).not.toEqual(ends(a));
    expect(b.state.chars[0]!.special.lid).toBe(1);
  });
});

describe('纸飞机', () => {
  it('落地不炸、不伤、不挖，人瞬移到落点上方；这回合就结束', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 40, facing: 1, plane: true });
    expect(r.events.some((e) => e.t === 'boom' || e.t === 'hurt')).toBe(false);
    expect(Buffer.from(r.state.terrain.cells).equals(Buffer.from(s.terrain.cells))).toBe(true);
    const sh = shots(r.events)[0]!;
    expect(sh.plane).toBe(true);
    const warp = r.events.find((e) => e.t === 'warp');
    expect(warp).toMatchObject({ t: 'warp', id: 0, from: { x: 1000, y: 500 }, to: { x: sh.flights[0]!.end!.x, y: 500 } });
    expect(r.state.chars[0]!.x).toBe(sh.flights[0]!.end!.x);
    expect(r.state.actor).toBe(1);
    expect(r.state.chars[0]!.special).toEqual({ lid: 2 });
  });

  it('落到墙上：落在落点上方第一个站得下的地方', () => {
    const t = slab(0, 3000, 500, 700);
    slab(1300, 1340, 380, 500, t);
    const s = flat([1000, 2900], { terrain: t });
    let r: { state: State; events: Ev[] } | null = null;
    for (let p = 20; p <= 60 && !r; p++) {
      const sh = previewShot(s, 20, p, 1);
      if (sh.end && sh.end.x >= 1300 && sh.end.x < 1304 && sh.end.y > 400) r = fire(s, { angle: 20, power: p, facing: 1, plane: true });
    }
    expect(r).not.toBeNull();
    const me = r!.state.chars[0]!;
    expect(me.y).toBe(380);
    expect(solidAt(r!.state.terrain, me.x, me.y)).toBe(true);
    expect(solidAt(r!.state.terrain, me.x, me.y - 1)).toBe(false);
  });

  it('撞到角色：落在他旁边最近的空位', () => {
    const s = flat([1000, 1300]);
    let r: { state: State; events: Ev[] } | null = null;
    for (let p = 10; p <= 60 && !r; p++) if (previewShot(s, 45, p, 1).hit === 1) r = fire(s, { angle: 45, power: p, facing: 1, plane: true });
    expect(r).not.toBeNull();
    const me = r!.state.chars[0]!;
    expect(Math.abs(me.x - 1300)).toBeGreaterThanOrEqual(28);
    expect(Math.abs(me.x - 1300)).toBeLessThanOrEqual(40);
    expect(me.y).toBe(500);
    expect(r!.state.chars[1]!.hp).toBe(MAX_HP);
  });

  it('飞出画本就作废：人留在原地、不出局，道具照样用掉', () => {
    const s = flat([2950, 100]);
    const r = fire(s, { angle: 30, power: 100, facing: 1, plane: true });
    expect(r.events.find((e) => e.t === 'warp')).toEqual({ t: 'warp', id: 0, from: { x: 2950, y: 500 }, to: null });
    expect(r.state.chars[0]).toMatchObject({ x: 2950, y: 500, out: false });
    expect(r.state.stamina).toBe(MAX_STAMINA);
  });

  it('受风影响', () => {
    const a = fire(flat([1000, 2900], { wind: 0 }), { angle: 45, power: 40, facing: 1, plane: true }).state.chars[0]!.x;
    const b = fire(flat([1000, 2900], { wind: 5 }), { angle: 45, power: 40, facing: 1, plane: true }).state.chars[0]!.x;
    expect(b).toBeGreaterThan(a);
  });
});

describe('确定性（带道具）', () => {
  it('同一个种子、同一串带道具的操作，结果完全一样', () => {
    const log: FireAction[] = [
      { t: 'fire', angle: 40, power: 62, facing: 1, p1: 1, b20: 1 },
      { t: 'fire', angle: 50, power: 70, facing: -1, fork: 1, lid: true },
      { t: 'fire', angle: 45, power: 40, facing: 1, plane: true },
      { t: 'fire', angle: 30, power: 55, facing: -1, p1: 2, b10: 1 },
    ];
    const a = replay(KEY, SETUP, log);
    const b = replay(KEY, SETUP, log);
    expect(a.bad).toBeNull();
    expect(JSON.stringify({ ...a.state, terrain: [...a.state.terrain.cells] })).toBe(JSON.stringify({ ...b.state, terrain: [...b.state.terrain.cells] }));
  });

  it('直接命中时炸点在他身子中间（坑挖到脚下）', () => {
    const s = flat([1000, 1300]);
    const r = fire(s, { angle: 45, power: hitPower(s), facing: 1 });
    expect(r.events.find((e) => e.t === 'boom')).toMatchObject({ x: 1300, y: 500 - BODY_CY });
  });
});

