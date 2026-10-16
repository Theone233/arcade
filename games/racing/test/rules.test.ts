import { describe, expect, it } from 'vitest';
import { HAND, HEAT, STRESS } from '../src/core/cards.ts';
import { apply, begin, checkOpts, crossedCorners, current, finishLine, parse, pending, seated, trackOf } from '../src/core/rules.ts';
import type { Action, Opts, Plan, State } from '../src/core/types.ts';
import { view } from '../src/core/view.ts';
import { getTrack } from '../src/track/index.ts';
import { keyOf, race, step } from './helpers.ts';

const OPTS: Opts = { track: 'lakeside', laps: 2, cars: 2, level: 'mix' };
const NO: Omit<Plan, 'gear' | 'cards'> = { boost: 'no', adren: 'no', slip: 'no', discard: [] };

/**
 * 摆一辆车：手牌、牌堆（最后一张最上面）、引擎热量、位置、挡位。kinds 整个重排，编号 = 手牌、牌堆、引擎依次往后。
 */
function setCar(s: State, seat: number, o: { hand?: number[]; deck?: number[]; engine?: number; pos?: number; lane?: number; gear?: number }): void {
  const c = s.cars[seat]!;
  const hand = o.hand ?? [1, 2, 3, 4, 1, 2, 3];
  const deck = o.deck ?? [1, 2, 3, 4, 1, 2, 3, 4];
  const engine = o.engine ?? 6;
  c.kinds = [...hand, ...deck, ...Array.from({ length: engine }, () => HEAT)];
  c.hand = hand.map((_, i) => i);
  c.deck = deck.map((_, i) => hand.length + i);
  c.engine = Array.from({ length: engine }, (_, i) => hand.length + deck.length + i);
  c.discard = [];
  c.play = [];
  if (o.pos !== undefined) c.pos = c.start = o.pos;
  if (o.lane !== undefined) c.lane = o.lane;
  if (o.gear !== undefined) c.gear = o.gear;
}

/** 摆好车以后按位置重排这一回合的顺序和拼劲（和规则里回合开始时一样） */
function reorder(s: State): State {
  s.order = s.cars
    .map((_, i) => i)
    .sort((a, b) => s.cars[b]!.pos - s.cars[a]!.pos || s.cars[a]!.lane - s.cars[b]!.lane || a - b);
  s.adren = s.order.slice(Math.max(0, s.order.length - (s.opts.cars >= 5 ? 2 : 1)));
  for (const c of s.cars) c.start = c.pos;
  return s;
}

/** 两辆车的空场：车 1 在后面（有拼劲） */
function duel(opts: Partial<Opts> = {}): State {
  const s = begin(keyOf(1), { ...OPTS, ...opts }, ['human', 'human'], [-1, -1]);
  setCar(s, 0, { pos: 0, lane: 0 });
  setCar(s, 1, { pos: -1, lane: 0 });
  return reorder(s);
}

function plan(s: State, seat: number, gear: number, cards: number[], extra: Partial<Plan> = {}): State {
  if (s.cars.every((c) => c.plan === null)) reorder(s);
  return step(s, seat, { t: 'plan', gear, cards, ...NO, ...extra });
}

function err(s: State, seat: number, a: Action): string {
  const r = apply(s, seat, a);
  return 'error' in r ? r.error : 'ok';
}

