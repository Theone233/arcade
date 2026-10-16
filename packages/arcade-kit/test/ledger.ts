/**
 * 测 0.3.0 的可选接口用的小游戏"记账桌"：开局选项（座位数、买入）、座位换人、对外的事（从假银行扣买入、把筹码结回去）、
 * 关房前结算、不轮流的操作。只在测试里用，不部署。
 */
import { DurableObject } from 'cloudflare:workers';
import type { RoomEffect, RoomGame } from '../src/game.ts';
import type { SeatKind } from '../src/protocol.ts';
import { DEFAULT_LIMITS, GameRoom, type RoomLimits } from '../src/room.ts';

export interface LedgerOpts {
  seats: number;
  buyIn: number;
}
export interface LedgerEffect extends RoomEffect {
  kind: 'debit' | 'credit';
  amount: number;
}
export interface LedgerState {
  key: number[];
  rules: number;
  opts: LedgerOpts;
  kinds: SeatKind[];
  /** 这个座位的筹码是真人买入的（离座交给电脑也还是他的） */
  owned: boolean[];
  chips: number[];
  pending: LedgerEffect[];
  nextId: number;
  turn: number;
  moves: number;
  /** 办完的事的 id、不轮流的操作，按顺序记 */
  log: string[];
  /** 停着等人（0.3.2 的 waiting）：谁也不用出手 */
  napping?: boolean;
}
export type LedgerAction = { t: 'pass' } | { t: 'cashout' } | { t: 'wave' } | { t: 'nap' } | { t: 'wake' };
export interface LedgerView {
  chips: number[];
  kinds: SeatKind[];
  pending: number;
  turn: number;
  log: string[];
}

const DEFAULT_OPTS: LedgerOpts = { seats: 4, buyIn: 100 };

function addEffect(s: LedgerState, seat: number, kind: LedgerEffect['kind'], amount: number): LedgerState {
  return { ...s, pending: [...s.pending, { id: `e${s.nextId}`, seat, kind, amount }], nextId: s.nextId + 1 };
}

