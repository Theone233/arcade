/** 道具（DESIGN.md 2.6）和体力共用（2.4）：扣体力、不够就拒绝、叠加的组合、特殊道具的次数、伤害倍率、连发一颗一颗算、三岔的角度、纸飞机 */
import { describe, expect, it } from 'vitest';
import { BOOST_COST, FORK_SPREAD, loadoutCost, MODES, PLAIN, shotScale, SPECIALS } from '../src/core/items.ts';
import { BODY_CY } from '../src/core/physics.ts';
import { apply, MAX_HP, MAX_STAMINA, previewShot, replay, STEP_COST } from '../src/core/rules.ts';
import { solidAt } from '../src/core/terrain.ts';
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
  it('价钱和设计一致', () => {
    expect([MODES.double.cost, MODES.triple.cost, MODES.fork.cost]).toEqual([35, 55, 40]);
    expect([BOOST_COST[10], BOOST_COST[20], BOOST_COST[50]]).toEqual([8, 18, 60]);
    expect([MODES.double.pct, MODES.triple.pct, MODES.fork.pct]).toEqual([60, 45, 50]);
    expect([SPECIALS.plane.cost, SPECIALS.lid.cost]).toEqual([60, 30]);
    expect([SPECIALS.plane.perGame, SPECIALS.lid.perGame]).toEqual([2, 2]);
    // 设计里叠加的例子
    expect(loadoutCost({ ...PLAIN, mode: 'triple', boost: 20 })).toBe(73);
    expect(loadoutCost({ ...PLAIN, mode: 'fork', boost: 50 })).toBe(100);
  });

  it('发射时扣掉道具的体力；爬和道具共用这回合的 100 点', () => {
    let s = flat([1000, 2900]);
    for (let i = 0; i < 10; i++) {
      const r = apply(s, { t: 'move', dir: 1 });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.stamina).toBe(MAX_STAMINA - 10 * STEP_COST);
    // 剩 80：连发 +2 加加力 20%（73）够
    const ok = apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'triple', boost: 20 });
    expect(ok.ok).toBe(true);
    const ev = ok.ok ? ok.events.find((e) => e.t === 'fire') : null;
    expect(ev).toMatchObject({ cost: 73, mode: 'triple', boost: 20 });
    // 剩 80：连发 +2 加加力 50%（115）不够，拒绝
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'triple', boost: 50 })).toEqual({ ok: false, error: 'tired' });
  });

  it('用光体力的组合正好能用', () => {
    const s = flat([1000, 2900]);
    s.stamina = 100;
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'fork', boost: 50 }).ok).toBe(true);
    s.stamina = 99;
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'fork', boost: 50 })).toEqual({ ok: false, error: 'tired' });
  });
});

describe('组合', () => {
  it('纸飞机不能和别的道具一起用', () => {
    const s = flat([1000, 2000]);
    for (const extra of [{ mode: 'double' as const }, { boost: 10 as const }, { lid: true }]) {
      expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, plane: true, ...extra })).toEqual({ ok: false, error: 'plane_alone' });
    }
  });

  it('锅盖可以和常用道具叠着用', () => {
    const s = flat([1000, 2900]);
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'double', boost: 10, lid: true }).ok).toBe(true);
  });

  it('不认识的道具一律拒绝', () => {
    const s = flat([1000, 2000]);
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'quad' as never })).toEqual({ ok: false, error: 'item' });
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, boost: 30 as never })).toEqual({ ok: false, error: 'item' });
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, mode: 'toString' as never })).toEqual({ ok: false, error: 'item' });
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

  it('纸飞机每局 2 次', () => {
    const s = flat([1000, 2900]);
    s.chars[0]!.special.plane = 0;
    expect(apply(s, { t: 'fire', angle: 45, power: 30, facing: 1, plane: true })).toEqual({ ok: false, error: 'no_plane' });
  });
});