describe('开局', () => {
  it('每辆车起手 7 张，牌堆、引擎按赛道配', () => {
    const s = begin(keyOf(3), { ...OPTS, cars: 6 }, Array(6).fill('ai'), []);
    const t = trackOf(s);
    for (const c of s.cars) {
      expect(c.hand.length).toBe(HAND);
      expect(c.engine.length).toBe(t.heat);
      expect(c.hand.length + c.deck.length).toBe(12 + 3 + t.stress);
      expect(c.gear).toBe(1);
      expect(c.kinds.filter((k) => k === STRESS).length).toBe(t.stress);
    }
  });

  it('发车格各占一个车位，都在起终点线后面', () => {
    const s = begin(keyOf(4), { ...OPTS, cars: 6 }, Array(6).fill('ai'), []);
    const spots = new Set(s.cars.map((c) => `${c.pos}:${c.lane}`));
    expect(spots.size).toBe(6);
    for (const c of s.cars) expect(c.pos).toBeLessThan(0);
  });

  it('选项校验', () => {
    expect(checkOpts({ track: 'lakeside', laps: 2, cars: 4, level: 'hard' })).toEqual({ track: 'lakeside', laps: 2, cars: 4, level: 'hard' });
    expect(checkOpts({ track: 'nope', laps: 2, cars: 4, level: 'hard' })).toBeNull();
    expect(checkOpts({ track: 'lakeside', laps: 4, cars: 4, level: 'hard' })).toBeNull();
    expect(checkOpts({ track: 'lakeside', laps: 2, cars: 7, level: 'hard' })).toBeNull();
    expect(checkOpts({ track: 'lakeside', laps: 2, cars: 4, level: 'x' })).toBeNull();
  });
});

describe('交计划', () => {
  it('升降 1 挡免费，2 挡要热量，3 挡不行', () => {
    const s = duel();
    expect(err(s, 0, { t: 'plan', gear: 3, cards: [0, 1, 2], ...NO })).toBe('ok');
    expect(err(s, 0, { t: 'plan', gear: 4, cards: [0, 1, 2, 3], ...NO })).toBe('bad_gear');
    setCar(s, 0, { pos: 0, engine: 0 });
    expect(err(s, 0, { t: 'plan', gear: 3, cards: [0, 1, 2], ...NO })).toBe('no_heat');
    expect(err(s, 0, { t: 'plan', gear: 2, cards: [0, 1], ...NO })).toBe('ok');
  });

  it('张数要等于挡位，不能打热量，不能交两次', () => {
    const s = duel();
    setCar(s, 0, { pos: 0, hand: [1, 2, HEAT, 3, 4, 1, 2] });
    expect(err(s, 0, { t: 'plan', gear: 1, cards: [0, 1], ...NO })).toBe('bad_cards');
    expect(err(s, 0, { t: 'plan', gear: 1, cards: [2], ...NO })).toBe('bad_cards');
    expect(err(s, 0, { t: 'plan', gear: 2, cards: [0, 0], ...NO })).toBe('bad_cards');
    const s2 = plan(s, 0, 1, [0]);
    expect(err(s2, 0, { t: 'plan', gear: 1, cards: [1], ...NO })).toBe('planned');
  });

  it('预设弃牌不能弃热量、手抖、要打的牌', () => {
    const s = duel();
    setCar(s, 0, { pos: 0, hand: [1, 2, HEAT, STRESS, 4, 1, 2] });
    expect(err(s, 0, { t: 'plan', gear: 1, cards: [0], ...NO, discard: [2] })).toBe('bad_discard');
    expect(err(s, 0, { t: 'plan', gear: 1, cards: [0], ...NO, discard: [3] })).toBe('bad_discard');
    expect(err(s, 0, { t: 'plan', gear: 1, cards: [0], ...NO, discard: [0] })).toBe('bad_discard');
    expect(err(s, 0, { t: 'plan', gear: 1, cards: [0], ...NO, discard: [4, 5] })).toBe('ok');
  });

  it('都交了才亮牌，亮牌前别人看不到挡位和牌', () => {
    let s = duel();
    s = plan(s, 0, 2, [3, 2]);
    expect(s.phase).toBe('plan');
    expect(pending(s)).toEqual([1]);
    const other = view(s, 1);
    expect(other.cars[0]!.gear).toBe(1);
    expect(other.cars[0]!.play).toEqual([]);
    expect(other.cars[0]!.ready).toBe(true);
    expect(other.me!.plan).toBeNull();
    expect(view(s, 0).me!.plan!.gear).toBe(2);
  });
});

