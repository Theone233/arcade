/**
 * 视图（DESIGN.md 2.6）：按座位过滤，只放这个座位能看到的。
 * 公开：每辆车的位置、挡位（亮牌以后的）、引擎几张、手里几张、牌堆几张、弃牌堆最上面一张、这回合打出和翻出来的、交没交计划。
 * 只给自己：手牌、自己交的计划、自己牌堆加弃牌堆里各种牌还剩几张（顺序不给）。
 * 谁也不给：牌堆顺序、随机数密钥。
 */
import { finishLine, racing } from './rules.ts';
import type { Ask, Ev, Opts, Phase, Plan, Stats, State } from './types.ts';

export interface CarView {
  seat: number;
  /** 电脑性格（-1 是真人） */
  persona: number;
  pos: number;
  /** 这一回合开始时在哪（算跨过了哪些弯道线） */
  start: number;
  lane: number;
  gear: number;
  rank: number | null;
  engine: number;
  hand: number;
  deck: number;
  discardTop: number | null;
  /** 这一回合亮出来的牌（亮牌前是空的） */
  play: number[];
  /** 这一回合的速度（亮牌前是 null） */
  speed: number | null;
  /** 交计划阶段：交了没有 */
  ready: boolean;
  /** 这一回合有拼劲 */
  adren: boolean;
  stalled: boolean;
  spun: boolean;
  stats: Stats;
}

export interface MeView {
  seat: number;
  hand: { id: number; kind: number }[];
  plan: Plan | null;
  /** 牌堆 + 弃牌堆里每种牌还有几张：下标是种类（0–11） */
  pool: number[];
  /** 自己这一场的状态（State.form），电脑据此浮动 */
  form: number[];
}

export interface View {
  v: number;
  opts: Opts;
  finish: number;
  round: number;
  phase: Phase;
  cars: CarView[];
  order: number[];
  /** 轮到谁回答、回答什么 */
  cur: number | null;
  ask: Ask | null;
  finished: number[];
  me: MeView | null;
  events: Ev[];
  n: number;
}

export function view(s: State, seat: number | null): View {
  const live = new Set(racing(s));
  const cars = s.cars.map((c, i): CarView => ({
    seat: i,
    persona: s.personas[i] ?? -1,
    pos: c.pos,
    start: c.start,
    lane: c.lane,
    gear: c.gear,
    rank: c.rank,
    engine: c.engine.length,
    hand: c.hand.length,
    deck: c.deck.length,
    discardTop: c.discard.length ? c.kinds[c.discard[c.discard.length - 1]!]! : null,
    play: c.shown ? c.play.map((id) => c.kinds[id]!) : [],
    speed: c.shown && !c.stalled ? c.speed : null,
    ready: s.phase === 'plan' && live.has(i) && c.plan !== null,
    adren: s.adren.includes(i),
    stalled: c.stalled,
    spun: c.spun,
    stats: { ...c.stats },
  }));
  let me: MeView | null = null;
  const c = seat === null ? undefined : s.cars[seat];
  if (seat !== null && c) {
    const pool = Array.from({ length: 12 }, () => 0);
    for (const id of [...c.deck, ...c.discard]) pool[c.kinds[id]!]!++;
    me = {
      seat,
      hand: c.hand.map((id) => ({ id, kind: c.kinds[id]! })).sort((a, b) => a.kind - b.kind || a.id - b.id),
      plan: c.plan ? structuredClone(c.plan) : null,
      pool,
      form: [...(s.form[seat] ?? [0, 0, 0])],
    };
  }
  const cur = s.phase === 'act' && s.ask !== null ? (s.order[s.at] ?? null) : null;
  return {
    v: s.v,
    opts: { ...s.opts },
    finish: finishLine(s),
    round: s.round,
    phase: s.phase,
    cars,
    order: s.order.slice(),
    cur,
    ask: cur === null ? null : s.ask,
    finished: s.finished.slice(),
    me,
    events: structuredClone(s.events),
    n: s.n,
  };
}
