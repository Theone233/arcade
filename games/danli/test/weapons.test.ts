/** 8 把武器（DESIGN.md 2.6）：攻、防、爆炸范围、角度照设计表；挖坑照包子蒸笼的比例；防御真的减伤；每把都能打、按自己的数炸 */
import { describe, expect, it } from 'vitest';
import { apply, previewShot } from '../src/core/rules.ts';
import type { State } from '../src/core/types.ts';
import { BLAST, blastDamage, isWeaponId, WEAPON_IDS, WEAPONS, weapon, type WeaponId } from '../src/core/weapons.ts';
import { flat } from './helpers.ts';

/** 设计表（DESIGN.md 2.6）：攻、防、爆炸范围、角度 */
const TABLE: Record<WeaponId, [string, number, number, 'small' | 'mid' | 'big', number, number]> = {
  steamer: ['包子蒸笼', 6, 6, 'mid', 20, 70],
  melon: ['西瓜投石器', 7, 4, 'big', 30, 60],
  paddle: ['弹弹球拍', 4, 7, 'small', 10, 60],
  carrot: ['萝卜钻', 5, 6, 'mid', 30, 75],
  rocket: ['冲天烟花筒', 9, 2, 'big', 60, 88],
  slipper: ['拖鞋弹弓', 5, 5, 'small', 0, 25],
  frisbee: ['飞盘发射器', 3, 8, 'small', 15, 75],
  milktea: ['奶茶炮', 3, 9, 'mid', 20, 70],
};

/** a 拿 wa、b 拿 wb 的平地局面 */
function duel(wa: WeaponId, wb: WeaponId, xs: [number, number] = [1000, 1400]): State {
  const s = flat(xs);
  s.chars[0]!.weapon = wa;
  s.chars[1]!.weapon = wb;
  return s;
}

/** 这把武器能直接打中对面的一发（在它的角度范围里找） */
function directHit(s: State): { angle: number; power: number } | null {
  const w = weapon(s.chars[s.actor]!.weapon);
  for (let angle = w.minAngle; angle <= w.maxAngle; angle++) for (let power = 10; power <= 100; power++) if (previewShot(s, angle, power, 1).hit === 1) return { angle, power };
  return null;
}

describe('武器表', () => {
  it('首发 8 把，攻、防、爆炸范围、角度照设计表', () => {
    expect(WEAPON_IDS).toHaveLength(8);
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      const [name, atk, def, blast, lo, hi] = TABLE[id];
      expect({ id: w.id, name: w.name, atk: w.atk, def: w.def, blast: w.blast, lo: w.minAngle, hi: w.maxAngle }).toEqual({ id, name, atk, def, blast, lo, hi });
      expect(w.radius).toBe(BLAST[blast].radius);
      expect(w.dig).toBe(BLAST[blast].dig);
      expect(w.special.name.length).toBeGreaterThan(0);
      expect(isWeaponId(id)).toBe(true);
    }
    expect(isWeaponId('sword')).toBe(false);
    // 短名：小按钮放得下（4 个字以内），是全名里的词
    for (const id of WEAPON_IDS) {
      expect(WEAPONS[id].short.length).toBeLessThanOrEqual(4);
      expect(WEAPONS[id].name.includes(WEAPONS[id].short)).toBe(true);
    }
  });

  it('挖坑半径照包子蒸笼"伤害 30、挖 26"的比例；三档从小到大', () => {
    for (const b of Object.values(BLAST)) expect(Math.abs(b.dig - (b.radius * 26) / 30)).toBeLessThanOrEqual(0.5);
    expect(BLAST.small.radius).toBeLessThan(BLAST.mid.radius);
    expect(BLAST.mid.radius).toBeLessThan(BLAST.big.radius);
  });

  it('防御真的减伤：被打的人武器防越高，挨得越少', () => {
    const shooter = weapon('steamer');
    const byDef = [...WEAPON_IDS].sort((a, b) => WEAPONS[a].def - WEAPONS[b].def);
    for (let i = 1; i < byDef.length; i++) {
      const lo = WEAPONS[byDef[i - 1]!];
      const hi = WEAPONS[byDef[i]!];
      const a = blastDamage(shooter, lo, shooter.radius, 0);
      const b = blastDamage(shooter, hi, shooter.radius, 0);
      if (hi.def > lo.def) expect(b).toBeLessThan(a);
      else expect(b).toBe(a);
    }
    // 防 9 比防 2 少挨两成多
    expect(blastDamage(shooter, weapon('milktea'), 30, 0)).toBeLessThan(blastDamage(shooter, weapon('rocket'), 30, 0) * 0.8);
  });

  it('攻越高打得越疼（同样的基础伤害下）', () => {
    const target = weapon('steamer');
    const same = (id: WeaponId) => ({ ...weapon(id), base: 36 });
    expect(blastDamage(same('rocket'), target, 30, 0)).toBeGreaterThan(blastDamage(same('steamer'), target, 30, 0));
    expect(blastDamage(same('steamer'), target, 30, 0)).toBeGreaterThan(blastDamage(same('frisbee'), target, 30, 0));
  });
});

describe('每把武器上场', () => {
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    it(`${w.name}：角度只能在 ${w.minAngle}–${w.maxAngle}°；直接打中照它的数扣血、照它的半径挖坑`, () => {
      const s = duel(id, 'milktea');
      if (w.minAngle > 0) expect(apply(s, { t: 'fire', angle: w.minAngle - 1, power: 50, facing: 1 })).toEqual({ ok: false, error: 'angle' });
      if (w.maxAngle < 90) expect(apply(s, { t: 'fire', angle: w.maxAngle + 1, power: 50, facing: 1 })).toEqual({ ok: false, error: 'angle' });
      // 拖鞋只有 0–25°：放近一点才打得着
      const hit = directHit(s) ?? directHit(duel(id, 'milktea', [1000, 1200]));
      expect(hit, '找不到能直接打中的一发').not.toBeNull();
      const st = directHit(s) ? s : duel(id, 'milktea', [1000, 1200]);
      const r = apply(st, { t: 'fire', angle: hit!.angle, power: hit!.power, facing: 1 });
      if (!r.ok) throw new Error(r.error);
      expect(r.events).toContainEqual(expect.objectContaining({ t: 'boom', r: w.dig }));
      expect(r.events).toContainEqual(expect.objectContaining({ t: 'hurt', id: 1, dmg: blastDamage(w, weapon('milktea'), w.radius, 0) }));
    });
  }

  it('爆炸范围：离爆心同样远，大范围的武器打得着、小的打不着', () => {
    const big = weapon('melon');
    const small = weapon('paddle');
    const d = small.radius + 5;
    expect(blastDamage(small, weapon('steamer'), small.radius, d)).toBe(0);
    expect(blastDamage(big, weapon('steamer'), big.radius, d)).toBeGreaterThan(0);
  });
});