describe('移动', () => {
  it('正好走速度那么多格，跳 2 挡付 1 张热量', () => {
    let s = duel();
    // 环湖 49 → 61 之间没有弯道线（下一条在第二圈的 9，也就是 69）
    setCar(s, 0, { pos: 49, gear: 2, hand: [4, 4, 3, 1, 1, 1, 1] });
    s = plan(s, 0, 4, [0, 1, 2, 3]);
    s = plan(s, 1, 1, [0]);
    const c = s.cars[0]!;
    expect(c.pos).toBe(61);
    expect(c.gear).toBe(4);
    expect(c.stats.heat).toBe(1);
    expect(s.events).toContainEqual(expect.objectContaining({ e: 'reveal', seat: 0, from: 2, gear: 4, paid: 1, speed: 12 }));
  });

  it('内线有车停外线，两个都满了往后找', () => {
    const s = begin(keyOf(2), { ...OPTS, cars: 4 }, Array(4).fill('human'), []);
    setCar(s, 0, { pos: 5, lane: 0 });
    setCar(s, 1, { pos: 5, lane: 1 });
    setCar(s, 2, { pos: 4, lane: 0 });
    setCar(s, 3, { pos: 1, lane: 0, hand: [4, 1, 1, 1, 1, 1, 1] });
    let t = s;
    t = plan(t, 0, 1, [0]); // 0 走 1 到 6
    t = plan(t, 1, 1, [3]); // 1 走 4 到 9
    t = plan(t, 2, 1, [4]); // 2 走 1 到 5
    t = plan(t, 3, 1, [0]); // 3 想走 4 到 5：5 的内线被 2 占了，外线空
    expect(t.cars[2]!.pos).toBe(5);
    expect(t.cars[2]!.lane).toBe(0);
    expect(t.cars[3]!.pos).toBe(5);
    expect(t.cars[3]!.lane).toBe(1);
  });

  it('两个车位都满了退到后一格', () => {
    const s = begin(keyOf(2), { ...OPTS, cars: 3 }, Array(3).fill('human'), []);
    setCar(s, 0, { pos: 8, lane: 0, hand: [1, 1, 1, 1, 1, 1, 1] });
    setCar(s, 1, { pos: 8, lane: 1, hand: [1, 1, 1, 1, 1, 1, 1] });
    setCar(s, 2, { pos: 5, lane: 0, hand: [3, 1, 1, 1, 1, 1, 1] });
    let t = s;
    // 前两辆都挂 1 挡打 0：设成 0 点
    t.cars[0]!.kinds[0] = 0;
    t.cars[1]!.kinds[0] = 0;
    t = plan(t, 0, 1, [0]);
    t = plan(t, 1, 1, [0]);
    t = plan(t, 2, 1, [0]);
    expect(t.cars[2]!.pos).toBe(7);
    expect(t.cars[2]!.lane).toBe(0);
  });

  it('手抖牌往下翻，翻到 1–4 才算，改装牌和热量进弃牌堆', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [STRESS, 1, 1, 1, 1, 1, 1], deck: [1, 1, 1, 3, 5, HEAT] });
    s = plan(s, 0, 1, [0]);
    s = plan(s, 1, 1, [0]);
    const ev = s.events.find((e) => e.e === 'reveal' && e.seat === 0);
    expect(ev).toMatchObject({ flips: [[HEAT, 5, 3]], speed: 3 });
    expect(s.cars[0]!.pos).toBe(3);
  });

  it('牌堆空了把弃牌堆洗进来，打在桌上的不洗', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [STRESS, 1, 1, 1, 1, 1, 1], deck: [HEAT] });
    const c = s.cars[0]!;
    // 弃牌堆里放一张 2
    c.kinds.push(2);
    c.discard = [c.kinds.length - 1];
    s = plan(s, 0, 1, [0]);
    s = plan(s, 1, 1, [0]);
    // 热量先翻进弃牌堆，再和那张 2 一起洗回来：最后翻到的一定是 2
    const ev = s.events.find((e) => e.e === 'reveal' && e.seat === 0);
    expect(ev).toMatchObject({ speed: 2 });
    expect(ev && ev.e === 'reveal' && ev.flips[0]!.at(-1)).toBe(2);
    expect(s.cars[0]!.shuffles).toBeGreaterThanOrEqual(1);
  });

  it('牌堆、弃牌堆都没有速度牌：手抖算 0，不会死循环', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [STRESS, 1, 1, 1, 1, 1, 1], deck: [HEAT, 0, 5] });
    s = plan(s, 0, 1, [0]);
    s = plan(s, 1, 1, [0]);
    expect(s.events.find((e) => e.e === 'reveal' && e.seat === 0)).toMatchObject({ speed: 0 });
  });
});

