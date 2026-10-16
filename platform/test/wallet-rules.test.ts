/** 管理员可调的钱包规则（0.10.6）：补给额、单机每日净赢份数、新号筹码、单次调整上限，改了即时生效、留记录。 */
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WalletReply } from '../worker/api/wallet-store';
import { advance, call, env, errorOf, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

type Stub = { buyin(req: unknown): Promise<WalletReply>; settle(req: unknown): Promise<WalletReply> };
const kaipan = (exports as unknown as { WalletService: (o: { props: { game: string } }) => Stub }).WalletService({ props: { game: 'kaipan' } });
let n = 0;
const id = (p: string) => `${p}-${String(++n).padStart(6, '0')}`;

async function admin() {
  const a = await registerUser();
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(a.user.id).run();
  return a;
}
const setRules = (cookie: string, body: unknown) => call('/api/admin/settings/wallet', { body, cookie });
const walletOf = async (cookie: string) => (await (await call('/api/wallet', { cookie })).json()) as { wallet: { balance: number; canRelief: boolean }; reliefTo: number; winUnits: number };

describe('钱包规则（0.10.6）', () => {
  it('没设过：默认值；只有管理员能看能改', async () => {
    const [a, u] = [await admin(), await registerUser()];
    const res = await call('/api/admin/settings/wallet', { cookie: a.cookie });
    expect(await res.json()).toMatchObject({
      rules: { reliefTo: 2_000, winUnits: 10, newBalance: 10_000, adminAdjustMax: 1_000_000 },
      defaults: { reliefTo: 2_000 },
      log: [],
      updatedAt: null,
    });
    expect((await call('/api/admin/settings/wallet', { cookie: u.cookie })).status).toBe(403);
    expect((await setRules(u.cookie, { reliefTo: 1 })).status).toBe(403);
  });

  it('改了即时生效：补给额、单机上限、新号筹码、单次调整上限；写 2 行，记下谁改的、从多少改成多少', async () => {
    const a = await admin();
    const res = await setRules(a.cookie, { reliefTo: 5_000, winUnits: 2, newBalance: 3_000, adminAdjustMax: 500 });
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(2);
    expect(await res.json()).toMatchObject({
      rules: { reliefTo: 5_000, winUnits: 2, newBalance: 3_000, adminAdjustMax: 500 },
      log: [{ at: Date.now(), by: a.username, changes: { reliefTo: [2_000, 5_000], winUnits: [10, 2], newBalance: [10_000, 3_000], adminAdjustMax: [1_000_000, 500] } }],
    });
    const u = await registerUser();
    // 新号：看到的和第一次带入后建的都是 3,000
    expect(await walletOf(u.cookie)).toMatchObject({ wallet: { balance: 3_000, canRelief: true }, reliefTo: 5_000, winUnits: 2 });
    const ref = id('ref');
    await kaipan.buyin({ userId: u.user.id, game: 'kaipan', ref, tier: 'small', amount: 2_000, until: Date.now() + 3_600_000, mode: 'client', op: id('op') });
    // 单机上限 2 份：带入 2,000 结回 10,000，只进 6,000（净赢 4,000）
    expect(await kaipan.settle({ userId: u.user.id, game: 'kaipan', ref, amount: 10_000, mode: 'client', op: id('op') })).toMatchObject({ ok: true, credited: 6_000, capped: 4_000 });
    // 余额 7,000 ≥ 补给额 5,000：领不了
    const relief = await call('/api/wallet/relief', { body: {}, cookie: u.cookie });
    expect([relief.status, await errorOf(relief)]).toEqual([409, 'relief_not_needed']);
    // 单次调整上限 500
    const adj = await call('/api/admin/wallet/adjust', { body: { username: u.username, amount: 600 }, cookie: a.cookie });
    // 0.10.17：文案里写现在的上限（以前前端写死 1,000,000）
    expect([adj.status, await adj.json()]).toEqual([400, { error: 'bad_amount', message: '数量要是不为 0 的整数，一次最多加减 500', max: 500 }]);
    expect((await call('/api/admin/wallet/adjust', { body: { username: u.username, amount: 500 }, cookie: a.cookie })).status).toBe(200);
  });

  it('超出范围、不是整数：整个拒（400），什么都不改；没有变化不写；只改传了的那几条', async () => {
    const a = await admin();
    for (const body of [{ reliefTo: -1 }, { winUnits: 0 }, { winUnits: 1.5 }, { newBalance: 10_000_001 }, { adminAdjustMax: '9' }, { reliefTo: 3_000, winUnits: 0 }]) {
      const res = await setRules(a.cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await (await call('/api/admin/settings/wallet', { cookie: a.cookie })).json()).toMatchObject({ rules: { reliefTo: 2_000, winUnits: 10 }, log: [] });
    expect((await setRules(a.cookie, { reliefTo: 2_000 })).status).toBe(200);
    expect(rowsWritten()).toBe(0);
    await setRules(a.cookie, { winUnits: 5 });
    expect(await (await call('/api/admin/settings/wallet', { cookie: a.cookie })).json()).toMatchObject({ rules: { reliefTo: 2_000, winUnits: 5, newBalance: 10_000 }, log: [{ changes: { winUnits: [10, 5] } }] });
  });

  it('别的 isolate 改的：最多 30 秒后跟上（这里直接改库模拟）', async () => {
    const u = await registerUser();
    expect((await walletOf(u.cookie)).reliefTo).toBe(2_000);
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('wallet_rules', ?1, 0)").bind(JSON.stringify({ rules: { reliefTo: 4_000 }, log: [] })).run();
    expect((await walletOf(u.cookie)).reliefTo).toBe(2_000);
    advance(30_000);
    expect((await walletOf(u.cookie)).reliefTo).toBe(4_000);
  });
});
