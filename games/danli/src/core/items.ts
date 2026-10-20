/**
 * 道具（DESIGN.md 2.6）：都从这回合的 100 点体力里扣，和爬动共用。数值是草案，用模拟器调（`npm run sim`）。
 * - 常用道具：每回合都能选、不限次数。"发射方式"三选一（连发 +1、连发 +2、三岔），"加力"三选一（10%、20%、50%），两类可以叠着用；
 * - 特殊道具：每局次数有限。纸飞机（人瞬移到落点，不能和别的道具一起用）、锅盖（这一发不受风，可以和常用道具叠着用）。
 * 每一颗炮弹都照常炸坑，坑的大小不打折；倍率只乘在伤害上。
 * 0.1.0 平衡调整（DESIGN.md 2.6）：连发每发 70% → 60%、55% → 45%，加力 50% 的体力 50 → 60。
 */

export type ShotMode = 'single' | 'double' | 'triple' | 'fork';
export type Boost = 0 | 10 | 20 | 50;
export type Special = 'plane' | 'lid';

export interface ModeDef {
  name: string;
  /** 扔几颗 */
  count: number;
  /** 每颗的伤害（百分比） */
  pct: number;
  cost: number;
}

export const MODES: Readonly<Record<ShotMode, ModeDef>> = {
  single: { name: '普通', count: 1, pct: 100, cost: 0 },
  double: { name: '连发 +1', count: 2, pct: 60, cost: 35 },
  triple: { name: '连发 +2', count: 3, pct: 45, cost: 55 },
  fork: { name: '三岔', count: 3, pct: 50, cost: 40 },
};

/** 三岔：三颗的角度各差几度 */
export const FORK_SPREAD = 6;

export const BOOST_COST: Readonly<Record<Boost, number>> = { 0: 0, 10: 8, 20: 18, 50: 60 };

export const SPECIALS: Readonly<Record<Special, { name: string; cost: number; perGame: number }>> = {
  plane: { name: '纸飞机', cost: 60, perGame: 2 },
  lid: { name: '锅盖', cost: 30, perGame: 2 },
};

/** 这一回合的出手：发射方式、加力、锅盖、纸飞机 */
export interface Loadout {
  mode: ShotMode;
  boost: Boost;
  lid: boolean;
  plane: boolean;
}

export const PLAIN: Loadout = { mode: 'single', boost: 0, lid: false, plane: false };

export function loadoutCost(l: Loadout): number {
  return MODES[l.mode].cost + BOOST_COST[l.boost] + (l.lid ? SPECIALS.lid.cost : 0) + (l.plane ? SPECIALS.plane.cost : 0);
}

/** 组合本身合不合法（不看体力和次数）：纸飞机不能和别的道具一起用 */
export function loadoutError(l: Loadout): string | null {
  if (typeof l.mode !== 'string' || !Object.hasOwn(MODES, l.mode)) return 'item';
  if (typeof l.boost !== 'number' || !Object.hasOwn(BOOST_COST, l.boost)) return 'item';
  if (typeof l.lid !== 'boolean' || typeof l.plane !== 'boolean') return 'item';
  if (l.plane && (l.mode !== 'single' || l.boost !== 0 || l.lid)) return 'plane_alone';
  return null;
}

/** 每颗炮弹的伤害倍率（万分比，整数）：发射方式 × 加力。普通、不加力是 10000 */
export function shotScale(l: Loadout): number {
  return MODES[l.mode].pct * (100 + l.boost);
}
