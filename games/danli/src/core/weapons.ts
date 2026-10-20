/**
 * 武器数值表（DESIGN.md 2.5、2.6）。结构按首发 8 把留好；M1 表里只有包子蒸笼，特技 M2 再做。
 * 数值是草案，改了要用模拟器跑（AGENTS.md 第 4 节"改数值的，用模拟器跑机器人验证"）。
 *
 * 伤害 = 基础伤害 × 攻击系数 × (1 − 对方防御减免) × 距离衰减：
 * - 攻击系数 = (70 + 5 × 攻) / 100：攻 6 是 1 倍；
 * - 防御减免 = 3 × 防 / 100：防 6 减 18%；
 * - 距离衰减：爆心满额，到爆炸半径边上降到一半。
 */

export type WeaponId = 'steamer' | 'melon' | 'paddle' | 'carrot' | 'rocket' | 'slipper' | 'frisbee' | 'milktea';

/** 爆炸范围三档（世界单位，角色约 44 高） */
export const BLAST = { small: 22, mid: 30, big: 40 } as const;

export interface Weapon {
  id: WeaponId;
  name: string;
  /** 攻、防：1–10 */
  atk: number;
  def: number;
  /** 爆炸半径（世界单位）：伤害按它衰减 */
  radius: number;
  /** 挖坑的半径（世界单位），和伤害的半径分开调：它决定画本多快被炸穿（DESIGN.md 2.3），用模拟器调 */
  dig: number;
  /** 基础伤害（爆心、攻击系数 1、对方不减免时） */
  base: number;
  /** 能用的角度（相对朝向，度） */
  minAngle: number;
  maxAngle: number;
  /** 特技（M2 才能放，先只写名字给界面看） */
  special: { name: string; line: string };
}

export const WEAPONS: Readonly<Partial<Record<WeaponId, Weapon>>> = {
  steamer: {
    id: 'steamer',
    name: '包子蒸笼',
    atk: 6,
    def: 6,
    radius: BLAST.mid,
    dig: 26,
    base: 36,
    minAngle: 20,
    maxAngle: 70,
    special: { name: '三笼齐发', line: '连射 3 发' },
  },
};

export function weapon(id: WeaponId): Weapon {
  const w = WEAPONS[id];
  if (!w) throw new Error(`没有这把武器：${id}`);
  return w;
}

/** 爆心距离 dd（已减去身体半径）时打到对方的伤害；超出半径是 0。scale 是道具带来的倍率（万分比，见 items.ts 的 shotScale）。整数运算 */
export function blastDamage(shooter: Weapon, target: Weapon, radius: number, dd: number, scale = 10_000): number {
  if (dd > radius) return 0;
  const num = shooter.base * (70 + 5 * shooter.atk) * (100 - 3 * target.def) * (2 * radius - dd) * scale;
  return Math.floor(num / (2 * radius * 10_000 * 10_000));
}
