/**
 * 电脑的"联机档"（DESIGN.md 5.6）：好友房里电脑在服务器上想，每一步（想 + 结算这一发）的 CPU 在开发机上 p99 不超过 3 ms，
 * 所以比单机档（index.ts 的 plan，一手要试两千多发、几十毫秒）试得少得多：
 * 1. 不爬（爬一步要在副本上走一遍规则；试过"原地打不中就爬 10 步再瞄"，胜率没变、CPU 多三成）：站在原地打；站的地方危险时照样用纸飞机，落点只试 8 组；
 * 2. 瞄准：离得最近的 2 个对手（第一个已经打得中就不瞄第二个），每人 4 个角度（武器能用的范围里均匀取），每个角度二分力度 5 次，让落点对着他（只模拟炮弹，不改地形），
 *    按落点粗算得分（和单机档同一套：打对手加分，伤到自己、队友扣分）；
 * 3. 道具不枚举：按这一发打不打得中、对手挤不挤在一起，从几组叠法里挑第一个买得起的（打得中：+2 加 50%、50% 加 20%……；
 *    挤在一起：三岔加 +1 加 +2、三岔加 +2……；风大先留锅盖），挑了连发、三岔的在副本上真打一遍（规则核心的 apply）核对一次，
 *    比不用道具还差（比如会伤到自己）就退回不用道具；
 * 4. 出手误差和单机档一样（角度 ±2°、力度 ±3，'ai' 随机流，序号是回合数），同一个状态出手一定一样。
 * 联机档比单机档弱多少见 README"数值"（npm run sim 100 online）。
 */
import { stream } from 'arcade-kit/rng';
import { idiv, isqrt } from '../core/fixed.ts';
import { loadout, loadoutCost, PLAIN, SPECIALS, volleys, type Loadout } from '../core/items.ts';
import { BODY_CY, BODY_R } from '../core/physics.ts';
import { groundDepth, planeLanding, previewShot } from '../core/rules.ts';
import type { Char, Dir, State } from '../core/types.ts';
import { blastDamage, weapon } from '../core/weapons.ts';
import { exact, inDanger, LID_WIND, MATE_K, SELF_K, withError, type Plan } from './index.ts';

/** 瞄几个对手、每人几个角度、每个角度二分几次 */
const TARGETS = 2;
const ANGLES = 4;
const HALVES = 5;
/** 粗算打中多少分算"打得中"（值得上连发、加力） */
const HIT = 12;
/** 落点附近多少以内有两个对手算挤在一起（上三岔） */
const CROWD = 70;
/** 危险时打不出这么多分就飞走；打得出也有这么大的机会先飞走（和单机档一样） */
const GOOD_SHOT = 25;
const PLANE_CHANCE = 35;

interface Cand {
  angle: number;
  power: number;
  facing: Dir;
  score: number;
  /** 落点（飞出画本是 null） */
  end: { x: number; y: number } | null;
}

/** 按落点粗算（和单机档的 quick 一样的分，只是炮弹已经算好了） */
function scoreAt(s: State, me: Char, end: { x: number; y: number } | null, hit: number | null): number {
  if (!end) return -10_000;
  const sw = weapon(me.weapon);
  let score = 0;
  let near = Infinity;
  for (const c of s.chars) {
    if (c.out) continue;
    const dx = c.x - end.x;
    const dy = c.y - BODY_CY - end.y;
    const d = isqrt(dx * dx + dy * dy);
    const dd = hit === c.id ? 0 : Math.max(0, d - BODY_R);
    const dmg = blastDamage(sw, weapon(c.weapon), sw.radius, dd);
    if (c.team === me.team) score -= (c.id === me.id ? SELF_K : MATE_K) * dmg;
    else {
      score += dmg;
      if (d < near) near = d;
    }
  }
  return score - idiv(near, 8);
}

/** 对着 target 二分力度：落点在他前面（够不着）就加力，过了（或飞出画本）就减力；回这几发里分最高的 */
function aimAt(s: State, me: Char, target: Char, angle: number, lid: boolean): Cand {
  const facing: Dir = target.x < me.x ? -1 : 1;
  let lo = 8;
  let hi = 100;
  let best: Cand | null = null;
  for (let k = 0; k < HALVES; k++) {
    const power = (lo + hi) >> 1;
    const sh = previewShot(s, angle, power, facing, false, lid);
    const score = scoreAt(s, me, sh.end, sh.hit);
    if (!best || score > best.score) best = { angle, power, facing, score, end: sh.end };
    if (sh.hit === target.id) break;
    // 飞出画本：多半是飞过头了（往下掉进洞里的也按过头算，减力）
    const past = !sh.end || (sh.end.x - target.x) * facing > 0;
    if (past) hi = power;
    else lo = power;
  }
  return best!;
}

