/** /games/danli/health：平台巡检用（docs/platform-backend.md 第 16 节），走在登录闸门前面，不问平台、不碰静态资源，单独部署和本站都一样回 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { HEALTH_PATH, route, type Env } from '../worker/route.ts';

const ORIGIN = 'https://game.example.com';
const root = new URL('..', import.meta.url).pathname;

/** 不该被调到的绑定：调一次记一次 */
function never(): { calls: number; fetch: () => Promise<Response> } {
  const f = {
    calls: 0,
    fetch: async (): Promise<Response> => {
      f.calls++;
      return new Response('should not be called', { status: 500 });
    },
  };
  return f;
}

describe('健康检查', () => {
  it('单独部署：回 ok 和 package.json 的版本，不缓存，不碰静态资源', async () => {
    const a = never();
    const res = await route(new Request(`${ORIGIN}${HEALTH_PATH}`), { ASSETS: a } as unknown as Env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
    expect(a.calls).toBe(0);
  });

  it('本站（GATE=login）没登录（不带 cookie）也回 200，不问平台', async () => {
    const a = never();
    const p = never();
    const res = await route(new Request(`${ORIGIN}${HEALTH_PATH}`), { ASSETS: a, ARCADE: p, GATE: 'login' } as unknown as Env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
    expect(a.calls + p.calls).toBe(0);
  });

  it('HEAD 也回；别的方法、别的路径交给后面的路由', async () => {
    const env = { ASSETS: { fetch: async () => new Response('asset', { status: 404 }) }, GATE: 'login' } as unknown as Env;
    expect((await route(new Request(`${ORIGIN}${HEALTH_PATH}`, { method: 'HEAD' }), env)).status).toBe(200);
    expect((await route(new Request(`${ORIGIN}${HEALTH_PATH}`, { method: 'POST' }), env)).status).toBe(404);
    expect((await route(new Request(`${ORIGIN}/games/danli/healthz`), env)).status).toBe(404);
  });

  it('wrangler.jsonc：run_worker_first 有这个地址（不然被静态资源接走，Worker 收不到），observability 开着', () => {
    const text = readFileSync(`${root}wrangler.jsonc`, 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    const cfg = JSON.parse(text) as { assets: { run_worker_first: string[] }; observability?: { enabled: boolean } };
    expect(cfg.assets.run_worker_first).toContain(HEALTH_PATH);
    expect(cfg.observability?.enabled).toBe(true);
  });
});