describe('熄火', () => {
  it('能打的不够这一挡：车不动、挂回 1 挡，热量顶上进弃牌堆', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, gear: 2, hand: [3, HEAT, HEAT, HEAT, HEAT, HEAT, HEAT] });
    s = plan(s, 0, 2, []);
    s = plan(s, 1, 1, [0]);
    const c = s.cars[0]!;
    expect(c.pos).toBe(0);
    expect(c.gear).toBe(1);
    expect(c.stats.stalls).toBe(1);
    expect(c.hand.filter((id) => c.kinds[id] === HEAT).length + c.discard.filter((id) => c.kinds[id] === HEAT).length).toBe(6);
    expect(s.events.some((e) => e.e === 'stall' && e.seat === 0)).toBe(true);
  });
});

describe('反应', () => {
  it('1 挡散热 3 张、2 挡 1 张', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [1, HEAT, HEAT, HEAT, HEAT, 1, 1], engine: 2 });
    s = plan(s, 0, 1, [0]);
    s = plan(s, 1, 1, [0]);
    expect(s.cars[0]!.engine.length).toBe(5);
    expect(s.events).toContainEqual({ e: 'cool', seat: 0, n: 3 });
  });

  it('冲刺：付 1 热量、翻一张加到速度上，问了再答', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [2, 1, 1, 1, 1, 1, 1], deck: [1, 1, 1, 1, 1, 1, 1, 4], engine: 3 });
    s = plan(s, 0, 1, [0], { boost: 'ask' });
    s = plan(s, 1, 1, [0]);
    expect(current(s)).toBe(0);
    expect(s.ask).toBe('boost');
    expect(err(s, 1, { t: 'boost', yes: true })).toBe('not_your_turn');
    expect(err(s, 0, { t: 'slip', yes: true })).toBe('not_asked');
    s = step(s, 0, { t: 'boost', yes: true });
    const c = s.cars[0]!;
    expect(c.pos).toBe(6);
    expect(s.events).toContainEqual({ e: 'boost', seat: 0, flips: [4], value: 4 });
    expect(c.engine.length).toBe(2);
    expect(c.stats.boosts).toBe(1);
  });

  it('拼劲：4 辆车以下最后一辆，5 辆以上最后两辆', () => {
    const four = begin(keyOf(5), { ...OPTS, cars: 4 }, Array(4).fill('ai'), []);
    expect(four.adren).toEqual([four.order[3]]);
    const five = begin(keyOf(5), { ...OPTS, cars: 5 }, Array(5).fill('ai'), []);
    expect(five.adren).toEqual(five.order.slice(3));
  });

  it('拼劲多走 1 格、速度也加 1', () => {
    let s = duel();
    // 车 1 在后面，有拼劲
    setCar(s, 1, { pos: -1, hand: [3, 1, 1, 1, 1, 1, 1] });
    s = plan(s, 0, 1, [1]);
    s = plan(s, 1, 1, [0], { adren: 'yes' });
    expect(s.cars[1]!.pos).toBe(3);
    expect(s.events).toContainEqual(expect.objectContaining({ e: 'move', seat: 1, to: 3, why: 'adren' }));
  });

  it('尾流：停在别人旁边或正后方一格可以再走 2 格，不算速度', () => {
    let s = duel();
    setCar(s, 0, { pos: 10, hand: [1, 1, 1, 1, 1, 1, 1] });
    setCar(s, 1, { pos: 5, hand: [4, 1, 1, 1, 1, 1, 1] });
    s = plan(s, 0, 1, [0]); // 0 到 11
    s = plan(s, 1, 1, [0], { slip: 'yes' }); // 1 到 9，后面隔一格不算……
    expect(s.cars[1]!.pos).toBe(9);
    let t = duel();
    setCar(t, 0, { pos: 10, hand: [1, 1, 1, 1, 1, 1, 1] });
    setCar(t, 1, { pos: 6, hand: [4, 1, 1, 1, 1, 1, 1] });
    t = plan(t, 0, 1, [0]); // 0 到 11
    t = plan(t, 1, 1, [0], { slip: 'yes' }); // 1 到 10，正后方一格，吸到 12
    expect(t.cars[1]!.pos).toBe(12);
    expect(t.events).toContainEqual(expect.objectContaining({ e: 'move', seat: 1, to: 12, why: 'slip' }));
    expect(t.cars[1]!.stats.slips).toBe(1);
  });
});

