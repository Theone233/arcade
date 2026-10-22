import { describe, expect, it } from 'vitest';
import { plan, planActions } from '../src/ai/index.ts';
import { PLAIN } from '../src/core/items.ts';
import { favoriteWeapon, PERSONAS } from '../src/ai/personas.ts';
import { apply, MAX_HP, newGame } from '../src/core/rules.ts';
import { LOOKS, type State } from '../src/core/types.ts';
import { isWeaponId, weapon, WEAPON_IDS } from '../src/core/weapons.ts';
import { flat, KEY, SETUP, slab, vs } from './helpers.ts';

const bots = { ...SETUP, players: SETUP.players.map((p) => ({ ...p, ai: true })) };

function runAll(s: State): State {
  for (const a of planActions(plan(s))) {
    const r = apply(s, a);
    if (!r.ok) throw new Error(`电脑出了不合法的一步：${JSON.stringify(a)} ${r.error}`);
    s = r.state;
  }
  return s;
}

describe('电脑', () => {
  it('同一个状态出手一定一样', () => {
    const s = newGame(KEY, bots);
    expect(plan(s)).toEqual(plan(s));
    expect(plan(newGame(KEY, bots))).toEqual(plan(s));
  });

  it('出的每一步都合法：角度在武器范围里、爬得过去', () => {
    for (let k = 0; k < 5; k++) {
      const s = newGame([k, 3, 3, 3, 3, 3, 3, 3], bots);
      const p = plan(s);
      const w = weapon(s.chars[s.actor]!.weapon);
      expect(p.angle).toBeGreaterThanOrEqual(w.minAngle);
      expect(p.angle).toBeLessThanOrEqual(w.maxAngle);
      expect(p.power).toBeGreaterThanOrEqual(1);
      expect(p.power).toBeLessThanOrEqual(100);
      runAll(s);
    }
  });

  it('平地上站着不动的对手，几发之内打得中', () => {
    let s = flat([800, 1500]);
    s.chars[1]!.hp = 1000;
    let hits = 0;
    for (let i = 0; i < 6; i++) {
      s.actor = 0;
      s.wind = (i % 5) - 2;
      const before = s.chars[1]!.hp;
      s = runAll(s);
      if (s.chars[1]!.hp < before) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('朝对手那边打，不往自己脚下炸', () => {
    const s = flat([800, 1500]);
    const p = plan(s);
    expect(p.facing).toBe(1);
    const after = runAll(s);
    expect(after.chars[0]!.hp).toBe(MAX_HP);
  });

  it('电脑对电脑能打完一局（不卡死），一局在 30 回合以内', () => {
    for (let k = 0; k < 3; k++) {
      let s = newGame([k, 9, 9, 9, 9, 9, 9, 9], bots);
      let guard = 0;
      while (s.phase === 'play' && guard++ < 40) s = runAll(s);
      expect(s.phase).toBe('over');
      expect(s.turn).toBeLessThanOrEqual(30);
    }
  });

  it('风大（3 级以上）时用锅盖', () => {
    for (const wind of [-5, 4]) {
      const p = plan(flat([800, 1500], { wind }));
      expect(p.loadout.lid).toBe(true);
    }
    expect(plan(flat([800, 1500], { wind: 1 })).loadout.lid).toBe(false);
  });

  it('剩下的体力会花在道具上（体力回合末清零，不留着）', () => {
    const p = plan(flat([800, 1500], { wind: 0 }));
    expect(p.loadout.p1 + p.loadout.p2 + p.loadout.fork + p.loadout.b10 + p.loadout.b20 + p.loadout.b50).toBeGreaterThan(0);
  });

  it('站在薄得快穿的地方、又打不着对手时，用纸飞机飞到地厚的地方', () => {
    // 我站在一块 16 厚的薄片上；对手躲在右边一个只朝画本外开口的盒子里，打不着
    const t = slab(900, 1100, 500, 516);
    slab(1400, 2500, 500, 700, t);
    slab(2600, 3000, 380, 400, t);
    slab(2600, 2620, 380, 500, t);
    slab(2600, 3000, 500, 700, t);
    const s = flat([1000, 2900], { terrain: t });
    const p = plan(s);
    expect(p.loadout.plane).toBe(true);
    const after = runAll(s);
    const me = after.chars[0]!;
    expect(me.x).toBeGreaterThanOrEqual(1400);
    expect(me.x).toBeLessThan(2500);
  });

  it('禁掉的道具不用（模拟器比较用和不用）', () => {
    const p = plan(flat([800, 1500], { wind: 5 }), { ban: new Set(['lid', 'p1', 'p2', 'fork', 'boost', 'plane'] as const) });
    expect(p.loadout).toEqual(PLAIN);
  });

  it('CPU 预算：想一手不超过 300 毫秒（手机降速 4 倍时约 1 秒以内）', () => {
    const s = newGame(KEY, bots);
    plan(s);
    let worst = 0;
    for (let k = 0; k < 5; k++) {
      const st = newGame([k, 5, 5, 5, 5, 5, 5, 5], bots);
      const t0 = performance.now();
      plan(st);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(300);
  });

  it('3v3 想一手也不超过 300 毫秒', () => {
    // 先热一手（JIT），和上一条一样
    plan(newGame(KEY, vs(3)));
    let worst = 0;
    for (let k = 0; k < 4; k++) {
      const st = newGame([k, 6, 6, 6, 6, 6, 6, 6], vs(3));
      const t0 = performance.now();
      plan(st);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(300);
  });

  it('每把武器的电脑都打得出合法的一发（角度在它的范围里）', () => {
    for (const id of WEAPON_IDS) {
      const s = newGame([3, 3, 3, 3, 3, 3, 3, 3], bots);
      for (const c of s.chars) c.weapon = id;
      const p = plan(s);
      expect(p.angle).toBeGreaterThanOrEqual(weapon(id).minAngle);
      expect(p.angle).toBeLessThanOrEqual(weapon(id).maxAngle);
      runAll(s);
    }
  });
});

describe('电脑当队友', () => {
  /** 2v2 平地：0 号（电脑，蓝队）在 x0，队友 2 号在 xm，对手 1、3 号在 x1、x3 */
  function team(x0: number, xm: number, x1: number, x3: number, wind: number): State {
    const s = flat([x0, x1], { wind });
    s.setup = vs(2);
    s.chars.push({ ...s.chars[0]!, id: 2, name: '队友', x: xm }, { ...s.chars[1]!, id: 3, name: '对手2', x: x3 });
    s.chars[0]!.ai = true;
    s.chars[1]!.team = 1;
    s.chars[3]!.team = 1;
    s.chars[2]!.team = 0;
    for (const c of s.chars) c.hp = MAX_HP;
    return s;
  }

  it('不打自己人：队友站在中间，各种风下都不伤到他', () => {
    for (const wind of [-4, -1, 0, 2, 5]) {
      const s = team(800, 1150, 1500, 1700, wind);
      const after = runAll(s);
      expect(after.chars[2]!.hp, `风 ${wind}`).toBe(MAX_HP);
      expect(after.chars[2]!.out).toBe(false);
    }
  });

  it('队友贴着对手站：宁可不炸那一片，也不连队友一起炸', () => {
    for (const wind of [-2, 0, 3]) {
      const s = team(800, 1480, 1520, 2400, wind);
      const after = runAll(s);
      expect(after.chars[2]!.hp, `风 ${wind}`).toBe(MAX_HP);
    }
  });

  it('只朝对手那边打：对手都在左边就朝左', () => {
    const s = team(1500, 1900, 900, 700, 0);
    expect(plan(s).facing).toBe(-1);
  });
});

describe('电脑人物', () => {
  it('6 位，名字、外观不重复；偏好的武器都认得，第一把是默认', () => {
    expect(PERSONAS).toHaveLength(6);
    expect(new Set(PERSONAS.map((p) => p.name)).size).toBe(6);
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(6);
    expect(new Set(PERSONAS.map((p) => p.look)).size).toBe(6);
    expect(PERSONAS.map((p) => p.name)).toEqual(['橘子', '团团', '企企', '柴柴', '兔兔', '鼠鼠']);
    for (const p of PERSONAS) {
      expect(LOOKS).toContain(p.look);
      for (const w of p.weapons) expect(isWeaponId(w)).toBe(true);
      expect(favoriteWeapon(p)).toBe(p.weapons[0]);
    }
  });

  it('性格不一样，默认挑的武器也不全一样', () => {
    expect(new Set(PERSONAS.map(favoriteWeapon)).size).toBeGreaterThanOrEqual(5);
  });
});

