/// <reference types="@cloudflare/workers-types" />
/**
 * 掼蛋 Worker 的请求处理（worker/index.ts 的全部逻辑，单独成文件好测试）：登录闸门 + 联机房间的开房、进房两个路由。
 * 部署入口是 worker/main.ts（默认导出 + 房间类 Room），这里只放普通函数和常量。单机实盘的接口 /games/guandan/api/stake/* 在 stake.ts。
 *
 * 登录闸门只管首页。静态资源仍由 Workers 静态资源直接返回，只有首页导航的三个路径和房间接口 /games/guandan/room/*
 * （wrangler.jsonc 的 assets.run_worker_first）先经过这里，js、图片不经过、不多花请求额度。
 *
 * GATE = "off"：原样交给静态资源。
 * GATE = "login"（邀请制测试，2026-10-14 所有者定）：问平台 GET /api/me（服务绑定 ARCADE，只转发 Cookie 和 cf-connecting-ip，3 秒超时）。
 *   - 已登录 → 放行；未登录 → 302 到 /login?next=<请求的路径 + 查询>（平台 0.10.1，docs/platform-backend.md 5.7）：
 *     登录完整页回到原链接，查询原样带回，房间链接 ?room= 直接进房（0.6.0"叫朋友来"）；
 *   - 平台出错、不是 JSON、超时、绑定不存在 → 503"暂时确认不了你登录没有"。宁可暂时谁都进不去，也不能放行（所有者原话"不希望其他人可以玩到"）。
 * GATE 是 "off" 以外的任何值（包括没配）都按 login 处理：配错时同样不放行。
 */

import { acceptCreate, acceptJoin, type GateOptions, type KitEnv } from 'arcade-kit/worker';
import { CLOSE } from 'arcade-kit/protocol';
import { ROOM_PATH } from '../src/net/version.ts';
import { routeStake, type WalletRpc } from './stake.ts';

/** 服务绑定和静态资源绑定只用到 fetch；闸门的测试用假的绑定，这里自己声明最小接口。 */
export interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
  ARCADE?: Fetcher;
  GATE?: string;
  /** 联机房间（Durable Object，worker/room.ts 的 Room） */
  ROOM?: DurableObjectNamespace;
  /** "on" 才开联机；其他值（含没配）开房 404、进房 4004 */
  ONLINE?: string;
  /** 房间只认这个网站发起的请求（Origin）；不设就是正式站 https://game.yyyu.org。本地联调设成本机地址 */
  SITE_ORIGIN?: string;
  /** arcade-kit 的计量（房间自己用：开房占名额、报写入）；这里不碰，列出来是为了一眼看全 */
  METER?: DurableObjectNamespace;
  /** 计量的门槛（wrangler.jsonc 的 vars，计量自己读） */
  KIT_QUOTA?: unknown;
  /** 平台钱包（服务绑定 RPC，入口 WalletService，props.game = guandan）：单机实盘的带入、结回、放弃（stake.ts） */
  WALLET?: WalletRpc;
}

export const ME_URL = 'https://game.yyyu.org/api/me';
/** 没登录时去哪儿登录：带上 next，登录完回到这条链接（平台只认本站的 /games/... 路径，不认的按没带处理） */
export function loginUrlFor(url: URL): string {
  return `/login?next=${encodeURIComponent(url.pathname + url.search)}`;
}
/** 和 wrangler.jsonc 的 run_worker_first 一致；不在这里的路径（理论上不会进 Worker）一律原样交给静态资源 */
export const GATED_PATHS = ['/games/guandan', '/games/guandan/', '/games/guandan/index.html'];
/** 转给平台的请求头：只要能认出人（cookie）和按 IP 限流（cf-connecting-ip）的 */
const FORWARD_HEADERS = ['cookie', 'cf-connecting-ip'];
const TIMEOUT_MS = 3000;

export type Verdict = 'allow' | 'login' | 'unavailable';

export interface Check {
  verdict: Verdict;
  /**
   * 平台 /api/me 下发的全部 Set-Cookie（会话每 30 天续期、会话失效时清 cookie）。放行和跳登录时要原样带回浏览器，
   * 否则只玩游戏、不开平台首页的人 cookie 续不上（400 天后要重新登录），失效的 cookie 也清不掉。
   */
  setCookies: string[];
}

const UNAVAILABLE: Check = { verdict: 'unavailable', setCookies: [] };

