/**
 * 武器数值表（DESIGN.md 2.5、2.6）：首发 8 把，开局选定、整局不换。特技这一版不做（只写名字给界面看）。
 * 普通发射的物理人人一样，武器只改数值：攻、防、爆炸范围（伤害半径和挖坑半径）、能用的角度、基础伤害。
 * 数值是草案，改了要用模拟器跑（`npm run sim 20 weapons` 看两两对打的胜率，结果写进 README"数值"）。
 *
 * 伤害 = 基础伤害 × 攻击系数 × (1 − 对方防御减免) × 距离衰减 × 道具倍率：
 * - 攻击系数 = (70 + 5 × 攻) / 100：攻 6 是 1 倍，攻 9 是 1.15 倍，攻 3 是 0.85 倍；
 * - 防御减免 = 3 × 防 / 100：防 2 减 6%，防 6 减 18%，防 9 减 27%（防御真的减伤：挨打的人用的武器防越高，挨得越少）；
 * - 距离衰减：爆心满额，到爆炸半径边上降到一半。
 * 挖坑半径和伤害半径分开（DESIGN.md 2.3）：照包子蒸笼"伤害 30、挖 26"的比例，小 22 / 19，中 30 / 26，大 40 / 35。
 */

export type WeaponId = 'steamer' | 'melon' | 'paddle' | 'carrot' | 'rocket' | 'slipper' | 'frisbee' | 'milktea';

export type BlastSize = 'small' | 'mid' | 'big';

/** 爆炸范围三档（世界单位，角色约 44 高）：伤害半径、挖坑半径 */
export const BLAST: Readonly<Record<BlastSize, { radius: number; dig: number }>> = {
  small: { radius: 22, dig: 19 },
  mid: { radius: 30, dig: 26 },
  big: { radius: 40, dig: 35 },
};

export interface Weapon {
  id: WeaponId;
  name: string;
  /** 短名（4 个字以内，放不下全名的小按钮用） */
  short: string;
  /** 攻、防：1–10 */
  atk: number;
  def: number;
  /** 爆炸范围这一档（界面写"小、中、大"） */
  blast: BlastSize;
  /** 爆炸半径（世界单位）：伤害按它衰减 */
  radius: number;
  /** 挖坑的半径（世界单位），和伤害的半径分开调：它决定画本多快被炸穿（DESIGN.md 2.3） */
  dig: number;
  /** 基础伤害（爆心、攻击系数 1、对方不减免时）。设计表里没有这一项，是模拟器调平用的 */
  base: number;
  /** 能用的角度（相对朝向，度） */
  minAngle: number;
  maxAngle: number;
  /** 特技（这一版还不能放，只写名字给界面看） */
  special: { name: string; line: string };
}

function make(id: WeaponId, [name, short]: [string, string], atk: number, def: number, blast: BlastSize, base: number, angles: [number, number], special: [string, string]): Weapon {
  return { id, name, short, atk, def, blast, ...BLAST[blast], base, minAngle: angles[0], maxAngle: angles[1], special: { name: special[0], line: special[1] } };
}

/** 顺序就是界面上武器卡的顺序 */
export const WEAPON_IDS: readonly WeaponId[] = ['steamer', 'melon', 'paddle', 'carrot', 'rocket', 'slipper', 'frisbee', 'milktea'];

export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = {
  steamer: make('steamer', ['包子蒸笼', '蒸笼'], 6, 6, 'mid', 36, [20, 70], ['三笼齐发', '连射 3 发']),
  melon: make('melon', ['西瓜投石器', '西瓜'], 7, 4, 'big', 31, [30, 60], ['西瓜雨', '天上落 5 块瓜']),
  paddle: make('paddle', ['弹弹球拍', '球拍'], 4, 7, 'small', 39, [10, 60], ['超级弹', '落地弹三次再炸']),
  carrot: make('carrot', ['萝卜钻', '萝卜钻'], 5, 6, 'mid', 36, [30, 75], ['地道战', '钻得很深再炸']),
  rocket: make('rocket', ['冲天烟花筒', '烟花筒'], 9, 2, 'big', 36, [60, 88], ['满天星', '一片烟花落下']),
  slipper: make('slipper', ['拖鞋弹弓', '拖鞋'], 5, 5, 'small', 68, [0, 25], ['连环拖鞋', '一回合两发']),
  frisbee: make('frisbee', ['飞盘发射器', '飞盘'], 3, 8, 'small', 38, [15, 75], ['回旋飞盘', '飞出去再飞回来，路上能打中两次']),
  milktea: make('milktea', ['奶茶炮', '奶茶炮'], 3, 9, 'mid', 34, [20, 70], ['全队回血', '全队回一点血']),
};

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && Object.hasOwn(WEAPONS, v);
}

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
