/** 管理后台能看更多（0.10.7）：今日概况、账号列表带钱包摘要、查人带战绩和钱包流水。都只读。 */
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WalletReply } from '../worker/api/wallet-store';
import { advance, call, env, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

type Stub = { buyin(req: unknown): Promise<WalletReply>; settle(req: unknown): Promise<WalletReply>; refund(req: unknown): Promise<WalletReply> };
const stub = (game: string) => (exports as unknown as { WalletService: (o: { props: { game: string } }) => Stub }).WalletService({ props: { game } });
let n = 0;
const id = (p: string) => `${p}-${String(++n).padStart(6, '0')}`;

async function admin() {
  const a = await registerUser();
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(a.user.id).run();
  return a;
}
async function play(userId: string, game: string, amount: number, back: number, stats?: unknown) {
  const base = { userId, game, ref: id('ref'), mode: 'client' };
  await stub(game).buyin({ ...base, tier: 'small', amount, until: Date.now() + 3_600_000, op: id('op') });
  return stub(game).settle({ ...base, amount: back, op: id('op'), stats });
}

describe('管理后台（0.10.7）', () => {
  it('今日概况：碰过钱包的人、来过的人、各游戏人数和带入结回、补给人数；前几天从统计里取；写 0 行', async () => {
    const a = await admin();
    const [u, v] = [await registerUser(), await registerUser()];
    await play(u.user.id, 'kaipan', 2_000, 3_000);
    await play(v.user.id, 'kaipan', 2_000, 0);
    await play(v.user.id, 'texas', 1_000, 500);
    await env.DB.prepare("UPDATE wallets SET state = json_set(state, '$.balance', 100) WHERE user_id = ?1").bind(v.user.id).run();
    expect((await call('/api/wallet/relief', { body: {}, cookie: v.cookie })).status).toBe(200);
    const res = await call('/api/admin/overview', { cookie: a.cookie });
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(0);
    const body = (await res.json()) as { today: Record<string, unknown>; days: unknown[] };
    expect(body.today).toMatchObject({
      day: '2026-10-14',
      active: 2,
      reliefCount: 1,
      grant: 20_000,
      games: { kaipan: { in: 4_000, out: 3_000, players: 2 }, texas: { in: 1_000, out: 500, players: 1 } },
    });
    expect(body.today.visitors).toBeGreaterThanOrEqual(1);
    expect(body.days).toEqual([]);
    await env.DB.prepare("INSERT INTO wallet_stats (day, data, created_at) VALUES ('2026-10-13', ?1, 0)").bind(JSON.stringify({ day: '2026-10-13', total: 1 })).run();
    expect(((await (await call('/api/admin/overview', { cookie: a.cookie })).json()) as { days: { day: string }[] }).days.map((d) => d.day)).toEqual(['2026-10-13']);
    expect((await call('/api/admin/overview', { cookie: u.cookie })).status).toBe(403);
  });

  it('账号列表带钱包摘要：余额、桌上的、各游戏上桌次数；没钱包的 balance 是 null', async () => {
    const a = await admin();
    const u = await registerUser();
    await play(u.user.id, 'kaipan', 2_000, 2_500);
    await stub('texas').buyin({ userId: u.user.id, game: 'texas', ref: id('ref'), tier: 'small', amount: 1_500, until: Date.now() + 3_600_000, mode: 'server', op: id('op') });
    const { users } = (await (await call('/api/admin/users', { cookie: a.cookie })).json()) as { users: { id: string; wallet: unknown }[] };
    expect(users.find((x) => x.id === u.user.id)!.wallet).toEqual({ balance: 10_000 - 2_000 + 2_500 - 1_500, onTable: 1_500, played: { kaipan: 1 } });
    expect(users.find((x) => x.id === a.user.id)!.wallet).toEqual({ balance: null, onTable: 0, played: {} });
  });

  it('查人带战绩和钱包流水（新的在前）：新号送的、带入、结回（到顶没进的另写）、放弃、到期退回、补给、管理员调整', async () => {
    const a = await admin();
    const u = await registerUser();
    await play(u.user.id, 'kaipan', 2_000, 30_000, { rounds: 1, wins: 1, best: 28_000 });
    const ref = id('ref');
    await stub('texas').buyin({ userId: u.user.id, game: 'texas', ref, tier: 'small', amount: 1_000, until: Date.now() + 3_600_000, mode: 'server', op: id('op') });
    await stub('texas').refund({ userId: u.user.id, game: 'texas', ref, mode: 'server', op: id('op') });
    await stub('guandan').buyin({ userId: u.user.id, game: 'guandan', ref: id('ref'), tier: 'small', amount: 500, until: Date.now() + 60_000, mode: 'client', op: id('op') });
    advance(61_000);
    await call('/api/admin/wallet/adjust', { body: { username: u.username, amount: -100, note: '测试' }, cookie: a.cookie });
    const body = (await (await call(`/api/admin/wallet/${u.username}`, { cookie: a.cookie })).json()) as { ledger: { t: string; g?: string; a: number; capped?: number }[]; career: Record<string, unknown> };
    expect(body.ledger.map((e) => [e.t, e.g ?? '', e.a, e.capped ?? 0])).toEqual([
      ['admin', '', -100, 0],
      ['expire', 'guandan', 500, 0],
      ['buyin', 'guandan', -500, 0],
      ['refund', 'texas', 1_000, 0],
      ['buyin', 'texas', -1_000, 0],
      ['settle', 'kaipan', 22_000, 8_000],
      ['buyin', 'kaipan', -2_000, 0],
      ['grant', '', 10_000, 0],
    ]);
    expect(body.career).toMatchObject({ kaipan: { n: 1, rounds: 1, wins: 1, best: 28_000, net: 20_000 } });
  });
});

describe('钱包页的最近进出（0.10.10）', () => {
  it('GET /api/wallet 回自己的流水，新的在前；还没钱包是空的；游戏的 RPC 不带', async () => {
    const u = await registerUser();
    const fresh = (await (await call('/api/wallet', { cookie: u.cookie })).json()) as { ledger: unknown[]; week: unknown };
    expect(fresh.ledger).toEqual([]);
    expect(fresh.week).toEqual({});
    await play(u.user.id, 'texas', 2_000, 2_500);
    const res = await call('/api/wallet', { cookie: u.cookie });
    const body = (await res.json()) as { ledger: { t: string; g?: string; a: number }[]; week: Record<string, number> };
    // 0.10.12：大厅卡片上的本周净赢
    expect(body.week).toEqual({ texas: 500 });
    expect(body.ledger.map((e) => [e.t, e.g, e.a])).toEqual([
      ['settle', 'texas', 2_500],
      ['buyin', 'texas', -2_000],
      ['grant', undefined, 10_000],
    ]);
    const view = await (exports as unknown as { WalletService: (o: { props: { game: string } }) => { view(userId: string): Promise<WalletReply> } })
      .WalletService({ props: { game: 'texas' } })
      .view(u.user.id);
    expect(view).not.toHaveProperty('ledger');
    expect(view).not.toHaveProperty('week');
  });
});
