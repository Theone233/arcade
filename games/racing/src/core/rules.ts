/**
 * 规则核心（DESIGN.md 第 2 节）：开局、交计划、一回合依次结算、回答冲刺 / 拼劲 / 尾流 / 弃牌、冲线名次。
 * 纯函数：apply 不改传进来的状态（先复制一份再改）；随机只用 arcade-kit/rng 按用途分流（'grid' 发车格、'deck' 每辆车每次洗牌）。
 * 不碰 DOM、网络、Math.random、Date、三角函数（test/arch.test.ts 检查）。
 */
import { shuffle, stream, type Entropy } from 'arcade-kit/rng';
import { getTrack, type Track } from '../track/index.ts';
import { discardable, faceValue, flipCounts, HAND, playable, startingKinds, STRESS } from './cards.ts';
import { LEVELS, Stage, type Action, type Ask, type Car, type Ev, type Opts, type Plan, type Pre, type State } from './types.ts';

export const RULES_VERSION = 1;
/** 房间的座位数（一场 2–6 辆车，开房时定） */
export const MAX_CARS = 6;
export const DEFAULT_OPTS: Opts = { track: 'lakeside', laps: 2, cars: 6, level: 'mix' };

// ---------- 选项和赛道 ----------

/** 校验开局选项；不合格返回 null */
export function checkOpts(raw: unknown): Opts | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const track = typeof o.track === 'string' ? getTrack(o.track) : null;
  const laps = o.laps;
  const cars = o.cars;
  if (!track) return null;
  if (typeof laps !== 'number' || !Number.isInteger(laps) || laps < 1 || laps > 3) return null;
  if (typeof cars !== 'number' || !Number.isInteger(cars) || cars < 2 || cars > MAX_CARS) return null;
  const level = LEVELS.find((l) => l === o.level);
  if (!level) return null;
  return { track: track.id, laps, cars, level };
}

export function trackOf(s: { opts: Opts }): Track {
  const t = getTrack(s.opts.track);
  if (!t) throw new Error(`unknown track ${s.opts.track}`);
  return t;
}

/** 终点线的绝对格数：pos ≥ 它就是冲线了 */
export function finishLine(s: { opts: Opts }): number {
  return s.opts.laps * trackOf(s).spaces;
}

/** 从 from（不含）到 to（含）之间跨过的弯道线，按先后；终点线以后的不算（DESIGN.md 2.5） */
export function crossedCorners(track: Track, finish: number, from: number, to: number): { line: number; limit: number }[] {
  const out: { line: number; limit: number }[] = [];
  if (to <= from) return out;
  const firstLap = Math.max(0, Math.floor(from / track.spaces));
  for (let lap = firstLap; lap * track.spaces <= to; lap++) {
    for (const c of track.corners) {
      const line = lap * track.spaces + c.at;
      if (line > from && line <= to && line < finish) out.push({ line, limit: c.limit });
    }
  }
  return out;
}

/** 从 pos 往前（不含 pos）最近的一条弯道线（终点线以后的不算）；没有了是 null */
export function nextCorner(track: Track, finish: number, pos: number): { line: number; limit: number } | null {
  const lap = Math.max(0, Math.floor(pos / track.spaces));
  for (let l = lap; l <= lap + 1; l++) {
    for (const c of track.corners) {
      const line = l * track.spaces + c.at;
      if (line > pos && line < finish) return { line, limit: c.limit };
    }
  }
  return null;
}

// ---------- 开局 ----------

