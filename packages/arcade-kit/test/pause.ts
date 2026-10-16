/**
 * 测 0.5.0 的"停一会儿再接着来"（RoomGame.pause / resume）用的小游戏"歇一下的比大小"：规则和 worker.ts 的比大小一样
 * （每人 3 张、轮流出一张），只是每出满一圈（4 张）停 3 秒给大家看清，到点由房间 resume 发下一圈，下一圈从下一家开始。
 * 负数的牌是不轮流的操作，用来在测试里拨动状态（规则仍是纯函数）。只在测试里用，不部署。
 * 不从 worker.ts 引 toyGame：worker.ts 要转出这里的房间类，互相引用时模块求值顺序会出问题。
 */
import type { RoomGame } from '../src/game.ts';
import { shuffle, stream } from '../src/rng.ts';
import { DEFAULT_LIMITS, GameRoom, type RoomLimits } from '../src/room.ts';

export const REST_MS = 3_000;

/** 不轮流的操作（牌面是负数） */
export const PAUSE_ACT = {
  /** 打个招呼：只记个数 */
  wave: -1,
  /** 让 resume 抛错 */
  breakThrow: -2,
  /** 让 resume 返回的还在停 */
  breakStay: -3,
  /** 修好 resume */
  fix: -4,
  /** 进入"等外面的事"（waiting） */
  nap: -5,
  /** 从等外面的事直接进入停顿 */
  restNow: -6,
  /** 偷看一眼：只改自己的视图，别人什么都看不出来（0.7.1 不广播） */
  peek: -7,
} as const;

export interface PauseState {
  hands: number[][];
  played: { seat: number; card: number }[];
  turn: number;
  /** 在停（一圈出完） */
  rest: boolean;
  napping: boolean;
  broken: 'throw' | 'stay' | null;
  waves: number;
  rules: number;
  /** 每个座位偷看了几次（只给本人看） */
  peeks?: number[];
}
export type PauseAction = { card: number };
export interface PauseView {
  mine: number[] | null;
  counts: number[];
  played: { seat: number; card: number }[];
  turn: number;
  rest: boolean;
  waves: number;
  /** 我偷看了几次（没入座的是 0） */
  peeked: number;
}
export interface PauseOpts {
  /** 开局先停一下（测"开局状态就是停顿"） */
  restFirst: boolean;
}

const done = (s: PauseState) => s.hands.every((h) => h.length === 0);

export const pauseGame: RoomGame<PauseState, PauseAction, PauseView, PauseOpts> = {
  seats: 4,
  rulesVersion: 1,
  options: (raw) => ({ restFirst: (raw as { restFirst?: unknown } | null | undefined)?.restFirst === true }),
  begin: (entropy, rules, setup) => {
    const deck = shuffle(Array.from({ length: 99 }, (_, i) => i + 1), stream(entropy, 'deal', 0));
    return {
      hands: Array.from({ length: 4 }, (_, s) => deck.slice(s * 3, s * 3 + 3)),
      played: [], turn: 0, rest: setup?.opts?.restFirst === true, napping: false, broken: null, waves: 0, rules,
    };
  },
  start: () => {
    throw new Error('pause game uses begin');
  },
  parse: (raw) => {
    const r = raw as { card?: unknown } | null;
    return r && typeof r === 'object' && typeof r.card === 'number' && Number.isInteger(r.card) ? { card: r.card } : null;
  },
  free: (a) => a.card < 0,
  apply: (s, seat, a) => {
    switch (a.card) {
      case PAUSE_ACT.wave:
        return { ...s, waves: s.waves + 1 };
      case PAUSE_ACT.breakThrow:
        return { ...s, broken: 'throw' };
      case PAUSE_ACT.breakStay:
        return { ...s, broken: 'stay' };
      case PAUSE_ACT.fix:
        return { ...s, broken: null };
      case PAUSE_ACT.nap:
        return { ...s, napping: true };
      case PAUSE_ACT.restNow:
        return { ...s, napping: false, rest: true };
      case PAUSE_ACT.peek:
        return { ...s, peeks: [0, 1, 2, 3].map((i) => (s.peeks?.[i] ?? 0) + (i === seat ? 1 : 0)) };
    }
    if (s.rest || s.napping || s.turn !== seat) return { error: 'not_your_turn' };
    const hand = s.hands[seat]!;
    const i = hand.indexOf(a.card);
    if (i < 0) return { error: 'no_such_card' };
    const hands = s.hands.map((h, k) => (k === seat ? h.filter((_, j) => j !== i) : h));
    const played = [...s.played, { seat, card: a.card }];
    const next = { ...s, hands, played, turn: (s.turn + 1) % 4 };
    return { ...next, rest: played.length % 4 === 0 && !done(next) };
  },
  turn: (s) => (s.rest || s.napping || done(s) ? null : s.turn),
  waiting: (s) => s.napping,
  pause: (s) => (s.rest ? REST_MS : null),
  resume: (s) => {
    if (s.broken === 'throw') throw new Error('resume broken');
    if (s.broken === 'stay') return { ...s };
    // 下一圈从下一家开始：第二圈先轮到电脑，测"停完电脑接着出"
    return { ...s, rest: false, turn: (s.played.length / 4) % 4 };
  },
  view: (s, seat) => ({
    mine: seat === null ? null : s.hands[seat]!, counts: s.hands.map((h) => h.length), played: s.played, turn: s.turn, rest: s.rest, waves: s.waves,
    peeked: seat === null ? 0 : (s.peeks?.[seat] ?? 0),
  }),
  ai: (s, seat) => ({ card: Math.min(...s.hands[seat]!) }),
  over: done,
};

export class PauseRoom extends GameRoom<PauseState, PauseAction, PauseView, unknown, PauseOpts> {
  protected readonly game = pauseGame;
  protected override readonly limits: RoomLimits = { ...DEFAULT_LIMITS, minClientVersion: 1 };
}

/** 写了 pause 没写 resume：房间当作没有停顿，和 0.4.0 一样（一圈出完没人能出手，按出错当打完） */
export const noResumeGame: RoomGame<PauseState, PauseAction, PauseView, PauseOpts> = { ...pauseGame, resume: undefined };

export class NoResumeRoom extends GameRoom<PauseState, PauseAction, PauseView, unknown, PauseOpts> {
  protected readonly game = noResumeGame;
  protected override readonly limits: RoomLimits = { ...DEFAULT_LIMITS, minClientVersion: 1 };
}
