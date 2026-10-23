/**
 * 道具（DESIGN.md 2.6）：都从这回合的 100 点体力里扣，和爬动共用。价钱、每颗伤害用模拟器调（`npm run sim`，结果在 README"数值"）。
 * - 常用道具（0.3.0 改成可叠加）：一回合能选多个、同一个也能选多次，只看体力；三岔、加力 50% 一回合最多 1 次（显式校验，不只靠价钱）。
 *   - 轮数 = 1 + 连发数（+1 算 1、+2 算 2），最多 MAX_VOLLEYS 轮；每轮的颗数：选了三岔是 3，没选是 1；
 *   - 每颗伤害按总轮数取 VOLLEY_PCT，三岔每颗再乘 FORK_PCT；加力加在一起乘到每一颗上；
 * - 特殊道具：纸飞机（人瞬移到落点，不能和别的道具一起用；0.3.1 起每局不限次数）、锅盖（每局 2 次，这一发不受风，能和常用道具叠，一回合 1 个）。
 * 每一颗炮弹都炸坑；一手扔不止 1 颗时，每颗的挖坑半径打一点折（DIG_PCT），伤害半径不变；倍率只乘在伤害上（万分比整数）。
 */

export type Special = 'plane' | 'lid';

/** 能叠的常用道具（计数）和特殊道具（有没有） */
export type Common = 'p1' | 'p2' | 'fork' | 'b10' | 'b20' | 'b50';

/** 这一回合的出手：每种常用道具选了几个，锅盖、纸飞机用没用 */
export interface Loadout {
  /** 连发 +1、+2 各几个 */
  p1: number;
  p2: number;
  /** 三岔（0 或 1） */
  fork: number;
  /** 加力 10%、20%、50% 各几个（50% 最多 1 个） */
  b10: number;
  b20: number;
  b50: number;
  lid: boolean;
  plane: boolean;
}

export const COMMON: readonly Common[] = ['p1', 'p2', 'fork', 'b10', 'b20', 'b50'];

export interface CommonDef {
  name: string;
  cost: number;
  /** 一回合最多几个（三岔、加力 50% 是 1；别的只受体力限制，这里写个碰不到的上限，给校验形状用） */
  max: number;
}

export const COMMONS: Readonly<Record<Common, CommonDef>> = {
  p1: { name: '连发 +1', cost: 18, max: 9 },
  p2: { name: '连发 +2', cost: 30, max: 4 },
  fork: { name: '三岔', cost: 52, max: 1 },
  b10: { name: '加力 10%', cost: 16, max: 10 },
  b20: { name: '加力 20%', cost: 30, max: 10 },
  b50: { name: '加力 50%', cost: 72, max: 1 },
};

/** 加力各加多少（百分点） */
export const BOOST_OF = { b10: 10, b20: 20, b50: 50 } as const;
/** 三岔：三颗的角度各差几度、每颗伤害乘多少（百分比） */
export const FORK_SPREAD = 6;
export const FORK_PCT = 35;
/** 一回合最多几轮：防异常的大上限（100 点体力买得到的最多是 7 轮：三个 +2） */
export const MAX_VOLLEYS = 10;
/** 每颗伤害（百分比），按总轮数取（下标是轮数，1 到 MAX_VOLLEYS）：n 轮一共约 n 的 0.1 次方倍（2 轮 108%、4 轮 116%、7 轮 121%），用模拟器定的 */
export const VOLLEY_PCT: readonly number[] = [0, 100, 54, 37, 29, 23, 20, 17, 15, 14, 13];

/**
 * 挖坑半径打几折（百分比），按这一手的总颗数取（下标是颗数，1 到 MAX_VOLLEYS × 3）：1 颗不打折，2 颗起 98%，单调不升，用模拟器定的。
 * 0.3.0 去掉击退以后，掉出画本只靠挖：一手多颗时坑缩得狠（原来 2 颗 87%、12 颗 61%）就几乎没人掉出画本了；
 * 一点不缩时多颗一手（连发 +2、+2 +2 加加力）挖得太狠、3v3 掉出画本到七成五。98% 对包子蒸笼是 26 → 25（见 README"数值"）。
 */
export const DIG_PCT: readonly number[] = [0, 100, ...Array.from({ length: MAX_VOLLEYS * 3 - 1 }, () => 98)];