describe('伤害倍率', () => {
  it('每颗的倍率 = 发射方式 × 加力', () => {
    expect(shotScale(PLAIN)).toBe(10_000);
    expect(shotScale({ ...PLAIN, mode: 'double' })).toBe(6_000);
    expect(shotScale({ ...PLAIN, mode: 'triple', boost: 20 })).toBe(5_400);
    expect(shotScale({ ...PLAIN, mode: 'fork', boost: 50 })).toBe(7_500);
    expect(shotScale({ ...PLAIN, boost: 10 })).toBe(11_000);
  });

  it('加力 50% 直接命中多 50%（取整）', () => {
    const w = weapon('steamer');
    const s = flat([1000, 1300]);
    const p = hitPower(s);
    const plain = fire(s, { angle: 45, power: p, facing: 1 }).events.find((e) => e.t === 'hurt' && e.id === 1);
    const boosted = fire(s, { angle: 45, power: p, facing: 1, boost: 50 }).events.find((e) => e.t === 'hurt' && e.id === 1);
    expect(plain).toMatchObject({ dmg: blastDamage(w, w, w.radius, 0) });
    expect(boosted).toMatchObject({ dmg: blastDamage(w, w, w.radius, 0, 15_000) });
    expect((boosted as { dmg: number }).dmg).toBeGreaterThan((plain as { dmg: number }).dmg);
  });

  it('坑的大小不看道具：加力 50% 挖的坑和不加力一样大', () => {
    const s = flat([1000, 2900]);
    const a = fire(s, { angle: 45, power: 40, facing: 1 }).state.terrain.cells;
    const b = fire(s, { angle: 45, power: 40, facing: 1, boost: 50 }).state.terrain.cells;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('连发', () => {
  it('连发 +1 扔 2 颗、+2 扔 3 颗，一颗一个 shot 事件，每颗都挖坑', () => {
    const s = flat([1000, 2900]);
    for (const [mode, n] of [['double', 2], ['triple', 3]] as const) {
      const r = fire(s, { angle: 45, power: 40, facing: 1, mode });
      expect(shots(r.events).length).toBe(n);
      expect(r.events.filter((e) => e.t === 'boom').length).toBe(n);
    }
  });

  it('按顺序一颗一颗算：前一颗的坑会影响后一颗（第二颗落得更深）', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 40, facing: 1, mode: 'double' });
    const [a, b] = shots(r.events).map((e) => e.flights[0]!.end!);
    expect(b!.y).toBeGreaterThan(a!.y);
  });

  it('每颗伤害 60%', () => {
    const w = weapon('steamer');
    const s = flat([1000, 1300]);
    s.chars[1]!.hp = 1000;
    const r = fire(s, { angle: 45, power: hitPower(s), facing: 1, mode: 'double' });
    const first = r.events.find((e) => e.t === 'hurt' && e.id === 1);
    expect(first).toMatchObject({ dmg: blastDamage(w, w, w.radius, 0, 6_000) });
  });

  it('自己出局了就不再扔', () => {
    const s = flat([1000, 2900]);
    s.chars[0]!.hp = 1;
    // 墙挡在面前：一出膛就炸到自己
    s.terrain = slab(1018, 1060, 300, 500, s.terrain);
    const r = fire(s, { angle: 20, power: 50, facing: 1, mode: 'triple' });
    expect(shots(r.events).length).toBe(1);
    expect(r.state.chars[0]!.out).toBe(true);
  });
});

describe('三岔', () => {
  it('三颗同时飞，角度各差 6°，每颗伤害 50%', () => {
    const s = flat([1000, 2900]);
    const r = fire(s, { angle: 45, power: 50, facing: 1, mode: 'fork' });
    const sh = shots(r.events);
    expect(sh.length).toBe(1);
    expect(sh[0]!.flights.length).toBe(3);
    // 三颗的路线和单独按 39°、45°、51° 打的一样
    for (const [i, a] of [45 - FORK_SPREAD, 45, 45 + FORK_SPREAD].entries()) {
      expect(sh[0]!.flights[i]!.path).toEqual(previewShot(s, a, 50, 1, true).path);
    }
    expect(r.events.filter((e) => e.t === 'boom').length).toBe(3);
    expect(MODES.fork.pct).toBe(50);
  });
});

describe('锅盖', () => {
  it('这一发不受风：大风里的落点和没风时一样；连发每一颗都算', () => {
    const calm = flat([1000, 2900], { wind: 0 });
    const windy = flat([1000, 2900], { wind: 5 });
    const a = fire(calm, { angle: 45, power: 50, facing: 1, mode: 'double' });
    const b = fire(windy, { angle: 45, power: 50, facing: 1, mode: 'double', lid: true });
    const c = fire(windy, { angle: 45, power: 50, facing: 1, mode: 'double' });
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
    expect(r.state.chars[0]!.special.plane).toBe(1);
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
    expect(r.state.chars[0]!.special.plane).toBe(1);
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
      { t: 'fire', angle: 40, power: 62, facing: 1, mode: 'double', boost: 20 },
      { t: 'fire', angle: 50, power: 70, facing: -1, mode: 'fork', lid: true },
      { t: 'fire', angle: 45, power: 40, facing: 1, plane: true },
      { t: 'fire', angle: 30, power: 55, facing: -1, mode: 'triple', boost: 10 },
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

