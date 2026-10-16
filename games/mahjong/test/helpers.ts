/** 测试用的小工具：牌的简写（'123m456p11s' → 计数或实物牌）、固定种子的随机数 */
import { stream } from 'arcade-kit/rng';
import { KINDS, tileOf, type Tile } from '../src/core/tiles/index.ts';

const BASE: Record<string, number> = { m: 0, p: 9, s: 18, z: 27 };

/** '123m45p' → 牌种列表 */
export function kinds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.match(/\d+[mpsz]/g) ?? []) {
    const base = BASE[part.at(-1)!]!;
    for (const d of part.slice(0, -1)) out.push(base + Number(d) - 1);
  }
  return out;
}

export function counts(s: string): number[] {
  const c = new Array<number>(KINDS).fill(0);
  for (const k of kinds(s)) c[k]!++;
  return c;
}

/** '123m' → 实物牌（同种牌依次用第 0、1、2、3 张） */
export function tiles(s: string): Tile[] {
  const used = new Map<number, number>();
  return kinds(s).map((k) => {
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return tileOf(k, n);
  });
}

export const KEY = [1, 2, 3, 4, 5, 6, 7, 8];
export const rng = (purpose: string, i = 0) => stream(KEY, purpose, i);