/** 开一场：key 是随机数密钥（房间的熵或浏览器现生成的），kinds 每个座位是真人还是电脑，personas 电脑性格（真人 -1） */
export function begin(key: Entropy, opts: Opts, kinds: ('human' | 'ai')[], personas: number[]): State {
  const t = trackOf({ opts });
  const n = opts.cars;
  const grid = shuffle(
    Array.from({ length: n }, (_, i) => i),
    stream(key, 'grid'),
  );
  const cars: Car[] = [];
  for (let seat = 0; seat < n; seat++) {
    const { kinds: cardKinds, deck, engine } = startingKinds(t.heat, t.stress);
    const g = grid.indexOf(seat);
    const car: Car = {
      kinds: cardKinds,
      deck: shuffle(deck, stream(key, 'deck', seat * 1000)),
      discard: [],
      hand: [],
      engine,
      play: [],
      shuffles: 0,
      gear: 1,
      pos: -1 - Math.floor(g / 2),
      lane: g % 2,
      rank: null,
      plan: null,
      shown: false,
      start: 0,
      speed: 0,
      stalled: false,
      spun: false,
      boosted: false,
      extra: false,
      slipped: false,
      stats: { spins: 0, boosts: 0, slips: 0, stalls: 0, heat: 0, top: 0 },
    };
    cars.push(car);
  }
  const fr = stream(key, 'form');
  const s: State = {
    v: RULES_VERSION,
    key: [...key],
    opts: { ...opts },
    kinds: Array.from({ length: n }, (_, i) => kinds[i] ?? 'ai'),
    personas: Array.from({ length: n }, (_, i) => personas[i] ?? -1),
    form: Array.from({ length: n }, () => [fr.below(201) - 100, fr.below(201) - 100, fr.below(1_000_000_000)]),
    round: 0,
    phase: 'plan',
    cars,
    order: [],
    at: 0,
    stage: Stage.Reveal,
    ask: null,
    adren: [],
    finished: [],
    events: [],
    n: 0,
  };
  cars.forEach((c, seat) => refill(s, seat, c));
  startRound(s);
  return s;
}

// ---------- 牌堆 ----------

function reshuffle(s: State, seat: number, c: Car): void {
  if (c.discard.length === 0) return;
  c.shuffles++;
  c.deck = shuffle(c.discard, stream(s.key, 'deck', seat * 1000 + c.shuffles));
  c.discard = [];
}

function drawOne(s: State, seat: number, c: Car): number | null {
  if (c.deck.length === 0) reshuffle(s, seat, c);
  return c.deck.pop() ?? null;
}

/** 补到 7 张（打在桌上的先进弃牌堆，所以会一起洗进去） */
function refill(s: State, seat: number, c: Car): void {
  c.discard.push(...c.play);
  c.play = [];
  while (c.hand.length < HAND) {
    const id = drawOne(s, seat, c);
    if (id === null) break;
    c.hand.push(id);
  }
}

/**
 * 手抖、冲刺的翻牌：从牌堆往下翻，1–4 的速度牌进打出区算数，别的进弃牌堆接着翻。
 * 中途牌堆空了把弃牌堆洗进来（打出区的不洗）；洗过一次又翻空了，说明牌堆和弃牌堆里一张速度牌都没有，算 0 点
 */
function flip(s: State, seat: number, c: Car): { flips: number[]; value: number } {
  const flips: number[] = [];
  let reshuffled = false;
  for (;;) {
    if (c.deck.length === 0) {
      if (reshuffled || c.discard.length === 0) return { flips, value: 0 };
      reshuffle(s, seat, c);
      reshuffled = true;
    }
    const id = c.deck.pop()!;
    const kind = c.kinds[id]!;
    flips.push(kind);
    if (flipCounts(kind)) {
      c.play.push(id);
      return { flips, value: kind };
    }
    c.discard.push(id);
  }
}

/** 付 n 张热量：引擎 → 弃牌堆 */
function payHeat(c: Car, n: number): void {
  for (let i = 0; i < n; i++) {
    const id = c.engine.pop();
    if (id === undefined) return;
    c.discard.push(id);
    c.stats.heat++;
  }
}

// ---------- 车位 ----------

/** 停在 target 这一格：内线空着停内线，否则外线；两个都满了往后找第一个有空位的格（DESIGN.md 2.2 第 2 步） */
function place(s: State, seat: number, target: number): { pos: number; lane: number } {
  for (let p = target; ; p--) {
    let inner = false;
    let outer = false;
    s.cars.forEach((d, i) => {
      if (i === seat || d.rank !== null || d.pos !== p) return;
      if (d.lane === 0) inner = true;
      else outer = true;
    });
    if (!inner) return { pos: p, lane: 0 };
    if (!outer) return { pos: p, lane: 1 };
  }
}

