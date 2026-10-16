/**
 * 好友房的规则（DESIGN.md 第 6 节）：把规则核心包成 arcade-kit 的 RoomGame，浏览器和房间共用。
 * - 交计划阶段是"一组人同时出手"（actors + group），亮牌以后一次一辆车；
 * - 电脑和托管的座位由 kit 马上用 ai() 代出；超时：交计划由电脑替他选，冲刺、尾流这些按"不"；
 * - 一场跑完不马上关：停 3 分钟（kit 的 pause）等人点"再来一场"，点的人用同样的选项开个新房间，把房间号发回来（{ t: 'next' }），别人跟过去。
 * 娱乐模式，不碰钱包（DESIGN.md 第 7 节）。
 */
import type { RoomGame, RoomSetup } from 'arcade-kit/game';
import { stream, type Entropy } from 'arcade-kit/rng';
import { decide } from '../ai/index.ts';
import { pickPersonas } from '../ai/personas.ts';
import { apply as applyCore, begin, checkOpts, current, decline, MAX_CARS, parse as parseCore, pending, RULES_VERSION, seated as seatedCore } from '../core/rules.ts';
import type { Action, Opts, State } from '../core/types.ts';
import { view as viewCore, type View } from '../core/view.ts';
import { EMOTES } from '../game/emotes.ts';

export type RoomOpts = Opts;

export interface RoomState {
  g: State;
  /** 有人开了新房间：房间号和谁开的 */
  next: { code: string; by: number } | null;
  /** 跑完以后等了 3 分钟没人点"再来一场" */
  ended: boolean;
}

export type RoomAction = { t: 'play'; a: Action } | { t: 'next'; code: string };

export interface RoomView {
  g: View;
  next: { code: string; by: number } | null;
  done: boolean;
}

/** 交计划 45 秒，亮牌以后的问题 15 秒 */
export const TURN_MS = { plan: 45_000, ask: 15_000 } as const;
/** 跑完等"再来一场"多久 */
export const REMATCH_MS = 3 * 60_000;
/** 电脑每一帧在页面上停多久（kit 给每帧的播放时间） */
export const AI_DELAY_MS = 700;

function over(s: RoomState): boolean {
  return s.ended || s.next !== null;
}

export const racingRoom: RoomGame<RoomState, RoomAction, RoomView, RoomOpts> = {
  seats: MAX_CARS,
  rulesVersion: RULES_VERSION,
  emotes: EMOTES,

  options(raw) {
    return checkOpts(raw);
  },

  seatCount(opts) {
    return opts?.cars ?? MAX_CARS;
  },

  begin(entropy: Entropy, _rv: number, setup?: RoomSetup<RoomOpts>): RoomState {
    const opts = setup?.opts ?? { track: 'lakeside', laps: 2, cars: MAX_CARS, level: 'mix' };
    const kinds = Array.from({ length: opts.cars }, (_, i): 'human' | 'ai' => (setup?.seats[i] === 'human' ? 'human' : 'ai'));
    const bots = kinds.filter((k) => k === 'ai').length;
    const picks = pickPersonas(stream(entropy, 'persona'), opts.level, bots);
    let k = 0;
    const personas = kinds.map((kind) => (kind === 'ai' ? picks[k++]! : -1));
    return { g: begin(entropy, opts, kinds, personas), next: null, ended: false };
  },

  start(): RoomState {
    throw new Error('racing rooms use begin');
  },

  parse(raw): RoomAction | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (o.t === 'next') return typeof o.code === 'string' && /^\d{6}$/.test(o.code) ? { t: 'next', code: o.code } : null;
    if (o.t !== 'play') return null;
    const a = parseCore(o.a);
    return a ? { t: 'play', a } : null;
  },

  apply(s, seat, a) {
    if (a.t === 'next') {
      if (s.g.phase !== 'over' || over(s)) return { error: 'not_over' };
      if (s.g.kinds[seat] !== 'human') return { error: 'not_seated' };
      return { ...s, next: { code: a.code, by: seat } };
    }
    if (over(s)) return { error: 'race_over' };
    const r = applyCore(s.g, seat, a.a);
    return 'error' in r ? r : { ...s, g: r };
  },

  turn(s) {
    return over(s) ? null : current(s.g);
  },

  actors(s) {
    const g = s.g;
    if (over(s) || g.phase === 'over') return [];
    if (g.phase === 'plan') return { seats: pending(g), group: `plan-${g.round}` };
    const c = current(g);
    return c === null ? [] : { seats: [c], group: `act-${g.round}-${g.at}-${g.stage}` };
  },

  turnMs(s) {
    return s.g.phase === 'plan' ? TURN_MS.plan : TURN_MS.ask;
  },

  view(s, seat): RoomView {
    return { g: viewCore(s.g, seat), next: s.next, done: over(s) };
  },

  ai(s, seat): RoomAction {
    return { t: 'play', a: decide(viewCore(s.g, seat), seat) };
  },

  timeout(s, seat): RoomAction {
    if (s.g.phase === 'plan') return { t: 'play', a: decide(viewCore(s.g, seat), seat) };
    return { t: 'play', a: decline(s.g.ask ?? 'discard') };
  },

  over,

  breakPoint(s) {
    return s.g.phase === 'over' || (s.g.phase === 'plan' && s.g.cars.every((c) => c.plan === null));
  },

  seated(s, seat, kind) {
    const g = seatedCore(s.g, seat, kind);
    return g === s.g ? s : { ...s, g };
  },

  free(a) {
    return a.t === 'next';
  },

  pause(s) {
    return s.g.phase === 'over' && !over(s) ? REMATCH_MS : null;
  },

  resume(s) {
    return { ...s, ended: true };
  },
};
