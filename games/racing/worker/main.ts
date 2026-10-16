/**
 * racing Worker：挂在站点的 /games/racing*（DESIGN.md 第 6 节）。两种部署由 env 决定（kit 0.10 的平台模式和独立模式）：
 * - 本站：部署工具补上 ARCADE 绑定和 GATE=login，认人走平台的 /api/me；
 * - 独立部署（wrangler.jsonc 原样，没有平台）：kit 发游客 cookie，任何人打开就能玩；站点根 / 转到 /games/racing/（standaloneRoot）。
 * 路由：
 * - 首页三个路径过登录闸门（kit 的 loginGate）：平台模式登录了放行，没登录 302 到 /login?next=<原路径和查询参数>，平台不可用回 503 页；独立模式放行并补发游客 cookie；
 * - /games/racing/rooms（开房）、/games/racing/rooms/<码>/ws（进房）原样交给 kit 的 acceptCreate / acceptJoin；
 *   开房的请求体 { opts } 是赛道、圈数、几辆车、电脑强弱，kit 开房时校验、定下，进房的人都看得到；
 * - 别的路径不经过这里（wrangler.jsonc 的 run_worker_first 只列了上面这些），由静态资源直接回。
 * 娱乐模式，不碰钱包（DESIGN.md 第 7 节）。
 */
import type { MeterEnv } from 'arcade-kit/meter';
import { acceptCreate, acceptJoin, loginGate, readJson, standaloneRoot } from 'arcade-kit/worker';
import { PERSONAS } from '../src/ai/personas.ts';
import type { RacingRoom } from './room.ts';

export { RoomMeter } from 'arcade-kit/meter';
export { RacingRoom } from './room.ts';

export interface Env extends MeterEnv {
  ASSETS: Fetcher;
  /** 平台（本站部署时由部署工具补上）；没有就是独立模式 */
  ARCADE?: Fetcher;
  ROOM: DurableObjectNamespace<RacingRoom>;
  /** 本站部署时是 login；独立模式不写 */
  GATE?: string;
  /** 开房、进房只认这个 Origin（部署时注入）；没设就认请求自己的 origin */
  SITE_ORIGIN?: string;
}

const BASE = '/games/racing';
const ROOMS = `${BASE}/rooms`;
const JOIN = /^\/games\/racing\/rooms\/([^/]+)\/ws$/;
/** 独立模式的游客：真人的昵称不许和电脑重名（平台模式下由平台的保留昵称管） */
const GUEST = { reserved: PERSONAS.map((p) => p.name) };

export default {
  async fetch(request, env): Promise<Response> {
    const root = standaloneRoot(request, env, 'racing');
    if (root) return root;
    const url = new URL(request.url);
    const path = url.pathname;
    // 页面里的资源和接口都用相对路径，没有结尾斜杠时相对路径会落到 /games/ 下
    if (path === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    if (path === `${BASE}/` || path === `${BASE}/index.html`) return loginGate(request, env, { downPage: DOWN_PAGE, guest: GUEST });
    if (path === ROOMS) return acceptCreate(request, env, { siteOrigin: env.SITE_ORIGIN, options: await roomOpts(request), guest: GUEST });
    const join = JOIN.exec(path);
    if (join) return acceptJoin(request, env, join[1]!, { siteOrigin: env.SITE_ORIGIN, guest: GUEST });
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