function moveTo(s: State, seat: number, target: number, why: 'cards' | 'boost' | 'adren' | 'slip' | 'spin'): void {
  const c = s.cars[seat]!;
  const from = c.pos;
  const at = place(s, seat, target);
  c.pos = at.pos;
  c.lane = at.lane;
  s.events.push({ e: 'move', seat, from, to: at.pos, lane: at.lane, why });
}

// ---------- 一回合 ----------

/** 还在跑的车（没冲线、没被移出赛道） */
export function racing(s: State): number[] {
  return s.cars.flatMap((c, i) => (c.rank === null ? [i] : []));
}

/** 回合开始：清掉上一回合的标记，按位置从前往后排好这一回合的顺序，定拼劲 */
function startRound(s: State): void {
  s.round++;
  s.phase = 'plan';
  s.events.push({ e: 'round', round: s.round });
  const live = racing(s);
  for (const i of live) {
    const c = s.cars[i]!;
    c.plan = null;
    c.shown = false;
    c.start = c.pos;
    c.speed = 0;
    c.stalled = false;
    c.spun = false;
    c.boosted = false;
    c.extra = false;
    c.slipped = false;
  }
  s.order = live.slice().sort((a, b) => {
    const ca = s.cars[a]!;
    const cb = s.cars[b]!;
    return cb.pos - ca.pos || ca.lane - cb.lane || a - b;
  });
  // 开局 5 辆车以上是最后两辆，否则最后一辆；按开局的车数算，冲线离场的不减
  const k = s.opts.cars >= 5 ? 2 : 1;
  s.adren = s.order.slice(Math.max(0, s.order.length - k));
  s.at = 0;
  s.stage = Stage.Reveal;
  s.ask = null;
}

function endRound(s: State): void {
  const finish = finishLine(s);
  const done = racing(s)
    .filter((i) => s.cars[i]!.pos >= finish)
    .sort((a, b) => {
      const ca = s.cars[a]!;
      const cb = s.cars[b]!;
      return cb.pos - ca.pos || ca.lane - cb.lane || a - b;
    });
  for (const i of done) rankCar(s, i);
  const live = racing(s);
  // 有真人的一场：真人都冲线（或都离座）了，剩下的电脑按位置排名次，不再陪跑
  const hadHuman = s.kinds.includes('human');
  if (live.length > 0 && hadHuman && !live.some((i) => s.kinds[i] === 'human')) {
    const rest = live.slice().sort((a, b) => {
      const ca = s.cars[a]!;
      const cb = s.cars[b]!;
      return cb.pos - ca.pos || ca.lane - cb.lane || a - b;
    });
    for (const i of rest) rankCar(s, i);
  }
  if (racing(s).length === 0) {
    s.phase = 'over';
    s.order = [];
    s.ask = null;
    return;
  }
  startRound(s);
}

function rankCar(s: State, seat: number): void {
  const rank = s.finished.length;
  s.cars[seat]!.rank = rank;
  s.finished.push(seat);
  s.events.push({ e: 'finish', seat, rank });
}

/** 预设 → 要不要；'ask' 是要问 */
function decide(p: Pre): boolean | null {
  return p === 'yes' ? true : p === 'no' ? false : null;
}

function canBoost(c: Car): boolean {
  return !c.boosted && !c.stalled && c.engine.length > 0;
}

export function canSlip(s: State, seat: number): boolean {
  const c = s.cars[seat]!;
  if (c.stalled || c.slipped || c.pos + 2 >= finishLine(s)) return false;
  return s.cars.some((d, i) => i !== seat && d.rank === null && (d.pos === c.pos || d.pos === c.pos + 1));
}

function hasDiscardable(c: Car): boolean {
  return c.hand.some((id) => discardable(c.kinds[id]!));
}

