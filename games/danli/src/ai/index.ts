/**
 * 电脑（DESIGN.md 第 5 节）：只读公开状态，用同一个物理引擎在心里试"角度 × 力度"，挑最好的一发；会爬到更好的位置；会用道具。
 * 一档（三档、性格 M2 再做）：
 * 1. 锅盖：风大（3 级以上）、还有次数，就先留出锅盖的 30 点，按"不受风"去瞄；
 * 2. 候选站位：原地，和往左、往右各爬 8、16 步（爬的体力要给锅盖留够）；
 * 3. 每个站位朝对手那边，角度每 5°、力度每 4 点试一遍（只模拟炮弹，不改地形），按落点粗算得分；最好的几发细调（角度 ±2°、力度 ±2）；
 * 4. 最好的几发，每一发把剩下的体力能买的"发射方式 × 加力"组合都在副本上真打一遍（规则核心的 apply，连发、三岔、坑、掉落都是真的），
 *    挑总分最高的：打掉对方的血、把对方炸出画本加很多分，伤到自己和队友扣分，赢下这局加很多分，省下来的体力不值钱（回合末就清零）。
 *    所以离得远时爬得少、体力留给加力和连发；对手站得近、挤在一起时三岔的分自然高；
 * 5. 纸飞机：脚下太薄、能踩的地不到 2 个身位、旁边就是洞，或者被困在坑里爬不出去时：这回合打不出像样的伤害就一定飞，打得出也有 35% 的机会先飞走；
 *    挑一个地厚、离对手不远不近的落点；
 * 6. 出手带一点误差（角度 ±2°、力度 ±3），误差来自 'ai' 随机流（序号是回合数），所以同一个状态出手一定一样。
 * ban 给模拟器用：禁掉某些道具，比较用和不用的胜率。
 */
import { stream, type RandomStream } from 'arcade-kit/rng';
import { idiv, isqrt } from '../core/fixed.ts';
import { BOOST_COST, MODES, PLAIN, SPECIALS, type Boost, type Loadout, type ShotMode } from '../core/items.ts';
import { BODY_CY, BODY_R } from '../core/physics.ts';
import { apply, groundDepth, mapOf, planeLanding, previewShot, STEP, stepTarget } from '../core/rules.ts';
import { solidAt } from '../core/terrain.ts';
import type { Action, Dir, State } from '../core/types.ts';
import { blastDamage, weapon } from '../core/weapons.ts';

export interface Plan {
  moves: Dir[];
  angle: number;
  power: number;
  facing: Dir;
  loadout: Loadout;
}

/** 可以禁掉的道具（模拟器比较用和不用） */
export type ItemKey = 'double' | 'triple' | 'fork' | 'boost' | 'lid' | 'plane';
export interface PlanOpts {
  ban?: ReadonlySet<ItemKey>;
}

interface Spot {
  state: State;
  moves: Dir[];
}

interface Cand {
  spot: Spot;
  angle: number;
  power: number;
  facing: Dir;
  score: number;
}

const WALKS = [8, 16];
const ANGLE_STEP = 5;
const POWER_STEP = 4;
const KEEP = 5;
/** 伤到自己人比打到对方多扣一半 */
const OWN_K = 1.5;
/** 风多大用锅盖 */
const LID_WIND = 3;
/** 这回合打不出这么多分，危险时一定用纸飞机飞走 */
const GOOD_SHOT = 25;
/** 打得出伤害，但站的地方危险时，也有这么大的机会（百分比）先飞走（0.1.0 平衡调整） */
const PLANE_CHANCE = 35;
/** 能踩的地少于这么宽（2 个身位）算危险 */
const FOOTING = 4 * BODY_R;

/** 往两边爬，记下几处站位；爬完要留够 keep 点体力 */
function spots(s: State, keep: number): Spot[] {
  const out: Spot[] = [{ state: s, moves: [] }];
  for (const dir of [-1, 1] as const) {
    let cur = s;
    const moves: Dir[] = [];
    for (const n of WALKS) {
      while (moves.length < n) {
        const r = apply(cur, { t: 'move', dir });
        if (!r.ok || r.state.stamina < keep) break;
        cur = r.state;
        moves.push(dir);
      }
      if (moves.length < n) break;
      out.push({ state: cur, moves: moves.slice() });
    }
  }
  return out;
}