describe('过弯', () => {
  const t = getTrack('lakeside')!;
  const c0 = t.corners[0]!;

  it('跨过的弯道线按圈算，终点线以后的不算', () => {
    expect(crossedCorners(t, 120, c0.at - 1, c0.at)).toEqual([{ line: c0.at, limit: c0.limit }]);
    expect(crossedCorners(t, 120, c0.at, c0.at + 1)).toEqual([]);
    expect(crossedCorners(t, 120, t.spaces + c0.at - 1, t.spaces + c0.at)).toEqual([{ line: t.spaces + c0.at, limit: c0.limit }]);
    expect(crossedCorners(t, t.spaces, t.spaces + c0.at - 1, t.spaces + c0.at)).toEqual([]);
  });

  it('刚好等于限速不付，超了几格付几张', () => {
    let s = duel();
    const v = c0.limit;
    setCar(s, 0, { pos: c0.at - 1, hand: [v, v + 2 <= 4 ? v + 2 : 4, 1, 1, 1, 1, 1] });
    s = plan(s, 0, 1, [0]);
    s = plan(s, 1, 1, [0]);
    expect(s.events).toContainEqual({ e: 'corner', seat: 0, line: c0.at, limit: c0.limit, speed: v, paid: 0 });
    let u = duel();
    setCar(u, 0, { pos: c0.at - 1, gear: 2, hand: [4, 4, 1, 1, 1, 1, 1], engine: 6 });
    u = plan(u, 0, 2, [0, 1]);
    u = plan(u, 1, 1, [0]);
    expect(u.events).toContainEqual({ e: 'corner', seat: 0, line: c0.at, limit: c0.limit, speed: 8, paid: 8 - c0.limit });
    expect(u.cars[0]!.engine.length).toBe(6 - (8 - c0.limit));
  });

  it('付不起就打滑：热量全付、退回弯前、3 挡以上拿 2 张手抖、挂回 1 挡', () => {
    let s = duel();
    setCar(s, 0, { pos: c0.at - 2, gear: 3, hand: [4, 4, 4, 1, 1, 1, 1], engine: 2 });
    s = plan(s, 0, 3, [0, 1, 2]);
    s = plan(s, 1, 1, [0]);
    const c = s.cars[0]!;
    expect(c.stats.spins).toBe(1);
    expect(c.pos).toBe(c0.at - 1);
    expect(c.gear).toBe(1);
    expect(c.engine.length).toBe(0);
    expect(c.hand.filter((id) => c.kinds[id] === STRESS).length).toBeGreaterThanOrEqual(2);
    expect(s.events).toContainEqual({ e: 'spin', seat: 0, line: c0.at, stress: 2 });
  });

  it('一回合跨两个弯：按先后各付各的，第二个付不起在第二个弯前打滑', () => {
    const s0 = duel();
    const tr = trackOf(s0);
    // 找两个隔得近的弯
    const a = tr.corners[0]!;
    const b = tr.corners[1]!;
    const speed = b.at - a.at + 2;
    if (speed > 16) return;
    let s = s0;
    const cards = [4, 4, 4, 4];
    let need = speed;
    const hand: number[] = [];
    for (const x of cards) {
      const v = Math.min(x, need - (cards.length - hand.length - 1));
      hand.push(Math.max(1, v));
      need -= Math.max(1, v);
    }
    setCar(s, 0, { pos: a.at - 1, gear: 4, hand: [...hand, 1, 1, 1], engine: Math.max(0, speed - a.limit) });
    const total = hand.reduce((x, y) => x + y, 0);
    s = plan(s, 0, 4, [0, 1, 2, 3]);
    s = plan(s, 1, 1, [0]);
    const ev = s.events.filter((e) => e.e === 'corner' && e.seat === 0);
    expect(ev[0]).toMatchObject({ line: a.at, paid: Math.max(0, total - a.limit) });
    if (total > b.limit && a.at - 1 + total >= b.at) {
      expect(s.cars[0]!.stats.spins).toBe(1);
      expect(s.cars[0]!.pos).toBeLessThan(b.at);
    }
  });
});