/** 亮牌、移动（第 2 步），再自动散热（第 4 步里的散热永远划算，做满） */
function reveal(s: State, seat: number): void {
  const c = s.cars[seat]!;
  const p = c.plan!;
  const from = c.gear;
  const paid = Math.abs(p.gear - from) === 2 ? 1 : 0;
  payHeat(c, paid);
  c.gear = p.gear;
  c.shown = true;
  const usable = c.hand.filter((id) => playable(c.kinds[id]!));
  if (usable.length < c.gear) {
    // 熄火：能打的全打，不够的用热量顶上；车不动，挂回 1 挡，直接补牌
    const heat = c.hand.filter((id) => !playable(c.kinds[id]!)).slice(0, c.gear - usable.length);
    const cards = [...usable, ...heat];
    c.hand = c.hand.filter((id) => !cards.includes(id));
    c.play.push(...cards);
    c.stalled = true;
    c.stats.stalls++;
    s.events.push({ e: 'stall', seat, from, gear: c.gear, paid, cards: cards.map((id) => c.kinds[id]!) });
    c.gear = 1;
    return;
  }
  c.hand = c.hand.filter((id) => !p.cards.includes(id));
  c.play.push(...p.cards);
  let speed = 0;
  const flips: number[][] = [];
  for (const id of p.cards) {
    const kind = c.kinds[id]!;
    if (kind === STRESS) {
      const f = flip(s, seat, c);
      flips.push(f.flips);
      speed += f.value;
    } else speed += faceValue(kind);
  }
  c.speed = speed;
  s.events.push({ e: 'reveal', seat, from, gear: c.gear, paid, cards: p.cards.map((id) => c.kinds[id]!), flips, speed });
  moveTo(s, seat, c.pos + speed, 'cards');
  const cool = (c.gear === 1 ? 3 : c.gear === 2 ? 1 : 0) + (s.adren.includes(seat) ? 1 : 0);
  let n = 0;
  for (let i = 0; i < c.hand.length && n < cool; ) {
    const id = c.hand[i]!;
    if (!playable(c.kinds[id]!)) {
      c.hand.splice(i, 1);
      c.engine.push(id);
      n++;
    } else i++;
  }
  if (n > 0) s.events.push({ e: 'cool', seat, n });
}

function doBoost(s: State, seat: number): void {
  const c = s.cars[seat]!;
  payHeat(c, 1);
  c.boosted = true;
  c.stats.boosts++;
  const f = flip(s, seat, c);
  c.speed += f.value;
  s.events.push({ e: 'boost', seat, flips: f.flips, value: f.value });
  moveTo(s, seat, c.pos + f.value, 'boost');
}

function doAdren(s: State, seat: number): void {
  const c = s.cars[seat]!;
  c.extra = true;
  c.speed += 1;
  moveTo(s, seat, c.pos + 1, 'adren');
}

function doSlip(s: State, seat: number): void {
  const c = s.cars[seat]!;
  c.slipped = true;
  c.stats.slips++;
  moveTo(s, seat, c.pos + 2, 'slip');
}

/** 过弯（第 6 步）：按跨过的先后比速度和限速，超了付热量，付不起打滑 */
function corners(s: State, seat: number): void {
  const c = s.cars[seat]!;
  c.stats.top = Math.max(c.stats.top, c.speed);
  const t = trackOf(s);
  for (const k of crossedCorners(t, finishLine(s), c.start, c.pos)) {
    const over = c.speed - k.limit;
    if (over <= 0) {
      s.events.push({ e: 'corner', seat, line: k.line, limit: k.limit, speed: c.speed, paid: 0 });
      continue;
    }
    if (c.engine.length >= over) {
      payHeat(c, over);
      s.events.push({ e: 'corner', seat, line: k.line, limit: k.limit, speed: c.speed, paid: over });
      continue;
    }
    const paid = c.engine.length;
    payHeat(c, paid);
    s.events.push({ e: 'corner', seat, line: k.line, limit: k.limit, speed: c.speed, paid });
    const stress = c.gear <= 2 ? 1 : 2;
    for (let i = 0; i < stress; i++) {
      c.hand.push(c.kinds.length);
      c.kinds.push(STRESS);
    }
    c.gear = 1;
    c.spun = true;
    c.stats.spins++;
    s.events.push({ e: 'spin', seat, line: k.line, stress });
    moveTo(s, seat, k.line - 1, 'spin');
    return;
  }
}

