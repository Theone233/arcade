/**
 * 规则核心的类型（DESIGN.md 2、4 节）。状态只在服务端（单机时在浏览器自己手里）；别人看到的是 view.ts 按座位过滤过的视图。
 */
import type { Entropy } from 'arcade-kit/rng';

/** 轮到自己时的预设：问我 / 要 / 不要（DESIGN.md 2.7） */
export type Pre = 'ask' | 'yes' | 'no';

/** 同时选挡出牌时交的（暗选，亮牌前谁也看不到） */
export interface Plan {
  gear: number;
  /** 打出去的牌（自己的牌编号） */
  cards: number[];
  boost: Pre;
  adren: Pre;
  slip: Pre;
  /** 'ask' 轮到时问；数组是要弃的牌（打完以后还在手里的才弃），空数组就是不弃 */
  discard: 'ask' | number[];
}

/** 亮牌以后一次一辆车要回答的 */
export type Ask = 'boost' | 'adren' | 'slip' | 'discard';

export type Action =
  | ({ t: 'plan' } & Plan)
  | { t: 'boost'; yes: boolean }
  | { t: 'adren'; yes: boolean }
  | { t: 'slip'; yes: boolean }
  | { t: 'discard'; cards: number[] };

export interface Stats {
  /** 打滑几次 */
  spins: number;
  /** 冲刺几次 */
  boosts: number;
  /** 吸尾流几次 */
  slips: number;
  /** 熄火几次 */
  stalls: number;
  /** 一共付了几张热量（跳挡、冲刺、超速、打滑） */
  heat: number;
  /** 一场里单回合的最高速度 */
  top: number;
}

export interface Car {
  /** 牌编号 → 种类（cards.ts）。打滑拿的手抖牌接在后面 */
  kinds: number[];
  /** 牌堆，最后一张是最上面 */
  deck: number[];
  /** 弃牌堆，最后一张是最上面（公开） */
  discard: number[];
  hand: number[];
  /** 引擎里的热量（公开张数） */
  engine: number[];
  /** 这一回合打在桌上的（含手抖、冲刺翻出来算数的速度牌） */
  play: number[];
  /** 洗过几次牌（随机流的序号） */
  shuffles: number;
  gear: number;
  pos: number;
  /** 0 内线、1 外线 */
  lane: number;
  /** 冲线名次（0 起）；还在跑是 null */
  rank: number | null;
  /** 这一回合交的；没交是 null */
  plan: Plan | null;
  /** 这一回合亮过牌了 */
  shown: boolean;
  /** 这一回合开始时在哪（算跨过了哪些弯道线） */
  start: number;
  /** 这一回合的速度（过弯比的就是它；含冲刺、拼劲，不含尾流） */
  speed: number;
  stalled: boolean;
  spun: boolean;
  boosted: boolean;
  /** 用了拼劲多走 1 格 */
  extra: boolean;
  slipped: boolean;
  stats: Stats;
}

/** 电脑强弱：新手 / 普通 / 老手 / 混着来（ai/personas.ts） */
export type Level = 'easy' | 'normal' | 'hard' | 'mix';
export const LEVELS: readonly Level[] = ['easy', 'normal', 'hard', 'mix'];

export interface Opts {
  /** 赛道 id（track/index.ts） */
  track: string;
  /** 1–3 */
  laps: number;
  /** 几辆车 2–6 */
  cars: number;
  /** 电脑强弱（只影响开局挑哪些性格） */
  level: Level;
}

/** 每辆车亮牌以后依次走的几步（DESIGN.md 2.2 第 2–8 步） */
export const Stage = {
  Reveal: 0,
  Boost: 1,
  Adren: 2,
  Slip: 3,
  Corner: 4,
  Discard: 5,
  Refill: 6,
  Done: 7,
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

export type Phase = 'plan' | 'act' | 'over';

export type Ev =
  /** 亮牌：换了挡（跳挡付了几张热量）、打出的牌、手抖翻出来的（每张手抖一串，最后一张算数）、速度 */
  | { e: 'reveal'; seat: number; from: number; gear: number; paid: number; cards: number[]; flips: number[][]; speed: number }
  /** 熄火：能打的不够这一挡，车不动、挂回 1 挡 */
  | { e: 'stall'; seat: number; from: number; gear: number; paid: number; cards: number[] }
  | { e: 'move'; seat: number; from: number; to: number; lane: number; why: 'cards' | 'boost' | 'adren' | 'slip' | 'spin' }
  | { e: 'cool'; seat: number; n: number }
  | { e: 'boost'; seat: number; flips: number[]; value: number }
  /** 过一条弯道线：line 是绝对格数，付了几张热量 */
  | { e: 'corner'; seat: number; line: number; limit: number; speed: number; paid: number }
  | { e: 'spin'; seat: number; line: number; stress: number }
  | { e: 'discard'; seat: number; n: number }
  | { e: 'finish'; seat: number; rank: number }
  | { e: 'round'; round: number };

export interface State {
  /** 规则版本 */
  v: number;
  /** 随机数密钥（只在服务端，view 绝不带） */
  key: Entropy;
  opts: Opts;
  /** 座位上是真人还是电脑（开局时定；离座、接管时 seated 改） */
  kinds: ('human' | 'ai')[];
  /** 电脑性格（ai/personas.ts 的下标）；真人是 -1 */
  personas: number[];
  /**
   * 每个座位这一场的状态（开局用 stream(key, 'form') 抽）：[冲劲 −100–100，手感 −100–100，抖动种子]。
   * 电脑据此在性格上浮动（这场冲、下场稳），只下发给自己（view 的 me.form）；离座交给电脑的座位也用得上
   */
  form: number[][];
  round: number;
  phase: Phase;
  cars: Car[];
  /** 这一回合依次走的顺序（回合开始时从前往后排） */
  order: number[];
  /** 轮到 order 里第几辆 */
  at: number;
  /** 当前这辆车走到第几步 */
  stage: Stage;
  /** 在等当前这辆车回答什么；不在等是 null */
  ask: Ask | null;
  /** 这一回合有拼劲的车 */
  adren: number[];
  /** 冲线的先后 */
  finished: number[];
  /** 这一步发生的事（画面按它放动画） */
  events: Ev[];
  /** 步数：每 apply 一次加 1 */
  n: number;
}
