/**
 * 测试和本机试用的假平台钱包（不部署）：照 docs/platform-backend.md 5.9 的规矩做麻将会碰到的那些，
 * 给 workerd 测试（test/worker/entry.ts 自己绑自己）用。
 *
 * - WalletService：游戏经服务绑定调的四个方法，绑定上的 props.game 要写，参数里的 game 要一致，不然 bad_game；
 * - FakeBank：一人一个 DO，存钱包；calls、writes 给测试数调了几次、写了几次；
 * - walletHttp：浏览器的 GET /api/wallet、POST /api/wallet/relief。
 * 各游戏一份、每一份只能结回一次（结完再结 no_stake）、操作 id 按游戏去重、到期退回、client 模式每天净赢最多 3 份。
 */
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export const NEW_BALANCE = 10_000;
export const RELIEF_TO = 2_000;
export const TIERS = { small: 2_000, mid: 10_000, big: 50_000, lux: 200_000 } as const;
type Tier = keyof typeof TIERS;
type Mode = 'server' | 'client';
const DAY_MS = 86_400_000;
const GAMES = new Set(['kaipan', 'guandan', 'texas', 'mahjong']);
const ID = /^[A-Za-z0-9_-]{8,64}$/;

interface Stake {
  ref: string;
  tier: Tier;
  amount: number;
  mode: Mode;
  at: number;
  until: number;
}

interface State {
  balance: number;
  stakes: Record<string, Stake>;
  reliefDay: string;
  /** client 模式当天每个游戏的带入、结回（算净赢）和带入过的最高档 */
  day: string;
  cin: Record<string, number>;
  cout: Record<string, number>;
  top: Record<string, Tier>;
  ops: Record<string, OpResult>;
  expired: string[];
  fresh: boolean;
}

export interface FakeEnv {
  FAKE_BANK: DurableObjectNamespace<FakeBank>;
}

type OpResult = { ok: true; credited?: number; capped?: number };
type Reply = { ok: true; wallet: View; credited?: number; capped?: number; dup?: true } | { ok: false; error: string; wallet?: View };
type View = {
  balance: number;
  stakes: ({ game: string } & Stake)[];
  canRelief: boolean;
  writesLeft: number;
  caps: Record<string, { net: number; cap: number }>;
  fresh: boolean;
};
type Cmd = { t: 'buyin' | 'settle' | 'refund'; game: string; ref: string; tier?: Tier; amount?: number; until?: number; mode: Mode; op: string };

const beijingDay = (now: number): string => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

export class FakeBank extends DurableObject {
  calls = 0;
  writes = 0;

  private async load(now: number): Promise<State> {
    const s =
      (await this.ctx.storage.get<State>('w')) ??
      ({ balance: NEW_BALANCE, stakes: {}, reliefDay: '', day: '', cin: {}, cout: {}, top: {}, ops: {}, expired: [], fresh: true } satisfies State);
    const day = beijingDay(now);
    if (s.day !== day) Object.assign(s, { day, cin: {}, cout: {}, top: {} });
    // 到期的那一份原样退回，记下 ref
    for (const [game, k] of Object.entries(s.stakes)) {
      if (k.until > now) continue;
      s.balance += k.amount;
      if (k.mode === 'client') s.cin[game] = Math.max(0, (s.cin[game] ?? 0) - k.amount);
      s.expired = [...s.expired, `${game}:${k.ref}`].slice(-16);
      delete s.stakes[game];
    }
    return s;
  }

  private async save(s: State): Promise<void> {
    this.writes++;
    await this.ctx.storage.put('w', { ...s, fresh: false });
  }

  private view(s: State): View {
    const caps: View['caps'] = {};
    for (const g of Object.keys(s.cin)) caps[g] = { net: (s.cout[g] ?? 0) - (s.cin[g] ?? 0), cap: 3 * TIERS[s.top[g] ?? 'small'] };
    return {
      balance: s.balance,
      stakes: Object.entries(s.stakes).map(([game, k]) => ({ game, ...k })),
      canRelief: Object.keys(s.stakes).length === 0 && s.balance < RELIEF_TO && s.reliefDay !== s.day,
      writesLeft: 200,
      caps,
      fresh: s.fresh,
    };
  }

  /** 只给测试用：直接把余额设成这个数（比如造一个只有 500 的人） */
  async setBalance(balance: number, now: number): Promise<void> {
    const s = await this.load(now);
    s.balance = balance;
    await this.save(s);
  }

  async look(now: number): Promise<View> {
    this.calls++;
    return this.view(await this.load(now));
  }

  async run(c: Cmd, now: number): Promise<Reply> {
    this.calls++;
    const s = await this.load(now);
    const key = `${c.game}:${c.op}`;
    const before = s.ops[key];
    if (before) return { ...before, wallet: this.view(s), dup: true };
    const r = this.apply(s, c, now);
    if (!r.ok) return { ...r, wallet: this.view(s) };
    s.ops[key] = r;
    await this.save(s);
    return { ...r, wallet: this.view(s) };
  }