function discardCards(s: State, seat: number, ids: readonly number[]): void {
  const c = s.cars[seat]!;
  const drop = ids.filter((id) => c.hand.includes(id) && discardable(c.kinds[id]!));
  if (drop.length === 0) return;
  c.hand = c.hand.filter((id) => !drop.includes(id));
  c.discard.push(...drop);
  s.events.push({ e: 'discard', seat, n: drop.length });
}

/** 往下走，直到要问人、或者回到交计划、或者整场打完 */
function advance(s: State): void {
  while (s.phase === 'act') {
    if (s.at >= s.order.length) {
      endRound(s);
      continue;
    }
    const seat = s.order[s.at]!;
    const c = s.cars[seat]!;
    const plan = c.plan!;
    switch (s.stage) {
      case Stage.Reveal:
        reveal(s, seat);
        s.stage = c.stalled ? Stage.Refill : Stage.Boost;
        break;
      case Stage.Boost:
        if (canBoost(c)) {
          const d = decide(plan.boost);
          if (d === null) return void (s.ask = 'boost');
          if (d) doBoost(s, seat);
        }
        s.stage = Stage.Adren;
        break;
      case Stage.Adren:
        if (s.adren.includes(seat) && !c.extra) {
          const d = decide(plan.adren);
          if (d === null) return void (s.ask = 'adren');
          if (d) doAdren(s, seat);
        }
        s.stage = Stage.Slip;
        break;
      case Stage.Slip:
        if (canSlip(s, seat)) {
          const d = decide(plan.slip);
          if (d === null) return void (s.ask = 'slip');
          if (d) doSlip(s, seat);
        }
        s.stage = Stage.Corner;
        break;
      case Stage.Corner:
        corners(s, seat);
        s.stage = Stage.Discard;
        break;
      case Stage.Discard:
        if (plan.discard === 'ask') {
          if (hasDiscardable(c)) return void (s.ask = 'discard');
        } else discardCards(s, seat, plan.discard);
        s.stage = Stage.Refill;
        break;
      case Stage.Refill:
        refill(s, seat, c);
        s.stage = Stage.Done;
        break;
      case Stage.Done:
        s.at++;
        s.stage = Stage.Reveal;
        break;
    }
  }
}

// ---------- 出手 ----------

/** 现在轮到谁回答（只在亮牌以后、一次一辆车时有） */
export function current(s: State): number | null {
  return s.phase === 'act' && s.ask !== null ? (s.order[s.at] ?? null) : null;
}

/** 交计划阶段还没交的车 */
export function pending(s: State): number[] {
  return s.phase === 'plan' ? racing(s).filter((i) => s.cars[i]!.plan === null) : [];
}

/** 这辆车这回合能挂的挡：升降 1 挡免费，2 挡要引擎里有热量 */
export function gearOptions(c: Pick<Car, 'gear'> & { engine: number }): number[] {
  const out: number[] = [];
  for (let g = 1; g <= 4; g++) {
    const d = Math.abs(g - c.gear);
    if (d <= 1 || (d === 2 && c.engine > 0)) out.push(g);
  }
  return out;
}

function checkPlan(c: Car, a: Plan): string | null {
  if (!gearOptions({ gear: c.gear, engine: c.engine.length }).includes(a.gear)) return Math.abs(a.gear - c.gear) === 2 ? 'no_heat' : 'bad_gear';
  const usable = c.hand.filter((id) => playable(c.kinds[id]!));
  if (usable.length >= a.gear) {
    if (a.cards.length !== a.gear || new Set(a.cards).size !== a.cards.length) return 'bad_cards';
    if (!a.cards.every((id) => usable.includes(id))) return 'bad_cards';
  }
  if (a.discard !== 'ask') {
    if (new Set(a.discard).size !== a.discard.length) return 'bad_discard';
    if (!a.discard.every((id) => c.hand.includes(id) && discardable(c.kinds[id]!) && !a.cards.includes(id))) return 'bad_discard';
  }
  return null;
}