/** 粗算：只看落点，按伤害公式估一下，没打到人就看离最近的对手多远 */
function quick(s: State, angle: number, power: number, facing: Dir, lid: boolean): number {
  const shot = previewShot(s, angle, power, facing, false, lid);
  if (!shot.end) return -10_000;
  const me = s.chars[s.actor]!;
  const sw = weapon(me.weapon);
  let score = 0;
  let near = Infinity;
  for (const c of s.chars) {
    if (c.out) continue;
    const dx = c.x - shot.end.x;
    const dy = c.y - BODY_CY - shot.end.y;
    const d = isqrt(dx * dx + dy * dy);
    const dd = shot.hit === c.id ? 0 : Math.max(0, d - BODY_R);
    const dmg = blastDamage(sw, weapon(c.weapon), sw.radius, dd);
    if (c.team === me.team) score -= OWN_K * dmg;
    else {
      score += dmg;
      if (d < near) near = d;
    }
  }
  return score - idiv(near, 8);
}

/** 准算：在副本上真打一遍（带道具） */
function exact(s: State, angle: number, power: number, facing: Dir, l: Loadout): number {
  const r = apply(s, { t: 'fire', angle, power, facing, ...l });
  if (!r.ok) return -10_000;
  const me = s.chars[s.actor]!;
  let score = 0;
  let near = Infinity;
  const ends = r.events.flatMap((e) => (e.t === 'shot' ? e.flights.flatMap((f) => (f.end ? [f.end] : [])) : []));
  for (const c of s.chars) {
    if (c.out) continue;
    const after = r.state.chars[c.id]!;
    const lost = c.hp - after.hp + (after.out ? 120 : 0);
    if (c.team === me.team) score -= OWN_K * lost + (after.out ? 200 : 0);
    else {
      score += lost;
      // 炸薄了对方脚下也算一点分（下一发更容易把他轰出画本）
      if (!after.out) score += (groundDepth(s.terrain, c.x, c.y) - groundDepth(r.state.terrain, after.x, after.y)) / 6;
      for (const e of ends) near = Math.min(near, isqrt((c.x - e.x) * (c.x - e.x) + (c.y - e.y) * (c.y - e.y)));
    }
  }
  if (r.state.phase === 'over' && r.state.winner === me.team) score += 1000;
  return score - (near === Infinity ? 1000 : idiv(near, 8));
}

function facings(s: State): Dir[] {
  const me = s.chars[s.actor]!;
  const out = new Set<Dir>();
  for (const c of s.chars) if (!c.out && c.team !== me.team) out.add(c.x < me.x ? -1 : 1);
  return out.size ? [...out] : [me.facing];
}

/** 剩下 left 点体力能买的组合（发射方式 × 加力），已经带上锅盖 */
function combos(left: number, lid: boolean, ban: ReadonlySet<ItemKey>): Loadout[] {
  const out: Loadout[] = [];
  for (const mode of Object.keys(MODES) as ShotMode[]) {
    if (mode !== 'single' && ban.has(mode)) continue;
    for (const boost of [0, 10, 20, 50] as Boost[]) {
      if (boost && ban.has('boost')) continue;
      if (MODES[mode].cost + BOOST_COST[boost] <= left) out.push({ mode, boost, lid, plane: false });
    }
  }
  return out;
}

/** 站在这里危险吗：脚下太薄、能踩的地不到 2 个身位，或者旁边一步之内就是通到底的洞 */
function inDanger(s: State): boolean {
  const me = s.chars[s.actor]!;
  const t = s.terrain;
  if (groundDepth(t, me.x, me.y) < 28) return true;
  const m = mapOf(s);
  // 往两边能走多宽（不看体力，只看爬不爬得过去）
  let width = 0;
  for (const dir of [-1, 1] as const) {
    let c = { x: me.x, y: me.y };
    for (let k = 0; k < FOOTING / STEP; k++) {
      const to = stepTarget(t, m.width, c, dir);
      if ('error' in to) break;
      c = { x: c.x + dir * STEP, y: to.y };
      width += STEP;
    }
  }
  if (width < FOOTING) return true;
  for (const dx of [-20, 20]) {
    const x = me.x + dx;
    let y = me.y - 12;
    while (y < m.height && !solidAt(t, x, y)) y++;
    if (y >= m.height) return true;
  }
  return false;
}

/** 被困住：两边都爬不出几步（只有原地这一个站位） */
function trapped(list: Spot[]): boolean {
  return list.length === 1;
}

