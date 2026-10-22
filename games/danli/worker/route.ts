/**
 * danli Worker 的路由：挂在站点的 /games/danli*。两种部署由 env 决定（kit 的平台模式和独立模式）：
 * - 本站：部署工具按 tools/workers.json 补上平台绑定和 GATE=login，首页过登录闸门；
 * - 独立部署（wrangler.jsonc 原样，没有平台）：kit 补发游客 cookie，谁打开都能玩；站点根 / 转到 /games/danli/、/api/me 回"没有平台"（standaloneRoot）。
 * /games/danli/health 给平台巡检用（docs/platform-backend.md 第 16 节）：排在最前面，不过登录闸门、不读存储、不问平台，单独部署时也能访问。
 * 好友房（DESIGN.md 5.6）只接 kit 的两个入口：POST /games/danli/rooms 开房（acceptCreate），/games/danli/rooms/<码>/ws 进房（acceptJoin）；
 * 不自己把浏览器的请求转给房间。部署时注入了 SITE_ORIGIN 就只认这个站点的页面，没有就认请求自己的 origin。
 * 别的路径由静态资源直接回（wrangler.jsonc 的 run_worker_first 只列了上面这些）。
 * 单独一个模块：入口 main.ts 只导出 default（具名导出会让单独部署的 Worker 起不来），测试从这里引。
 */
import { acceptCreate, acceptJoin, loginGate, standaloneRoot, type GateEnv, type KitEnv } from 'arcade-kit/worker';
import pkg from '../package.json' with { type: 'json' };
import { PERSONAS } from '../src/ai/personas.ts';

const GAME = 'danli';
const BASE = `/games/${GAME}`;
export const HEALTH_PATH = `${BASE}/health`;
export const ROOMS_PATH = `${BASE}/rooms`;
const JOIN_RE = /^\/games\/danli\/rooms\/(\d{6})\/ws$/;
export type Env = GateEnv & KitEnv & { SITE_ORIGIN?: string };

/** 独立模式的游客：真人的昵称不许和电脑重名（平台模式下由平台的保留昵称管） */
const GUEST = { reserved: PERSONAS.map((p) => p.name) };

const DOWN_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>弹里个弹</title>
<style>body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:#efe8dc;color:#46291a;font:16px/1.6 system-ui,sans-serif;text-align:center}
a{color:#e2432a}</style></head>
<body><main><h1>平台暂时连不上</h1><p>稍等一会儿再刷新试试。</p><p><a href="/">回大厅</a></p></main></body></html>`;

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  // 巡检：版本号是 package.json 的（wrangler 打包时内联），不缓存
  if (path === HEALTH_PATH && (request.method === 'GET' || request.method === 'HEAD')) {
    return Response.json({ ok: true, version: pkg.version }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const root = standaloneRoot(request, env, GAME);
  if (root) return root;
  // 页面里的资源都用相对路径，没有结尾斜杠时相对路径会落到 /games/ 下
  if (path === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
  if (path === `${BASE}/` || path === `${BASE}/index.html`) return loginGate(request, env, { downPage: DOWN_PAGE, guest: GUEST });
  const gate = { guest: GUEST, ...(env.SITE_ORIGIN ? { siteOrigin: env.SITE_ORIGIN } : {}) };
  if (path === ROOMS_PATH) return acceptCreate(request, env, gate);
  const join = JOIN_RE.exec(path);
  if (join) return acceptJoin(request, env, join[1]!, gate);
  return env.ASSETS.fetch(request);
}
