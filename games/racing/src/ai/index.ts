/**
 * 电脑（DESIGN.md 5.2）：只拿自己座位的视图，和真人看到的一样。
 * - 选挡出牌：列出能挂的挡 × 手里能打的组合（按牌面去重），每种按"走到哪、付几张热量、会不会打滑、下回合刹不刹得住"打分，挑最高的；
 *   手抖牌、冲刺的点数按自己牌堆加弃牌堆里速度牌的成分算分布；
 * - 冲刺、拼劲、尾流：比较做和不做；弃牌：离弯近留小牌、直道上留大牌。
 * 每场的状态（视图里自己的 form）在性格上浮动：冲劲高的这场热量看得轻、更敢冲刺和吸尾流，手感差的这场更容易挑错。
 * 纯函数、确定性：失误用"这场的抖动种子 + 步数 + 座位 + 选项编号"算出来的哈希，不用 Math.random。
 */
import { crossedCorners, gearOptions, nextCorner } from '../core/rules.ts';
import { discardable, faceValue, HEAT, STRESS } from '../core/cards.ts';
import type { Action, Plan } from '../core/types.ts';
import type { CarView, View } from '../core/view.ts';
import { getTrack, type Track } from '../track/index.ts';
import { DEFAULT_PERSONA, PERSONAS, type Persona } from './personas.ts';

/** 一个速度分布：点数 → 概率 */
type Dist = Map<number, number>;

/** 性格按这场的状态浮动：冲劲 ±100 让热量的估值 ∓25%、冲刺尾流的门槛 ∓0.5；手感 −100 多 0.8 的失误，+100 少 0.4 */
function tuned(p: Persona, form: readonly number[]): Persona {
  const drive = (form[0] ?? 0) / 100;
  const touch = (form[1] ?? 0) / 100;
  return {
    ...p,
    heat: p.heat * (1 - drive / 4),
    spin: p.spin * (1 - drive / 5),
    boost: p.boost - drive / 2,
    slip: p.slip - drive / 2,
    slop: Math.max(0, p.slop + (touch < 0 ? -touch * 0.8 : -touch * 0.4)),
  };
}

/** 手抖、冲刺翻出来的点数分布：按牌堆 + 弃牌堆里 1–4 的张数；一张都没有就是 0 */
function flipDist(pool: readonly number[]): Dist {
  const d: Dist = new Map();
  let total = 0;
  for (let v = 1; v <= 4; v++) total += pool[v] ?? 0;
  if (total === 0) return new Map([[0, 1]]);
  for (let v = 1; v <= 4; v++) if (pool[v]) d.set(v, pool[v]! / total);
  return d;
}

function shift(d: Dist, k: number): Dist {
  return new Map([...d].map(([v, p]) => [v + k, p]));
}

function convolve(a: Dist, b: Dist): Dist {
  const out: Dist = new Map();
  for (const [x, p] of a) for (const [y, q] of b) out.set(x + y, (out.get(x + y) ?? 0) + p * q);
  return out;
}

/** 一张热量值几格：引擎越空越值钱；离终点越近越不值钱（跑完了还剩着就是白留） */
function heatValue(x: Ctx, engine: number, pos = x.car.pos): number {
  const left = Math.max(0, x.v.finish - pos) / x.track.spaces;
  return x.p.heat * (1 + 3 / (Math.max(0, engine) + 1)) * Math.min(1, Math.max(0.1, left));
}

