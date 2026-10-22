/**
 * 好友房的"一回合 = 一条消息"（DESIGN.md 5.6）：一回合的操作记成一条 Rec（爬动序列、角度、力度、朝向、道具，或者弃权），
 * 加上这一手打完以后下一回合的风。房间和页面都用这里把 Rec 换成规则核心的一串操作，同一个起点、同一串 Rec 一定得到同一个局面。
 * 页面拿不到种子：开局的出生点、先手的队、第一回合的风由房间下发，之后每回合的风跟着 Rec 走（startOf、stepRec）。
 * 纯函数，不碰 DOM、网络、存储。
 */
import type { Entropy } from 'arcade-kit/rng';
import { COMMON, type Loadout } from '../core/items.ts';
import { buildTerrain, MAPS } from '../core/maps.ts';
import { apply, startFrom } from '../core/rules.ts';
import type { Action, Dir, Ev, Setup, State, Team } from '../core/types.ts';

/**
 * 一回合（公开，进房间的视图）：m 爬动（L 往左一步、R 往右一步），a 角度、p 力度、f 朝向；
 * 道具是每种几个（p1、p2 连发 +1、+2，fork 三岔，b10、b20、b50 加力），0 个不写；lid、plane 用了才写；pass 是弃权；w 是下一回合的风
 */
export interface Rec {
  m?: string;
  a?: number;
  p?: number;
  f?: Dir;
  p1?: number;
  p2?: number;
  fork?: number;
  b10?: number;
  b20?: number;
  b50?: number;
  lid?: true;
  plane?: true;
  pass?: true;
  w: number;
}

/** 一回合最多爬几步：体力 100、平地一步 2 */
export const MAX_MOVES = 50;

/** 开局的公开信息（房间下发，页面按它重放） */
export interface Opening {
  setup: Setup;
  xs: readonly number[];
  first: Team;
  wind: number;
}

/** 页面没有种子：开局和风都由房间给，规则核心里用到种子的地方（风、电脑的误差）页面都不算，填一把全零的 */
export const NO_KEY: Entropy = [0, 0, 0, 0, 0, 0, 0, 0];

/** 按房间下发的开局重建第一回合的局面 */
export function startOf(o: Opening, key: Entropy = NO_KEY): State {
  return startFrom(key, o.setup, buildTerrain(MAPS[o.setup.map]), o.xs, o.first, o.wind);
}

/** 一条 Rec 换成规则核心的一串操作 */
export function recActions(r: Omit<Rec, 'w'>): Action[] {
  if (r.pass) return [{ t: 'pass' }];
  const out: Action[] = [];
  for (const ch of r.m ?? '') out.push({ t: 'move', dir: ch === 'L' ? -1 : 1 });
  const fire: Action = { t: 'fire', angle: r.a ?? 45, power: r.p ?? 50, facing: r.f ?? 1, lid: r.lid === true, plane: r.plane === true };
  for (const k of COMMON) fire[k] = r[k] ?? 0;
  out.push(fire);
  return out;
}

/** 一串操作（电脑的计划、页面上的出手）记成 Rec 的样子（不带风）：默认值不写，Rec 越短快照越小 */
export function toRec(moves: readonly Dir[], fire: { angle: number; power: number; facing: Dir } & Partial<Loadout>): Omit<Rec, 'w'> {
  const r: Omit<Rec, 'w'> = { a: fire.angle, p: fire.power, f: fire.facing };
  if (moves.length) r.m = moves.map((d) => (d < 0 ? 'L' : 'R')).join('');
  for (const k of COMMON) if (fire[k]) r[k] = fire[k];
  if (fire.lid) r.lid = true;
  if (fire.plane) r.plane = true;
  return r;
}

/**
 * 做一回合：按顺序做完 Rec 里的操作，有一步不合法就回它的错误码（规则核心的固定短码），局面不变。
 * 回合必须走完（以发射或弃权收尾、换到下一个人或者打完）。wind 给了就把下一回合的风换成它（页面重放用；房间用种子自己算）。
 */
export function stepRec(s: State, r: Omit<Rec, 'w'>, wind?: number): { state: State; events: Ev[] } | { error: string } {
  const acts = recActions(r);
  const events: Ev[] = [];
  let cur = s;
  for (const a of acts) {
    const out = apply(cur, a);
    if (!out.ok) return { error: out.error };
    cur = out.state;
    events.push(...out.events);
  }
  if (wind !== undefined && cur.phase === 'play' && cur.wind !== wind) cur = { ...cur, wind };
  return { state: cur, events };
}