describe('弃牌和补牌', () => {
  it('问弃牌时只能弃速度牌、改装牌；补到 7 张', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [1, 2, HEAT, STRESS, 4, 0, 5] });
    s = plan(s, 0, 1, [0], { discard: 'ask' });
    s = plan(s, 1, 1, [0]);
    // 1 挡散热把那张热量收回引擎了
    expect(s.ask).toBe('discard');
    expect(err(s, 0, { t: 'discard', cards: [3] })).toBe('bad_discard');
    s = step(s, 0, { t: 'discard', cards: [5, 6] });
    const c = s.cars[0]!;
    expect(c.hand.length).toBe(HAND);
    expect(c.hand).not.toContain(5);
    expect(c.hand).not.toContain(6);
  });
});

describe('冲线', () => {
  it('同一回合冲线：过线越远越前，同一格内线在前', () => {
    const s = begin(keyOf(6), { ...OPTS, laps: 1, cars: 3 }, Array(3).fill('ai'), []);
    const f = finishLine(s);
    setCar(s, 0, { pos: f - 1, lane: 0, hand: [1, 1, 1, 1, 1, 1, 1] });
    setCar(s, 1, { pos: f - 1, lane: 1, hand: [2, 1, 1, 1, 1, 1, 1] });
    setCar(s, 2, { pos: f - 2, lane: 0, hand: [2, 1, 1, 1, 1, 1, 1] });
    let t = s;
    t = plan(t, 0, 1, [0]); // f
    t = plan(t, 1, 1, [0]); // f + 1
    t = plan(t, 2, 1, [0]); // f
    expect(t.finished).toEqual([1, 0, 2]);
    expect(t.phase).toBe('over');
  });

  it('真人都冲线了，剩下的电脑按位置排名次', () => {
    const s = begin(keyOf(7), { ...OPTS, laps: 1, cars: 3 }, ['human', 'ai', 'ai'], [-1, 0, 1]);
    const f = finishLine(s);
    setCar(s, 0, { pos: f - 1, hand: [4, 1, 1, 1, 1, 1, 1] });
    setCar(s, 1, { pos: 3, hand: [1, 1, 1, 1, 1, 1, 1] });
    setCar(s, 2, { pos: 9, hand: [1, 1, 1, 1, 1, 1, 1] });
    let t = s;
    t = plan(t, 0, 1, [0]);
    t = plan(t, 1, 1, [0]);
    t = plan(t, 2, 1, [0]);
    expect(t.phase).toBe('over');
    expect(t.finished).toEqual([0, 2, 1]);
  });

  it('离座的真人交给电脑：不再算真人', () => {
    const s = begin(keyOf(7), OPTS, ['human', 'ai'], [-1, 0]);
    expect(seated(s, 0, 'ai').kinds).toEqual(['ai', 'ai']);
    expect(seated(s, 0, 'human')).toBe(s);
  });
});

