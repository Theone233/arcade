/** 计量与熔断（6.6）：档位、分类预算、账号安全类的例外、紧急开关、上报失败即停服。 */
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMeterForTests } from '../worker/api/meter';
import { handleApi } from '../worker/api/router';
import type { Env } from '../worker/env';
import { advance, call, count, env, errorOf, flushMeter, GOOD_PASSWORD, meter, ORIGIN, registerUser, resetAll, rowsWritten, sidOf, uniqueName } from './helpers';

beforeEach(() => resetAll());

/** 往今天的计量里塞一行"别的 isolate 报上来的"用量，再让本 isolate 重新读档位。 */
async function seed(cols: Record<string, number>): Promise<void> {
  const hour = new Date(Date.now() - 3_600_000).toISOString().slice(0, 13);
  const today = new Date().toISOString().slice(0, 10);
  // 跨了 UTC 0 点的那一小时算昨天，就放进当前小时
  const key = hour.startsWith(today) ? hour : new Date().toISOString().slice(0, 13);
  const names = Object.keys(cols);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO meter_hourly (hour, ${names.join(', ')}, updated_at) VALUES (?1, ${names.map((_, i) => `?${i + 2}`).join(', ')}, 0)`,
  )
    .bind(key, ...Object.values(cols))
    .run();
  resetMeterForTests();
}

const register = () => call('/api/auth/register', { body: { username: uniqueName(), password: GOOD_PASSWORD, displayName: '小红' } });
const login = (u: { username: string; password: string }) => call('/api/auth/login', { body: { username: u.username, password: u.password } });
const putSave = (u: { cookie: string }, slot: string, baseRev: number) =>
  call(`/api/saves/kaipan/${slot}`, { method: 'PUT', body: { baseRev, data: { slot } }, cookie: u.cookie });
const getSaves = (u: { cookie: string }) => call('/api/saves/kaipan', { cookie: u.cookie });

describe('上报', () => {
  it('本 isolate 第一次请求先上报；之后按类别累计写入行数', async () => {
    await registerUser();
    await flushMeter();
    const row = await env.DB.prepare('SELECT * FROM meter_hourly').first<Record<string, number>>();
    expect(row!.requests).toBeGreaterThanOrEqual(1);
    expect(row!.rows_reg).toBe(9);
    expect(row!.db_size).toBeGreaterThan(0);
  });

  it('交分的写入报进 rows_board，不算进 rows_save', async () => {
    const u = await registerUser();
    await flushMeter();
    await call('/api/scores', { body: { gameId: 'kaipan', boardId: 'daily-2026-10-14', score: 1 }, cookie: u.cookie });
    await flushMeter();
    const row = await env.DB.prepare('SELECT SUM(rows_board) AS board, SUM(rows_save) AS save FROM meter_hourly').first<Record<string, number>>();
    expect(row).toEqual({ board: 3, save: 0 });
  });

  it('任何一项到 80%：有写入的调用每次都上报', async () => {
    await resetAll({ meterEagerRatio: 0.8, meterEagerMinMs: 1 });
    await seed({ requests: 32_000 });
    const fail = () => call('/api/auth/login', { body: { username: 'ghost_user', password: 'Wrong-Pass-1' } });
    await fail(); // 和冷启动那次上报同一时刻：没到最小间隔，不报
    advance(5);
    await fail();
    // 平时要攒 meterFlushCalls（这里设得极大）次才报；到了 80% 每次有写入的调用都在 waitUntil 里报
    // waitUntil 里的上报什么时候落库取决于机器快慢：最多等 5 秒
    await vi.waitFor(async () => expect(await count('SELECT SUM(requests) AS n FROM meter_hourly')).toBe(32_002), { timeout: 5_000, interval: 10 });
  });

  it('eager 只在有真用量时、至少隔 1 秒才报：刷 404 不放大写入', async () => {
    await resetAll({ meterEagerRatio: 0.8, meterEagerMinMs: 1_000 });
    await seed({ requests: 32_000 });
    await call('/api/me');
    const spy = vi.spyOn(meter, 'flush');
    // 每次都过了最小间隔，挡住它们的只能是"没有真用量"
    for (let i = 0; i < 30; i++) {
      advance(1_000);
      await call('/api/nope');
    }
    expect(spy).not.toHaveBeenCalled();
    // 有写入的请求（错密码登录）也要隔够最小间隔：间隔设 60 秒，先拨过去，再每秒一次连发 10 次，只报第一次
    await resetAll.limits({ meterEagerRatio: 0.8, meterEagerMinMs: 60_000, anonPerIpPerMinute: 1_000, loginPerIpHour: 1_000 });
    advance(60_000);
    for (let i = 0; i < 10; i++) {
      await call('/api/auth/login', { body: { username: 'ghost_user', password: 'Wrong-Pass-1' } });
      advance(1_000);
    }
    expect(spy.mock.calls.length).toBe(1);
    spy.mockRestore();
  });

  it('上报自己写的行不算真用量：接近阈值时只有 404 也不会一次引出下一次', async () => {
    await resetAll({ meterEagerRatio: 0.8, meterEagerMinMs: 1 });
    await seed({ requests: 32_000 });
    await call('/api/me');
    const spy = vi.spyOn(meter, 'flush');
    for (let i = 0; i < 10; i++) {
      advance(3);
      await call('/api/nope');
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('停服档不按调用次数报，也不 eager：连发请求只有冷启动那一次上报', async () => {
    // 对照：正常档下攒够 meterFlushCalls 次就报
    await resetAll({ meterFlushCalls: 5 });
    const normal = vi.spyOn(meter, 'flush');
    for (let i = 0; i < 12; i++) await call('/api/nope');
    expect(normal.mock.calls.length).toBeGreaterThanOrEqual(2);
    normal.mockRestore();

    await resetAll({ meterFlushCalls: 5, meterEagerRatio: 0.8, meterEagerMinMs: 1 });
    await seed({ requests: 60_000 });
    const spy = vi.spyOn(meter, 'flush');
    // 每次都过了 eager 的最小间隔，又没到 meterFlushMs：挡住它们的只能是"停服档不 eager、不按次数报"
    for (let i = 0; i < 20; i++) {
      advance(5);
      await call('/api/nope');
    }
    for (let i = 0; i < 5; i++) {
      advance(5);
      await call('/api/auth/login', { body: { username: 'ghost_user', password: 'Wrong-Pass-1' } });
    }
    expect(spy.mock.calls.length).toBe(1);
    spy.mockRestore();
  });

  it('API_MODE=off 时也不按调用次数报', async () => {
    await resetAll({ meterFlushCalls: 3 });
    await seed({ requests: 32_000 });
    const e = { ...env, API_MODE: 'off' };
    await handleApi(new Request(`${ORIGIN}/api/me`), e, createExecutionContext());
    const spy = vi.spyOn(meter, 'flush');
    for (let i = 0; i < 10; i++) {
      meter.countCall(); // 入口（worker/index.ts）每次都会计
      await handleApi(new Request(`${ORIGIN}/api/me`), e, createExecutionContext());
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('冷启动时并发进来的请求等第一次上报，不被误判停服', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => call('/api/me')));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
  });

  it('上报失败：进停服档（503），重试成功后恢复', async () => {
    const broken = { ...env, DB: { ...env.DB, prepare: env.DB.prepare.bind(env.DB), batch: () => Promise.reject(new Error('down')) } } as unknown as Env;
    const direct = (e: Env) => handleApi(new Request(`${ORIGIN}/api/me`), e, createExecutionContext());
    expect((await direct(broken)).status).toBe(503);
    // 还没到重试时间（meterRetryMs 默认 10 秒）：即使库好了也先停着
    advance(9_999);
    expect((await direct(env)).status).toBe(503);
    advance(1);
    expect((await direct(env)).status).toBe(200);
  });

  it('上报卡住超过 meterFlushTimeoutMs：按失败处理（503），不把请求挂住；卡住的那次回来也不改档位', async () => {
    await resetAll({ meterFlushTimeoutMs: 50 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stuck = {
      ...env,
      DB: {
        prepare: env.DB.prepare.bind(env.DB),
        batch: async (s: D1PreparedStatement[]) => {
          await gate;
          return env.DB.batch(s);
        },
      },
    } as unknown as Env;
    const direct = (e: Env) => handleApi(new Request(`${ORIGIN}/api/me`), e, createExecutionContext());
    const started = performance.now();
    const results = await Promise.all(Array.from({ length: 3 }, () => direct(stuck)));
    expect(results.map((r) => r.status)).toEqual([503, 503, 503]);
    expect(performance.now() - started).toBeLessThan(2_000);

    // 卡住的那次回来了：计数照样写进去，但档位不被它改回正常，等重试
    const failedAt = Date.now();
    release();
    // 注意：假时钟下 vi.waitFor 每轮会自动把时间往前拨一点，所以下面按 failedAt 算重试时间
    await vi.waitFor(async () => expect(await count('SELECT COUNT(*) AS n FROM meter_hourly')).toBe(1));
    expect((await direct(env)).status).toBe(503);
    vi.setSystemTime(failedAt + 10_000);
    expect((await direct(env)).status).toBe(200);
  });
});

describe('总量档位', () => {
  it('只读：写接口 503（含注册、登录），读照常并标 readonly；退出照样删会话', async () => {
    const u = await registerUser();
    await seed({ requests: 40_000 });
    expect(await errorOf(await register())).toBe('busy');
    expect((await login(u)).status).toBe(503);
    const me = await call('/api/me', { cookie: u.cookie });
    expect(await me.json()).toMatchObject({ service: 'readonly' });
    expect((await putSave(u, 'a', 0)).status).toBe(503);
    expect((await getSaves(u)).status).toBe(200);
    const out = await call('/api/auth/logout', { body: {}, cookie: u.cookie });
    expect(out.status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM sessions')).toBe(0);
  });

  it('只读也可以由读取行数或库大小（取每次调用的 size_after）触发', async () => {
    const u = await registerUser();
    await seed({ rows_read: 3_000_000 });
    expect((await login(u)).status).toBe(503);
    await resetAll.limits({ readonly: { calls: 40_000, rowsWritten: 50_000, rowsRead: 3_000_000, dbBytes: 1 } });
    await seed({ requests: 0 });
    expect((await login(u)).status).toBe(503);
  });

  it('停服：/api 一律 503 不碰 D1；退出只清 cookie', async () => {
    const u = await registerUser();
    await seed({ rows_auth: 80_000 });
    await call('/api/me');
    expect((await call('/api/me', { cookie: u.cookie })).status).toBe(503);
    expect(rowsWritten()).toBe(0);
    const out = await call('/api/auth/logout', { body: {}, cookie: u.cookie });
    expect(out.status).toBe(204);
    expect(sidOf(out)).toBe('');
    expect(rowsWritten()).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM sessions')).toBe(1);
  });

  it('停增长（库 ≥ 300 MB）：停注册和新建存档槽，已有的槽照常覆盖，登录照常，存档标 paused', async () => {
    const u = await registerUser();
    expect((await putSave(u, 'old', 0)).status).toBe(200);
    await env.DB.prepare('UPDATE saves SET updated_at = 0').run();
    await resetAll.limits({ noGrowthDbBytes: 1 });
    expect((await register()).status).toBe(503);
    expect((await login(u)).status).toBe(200);
    expect(await (await call('/api/me')).json()).toMatchObject({ service: 'ok', saves: 'paused' });
    const fresh = await putSave(u, 'new', 0);
    expect(await errorOf(fresh)).toBe('busy');
    expect(rowsWritten()).toBe(0);
    expect((await putSave(u, 'old', 1)).status).toBe(200);
  });

  it('停增长档：覆盖不许变大（503、只写计数 1 行），变小或一样大照常', async () => {
    const u = await registerUser();
    const over = (rev: number, data: string) =>
      call('/api/saves/kaipan/p', { method: 'PUT', body: { baseRev: rev, data }, cookie: u.cookie });
    expect((await over(0, 'x'.repeat(100))).status).toBe(200);
    await resetAll.limits({ noGrowthDbBytes: 1 });
    const aged = () => env.DB.prepare('UPDATE saves SET updated_at = 0').run();
    await aged();
    const bigger = await over(1, 'x'.repeat(101));
    expect(await errorOf(bigger)).toBe('busy');
    expect(rowsWritten()).toBe(1);
    expect((await over(1, 'y'.repeat(100))).status).toBe(200);
    await aged();
    expect((await over(2, 'z'.repeat(10))).status).toBe(200);
    expect(await count('SELECT size AS n FROM saves')).toBe(12);
  });
});

describe('分类预算：一类用完只停这一类', () => {
  it('注册类用完：只停注册，登录照常', async () => {
    const u = await registerUser();
    await seed({ rows_reg: 2_700 });
    expect((await register()).status).toBe(503);
    expect((await login(u)).status).toBe(200);
  });

  it('存档类用完：存档写入 503、0 行，读存档、登录照常，/api/me 标 paused', async () => {
    const u = await registerUser();
    expect((await putSave(u, 'a', 0)).status).toBe(200);
    await seed({ rows_save: 14_800 });
    const res = await putSave(u, 'b', 0);
    expect(res.status).toBe(503);
    expect(rowsWritten()).toBe(0);
    expect((await getSaves(u)).status).toBe(200);
    expect((await login(u)).status).toBe(200);
    expect(await (await call('/api/me', { cookie: u.cookie })).json()).toMatchObject({ saves: 'paused' });
  });

  it('登录找回类用完：停登录，注册和已登录的读写照常', async () => {
    const u = await registerUser();
    await seed({ rows_auth: 12_000 });
    expect((await login(u)).status).toBe(503);
    expect((await register()).status).toBe(201);
    expect((await call('/api/me', { method: 'PATCH', body: { displayName: '新名字' }, cookie: u.cookie })).status).toBe(200);
  });

  it('排行榜类用完：只停交分，云存档照常；存档类用完时交分照常', async () => {
    const u = await registerUser();
    const score = (n: number) => call('/api/scores', { body: { gameId: 'kaipan', boardId: 'daily-2026-10-14', score: n }, cookie: u.cookie });
    const save = (rev: number) => call('/api/saves/kaipan/p', { method: 'PUT', body: { baseRev: rev, data: 'x' }, cookie: u.cookie });
    await seed({ rows_board: 2_500 });
    const res = await score(1);
    expect(await errorOf(res)).toBe('busy');
    expect(rowsWritten()).toBe(0);
    expect((await save(0)).status).toBe(200);
    await seed({ rows_save: 9_300 });
    expect((await score(1)).status).toBe(200);
  });

  it('好友与资料类用完：改昵称 503，/api/me 不做顺带写入', async () => {
    const u = await registerUser();
    await env.DB.prepare('UPDATE users SET last_seen_at = 1').run();
    await seed({ rows_social: 5_000 });
    expect((await call('/api/me', { cookie: u.cookie })).status).toBe(200);
    expect(rowsWritten()).toBe(0);
    expect((await call('/api/me', { method: 'PATCH', body: { displayName: '新名字' }, cookie: u.cookie })).status).toBe(503);
  });

  it('账号安全类用完：停换恢复码；改密码照做；超额封顶也用完后改密码也停，注销、退出照做', async () => {
    const u = await registerUser();
    await seed({ rows_acct: 2_000 });
    expect((await call('/api/account/recovery-code', { body: { currentPassword: u.password }, cookie: u.cookie })).status).toBe(503);
    const pw = await call('/api/account/password', { body: { currentPassword: u.password, newPassword: 'Brand-New-Pass-2' }, cookie: u.cookie });
    expect(pw.status).toBe(204);
    const cookie = sidOf(pw)!;

    await seed({ rows_acct: 5_000 });
    const capped = await call('/api/account/password', { body: { currentPassword: 'Brand-New-Pass-2', newPassword: 'Brand-New-Pass-3' }, cookie });
    expect(capped.status).toBe(503);
    expect((await call('/api/account/logout-others', { body: { currentPassword: 'Brand-New-Pass-2' }, cookie })).status).toBe(503);
    expect((await call('/api/auth/logout', { body: {}, cookie })).status).toBe(204);

    // 封顶也用完了：对的密码照样能注销
    const v = await registerUser(uniqueName(), GOOD_PASSWORD, '198.51.100.77');
    expect((await call('/api/account/delete', { body: { currentPassword: v.password }, cookie: v.cookie })).status).toBe(204);
  });

  it('封顶用完后错密码注销：不写行，猜错一次就锁到当天结束，之后连对的密码也不再验', async () => {
    const v = await registerUser(uniqueName(), GOOD_PASSWORD, '198.51.100.77');
    await seed({ rows_acct: 5_000 });
    const del = (pw: string) => call('/api/account/delete', { body: { currentPassword: pw }, cookie: v.cookie });
    const wrong = await del('Wrong-Pass-1');
    expect(wrong.status).toBe(429);
    expect(rowsWritten()).toBe(0);
    for (let i = 0; i < 10; i++) {
      expect((await del(`Wrong-Pass-${i + 2}`)).status).toBe(429);
      expect(rowsWritten()).toBe(0);
    }
    // 对的密码也 429：说明后面这些请求根本没走到验密码，猜的次数 ≤ 1
    const right = await del(v.password);
    expect(right.status).toBe(429);
    const now = Date.now();
    expect(Number(right.headers.get('retry-after'))).toBe(Math.ceil((86_400_000 - (now % 86_400_000)) / 1000));
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?1', v.user.id)).toBe(1);
  });

  it('封顶用完、库里已经错够 failFree 次：换个 isolate 也不验密码，直接 429', async () => {
    const v = await registerUser(uniqueName(), GOOD_PASSWORD, '198.51.100.78');
    await env.DB.prepare('INSERT INTO rate_counters (key, window_start, count, blocked_until) VALUES (?1, ?2, 5, 0)')
      .bind(`reauth:fail:${v.user.id}`, Date.now() - 1_000)
      .run();
    await seed({ rows_acct: 5_000 });
    await resetAll.cacheOnly();
    const right = await call('/api/account/delete', { body: { currentPassword: v.password }, cookie: v.cookie });
    expect(right.status).toBe(429);
    expect(rowsWritten()).toBe(0);
    // 封顶没用完时，同样的失败行（没在锁）照常验密码
    await seed({ rows_acct: 0 });
    expect((await call('/api/account/delete', { body: { currentPassword: v.password }, cookie: v.cookie })).status).toBe(204);
  });
});

describe('紧急开关 API_MODE（Secret）', () => {
  const direct = async (path: string, e: Env, init: RequestInit = {}) => {
    const ctx = createExecutionContext();
    const res = await handleApi(new Request(`${ORIGIN}${path}`, init), e, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };

  it('不分大小写、去空白；认不出的值按 off（fail-closed）', async () => {
    expect((await direct('/api/me', { ...env, API_MODE: ' OFF ' })).status).toBe(503);
    expect(await (await direct('/api/me', { ...env, API_MODE: 'Readonly' })).json()).toMatchObject({ service: 'readonly' });
    expect((await direct('/api/me', { ...env, API_MODE: 'oof' })).status).toBe(503);
    expect((await direct('/api/me', { ...env, API_MODE: 'normal' })).status).toBe(200);
  });

  it('off：/api/me 也 503；readonly：写 503、读照常', async () => {
    expect((await direct('/api/me', { ...env, API_MODE: 'off' })).status).toBe(503);
    expect((await direct('/api/me', { ...env, API_MODE: 'readonly' })).status).toBe(200);
    const res = await direct('/api/auth/register', { ...env, API_MODE: 'readonly' }, {
      method: 'POST',
      headers: { 'x-arcade': '1', origin: ORIGIN, 'cf-connecting-ip': '192.0.2.1' },
      body: JSON.stringify({ username: 'carol_1', password: GOOD_PASSWORD, displayName: '小红' }),
    });
    expect(res.status).toBe(503);
  });

  it('缺 pepper Secret：503 busy，不写半截数据', async () => {
    const res = await direct('/api/auth/register', { ...env, PEPPER_PW: undefined }, {
      method: 'POST',
      headers: { 'x-arcade': '1', origin: ORIGIN, 'cf-connecting-ip': '192.0.2.2' },
      body: JSON.stringify({ username: 'dave_1', password: GOOD_PASSWORD, displayName: '小红' }),
    });
    expect(res.status).toBe(503);
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(0);
  });
});