/** 有次数限制的特殊道具（纸飞机 0.3.1 起不限次数，DESIGN.md 2.6） */
export type Limited = 'lid';

export const SPECIALS: Readonly<Record<Special, { name: string; cost: number; perGame: number | null }>> & { lid: { perGame: number } } = {
  /** perGame 是 null：每局不限次数（还是花 60、只能单独用） */
  plane: { name: '纸飞机', cost: 60, perGame: null },
  lid: { name: '锅盖', cost: 30, perGame: 2 },
};

export const PLAIN: Loadout = { p1: 0, p2: 0, fork: 0, b10: 0, b20: 0, b50: 0, lid: false, plane: false };

/** 轮数 */
export function volleys(l: Loadout): number {
  return 1 + l.p1 + 2 * l.p2;
}

/** 每轮几颗 */
export function shellsPer(l: Loadout): number {
  return l.fork ? 3 : 1;
}

/** 加力一共多少（百分点） */
export function boostOf(l: Loadout): number {
  return BOOST_OF.b10 * l.b10 + BOOST_OF.b20 * l.b20 + BOOST_OF.b50 * l.b50;
}

/** 用了常用道具没有（不算锅盖、纸飞机） */
export function anyCommon(l: Loadout): boolean {
  return COMMON.some((k) => l[k] > 0);
}

export function loadoutCost(l: Loadout): number {
  let n = 0;
  for (const k of COMMON) n += COMMONS[k].cost * l[k];
  return n + (l.lid ? SPECIALS.lid.cost : 0) + (l.plane ? SPECIALS.plane.cost : 0);
}

/**
 * 组合本身合不合法（不看体力和次数）：每种是 0 到上限的整数（三岔、加力 50% 一回合最多 1 个）、轮数不超过 MAX_VOLLEYS、
 * 锅盖和纸飞机是真假；纸飞机不能和别的道具一起用
 */
export function loadoutError(l: Loadout): string | null {
  if (!l || typeof l !== 'object') return 'item';
  for (const k of COMMON) {
    const v = l[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > COMMONS[k].max) return 'item';
  }
  if (typeof l.lid !== 'boolean' || typeof l.plane !== 'boolean') return 'item';
  if (volleys(l) > MAX_VOLLEYS) return 'volleys';
  if (l.plane && (anyCommon(l) || l.lid)) return 'plane_alone';
  return null;
}

/** 每颗炮弹的伤害倍率（万分比，整数）：按轮数的每颗伤害 × 三岔 × (1 + 加力)，向下取整。不用道具是 10000 */
export function shotScale(l: Loadout): number {
  // 三岔的百分比不一定除得尽：向下取整（整数，哪儿算都一样）
  return Math.floor((VOLLEY_PCT[volleys(l)]! * (100 + boostOf(l)) * (l.fork ? FORK_PCT : 100)) / 100);
}

/** 这一手的总颗数 */
export function shellCount(l: Loadout): number {
  return volleys(l) * shellsPer(l);
}

/** 这一手每颗的挖坑半径（整数，向下取整）：武器的挖坑半径按总颗数打折 */
export function digRadius(dig: number, l: Loadout): number {
  return Math.floor((dig * DIG_PCT[Math.min(shellCount(l), DIG_PCT.length - 1)]!) / 100);
}

/** 一组道具的简称（模拟器、日志用）：如 "三岔+2+50%"，没用是 "不用" */
export function loadoutName(l: Loadout): string {
  if (l.plane) return '纸飞机';
  const parts: string[] = [];
  if (l.fork) parts.push('三岔');
  for (let i = 0; i < l.p2; i++) parts.push('+2');
  for (let i = 0; i < l.p1; i++) parts.push('+1');
  for (let i = 0; i < l.b50; i++) parts.push('50%');
  for (let i = 0; i < l.b20; i++) parts.push('20%');
  for (let i = 0; i < l.b10; i++) parts.push('10%');
  const s = parts.join(' ') || '不用';
  return l.lid ? `${s} 锅盖` : s;
}

/** 按计数造一组（没写的是 0） */
export function loadout(p: Partial<Loadout>): Loadout {
  return { ...PLAIN, ...p };
}
