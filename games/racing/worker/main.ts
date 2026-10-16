/**
 * racing Worker：挂在站点的 /games/racing*（路由部署时注入，DESIGN.md 第 6 节）。
 * - 首页三个路径过登录闸门（kit 0.8.0 的 loginGate）：登录了放行，没登录 302 到 /login?next=<原路径和查询参数>，平台不可用回 503 页；GATE=off 时不拦；
 * - /games/racing/rooms（开房）、/games/racing/rooms/<码>/ws（进房）原样交给 kit 的 acceptCreate / acceptJoin；
 *   开房的请求体 { opts } 是赛道、圈数、几辆车、电脑强弱，kit 开房时校验、定下，进房的人都看得到；
 * - 别的路径不经过这里（wrangler.jsonc 的 run_worker_first 只列了上面这些），由静态资源直接回。
 * 娱乐模式，不碰钱包（DESIGN.md 第 7 节）。
 */
import type { MeterEnv } from 'arcade-kit/meter';
import { acceptCreate, acceptJoin, loginGate, readJson } from 'arcade-kit/worker';
import type { RacingRoom } from './room.ts';

export { RoomMeter } from 'arcade-kit/meter';
export { RacingRoom } from './room.ts';

export interface Env extends MeterEnv {
  ASSETS: Fetcher;
  ARCADE?: Fetcher;
  ROOM: DurableObjectNamespace<RacingRoom>;
  /** off 以外（包括没配）都要登录 */
  GATE?: string;
  /** 开房、进房只认这个 Origin（部署时注入）；没设就认请求自己的 origin */
  SITE_ORIGIN?: string;
}

const BASE = '/games/racing';
const ROOMS = `${BASE}/rooms`;
const JOIN = /^\/games\/racing\/rooms\/([^/]+)\/ws$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    // 页面里的资源和接口都用相对路径，没有结尾斜杠时相对路径会落到 /games/ 下
    if (path === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    if (path === `${BASE}/` || path === `${BASE}/index.html`) return loginGate(request, env, { downPage: DOWN_PAGE });
    if (path === ROOMS) return acceptCreate(request, env, { siteOrigin: env.SITE_ORIGIN, options: await roomOpts(request) });
    const join = JOIN.exec(path);
    if (join) return acceptJoin(request, env, join[1]!, { siteOrigin: env.SITE_ORIGIN });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/**
 * 开房请求体里的 { opts }。一律开房就定：没带、太长、不是 JSON 都当 null，kit 回 400 bad_options。
 * 这一步在 kit 认人之前：必须带 content-length 且不超过 512 字节才读。非 POST 的不读（kit 回 405）
 */
async function roomOpts(request: Request): Promise<unknown> {
  if (request.method !== 'POST') return null;
  return ((await readJson(request, 512)) as { opts?: unknown } | null)?.opts ?? null;
}

const DOWN_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>飞驰</title>
<style>body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:#0f1820;color:#e9f0f6;font:16px/1.6 system-ui,sans-serif;text-align:center}
a{color:#ff6b5e}</style></head>
<body><main><h1>平台暂时连不上</h1><p>稍等一会儿再刷新试试。</p><p><a href="/">回大厅</a></p></main></body></html>`;