/** 纸飞机挑落点（简版）：两个方向 × 2 个角度 × 2 个力度，挑地厚、离对手不远不近的 */
function planeLite(s: State, me: Char): Plan | null {
  const w = weapon(me.weapon);
  let best: { angle: number; power: number; facing: Dir; score: number } | null = null;
  const mid = (w.minAngle + w.maxAngle) >> 1;
  for (const facing of [-1, 1] as const) {
    for (const angle of [idiv(w.minAngle + mid, 2), idiv(mid + w.maxAngle, 2)]) {
      for (const power of [36, 56]) {
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

/** 道具：打得中就上连发或加力，对手挤在一起上三岔；只挑体力买得起的 */
/** 打中了用的叠法（按顺序挑第一个买得起的）、对手挤在一起用的、打不准时用的 */
const HIT_STACKS = [{ p2: 1, b50: 1 }, { b50: 1, b20: 1 }, { p2: 2, b20: 1 }, { p1: 1, b50: 1 }, { p2: 1, p1: 1, b20: 1 }, { b50: 1 }, { p2: 1, b20: 1 }, { b20: 1 }].map((p) => loadout(p));
const CROWD_STACKS = [{ fork: 1, p1: 1, p2: 1 }, { fork: 1, p2: 1, b10: 1 }, { fork: 1, p1: 1, b20: 1 }, { fork: 1, p2: 1 }, { fork: 1, p1: 1 }, { fork: 1, b20: 1 }, { fork: 1 }].map((p) => loadout(p));
const MISS_STACKS = [{ b20: 1 }].map((p) => loadout(p));

/** 道具：打得中就上连发、加力，对手挤在一起上三岔；只挑体力买得起的 */
function pickLoadout(s: State, me: Char, c: Cand, left: number, lid: boolean): Loadout {
  if (c.score < 0) return { ...PLAIN, lid };
  const crowd = c.end ? s.chars.filter((o) => !o.out && o.team !== me.team && Math.abs(o.x - c.end!.x) <= CROWD).length : 0;
  const wants = crowd >= 2 ? CROWD_STACKS : c.score >= HIT ? HIT_STACKS : MISS_STACKS;
  for (const l of wants) if (loadoutCost(l) <= left) return { ...l, lid };
  return { ...PLAIN, lid };
}

/** 对着最近的几个对手瞄（第一个已经打得中就不瞄第二个了，省 CPU） */
function aimFrom(s: State, lid: boolean): Cand | null {
  const me = s.chars[s.actor]!;
  const w = weapon(me.weapon);
  const foes = s.chars
    .filter((c) => !c.out && c.team !== me.team)
    .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x) || a.id - b.id)
    .slice(0, TARGETS);
  let best: Cand | null = null;
  const span = w.maxAngle - w.minAngle;
  for (const t of foes) {
    if (best && best.score >= HIT) break;
    for (let k = 0; k < ANGLES; k++) {
      const angle = w.minAngle + idiv(span * (2 * k + 1), 2 * ANGLES);
      const c = aimAt(s, me, t, angle, lid);
      if (!best || c.score > best.score) best = c;
    }
  }
  return best;
}

export function planLite(s: State): Plan {
  const me = s.chars[s.actor]!;
  const w = weapon(me.weapon);
  const rng = stream(s.key, 'ai', s.turn);
  const roll = rng.below(100);
  const lid = me.special.lid > 0 && Math.abs(s.wind) >= LID_WIND && s.stamina >= SPECIALS.lid.cost;
  const best = aimFrom(s, lid);
  const pick = best ?? { angle: idiv(w.minAngle + w.maxAngle, 2), power: 60, facing: me.facing, score: -10_000, end: null };
  if (me.special.plane > 0 && s.stamina >= SPECIALS.plane.cost && inDanger(s) && (pick.score < GOOD_SHOT || roll < PLANE_CHANCE)) {
    const p = planeLite(s, me);
    if (p) return withError(s, p, rng);
  }
  const left = s.stamina - (lid ? SPECIALS.lid.cost : 0);
  let chosen = pickLoadout(s, me, pick, left, lid);
  // 连发、三岔真打一遍（第二颗穿过第一颗的坑、三颗散开），分比不用道具的粗算还低（伤到自己、队友）就不用；
  // 只加力不改弹道，伤害等比放大，粗算是正的就不会变负，不用再打
  if (volleys(chosen) > 1 || chosen.fork) {
    const withItems = exact(s, pick.angle, pick.power, pick.facing, chosen);
    if (withItems < pick.score) chosen = { ...PLAIN, lid };
  }
  return withError(s, { moves: [], angle: pick.angle, power: pick.power, facing: pick.facing, loadout: chosen }, rng);
}