/** 问平台这个请求的人登录没有。任何意外都返回 unavailable（不放行，也不带平台的 cookie）。 */
export async function checkLogin(request: Request, arcade: Fetcher | undefined, timeoutMs = TIMEOUT_MS): Promise<Check> {
  if (!arcade || typeof arcade.fetch !== 'function') return UNAVAILABLE;
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = request.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  const ask = (async (): Promise<Check> => {
    const res = await arcade.fetch(ME_URL, { method: 'GET', headers, redirect: 'manual', signal: ctl.signal });
    if (res.status !== 200) return UNAVAILABLE;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null || !('user' in body)) return UNAVAILABLE;
    const user = (body as { user: unknown }).user;
    // getSetCookie 逐条返回；headers.get 会把多条用逗号合并（Expires 里本身就有逗号），浏览器拆不回来
    const setCookies = res.headers.getSetCookie();
    if (user === null) return { verdict: 'login', setCookies };
    return typeof user === 'object' ? { verdict: 'allow', setCookies } : UNAVAILABLE;
  })().catch((): Check => UNAVAILABLE); // 超时后中止的请求会在这里落空，不留未处理的拒绝
  try {
    // 读响应体也算在 3 秒里
    const r = await Promise.race([ask, timeout]);
    return r === 'timeout' ? UNAVAILABLE : r;
  } catch {
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}

const UNAVAILABLE_HTML = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>掼蛋</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d2a1f;color:#e8f0e8;
font:18px/1.6 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;text-align:center}a{color:#ffe3a0}</style></head>
<body><main><p>暂时确认不了你登录没有（平台一时连不上），过一会儿刷新再来</p><p><a href="/">回首页</a></p></main></body>
</html>`;

function appendCookies(headers: Headers, setCookies: readonly string[]): void {
  for (const c of setCookies) headers.append('Set-Cookie', c);
}

const CREATE_PATH = `${ROOM_PATH}/rooms`;
const JOIN_RE = new RegExp(`^${ROOM_PATH}/rooms/([^/]+)/ws$`);

/**
 * 联机房间的两个路由（wrangler.jsonc 的 run_worker_first 放行 /games/guandan/room/*），其余交给 arcade-kit：
 * 查 Origin、经平台 /api/me 认人、找房间都在 acceptCreate / acceptJoin 里，这里不碰浏览器的原始请求。
 * 不经过 GATE：进房本来就要登录（kit 认不出人就拒绝），GATE=off 时也一样。
 * 返回 null 表示不是房间的路径。
 */
export function routeRoom(request: Request, env: Env): Promise<Response> | Response | null {
  const path = new URL(request.url).pathname;
  const join = JOIN_RE.exec(path);
  if (path !== CREATE_PATH && !join) return path.startsWith(`${ROOM_PATH}/`) || path === ROOM_PATH ? new Response('not found', { status: 404 }) : null;
  const on = env.ONLINE === 'on' && env.ROOM !== undefined;
  // 闸门的 Fetcher 只声明了 fetch；运行时的服务绑定就是 kit 要的 Fetcher
  const kitEnv = { ROOM: env.ROOM, ARCADE: env.ARCADE } as KitEnv;
  const opts: GateOptions = env.SITE_ORIGIN ? { siteOrigin: env.SITE_ORIGIN } : {};
  if (path === CREATE_PATH) return on ? createWithOptions(request, kitEnv, opts) : new Response('not found', { status: 404 });
  if (!on) {
    // 联机关着：和"没有这个房间"一样，接受升级后马上 4004 关掉（浏览器的 WebSocket 拿不到 HTTP 状态码，客户端认得 4004、不再重连）
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 });
    const pair = new WebSocketPair();
    pair[1].accept();
    pair[1].close(CLOSE.noRoom, 'online off');
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  return acceptJoin(request, kitEnv, join![1]!, opts);
}

/**
 * 开房：请求体里带 { stake: 档位 } 的是实盘房间（docs/stake.md 3.1，kit 0.4.0 的"开房就定选项"）；没带（或没有请求体）和以前一样是娱乐房间。
 * 档位不认得的照样交给 kit，由规则的 options 校验后回 400 bad_options。
 */
async function createWithOptions(request: Request, kitEnv: KitEnv, opts: GateOptions): Promise<Response> {
  let stake: unknown;
  if (request.headers.get('content-type')?.includes('application/json')) {
    const body: unknown = await request.clone().json().catch(() => null);
    if (body && typeof body === 'object') stake = (body as { stake?: unknown }).stake;
  }
  return acceptCreate(request, kitEnv, stake === undefined || stake === null ? opts : { ...opts, options: { stake } });
}

export async function handle(request: Request, env: Env, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const room = routeRoom(request, env);
  if (room) return room;
  // 实盘接口自己认人（和房间一样不经过 GATE）
  const stake = routeStake(request, env);
  if (stake) return stake;
  if (env.GATE === 'off') return env.ASSETS.fetch(request);
  if (!GATED_PATHS.includes(new URL(request.url).pathname)) return env.ASSETS.fetch(request);
  const { verdict, setCookies } = await checkLogin(request, env.ARCADE, timeoutMs);
  if (verdict === 'allow') {
    const asset = await env.ASSETS.fetch(request);
    const out = new Response(asset.body, asset);
    out.headers.set('Cache-Control', 'private, no-store');
    appendCookies(out.headers, setCookies);
    return out;
  }
  if (verdict === 'login') {
    const headers = new Headers({ Location: loginUrlFor(new URL(request.url)), 'Cache-Control': 'private, no-store' });
    appendCookies(headers, setCookies);
    return new Response(null, { status: 302, headers });
  }
  return new Response(UNAVAILABLE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