/** 纸飞机挑落点：地厚（不容易被轰下去）、离最近的对手 300–700 */
function planPlane(s: State): Plan | null {
  const me = s.chars[s.actor]!;
  const w = weapon(me.weapon);
  let best: { angle: number; power: number; facing: Dir; score: number } | null = null;
  for (const facing of [-1, 1] as const) {
    for (let angle = w.minAngle; angle <= w.maxAngle; angle += ANGLE_STEP) {
      for (let power = 16; power <= 80; power += POWER_STEP) {
        const to = planeLanding(s, angle, power, facing);
        if (!to) continue;
        const depth = groundDepth(s.terrain, to.x, to.y);
        if (depth < 50) continue;
        let near = Infinity;
        for (const c of s.chars) if (!c.out && c.team !== me.team) near = Math.min(near, Math.abs(c.x - to.x));
        const far = near < 300 ? 300 - near : near > 700 ? near - 700 : 0;
        const score = Math.min(depth, 100) * 2 - far / 5;
        if (!best || score > best.score) best = { angle, power, facing, score };
      }
    }
  }
  return best ? { moves: [], angle: best.angle, power: best.power, facing: best.facing, loadout: { ...PLAIN, plane: true } } : null;
}

export function plan(s: State, opts: PlanOpts = {}): Plan {
  const ban = opts.ban ?? new Set<ItemKey>();
  const me = s.chars[s.actor]!;
  const w = weapon(me.weapon);
  const lid = !ban.has('lid') && me.special.lid > 0 && Math.abs(s.wind) >= LID_WIND && s.stamina >= SPECIALS.lid.cost;
  const keep = lid ? SPECIALS.lid.cost : 0;
  const where = spots(s, keep);
  const all: Cand[] = [];
  for (const spot of where) {
    const st = spot.state;
    for (const facing of facings(st)) {
      for (let angle = w.minAngle; angle <= w.maxAngle; angle += ANGLE_STEP) {
        for (let power = 20; power <= 100; power += POWER_STEP) {
          all.push({ spot, angle, power, facing, score: quick(st, angle, power, facing, lid) - spot.moves.length * 0.2 });
        }
      }
    }
  }
  all.sort((a, b) => b.score - a.score);
  const fine: Cand[] = [];
  for (const c of all.slice(0, KEEP)) {
    for (let da = -2; da <= 2; da++) {
      for (let dp = -2; dp <= 2; dp++) {
        const angle = c.angle + da;
        const power = c.power + dp;
        if (angle < w.minAngle || angle > w.maxAngle || power < 1 || power > 100) continue;
        fine.push({ ...c, angle, power, score: quick(c.spot.state, angle, power, c.facing, lid) - c.spot.moves.length * 0.2 });
      }
    }
  }
  fine.sort((a, b) => b.score - a.score);
  // 最好的几发，每一发配上剩下体力能买的道具组合真打一遍
  let best: (Cand & { loadout: Loadout }) | null = null;
  for (const c of [...fine.slice(0, KEEP), ...all.slice(0, 3)]) {
    const left = c.spot.state.stamina - keep;
    for (const l of combos(left, lid, ban)) {
      // 省下的体力不值钱，只用很小的分数让同分时少花
      const score = exact(c.spot.state, c.angle, c.power, c.facing, l) - c.spot.moves.length * 0.2 - (MODES[l.mode].cost + BOOST_COST[l.boost]) * 0.001;
      if (!best || score > best.score) best = { ...c, score, loadout: l };
    }
  }
  const pick = best ?? { spot: { state: s, moves: [] as Dir[] }, angle: 45, power: 60, facing: me.facing, score: 0, loadout: PLAIN };
  // 纸飞机：危险或被困时，打不出像样的一发就飞去安全的地方；打得出也有 PLANE_CHANCE 的机会先飞走（这回合就不开炮了）
  const rng = stream(s.key, 'ai', s.turn);
  const roll = rng.below(100);
  if (!ban.has('plane') && me.special.plane > 0 && s.stamina >= SPECIALS.plane.cost && (inDanger(s) || trapped(where)) && (pick.score < GOOD_SHOT || roll < PLANE_CHANCE)) {
    const p = planPlane(s);
    if (p) return withError(s, p, rng);
  }
  return withError(s, { moves: pick.spot.moves, angle: pick.angle, power: pick.power, facing: pick.facing, loadout: pick.loadout }, rng);
}

/** 出手的误差：角度 ±2°、力度 ±3（'ai' 随机流，序号是回合数；和纸飞机的那一下共用一条流） */
function withError(s: State, p: Plan, err: RandomStream): Plan {
  const w = weapon(s.chars[s.actor]!.weapon);
  const angle = Math.min(w.maxAngle, Math.max(w.minAngle, p.angle + err.below(5) - 2));
  const power = Math.min(100, Math.max(1, p.power + err.below(7) - 3));
  return { ...p, angle, power };
}

/** 把计划拆成一串操作（爬、发射） */
export function planActions(p: Plan): Action[] {
  return [...p.moves.map((dir): Action => ({ t: 'move', dir })), { t: 'fire', angle: p.angle, power: p.power, facing: p.facing, ...p.loadout }];
}
