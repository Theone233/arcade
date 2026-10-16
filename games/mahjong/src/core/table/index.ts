/**
 * 牌桌上各玩法共用的小件（DESIGN.md 3.3）：副露、牌墙的头尾、轮转、声明的裁决。
 * 只管通用的事，不认识番、筹码、换三张；状态都是可以直接存进 JSON 的普通对象。
 */
import type { Tile } from '../tiles/index.ts';

/** 杠的三种：直杠（别人打出第四张）、补杠（碰了再加一张）、暗杠（手里四张） */
export type KanType = 'direct' | 'added' | 'concealed';

/** 副露：吃（只在有的玩法里开）、碰、杠。from 是牌从哪个座位来的（暗杠是 null） */
export interface Meld {
  kind: 'chi' | 'pon' | 'kan';
  tiles: Tile[];
  from: number | null;
  /** 只有杠有 */
  kan?: KanType;
}

/** 弃牌河里的一张：taken 是被人碰、杠、胡拿走了（画面上画淡） */
export interface RiverTile {
  tile: Tile;
  taken?: boolean;
}

/** 牌墙：一个数组 + 头尾指针。正常摸牌从头摸，杠后补牌从尾摸（日麻另切王牌区，由玩法自己做） */
export interface Wall {
  tiles: Tile[];
  head: number;
  /** 尾上下一张补牌的位置（含） */
  tail: number;
}

export const newWall = (tiles: Tile[], dealt: number): Wall => ({ tiles, head: dealt, tail: tiles.length - 1 });
export const wallLeft = (w: Wall): number => w.tail - w.head + 1;

export function drawHead(w: Wall): Tile | null {
  if (wallLeft(w) <= 0) return null;
  return w.tiles[w.head++]!;
}

export function drawTail(w: Wall): Tile | null {
  if (wallLeft(w) <= 0) return null;
  return w.tiles[w.tail--]!;
}

/** 从 seat 往下数，第一个 ok 的座位（不含 seat 自己）；都不 ok 返回 null */
export function nextSeat(seat: number, n: number, ok: (s: number) => boolean): number | null {
  for (let i = 1; i < n; i++) {
    const s = (seat + i) % n;
    if (ok(s)) return s;
  }
  return null;
}

/** 从 from 往下数到 to 隔几家（下家 1、对家 2、上家 3） */
export const distance = (from: number, to: number, n: number): number => (to - from + n) % n;

/** 别人打出（或补杠）一张以后，一个座位能做的声明 */
export type ClaimKind = 'ron' | 'kan' | 'pon' | 'chi';
export type Answer = ClaimKind | 'pass';

/**
 * 声明的裁决：胡 > 杠 / 碰 > 吃。multiRon 为 true 时所有要胡的都胡（川麻的一炮多响），
 * 否则只取离打牌的人最近的那一家（日麻的头跳）。没人要返回 null（轮到下一家）。
 */
export function resolveClaims(
  answers: readonly (Answer | null)[],
  from: number,
  multiRon: boolean,
): { ron: number[] } | { seat: number; kind: Exclude<ClaimKind, 'ron'> } | null {
  const n = answers.length;
  const order = Array.from({ length: n - 1 }, (_, i) => (from + 1 + i) % n);
  const ron = order.filter((s) => answers[s] === 'ron');
  if (ron.length) return { ron: multiRon ? ron : ron.slice(0, 1) };
  for (const kind of ['kan', 'pon', 'chi'] as const) {
    const s = order.find((x) => answers[x] === kind);
    if (s !== undefined) return { seat: s, kind };
  }
  return null;
}