export const ledgerGame: RoomGame<LedgerState, LedgerAction, LedgerView, LedgerOpts, LedgerEffect> = {
  seats: 4,
  rulesVersion: 1,
  options: (raw) => {
    if (raw === undefined) return DEFAULT_OPTS;
    const o = raw as Partial<LedgerOpts> | null;
    if (!o || typeof o !== 'object' || !Number.isInteger(o.seats) || !Number.isInteger(o.buyIn)) return null;
    if (o.seats! < 2 || o.seats! > 4 || o.buyIn! < 1 || o.buyIn! > 1000) return null;
    return { seats: o.seats!, buyIn: o.buyIn! };
  },
  seatCount: (opts) => (opts ?? DEFAULT_OPTS).seats,
  begin: (entropy, rules, setup) => {
    const opts = setup?.opts ?? DEFAULT_OPTS;
    const kinds = setup?.seats ?? ['human', 'ai', 'ai', 'ai'];
    // 电脑带庄家的筹码；真人从银行扣买入，到账前是 0
    let s: LedgerState = {
      key: [...entropy], rules, opts, kinds, owned: kinds.map((k) => k === 'human'), chips: kinds.map((k) => (k === 'ai' ? opts.buyIn : 0)), pending: [], nextId: 0, turn: 0, moves: 0, log: [],
    };
    kinds.forEach((k, seat) => {
      if (k === 'human') s = addEffect(s, seat, 'debit', opts.buyIn);
    });
    return s;
  },
  start: () => {
    throw new Error('ledger uses begin');
  },
  // 电脑的座位换成真人：庄家的筹码收回，扣他的买入。主人回到自己的座位也会调到这里（kind 照样是 human），按状态认出来、什么都不做
  seated: (s, seat, kind) => {
    const next = { ...s, kinds: s.kinds.map((k, i) => (i === seat ? kind : k)) };
    if (kind !== 'human' || s.owned[seat]) return next;
    const owned = s.owned.map((o, i) => o || i === seat);
    return addEffect({ ...next, owned, chips: next.chips.map((c, i) => (i === seat ? 0 : c)) }, seat, 'debit', s.opts.buyIn);
  },
  parse: (raw) => {
    const t = (raw as { t?: unknown } | null)?.t;
    return t === 'pass' || t === 'cashout' || t === 'wave' || t === 'nap' || t === 'wake' ? { t } : null;
  },
  free: (a) => a.t !== 'pass',
  apply: (s, seat, a) => {
    if (a.t === 'wave') return { ...s, log: [...s.log, `wave${seat}`] };
    if (a.t === 'nap' || a.t === 'wake') return { ...s, napping: a.t === 'nap' };
    if (a.t === 'cashout') {
      if (s.chips[seat]! <= 0) return { error: 'no_chips' };
      return addEffect({ ...s, chips: s.chips.map((c, i) => (i === seat ? 0 : c)) }, seat, 'credit', s.chips[seat]!);
    }
    if (s.turn !== seat) return { error: 'not_your_turn' };
    return { ...s, turn: (s.turn + 1) % s.opts.seats, moves: s.moves + 1 };
  },
  turn: (s) => (s.napping ? null : s.turn),
  waiting: (s) => s.napping === true,
  view: (s) => ({ chips: s.chips, kinds: s.kinds, pending: s.pending.length, turn: s.turn, log: s.log }),
  ai: () => ({ t: 'pass' }),
  over: (s) => s.moves >= 100,
  effects: (s) => s.pending,
  settled: (s, id, result) => {
    // 模拟游戏写错了 settled：办完了却不从 pending 里拿掉（只给测试用，看房间会不会一直重办）
    if ((result as { keep?: unknown } | null)?.keep === true) return s;
    const e = s.pending.find((x) => x.id === id)!;
    const ok = (result as { ok?: unknown } | null)?.ok === true;
    const chips = e.kind === 'debit' && ok ? s.chips.map((c, i) => (i === e.seat ? c + e.amount : c)) : s.chips;
    return { ...s, chips, pending: s.pending.filter((x) => x.id !== id), log: [...s.log, id] };
  },
  // 关房：真人桌上的筹码都结回银行
  closing: (s) => {
    let out = s;
    s.owned.forEach((o, seat) => {
      if (o && out.chips[seat]! > 0) {
        out = addEffect({ ...out, chips: out.chips.map((c, i) => (i === seat ? 0 : c)) }, seat, 'credit', out.chips[seat]!);
      }
    });
    return out;
  },
};

export interface LedgerEnv {
  BANK: DurableObjectNamespace<ToyBank>;
}

export class LedgerRoom extends GameRoom<LedgerState, LedgerAction, LedgerView, LedgerEnv, LedgerOpts, LedgerEffect> {
  protected readonly game = ledgerGame;
  protected override readonly limits: RoomLimits = { ...DEFAULT_LIMITS, minClientVersion: 1 };
  protected override async perform(e: LedgerEffect, userId: string | null): Promise<unknown> {
    const r = await bank(this.env).apply(e.id, userId, e.kind, e.amount);
    // 银行"连不上"在这一头抛（在银行那头抛，workerd 会当成没接住的异常刷日志）
    if (!r.ok) throw new Error('bank down');
    return r;
  }
}

export const bank = (env: LedgerEnv) => env.BANK.get(env.BANK.idFromName('bank'));

/** 假银行：按操作 id 去重（幂等），down 时一律回 ok: false（房间那头当成"连不上"抛错）。只放内存，测试用。 */
export class ToyBank extends DurableObject {
  down = false;
  /** 回话里带 keep，让记账桌的 settled 装作写错了 */
  keep = false;
  /** 每个 id 实际收到几次（去重前） */
  readonly calls = new Map<string, number>();
  readonly done = new Map<string, { userId: string | null; kind: string; amount: number }>();

  async apply(id: string, userId: string | null, kind: string, amount: number): Promise<{ ok: boolean; keep?: true }> {
    if (this.down) return { ok: false };
    this.calls.set(id, (this.calls.get(id) ?? 0) + 1);
    if (!this.done.has(id)) this.done.set(id, { userId, kind, amount });
    return this.keep ? { ok: true, keep: true } : { ok: true };
  }
}
