/**
 * 单机（DESIGN.md 4、5 节）：在浏览器里对三个电脑打一场，不连房间、不占任何额度。
 * - 电脑一步一步出，每步停一下给画面播动画（声明窗口里电脑的回答不停）；
 * - 每一步存进 mahjong.solo，关了页面回来接着打；
 * - 实盘（client 模式）：开场经 Worker 从钱包带入，一场打完（或中途离开）带着小结结回；带入、结回的操作号都先存下来，
 *   断网、刷新后用同一个号重发，平台按号去重，不会多扣多给。
 */
import { stream } from 'arcade-kit/rng';
import { AIS } from './ai/index.ts';
import { pickPersonas, PERSONAS } from './ai/personas.ts';
import type { SettleStats } from './core/match/index.ts';
import { sichuanXuezhan as XZ, view, type XzAction, type XzOpts, type XzState, type XzView } from './core/variants/sichuan-xuezhan/index.ts';
import type { SeatKind } from './core/variants/types.ts';
import { baseOf, stakesOf, type StakesId, type TierId } from './game/stakes.ts';
import { randomId, soloSettle, type WalletReply } from './net/wallet.ts';

export const SOLO_KEY = 'mahjong.solo';
const KINDS: SeatKind[] = ['human', 'ai', 'ai', 'ai'];
export const ME = 0;

export interface SoloSave {
  v: 1;
  state: XzState;
  stakes: StakesId;
  names: string[];
  /** 实盘：钱包里这一份的号；结回的操作号和小结（先存再发，重发用同一个） */
  ref: string | null;
  settle: { op: string; amount: number; stats: SettleStats } | null;
  /** 已经结回（或者娱乐局打完） */
  done: boolean;
}

export interface SoloUi {
  /** 画一帧（每一步之后） */
  frame(v: XzView, names: string[]): void;
  /** 一局打完（停在结算）或一场打完 */
  roundEnd(v: XzView, names: string[]): void;
  /** 结回的结果（实盘） */
  settled(r: WalletReply): void;
}

export function loadSolo(): SoloSave | null {
  try {
    const raw = localStorage.getItem(SOLO_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SoloSave;
    return s && s.v === 1 && s.state?.variant === XZ.id && s.state.v === XZ.rulesVersion ? s : null;
  } catch {
    return null;
  }
}

function persist(s: SoloSave): void {
  try {
    if (s.done) localStorage.removeItem(SOLO_KEY);
    else localStorage.setItem(SOLO_KEY, JSON.stringify(s));
  } catch {
    // 存不上（隐私模式、满了）：这一场照打，只是关了页面就接不上
  }
}

/** 开一场：密钥浏览器现生成；chips 是实盘带进来的（不够一份时可以少带） */
export function newSolo(stakes: StakesId, opts: XzOpts, myName: string, ref: string | null, chips: number): SoloSave {
  const st = stakesOf(stakes)!;
  const key = [...crypto.getRandomValues(new Uint32Array(8))];
  const personas = [0, ...pickPersonas(stream(key, 'persona'), st.level, 3)];
  const state = XZ.begin(key, opts, KINDS, { share: st.share, base: baseOf(st.share), personas, chips: [chips, st.share, st.share, st.share] }) as XzState;
  return { v: 1, state, stakes, names: [myName, ...personas.slice(1).map((p) => PERSONAS[p]!.name)], ref, settle: null, done: false };
}

/** 电脑每一步之后停多久（毫秒，再乘速度） */
function delayOf(prev: XzState, next: XzState): number {
  if (next.events.some((e) => e.e === 'hu')) return 1_300;
  if (next.events.some((e) => e.e === 'pon' || e.e === 'kan')) return 1_000;
  if (next.events.some((e) => e.e === 'discard')) return 700;
  if (prev.phase === 'claim' && next.phase === 'claim') return 0;
  return 250;
}

export class Solo {
  private s: SoloSave;
  private busy = false;
  private stopped = false;
  speed = 1;
  private readonly ui: SoloUi;

  constructor(save: SoloSave, ui: SoloUi) {
    this.s = save;
    this.ui = ui;
  }

  get save(): SoloSave {
    return this.s;
  }

  get view(): XzView {
    return view(this.s.state, ME);
  }

  get stakes(): StakesId {
    return this.s.stakes;
  }

  get names(): string[] {
    return this.s.names;
  }

  /** 画当前的局面，接着让电脑出（回来接着打时也从这里开始） */
  resume(): void {
    persist(this.s);
    this.ui.frame(this.view, this.s.names);
    if (this.s.state.phase === 'end' || this.s.state.phase === 'over') this.ui.roundEnd(this.view, this.s.names);
    if (this.s.state.phase === 'over') void this.finish();
    else void this.runAi();
  }

  act(a: XzAction): string | null {
    if (this.busy || this.stopped) return 'busy';
    const next = XZ.apply(this.s.state, ME, a);
    if ('error' in next) return next.error;
    this.step(next);
    void this.runAi();
    return null;
  }

  /** 一局结算看完了：开下一局 */
  next(): void {
    if (this.s.state.phase !== 'end') return;
    this.step(XZ.resume(this.s.state));
    void this.runAi();
  }

  stop(): void {
    this.stopped = true;
  }

  private step(next: XzState): void {
    this.s.state = next;
    persist(this.s);
    this.ui.frame(this.view, this.s.names);
    if (next.phase === 'end' || next.phase === 'over') this.ui.roundEnd(this.view, this.s.names);
    if (next.phase === 'over') void this.finish();
  }

  private async runAi(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const ai = AIS[XZ.id]!;
      for (;;) {
        if (this.stopped) return;
        const s = this.s.state;
        const act = XZ.actors(s);
        if (!act) return;
        const seat = act.seats.find((i) => KINDS[i] === 'ai');
        if (seat === undefined) return;
        const next = XZ.apply(s, seat, XZ.auto(s, seat, ai));
        if ('error' in next) throw new Error(`ai move rejected: ${next.error}`);
        const wait = delayOf(s, next) * this.speed;
        if (wait > 0) await sleep(wait);
        if (this.stopped) return;
        this.step(next);
      }
    } finally {
      this.busy = false;
    }
  }

  /** 实盘结回（一场打完，或者中途离开）：先把操作号和小结存下来再发，失败了下次用同一个号重发 */
  async finish(): Promise<void> {
    const st = stakesOf(this.s.stakes)!;
    if (!st.wallet || !this.s.ref) {
      if (this.s.state.phase === 'over') {
        this.s.done = true;
        persist(this.s);
      }
      return;
    }
    if (!this.s.settle) {
      const r = XZ.result(this.s.state).seats[ME]!;
      this.s.settle = { op: randomId(), amount: Math.max(0, r.chips), stats: r.stats };
      persist(this.s);
    }
    const r = await soloSettle({ op: this.s.settle.op, session: this.s.ref, amount: this.s.settle.amount, stats: this.s.settle.stats });
    // 结过了、放太久已经退回：都算结完
    if (r.ok || r.error === 'no_stake' || r.error === 'expired') {
      this.s.done = true;
      persist(this.s);
    }
    this.ui.settled(r);
  }

  /** 中途离开：马上结算（娱乐局直接丢掉） */
  async leave(): Promise<void> {
    this.stop();
    const st = stakesOf(this.s.stakes)!;
    if (!st.wallet) {
      this.s.done = true;
      persist(this.s);
      return;
    }
    await this.finish();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

export type { TierId };