/** 做一步；不合法返回 { error }（固定短码，不带牌面），状态不变 */
export function apply(prev: State, seat: number, a: Action): State | { error: string } {
  if (prev.phase === 'over') return { error: 'race_over' };
  const c0 = prev.cars[seat];
  if (!c0 || c0.rank !== null) return { error: 'not_racing' };
  if (a.t === 'plan') {
    if (prev.phase !== 'plan') return { error: 'not_plan' };
    if (c0.plan !== null) return { error: 'planned' };
    const err = checkPlan(c0, a);
    if (err) return { error: err };
  } else {
    if (current(prev) !== seat) return { error: 'not_your_turn' };
    if (a.t !== prev.ask) return { error: 'not_asked' };
    if (a.t === 'discard') {
      if (new Set(a.cards).size !== a.cards.length) return { error: 'bad_discard' };
      if (!a.cards.every((id) => c0.hand.includes(id) && discardable(c0.kinds[id]!))) return { error: 'bad_discard' };
    }
  }
  const s = structuredClone(prev);
  s.events = [];
  s.n++;
  const c = s.cars[seat]!;
  switch (a.t) {
    case 'plan': {
      const usable = c.hand.filter((id) => playable(c.kinds[id]!));
      c.plan = {
        gear: a.gear,
        // 熄火（能打的不够这一挡）时交什么都一样，亮牌时自动打
        cards: usable.length >= a.gear ? [...a.cards] : [],
        boost: a.boost,
        adren: a.adren,
        slip: a.slip,
        discard: a.discard === 'ask' ? 'ask' : [...a.discard],
      };
      if (pending(s).length === 0) {
        s.phase = 'act';
        s.at = 0;
        s.stage = Stage.Reveal;
        advance(s);
      }
      return s;
    }
    case 'boost':
      if (a.yes) doBoost(s, seat);
      s.stage = Stage.Adren;
      break;
    case 'adren':
      if (a.yes) doAdren(s, seat);
      s.stage = Stage.Slip;
      break;
    case 'slip':
      if (a.yes) doSlip(s, seat);
      s.stage = Stage.Corner;
      break;
    case 'discard':
      discardCards(s, seat, a.cards);
      s.stage = Stage.Refill;
      break;
  }
  s.ask = null;
  advance(s);
  return s;
}

/** 回答"不"（超时、托管的兜底；交计划的超时由电脑替他选） */
export function decline(ask: Ask): Action {
  return ask === 'discard' ? { t: 'discard', cards: [] } : { t: ask, yes: false };
}

/** 座位换人（好友房里离座交给电脑、接管电脑座位） */
export function seated(prev: State, seat: number, kind: 'human' | 'ai'): State {
  if (prev.kinds[seat] === kind) return prev;
  const s = structuredClone(prev);
  s.kinds[seat] = kind;
  s.events = [];
  return s;
}

// ---------- 操作的形状 ----------

const PRES = new Set<unknown>(['ask', 'yes', 'no']);

function ids(x: unknown, max: number): number[] | null {
  if (!Array.isArray(x) || x.length > max) return null;
  for (const v of x) if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 999) return null;
  return x as number[];
}

/** 校验客户端发来的操作的形状；不合格返回 null */
export function parse(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  switch (o.t) {
    case 'plan': {
      const cards = ids(o.cards, 4);
      const gear = o.gear;
      if (!cards || typeof gear !== 'number' || !Number.isInteger(gear) || gear < 1 || gear > 4) return null;
      const pre = (x: unknown): Pre | null => (x === undefined ? 'ask' : PRES.has(x) ? (x as Pre) : null);
      const boost = pre(o.boost);
      const adren = pre(o.adren);
      const slip = pre(o.slip);
      const discard = o.discard === undefined || o.discard === 'ask' ? 'ask' : ids(o.discard, 20);
      if (!boost || !adren || !slip || !discard) return null;
      return { t: 'plan', gear, cards, boost, adren, slip, discard };
    }
    case 'boost':
    case 'adren':
    case 'slip':
      return typeof o.yes === 'boolean' ? { t: o.t, yes: o.yes } : null;
    case 'discard': {
      const cards = ids(o.cards, 20);
      return cards ? { t: 'discard', cards } : null;
    }
    default:
      return null;
  }
}

export type { Ev };
