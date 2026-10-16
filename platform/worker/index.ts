/**
 * 平台的 Worker：静态界面由 ASSETS 提供；/api/* 是账号等接口（api/router.ts，接口约定见仓库根 docs/platform-backend.md 第 15 节）。
 * 各游戏在同一域名下用路径路由挂自己的 Worker，不经过这里。架构见 docs/architecture.md 第 3 节。
 */
import { runCleanup } from './api/cron';
import { meter } from './api/meter';
import { handleApi } from './api/router';
import type { Env } from './env';

/** 游戏用的钱包 RPC，只能经服务绑定调（docs/platform-backend.md 5.9） */
export { WalletService } from './wallet-service';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      meter.countCall();
      return handleApi(request, env, ctx);
    }
    if (url.pathname.startsWith('/games/')) {
      // 有这个游戏时请求由游戏自己的路由接走，到不了这里
      meter.countCall();
      return new Response('没有这个游戏', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(runCleanup(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
