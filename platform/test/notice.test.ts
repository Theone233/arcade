/** 大厅公告（0.10.8）：管理员发、撤，跟着 /api/me 回给登录了的人，30 秒缓存。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetSettingsCacheForTests } from '../worker/api/settings';
import { advance, call, env, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

async function admin() {
  const a = await registerUser();
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(a.user.id).run();
  return a;
}
const setNotice = (cookie: string, text: unknown) => call('/api/admin/settings/notice', { body: { text }, cookie });
const noticeOf = async (cookie?: string) => ((await (await call('/api/me', { cookie })).json()) as { notice: unknown }).notice;

describe('大厅公告（0.10.8）', () => {
  it('发了以后登录的人在 /api/me 里看到；没登录的看不到；写 2 行', async () => {
    const [a, u] = [await admin(), await registerUser()];
    expect(await noticeOf(u.cookie)).toBeNull();
    const res = await setNotice(a.cookie, '  今晚 9 点\n掼蛋好友局，\t来凑一桌  ');
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(2);
    const body = (await res.json()) as { notice: { text: string; by: string; at: number }; max: number };
    expect(body.notice).toMatchObject({ text: '今晚 9 点 掼蛋好友局， 来凑一桌', by: a.username });
    expect(body.max).toBe(120);
    expect(await noticeOf(u.cookie)).toEqual({ text: '今晚 9 点 掼蛋好友局， 来凑一桌', at: body.notice.at });
    expect(await noticeOf()).toBeNull();
  });

  it('空字符串是撤下；只有管理员能发；太长整个拒', async () => {
    const [a, u] = [await admin(), await registerUser()];
    await setNotice(a.cookie, '有公告');
    expect((await setNotice(u.cookie, '我也发')).status).toBe(403);
    const long = await setNotice(a.cookie, '字'.repeat(121));
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: 'bad_request', max: 120 });
    expect((await setNotice(a.cookie, '字'.repeat(120))).status).toBe(200);
    expect((await setNotice(a.cookie, 42)).status).toBe(400);
    const off = await setNotice(a.cookie, '   ');
    expect(await off.json()).toMatchObject({ notice: null });
    expect(await noticeOf(u.cookie)).toBeNull();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'notice'").first<{ n: number }>())?.n).toBe(0);
  });

  it('/api/me 缓存 30 秒：别的 isolate 改的，最多晚 30 秒看到', async () => {
    const [a, u] = [await admin(), await registerUser()];
    expect(await noticeOf(u.cookie)).toBeNull();
    // 模拟别的 isolate 改了：直接写库，本 isolate 的缓存不知道
    await setNotice(a.cookie, '新公告');
    resetSettingsCacheForTests();
    expect(await noticeOf(u.cookie)).toMatchObject({ text: '新公告' });
    await env.DB.prepare("DELETE FROM settings WHERE key = 'notice'").run();
    expect(await noticeOf(u.cookie)).toMatchObject({ text: '新公告' });
    advance(30_000);
    expect(await noticeOf(u.cookie)).toBeNull();
  });
});
