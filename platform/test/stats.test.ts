/** 战绩页接口（0.10.3，docs/platform-backend.md 5.10、15.11）：career 对登录的人公开，余额不给；只读。 */
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WalletReply } from '../worker/api/wallet-store';
import { advance, call, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

type Stub = { buyin(req: unknown): Promise<WalletReply>; settle(req: unknown): Promise<WalletReply> };
const boundTo = (game: string) => (exports as unknown as { WalletService: (o: { props: { game: string } }) => Stub }).WalletService({ props: { game } });
let n = 0;
const op = () => `op-stats-${String(++n).padStart(6, '0')}`;

/** 带一份上桌再结回：game 的 client 模式，带 2,000 回 amount */
async function play(userId: string, game: string, amount: number, stats?: unknown) {
  const ref = `ref-st-${String(++n).padStart(6, '0')}`;
  const base = { userId, game, ref, mode: 'client' };
  await boundTo(game).buyin({ ...base, tier: 'small', amount: 2_000, until: Date.now() + 3_600_000, op: op() });
  return boundTo(game).settle({ ...base, amount, op: op(), stats });
}

type U = Awaited<ReturnType<typeof registerUser>>;
const stats = async (viewer: U, who: string) => call(`/api/stats/${who}`, { cookie: viewer.cookie });

describe('GET /api/stats/<id>', () => {
  it('别人看得到我的战绩（不含余额），自己用 me 也行；只读 0 行', async () => {
    const [a, b] = [await registerUser(), await registerUser()];
    await play(a.user.id, 'kaipan', 3_000, { rounds: 1, wins: 1, best: 1_000, titles: ['first_win'], max: { score: 88 } });
    await play(a.user.id, 'texas', 1_000);
    const res = await stats(b, a.user.id);
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(0);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      user: { userId: a.user.id },
      relation: 'none',
      week: '2026-10-12',
      games: {
        kaipan: { n: 1, net: 1_000, wnet: 1_000, rounds: 1, wins: 1, best: 1_000, titles: [{ id: 'first_win', at: Date.now() }], max: { score: 88 }, sum: {} },
        texas: { n: 1, net: -1_000, wnet: -1_000, rounds: 0 },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/balance|stakes|username/);
    expect(await (await stats(a, 'me')).json()).toMatchObject({ relation: 'self', games: { kaipan: { n: 1 } } });
  });

  it('还没玩过：games 是空的；本周净赢过了周一按 0 给', async () => {
    const [a, b] = [await registerUser(), await registerUser()];
    expect(await (await stats(b, a.user.id)).json()).toMatchObject({ games: {} });
    await play(a.user.id, 'kaipan', 3_000);
    advance(6 * 24 * 3_600_000);
    expect(await (await stats(b, a.user.id)).json()).toMatchObject({ week: '2026-10-19', games: { kaipan: { net: 1_000, wnet: 0 } } });
  });

  it('好友、发出的请求、收到的请求分得清；对方屏蔽了我就是 404；id 不对 404；没登录 401', async () => {
    const [a, b, c] = [await registerUser(), await registerUser(), await registerUser()];
    expect((await call('/api/friends/requests', { body: { friendCode: b.user.friendCode }, cookie: a.cookie })).status).toBe(200);
    expect(await (await stats(a, b.user.id)).json()).toMatchObject({ relation: 'pending_out' });
    expect(await (await stats(b, a.user.id)).json()).toMatchObject({ relation: 'pending_in' });
    expect((await call(`/api/friends/${a.user.id}/accept`, { body: {}, cookie: b.cookie })).status).toBe(200);
    expect(await (await stats(a, b.user.id)).json()).toMatchObject({ relation: 'friends' });
    expect((await call('/api/blocks', { body: { userId: c.user.id }, cookie: b.cookie })).status).toBeLessThan(300);
    expect((await stats(c, b.user.id)).status).toBe(404);
    expect((await stats(b, c.user.id)).status).toBe(200);
    expect((await stats(a, 'nobody')).status).toBe(404);
    expect((await stats(a, 'A'.repeat(22))).status).toBe(404);
  });

  it('我屏蔽了的人发来请求：和好友页一样当没有（0.10.17），不给"接受"', async () => {
    const [a, b] = [await registerUser(), await registerUser()];
    expect((await call('/api/blocks', { body: { userId: a.user.id }, cookie: b.cookie })).status).toBeLessThan(300);
    // 被屏蔽的人照常能发（看不出自己被屏蔽，15.4），对方的战绩页上不露
    expect((await call('/api/friends/requests', { body: { userId: b.user.id }, cookie: a.cookie })).status).toBe(200);
    expect(await (await stats(b, a.user.id)).json()).toMatchObject({ relation: 'none' });
    expect((await call(`/api/stats/${a.user.id}`)).status).toBe(401);
  });
});