  private apply(s: State, c: Cmd, now: number): OpResult | { ok: false; error: string } {
    const k = s.stakes[c.game];
    if (c.t === 'buyin') {
      const share = TIERS[c.tier!];
      const amount = c.amount!;
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > share) return { ok: false, error: 'bad_amount' };
      if (c.until! <= now) return { ok: false, error: 'bad_until' };
      const until = Math.min(c.until!, now + DAY_MS);
      if (s.expired.includes(`${c.game}:${c.ref}`)) return { ok: false, error: 'expired' };
      if (k) {
        if (k.ref !== c.ref || k.tier !== c.tier) return { ok: false, error: 'at_table' };
        if (k.mode !== c.mode) return { ok: false, error: 'bad_mode' };
        if (s.balance < amount) return { ok: false, error: 'no_funds' };
        k.amount += amount;
        k.until = Math.max(k.until, until);
      } else {
        // 平台 0.10.2：新开一份也只要余额够这次的数，不用够一整份
        if (s.balance < amount) return { ok: false, error: 'no_funds' };
        s.stakes[c.game] = { ref: c.ref, tier: c.tier!, amount, mode: c.mode, at: now, until };
      }
      s.balance -= amount;
      if (TIERS[c.tier!] > TIERS[s.top[c.game] ?? 'small'] || !s.top[c.game]) s.top[c.game] = c.tier!;
      if (c.mode === 'client') s.cin[c.game] = (s.cin[c.game] ?? 0) + amount;
      return { ok: true };
    }
    if (!k || k.ref !== c.ref) return { ok: false, error: s.expired.includes(`${c.game}:${c.ref}`) ? 'expired' : 'no_stake' };
    if (k.mode !== c.mode) return { ok: false, error: 'bad_mode' };
    delete s.stakes[c.game];
    if (c.t === 'refund') {
      s.balance += k.amount;
      if (k.mode === 'client') s.cin[c.game] = Math.max(0, (s.cin[c.game] ?? 0) - k.amount);
      return { ok: true, credited: k.amount };
    }
    const amount = c.amount!;
    let credited = amount;
    if (k.mode === 'client') {
      // 净赢最多 3 份；带上桌的那一份总能拿回来
      const room = 3 * TIERS[s.top[c.game] ?? k.tier] - ((s.cout[c.game] ?? 0) - (s.cin[c.game] ?? 0));
      credited = Math.min(amount, Math.max(room, Math.min(amount, k.amount)));
      s.cout[c.game] = (s.cout[c.game] ?? 0) + credited;
    }
    s.balance += credited;
    return credited < amount ? { ok: true, credited, capped: amount - credited } : { ok: true, credited };
  }

  async relief(now: number): Promise<{ status: number; body: { error?: string; wallet: View } }> {
    this.calls++;
    const s = await this.load(now);
    if (Object.keys(s.stakes).length) return { status: 409, body: { error: 'at_table', wallet: this.view(s) } };
    if (s.balance >= RELIEF_TO) return { status: 409, body: { error: 'relief_not_needed', wallet: this.view(s) } };
    if (s.reliefDay === s.day) return { status: 409, body: { error: 'relief_used', wallet: this.view(s) } };
    s.balance = RELIEF_TO;
    s.reliefDay = s.day;
    await this.save(s);
    return { status: 200, body: { wallet: this.view({ ...s, fresh: false }) } };
  }
}

const bank = (env: FakeEnv, userId: string) => env.FAKE_BANK.get(env.FAKE_BANK.idFromName(userId));

/** 平台给游戏的 RPC（绑定写 entrypoint: "WalletService"、props: { game }） */
export class WalletService extends WorkerEntrypoint<FakeEnv, { game?: string }> {
  async view(userId: string): Promise<Reply> {
    if (!this.bound()) return { ok: false, error: 'bad_game' };
    return { ok: true, wallet: await bank(this.env, userId).look(Date.now()) };
  }
  buyin(req: unknown): Promise<Reply> {
    return this.op('buyin', req);
  }
  settle(req: unknown): Promise<Reply> {
    return this.op('settle', req);
  }
  refund(req: unknown): Promise<Reply> {
    return this.op('refund', req);
  }

  private bound(): string | null {
    const g = this.ctx.props?.game;
    return typeof g === 'string' && GAMES.has(g) ? g : null;
  }

  private async op(t: Cmd['t'], req: unknown): Promise<Reply> {
    const game = this.bound();
    if (!game) return { ok: false, error: 'bad_game' };
    const q = (req ?? {}) as Record<string, unknown>;
    if (typeof q.userId !== 'string' || q.userId === '') return { ok: false, error: 'bad_request' };
    if (q.game !== game) return { ok: false, error: 'bad_game' };
    const okId = (x: unknown) => typeof x === 'string' && ID.test(x);
    const okNum = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
    if (!okId(q.ref) || !okId(q.op) || (q.mode !== 'server' && q.mode !== 'client')) return { ok: false, error: 'bad_request' };
    if (t === 'buyin' && (!(typeof q.tier === 'string' && q.tier in TIERS) || !okNum(q.amount) || !okNum(q.until))) return { ok: false, error: 'bad_request' };
    if (t === 'settle' && !okNum(q.amount)) return { ok: false, error: 'bad_request' };
    return bank(this.env, q.userId).run({ t, game, ref: q.ref as string, tier: q.tier as Tier, amount: q.amount as number, until: q.until as number, mode: q.mode as Mode, op: q.op as string }, Date.now());
  }
}

/** 浏览器的钱包接口（平台 15.9）：认 cookie 里的 __Host-sid；不是这两条路回 null */
export async function walletHttp(request: Request, env: FakeEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/wallet' && url.pathname !== '/api/wallet/relief') return null;
  const sid = /__Host-sid=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
  if (!sid) return Response.json({ error: 'login' }, { status: 401 });
  if (url.pathname === '/api/wallet') {
    if (request.method !== 'GET') return Response.json({ error: 'method' }, { status: 405 });
    return Response.json({ wallet: await bank(env, sid).look(Date.now()), tiers: TIERS, reliefTo: RELIEF_TO });
  }
  if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  if (request.headers.get('x-arcade') !== '1') return Response.json({ error: 'forbidden' }, { status: 403 });
  const r = await bank(env, sid).relief(Date.now());
  return Response.json(r.body, { status: r.status });
}