/** 失误：按这场的抖动种子、步数、座位、选项编号算的 0–1 之间的数（确定性，每场不一样） */
function jitter(salt: number, n: number, seat: number, k: number): number {
  let h = salt ^ (n * 73_856_093) ^ (seat * 19_349_663) ^ (k * 83_492_791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 0x1_0000_0000;
}

interface Ctx {
  v: View;
  seat: number;
  car: CarView;
  track: Track;
  p: Persona;
  /** 下一回合手里肯定还有的牌（选牌时是打完剩下的；冲刺、尾流时是现在的手牌） */
  keep: number[];
}

function ctxOf(v: View, seat: number): Ctx {
  const track = getTrack(v.opts.track);
  if (!track) throw new Error('unknown track');
  const car = v.cars[seat]!;
  const p = tuned(PERSONAS[car.persona] ?? PERSONAS[DEFAULT_PERSONA]!, v.me?.form ?? []);
  return { v, seat, car, track, p, keep: (v.me?.hand ?? []).map((h) => h.kind) };
}

/** 从 start 开到 to、速度 speed、引擎 engine：要付几张热量，会不会在哪条线打滑 */
function cornerCost(x: Ctx, start: number, to: number, speed: number, engine: number): { cost: number; spin: number | null } {
  let left = engine;
  let cost = 0;
  for (const k of crossedCorners(x.track, x.v.finish, start, to)) {
    const over = speed - k.limit;
    if (over <= 0) continue;
    if (left < over) return { cost: cost + left, spin: k.line };
    left -= over;
    cost += over;
  }
  return { cost, spin: null };
}

/**
 * 下一回合刹不刹得住：停在 land、挂 gear、引擎还剩 engine。下回合最慢能挂的挡（降 1 挡免费，有热量能降 2 挡）
 * 打手里最小的几张（不够的按 2 点算新抽的，手抖按 2.5），要是这样还会冲进下个弯，按超出的格数算风险
 */
function nextRisk(x: Ctx, land: number, gear: number, engine: number): number {
  const nc = nextCorner(x.track, x.v.finish, land);
  if (!nc) return 0;
  const d = nc.line - land;
  const g = Math.max(1, gear - (engine > 0 ? 2 : 1));
  const vals = x.keep.filter((k) => k !== HEAT).map((k) => (k === STRESS ? 2.5 : faceValue(k)));
  vals.sort((a, b) => a - b);
  let slow = 0;
  for (let i = 0; i < g; i++) slow += vals[i] ?? 2;
  if (slow < d) return 0;
  const over = slow - nc.limit;
  if (over <= 0) return 0;
  const pay = over > engine ? x.p.spin * 0.6 + engine * heatValue(x, engine, land) : over * heatValue(x, engine, land);
  return pay * x.p.ahead;
}

/** 走 speed 格（不管挡车）的得分 */
function outcome(x: Ctx, speed: number, gear: number, engine: number): number {
  const c = x.car;
  const land = c.pos + speed;
  const r = cornerCost(x, c.pos, land, speed, engine);
  if (r.spin !== null) {
    const back = r.spin - 1 - c.pos;
    const stress = gear <= 2 ? 1 : 2;
    return back - x.p.spin - stress * 1.5 - r.cost * heatValue(x, engine);
  }
  const left = engine - r.cost;
  let score = speed - r.cost * heatValue(x, left) - nextRisk(x, land, gear, left);
  if (land >= x.v.finish) score += 20 + (land - x.v.finish) * 0.5;
  // 挡位高一点，下回合能开得更快
  score += gear * 0.3;
  return score;
}

function expect(d: Dist, f: (v: number) => number): number {
  let s = 0;
  for (const [v, p] of d) s += p * f(v);
  return s;
}

/** 手里的牌按种类数一数，列出所有按牌面去重的 k 张组合 */
function combos(kinds: readonly number[], k: number): number[][] {
  const counts = new Map<number, number>();
  for (const x of kinds) counts.set(x, (counts.get(x) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => a - b);
  const out: number[][] = [];
  const pick: number[] = [];
  const rec = (i: number): void => {
    if (pick.length === k) return void out.push(pick.slice());
    if (i >= keys.length) return;
    const key = keys[i]!;
    const max = Math.min(counts.get(key)!, k - pick.length);
    for (let n = max; n >= 0; n--) {
      for (let j = 0; j < n; j++) pick.push(key);
      rec(i + 1);
      for (let j = 0; j < n; j++) pick.pop();
    }
  };
  rec(0);
  return out;
}

/** 选挡出牌 */
function planFor(v: View, seat: number): Plan {
  const x = ctxOf(v, seat);
  const me = v.me!;
  const c = x.car;
  const flipD = flipDist(me.pool);
  const handHeat = me.hand.filter((h) => h.kind === HEAT).length;
  const usable = me.hand.filter((h) => h.kind !== HEAT);
  let best: { score: number; gear: number; kinds: number[] } | null = null;
  let k = 0;
  for (const gear of gearOptions({ gear: c.gear, engine: c.engine })) {
    const paid = Math.abs(gear - c.gear) === 2 ? 1 : 0;
    const cool = gear === 1 ? 3 : gear === 2 ? 1 : 0;
    const adren = c.adren ? 1 : 0;
    const engine = c.engine - paid + Math.min(cool + adren, handHeat);
    const base = -paid * heatValue(x, c.engine) + Math.min(cool + adren, handHeat) * 0.8;
    if (usable.length < gear) {
      // 熄火：车不动、挂回 1 挡，只当没办法时的退路
      const score = base - 6 - gear;
      if (!best || score > best.score) best = { score, gear, kinds: [] };
      continue;
    }
    for (const set of combos(
      usable.map((h) => h.kind),
      gear,
    )) {
      const rest = usable.map((h) => h.kind);
      for (const kind of set) rest.splice(rest.indexOf(kind), 1);
      x.keep = rest;
      const fixed = set.reduce((a, kind) => a + (kind === STRESS ? 0 : faceValue(kind)), 0);
      let d: Dist = new Map([[fixed, 1]]);
      for (const kind of set) if (kind === STRESS) d = convolve(d, flipD);
      let score = base + expect(d, (sp) => outcome(x, sp, gear, engine));
      // 打掉手抖牌是在清手
      score += set.filter((kind) => kind === STRESS).length * 0.6;
      score -= jitter(me.form[2] ?? 0, v.n, seat, k++) * x.p.slop;
      if (!best || score > best.score) best = { score, gear, kinds: set };
    }
  }
  const pick = best!;
  const cards: number[] = [];
  const left = usable.slice();
  for (const kind of pick.kinds) {
    const i = left.findIndex((h) => h.kind === kind);
    cards.push(left.splice(i, 1)[0]!.id);
  }
  return { gear: pick.gear, cards, boost: 'ask', adren: 'ask', slip: 'ask', discard: 'ask' };
}

/** 冲刺：付 1 热量，翻一张速度牌 */
function wantBoost(x: Ctx): boolean {
  const c = x.car;
  const speed = c.speed ?? 0;
  const now = cornerCost(x, c.start, c.pos, speed, c.engine);
  const d = flipDist(x.v.me!.pool);
  const gain = expect(d, (w) => {
    const r = cornerCost(x, c.start, c.pos + w, speed + w, c.engine - 1);
    if (r.spin !== null && now.spin === null) return -x.p.spin;
    const land = c.pos + w;
    return w - (r.cost - now.cost) * heatValue(x, c.engine - 1 - r.cost) - nextRisk(x, land, c.gear, c.engine - 1 - r.cost) + nextRisk(x, c.pos, c.gear, c.engine - now.cost) + (land >= x.v.finish && c.pos < x.v.finish ? 20 : 0);
  });
  return gain - heatValue(x, c.engine - 1) > x.p.boost;
}

/** 多走 1 格（拼劲）或吸尾流 2 格：会不会多付热量、打滑 */
function wantMove(x: Ctx, step: number, addSpeed: boolean, bar: number): boolean {
  const c = x.car;
  const speed = c.speed ?? 0;
  const now = cornerCost(x, c.start, c.pos, speed, c.engine);
  const then = cornerCost(x, c.start, c.pos + step, speed + (addSpeed ? 1 : 0), c.engine);
  if (then.spin !== null && now.spin === null) return false;
  const gain = step - (then.cost - now.cost) * heatValue(x, c.engine - then.cost) - nextRisk(x, c.pos + step, c.gear, c.engine - then.cost) + nextRisk(x, c.pos, c.gear, c.engine - now.cost);
  return gain > bar;
}

/** 弃牌：离弯近留小牌、直道上留大牌 */
function discards(x: Ctx): number[] {
  const c = x.car;
  const nc = nextCorner(x.track, x.v.finish, c.pos);
  const d = nc ? nc.line - c.pos : 99;
  const slow = nc !== null && d <= 10 && nc.limit <= 4;
  const out: number[] = [];
  for (const h of x.v.me!.hand) {
    if (!discardable(h.kind)) continue;
    const bad = slow ? h.kind >= 4 : d > 8 && h.kind <= 1;
    if (bad) out.push(h.id);
  }
  return out;
}

/** 电脑出手（电脑座位、托管、超时代出都用它）：必须合法 */
export function decide(v: View, seat: number): Action {
  if (v.phase === 'plan') return { t: 'plan', ...planFor(v, seat) };
  const x = ctxOf(v, seat);
  switch (v.ask) {
    case 'boost':
      return { t: 'boost', yes: wantBoost(x) };
    case 'adren':
      return { t: 'adren', yes: wantMove(x, 1, true, -0.5) };
    case 'slip':
      return { t: 'slip', yes: wantMove(x, 2, false, x.p.slip) };
    case 'discard':
      return { t: 'discard', cards: discards(x) };
    default:
      return { t: 'discard', cards: [] };
  }
}
