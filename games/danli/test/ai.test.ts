import { describe, expect, it } from 'vitest';
import { plan, planActions } from '../src/ai/index.ts';
import { apply, MAX_HP, newGame } from '../src/core/rules.ts';
import type { State } from '../src/core/types.ts';
import { weapon } from '../src/core/weapons.ts';
import { flat, KEY, SETUP, slab } from './helpers.ts';

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
    expect(p.loadout.mode !== 'single' || p.loadout.boost > 0).toBe(true);
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
    const p = plan(flat([800, 1500], { wind: 5 }), { ban: new Set(['lid', 'double', 'triple', 'fork', 'boost', 'plane']) });
    expect(p.loadout).toEqual({ mode: 'single', boost: 0, lid: false, plane: false });
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
});
