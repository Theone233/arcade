/** 测试用的局面：平地、两个角色，位置随便摆 */
import { newGame } from '../src/core/rules.ts';
import { emptyTerrain, fillPolygon, MAT, type Terrain } from '../src/core/terrain.ts';
import type { Setup, State } from '../src/core/types.ts';

export const KEY = [1, 2, 3, 4, 5, 6, 7, 8];

export const SETUP: Setup = {
  map: 'kitchen',
  players: [
    { name: '我', team: 0, look: 'shiba', weapon: 'steamer', ai: false },
    { name: '橘子', team: 1, look: 'cat', weapon: 'steamer', ai: true },
  ],
};

/** 一块从 x0 到 x1、地面在 top、底在 bottom 的长方形地 */
export function slab(x0: number, x1: number, top: number, bottom: number, t: Terrain = emptyTerrain(3000, 780)): Terrain {
  fillPolygon(t, [[x0, top], [x1, top], [x1, bottom], [x0, bottom]], MAT.dough);
  return t;
}

/** 平地局面：地面 y=500（脚底站在 500），actor 是 0 号，风 0 */
export function flat(xs: [number, number], opts: Partial<Pick<State, 'wind' | 'actor' | 'turn'>> & { terrain?: Terrain } = {}): State {
  const s = newGame(KEY, SETUP);
  s.terrain = opts.terrain ?? slab(0, 3000, 500, 700);
  s.chars[0]!.x = xs[0];
  s.chars[1]!.x = xs[1];
  for (const c of s.chars) {
    c.y = 500;
    c.facing = c.x < 1500 ? 1 : -1;
  }
  s.actor = opts.actor ?? 0;
  s.wind = opts.wind ?? 0;
  s.turn = opts.turn ?? 1;
  return s;
}
