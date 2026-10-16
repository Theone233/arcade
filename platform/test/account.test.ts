/** 改密码、换恢复码、退出其他设备、注销（15.2）；再验证单独计数；acct 每人每天上限。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, count, env, errorOf, flushMeter, registerUser, resetAll, rowsBy, rowsWritten, sidOf } from './helpers';

beforeEach(() => resetAll());

async function secondDevice(username: string, password: string): Promise<string> {
  return sidOf(await call('/api/auth/login', { body: { username, password } }))!;
}

const me = async (cookie: string) => ((await (await call('/api/me', { cookie })).json()) as { user: unknown }).user;

describe('改密码', () => {
  it('成功：其他会话失效，当前设备换新令牌；写 4 + 会话数 行', async () => {
    const u = await registerUser();
    const other = await secondDevice(u.username, u.password);
    const res = await call('/api/account/password', {
      body: { currentPassword: u.password, newPassword: 'Brand-New-Pass-2' },
      cookie: u.cookie,
    });
    expect(res.status).toBe(204);
    // 改凭证 1 + 删 2 个会话（各 1 行，实测）+ 新会话 2 + acct 计数 1
    expect(rowsWritten()).toBe(6);
    expect(rowsBy('acct')).toBe(6);
    const fresh = sidOf(res)!;
    expect(fresh).not.toBe(u.cookie);
    expect(await me(u.cookie)).toBeNull();
    expect(await me(other)).toBeNull();
    expect(await me(fresh)).not.toBeNull();
    expect((await call('/api/auth/login', { body: { username: u.username, password: 'Brand-New-Pass-2' } })).status).toBe(200);
  });

  it('当前密码错：401，记 reauth 失败（1 行）；连续 5 次后 429，但不影响登录', async () => {
    const u = await registerUser();
    const body = { currentPassword: 'Wrong-Pass-1', newPassword: 'Brand-New-Pass-2' };
    const first = await call('/api/account/password', { body, cookie: u.cookie });
    expect(first.status).toBe(401);
    expect(await errorOf(first)).toBe('bad_credentials');
    expect(rowsWritten()).toBe(1);
    for (let i = 0; i < 4; i++) await call('/api/account/password', { body, cookie: u.cookie });
    const locked = await call('/api/account/password', { body: { ...body, currentPassword: u.password }, cookie: u.cookie });
    expect(locked.status).toBe(429);
    expect(await count("SELECT COUNT(*) AS n FROM rate_counters WHERE key LIKE 'login:fail:%'")).toBe(0);
    expect((await call('/api/auth/login', { body: { username: u.username, password: u.password } })).status).toBe(200);
  });

  it('锁到期那一刻并发 20 个错密码：失败计数写入不超过 failFree + 1 行', async () => {
    const u = await registerUser();
    const body = { currentPassword: 'Wrong-Pass-1', newPassword: 'Brand-New-Pass-2' };
    await flushMeter();
    const before = await count('SELECT SUM(rows_acct) AS n FROM meter_hourly');
    const results = await Promise.all(Array.from({ length: 20 }, () => call('/api/account/password', { body, cookie: u.cookie })));
    expect(results.every((r) => r.status === 401 || r.status === 429)).toBe(true);
    await flushMeter();
    expect((await count('SELECT SUM(rows_acct) AS n FROM meter_hourly')) - before).toBeLessThanOrEqual(6);
  });

  it('新密码太弱：422；没登录：401', async () => {
    const u = await registerUser();
    expect(await errorOf(await call('/api/account/password', { body: { currentPassword: u.password, newPassword: 'iloveyou' }, cookie: u.cookie }))).toBe('weak_password');
    expect((await call('/api/account/password', { body: { currentPassword: u.password, newPassword: 'Brand-New-Pass-2' } })).status).toBe(401);
  });

  it('带着失效的会话调要登录的接口：401 unauthorized，并清掉两个 cookie；没带会话的不发 Set-Cookie', async () => {
    const u = await registerUser();
    await env.DB.prepare('DELETE FROM sessions').run();
    const res = await call('/api/saves/kaipan/a', { method: 'PUT', body: { baseRev: 0, data: 1 }, cookie: u.cookie });
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toBe('unauthorized');
    expect(sidOf(res)).toBe('');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('__Host-arcade_li=;') && c.includes('Max-Age=0'))).toBe(true);
    expect(rowsWritten()).toBe(0);
    const anon = await call('/api/saves/kaipan');
    expect(anon.status).toBe(401);
    expect(anon.headers.getSetCookie()).toEqual([]);
  });

  it('acct 每人每天上限：成功的才算，超了 429 且不验密码', async () => {
    await resetAll({ acctPerDay: 2 });
    const u = await registerUser();
    let cookie = u.cookie;
    let pw = u.password;
    for (const next of ['Brand-New-Pass-2', 'Brand-New-Pass-3']) {
      const res = await call('/api/account/password', { body: { currentPassword: pw, newPassword: next }, cookie });
      expect(res.status).toBe(204);
      cookie = sidOf(res)!;
      pw = next;
    }
    // 失败的不算：错密码不增加 acct 计数
    const res = await call('/api/account/recovery-code', { body: { currentPassword: pw }, cookie });
    expect(res.status).toBe(429);
    expect(rowsWritten()).toBe(0);
  });
});

describe('换恢复码、退出其他设备', () => {
  it('换恢复码：旧码作废、新码能用，写 2 行', async () => {
    const u = await registerUser();
    const res = await call('/api/account/recovery-code', { body: { currentPassword: u.password }, cookie: u.cookie });
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(2);
    const { recoveryCode } = (await res.json()) as { recoveryCode: string };
    const old = await call('/api/auth/recover', { body: { username: u.username, recoveryCode: u.recoveryCode, newPassword: 'Brand-New-Pass-2' } });
    expect(old.status).toBe(401);
    const ok = await call('/api/auth/recover', { body: { username: u.username, recoveryCode, newPassword: 'Brand-New-Pass-2' } });
    expect(ok.status).toBe(200);
  });

  it('退出其他设备：只留当前会话，写 1 + 其他会话数 行', async () => {
    const u = await registerUser();
    const a = await secondDevice(u.username, u.password);
    const b = await secondDevice(u.username, u.password);
    const res = await call('/api/account/logout-others', { body: { currentPassword: u.password }, cookie: u.cookie });
    expect(res.status).toBe(204);
    expect(rowsWritten()).toBe(3);
    expect(await me(u.cookie)).not.toBeNull();
    expect(await me(a)).toBeNull();
    expect(await me(b)).toBeNull();
  });
});

describe('注销', () => {
  it('用密码或恢复码都行；7 张表里这个人的行全部删干净，别人的不动', async () => {
    const u = await registerUser();
    const other = await registerUser();
    await secondDevice(u.username, u.password);
    // 手动造好友、屏蔽、存档、限流计数（这些接口在后面的 PR 里上线）
    const [a, b] = [u.user.id, other.user.id].sort();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO friendships VALUES (?1, ?2, 'accepted', ?1, 1)").bind(a, b),
      env.DB.prepare('INSERT INTO blocks VALUES (?1, ?2, 1)').bind(other.user.id, u.user.id),
      env.DB.prepare("INSERT INTO saves VALUES (?1, 'kaipan', 'profile', 1, '{}', 2, 1)").bind(u.user.id),
      env.DB.prepare("INSERT INTO saves VALUES (?1, 'kaipan', 'profile', 1, '{}', 2, 1)").bind(other.user.id),
      env.DB.prepare('INSERT INTO rate_counters VALUES (?1, 1, 1, 0)').bind(`save:${u.user.id}`),
      env.DB.prepare('INSERT INTO rate_counters VALUES (?1, 1, 1, 0)').bind(`login:fail:${u.username}`),
    ]);

    const wrong = await call('/api/account/delete', { body: { recoveryCode: 'AAAAA-AAAAA-AAAAA-AAAAA' }, cookie: u.cookie });
    expect(wrong.status).toBe(401);
    const res = await call('/api/account/delete', { body: { recoveryCode: u.recoveryCode }, cookie: u.cookie });
    expect(res.status).toBe(204);
    expect(sidOf(res)).toBe('');

    const id = u.user.id;
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?1', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?1', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?1', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM saves WHERE user_id = ?1', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM friendships WHERE user_a = ?1 OR user_b = ?1', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM blocks WHERE blocker = ?1 OR blocked = ?1', id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM rate_counters WHERE key LIKE ?1 OR key LIKE ?2', `%${id}`, `%${u.username}`)).toBe(0);
    // 别人的不动
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?1', other.user.id)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM saves WHERE user_id = ?1', other.user.id)).toBe(1);
    expect(await me(other.cookie)).not.toBeNull();
    // 用户名可以再注册
    await registerUser(u.username);
  });

  it('请求体里既没密码也没恢复码：400', async () => {
    const u = await registerUser();
    expect((await call('/api/account/delete', { body: {}, cookie: u.cookie })).status).toBe(400);
  });
});
