/**
 * 牌的表示（DESIGN.md 3.1），所有玩法共用。
 *
 * - 牌种 Kind：0–8 万、9–17 筒、18–26 条、27–33 字牌（东南西北白发中）、34–41 花牌。手牌拆解只看前 34 种。
 * - 一张实物牌 Tile = 牌种 × 4 + 第几张（0–3）。赤宝牌不放在牌上，由玩法的牌集声明"哪几张是红的"，所以同一套编码日麻、川麻都能用。
 * 万、筒、条的中文名和画法在界面层，这里只有编号。
 */
import { shuffle, type RandomStream } from 'arcade-kit/rng';

export type Kind = number;
export type Tile = number;

/** 数牌的门：万、筒、条（字牌、花牌不算门） */
export type Suit = 0 | 1 | 2;
export const SUITS: readonly Suit[] = [0, 1, 2];

/** 拆解用的计数数组长度：数牌 27 + 字牌 7 */
export const KINDS = 34;
export const HONOR0 = 27;
export const FLOWER0 = 34;

export const kindOf = (t: Tile): Kind => t >> 2;
export const tileOf = (k: Kind, copy: number): Tile => k * 4 + copy;

/** 数牌的门；字牌、花牌返回 -1 */
export const suitOf = (k: Kind): Suit | -1 => (k < HONOR0 ? ((k / 9) | 0) as Suit : -1);
/** 数牌的点数 1–9；字牌、花牌返回 0 */
export const rankOf = (k: Kind): number => (k < HONOR0 ? (k % 9) + 1 : 0);
export const kindAt = (suit: Suit, rank: number): Kind => suit * 9 + rank - 1;
/** 一门的九种牌（缺门、清一色这类按门算的用） */
export const suitKinds = (suit: Suit): Kind[] => Array.from({ length: 9 }, (_, r) => suit * 9 + r);

/**
 * 牌集：玩法声明用哪些牌。
 * suits 用哪几门数牌；honors 有没有字牌；flowers 有没有花牌；red 是赤宝牌的实物牌编号（日麻 5m、5p、5s 的第 0 张）
 */
export interface TileSet {
  suits: readonly Suit[];
  honors: boolean;
  flowers: boolean;
  red: readonly Tile[];
}

/** 这套牌的全部实物牌（按编号排好，洗牌前） */
export function allTiles(set: TileSet): Tile[] {
  const out: Tile[] = [];
  for (const s of set.suits) for (let r = 1; r <= 9; r++) for (let c = 0; c < 4; c++) out.push(tileOf(kindAt(s, r), c));
  if (set.honors) for (let k = HONOR0; k < FLOWER0; k++) for (let c = 0; c < 4; c++) out.push(tileOf(k, c));
  if (set.flowers) for (let k = FLOWER0; k < FLOWER0 + 8; k++) out.push(tileOf(k, 0));
  return out;
}

/** 洗好的牌墙：rng 由玩法按"用途 + 第几局"分流后给进来 */
export function buildWall(set: TileSet, rng: RandomStream): Tile[] {
  return shuffle(allTiles(set), rng);
}

/** 手牌排序：按牌种，同种按第几张 */
export const byTile = (a: Tile, b: Tile): number => a - b;

/** 实物牌数组 → 计数（长 34，花牌不计） */
export function countsOf(tiles: readonly Tile[]): number[] {
  const c = new Array<number>(KINDS).fill(0);
  for (const t of tiles) {
    const k = kindOf(t);
    if (k < KINDS) c[k]!++;
  }
  return c;
}