describe('纯函数和确定性', () => {
  it('apply 不改传进来的状态', () => {
    const s = duel();
    const before = JSON.stringify(s);
    plan(s, 0, 1, [0]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('同一把密钥、同一串操作，结果完全一样', () => {
    const opts: Opts = { track: 'hillcity', laps: 1, cars: 6, level: 'mix' };
    const a = race(11, opts, [0, 1, 2, 3, 4, 5]);
    const b = race(11, opts, [0, 1, 2, 3, 4, 5]);
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
    const c = race(12, opts, [0, 1, 2, 3, 4, 5]);
    expect(JSON.stringify(c.s)).not.toBe(JSON.stringify(a.s));
  });

  it('全电脑跑完：每辆车牌的总数守恒，名次齐全', () => {
    for (const track of ['lakeside', 'hillcity', 'harbor']) {
      const opts: Opts = { track, laps: 2, cars: 6, level: 'mix' };
      race(21, opts, [0, 1, 2, 3, 4, 5], 5_000, (s) => {
        for (const c of s.cars) {
          const all = [...c.deck, ...c.discard, ...c.hand, ...c.engine, ...c.play].sort((x, y) => x - y);
          expect(all).toEqual(c.kinds.map((_, i) => i));
        }
      });
      const { s } = race(22, opts, [0, 1, 2, 3, 4, 5]);
      expect(s.finished.slice().sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

describe('视图', () => {
  it('不带密钥、别人的手牌、任何人的牌堆顺序', () => {
    const s = begin(keyOf(8), { ...OPTS, cars: 4 }, Array(4).fill('human'), []);
    for (const seat of [null, 0, 1, 2, 3]) {
      const v = view(s, seat);
      const text = JSON.stringify(v);
      expect(text).not.toContain('"key"');
      expect(text).not.toContain('"kinds"');
      expect(text).not.toContain('"deck":[');
      if (seat === null) expect(v.me).toBeNull();
      else {
        expect(v.me!.hand.length).toBe(HAND);
        const mine = s.cars[seat]!.hand.slice().sort((a, b) => a - b);
        expect(v.me!.hand.map((h) => h.id).sort((a, b) => a - b)).toEqual(mine);
      }
    }
  });

  it('自己的弃牌堆只在自己的视图里，别人只看得到最上面一张', () => {
    let s = duel();
    setCar(s, 0, { pos: 0, hand: [1, 2, 3, 4, 1, 2, 3] });
    s = plan(s, 0, 1, [0], { discard: [1, 2] });
    s = plan(s, 1, 1, [0]);
    const mine = view(s, 0).me!.discard;
    expect(mine.length).toBe(s.cars[0]!.discard.length);
    expect(mine).toEqual(s.cars[0]!.discard.map((id) => s.cars[0]!.kinds[id]));
    const theirs = view(s, 1);
    expect(theirs.cars[0]!.discardTop).toBe(mine.at(-1));
    expect(JSON.stringify(theirs)).not.toContain(JSON.stringify(mine));
  });

  it('自己的牌堆加弃牌堆的成分对得上', () => {
    const s = begin(keyOf(9), OPTS, ['human', 'human'], []);
    const v = view(s, 0);
    const total = v.me!.pool.reduce((a, b) => a + b, 0);
    expect(total).toBe(s.cars[0]!.deck.length);
  });
});

describe('操作的形状', () => {
  it('parse', () => {
    expect(parse({ t: 'plan', gear: 2, cards: [1, 2] })).toEqual({ t: 'plan', gear: 2, cards: [1, 2], boost: 'ask', adren: 'ask', slip: 'ask', discard: 'ask' });
    expect(parse({ t: 'plan', gear: 5, cards: [] })).toBeNull();
    expect(parse({ t: 'plan', gear: 2, cards: [1, 2], boost: 'maybe' })).toBeNull();
    expect(parse({ t: 'plan', gear: 2, cards: [1, 2, 3, 4, 5] })).toBeNull();
    expect(parse({ t: 'boost', yes: 1 })).toBeNull();
    expect(parse({ t: 'slip', yes: false })).toEqual({ t: 'slip', yes: false });
    expect(parse({ t: 'discard', cards: [1.5] })).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse([1])).toBeNull();
  });
});
