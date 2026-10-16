/**
 * 独立部署（kit 0.10 的独立模式，docs/new-game.md 第 7 节）：wrangler.jsonc 原样部署、没有平台时，
 * env 里没有 ARCADE、GATE 也不是 login。这里拿测试 Worker 的 env 去掉这两样，直接调 Worker 的 fetch（不另加 wrangler 配置）。
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/main.ts';

const SITE = 'https://racing.example.workers.dev';
const alone = { ...env, ARCADE: undefined, GATE: undefined } as unknown as Env;
const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`${SITE}${path}`, { redirect: 'manual', ...init }) as Parameters<typeof worker.fetch>[0], alone);
const cookieOf = (r: Response): string => (r.headers.get('set-cookie') ?? '').split(';')[0]!;

describe('独立部署', () => {
  it('站点根转到 /games/racing/，首页直接给页面并发游客 cookie', async () => {
    const root = await call('/?name=x');
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/games/racing/?name=x');
    const home = await call('/games/racing/');
    expect(home.status).toBe(200);
    expect(cookieOf(home)).toMatch(/kit-guest=/);
  });

  it('游客能开房、进房；昵称不许冒充电脑', async () => {
    const home = await call('/games/racing/');
    const cookie = cookieOf(home);
    // 直接构造的 Request 不会自己带 content-length，开房读请求体要它（Worker 只读带长度的）
    const body = JSON.stringify({ opts: { track: 'lakeside', laps: 1, cars: 2, level: 'easy' } });
    const res = await call('/games/racing/rooms?name=%E5%BC%AF%E9%81%93%E7%8E%8B', {
      method: 'POST',
      headers: { origin: SITE, cookie, 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(body).length) },
      body,
    });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    const ws = await call(`/games/racing/rooms/${code}/ws?cv=1&name=%E5%BC%AF%E9%81%93%E7%8E%8B`, { headers: { upgrade: 'websocket', origin: SITE, cookie } });
    expect(ws.status).toBe(101);
    const sock = ws.webSocket!;
    sock.accept();
    const welcome = await new Promise<{ room: { seats: { name: string | null }[] } }>((ok) =>
      sock.addEventListener('message', (e) => ok(JSON.parse(e.data as string))),
    );
    // 开房的人坐 0 号；"弯道王"是电脑的名字，换成默认的"游客 + 数字"
    expect(welcome.room.seats[0]!.name).toMatch(/^游客\d+$/);
    sock.close();
  });

  it('没有游客 cookie 不能进房', async () => {
    const ws = await call('/games/racing/rooms/123456/ws?cv=1', { headers: { upgrade: 'websocket', origin: SITE } });
    expect(ws.status).toBe(101);
    const closed = await new Promise<number>((ok) => {
      ws.webSocket!.accept();
      ws.webSocket!.addEventListener('close', (e) => ok(e.code));
    });
    expect(closed).toBe(4401);
  });
});
