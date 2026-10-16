import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * 联机房间的测试（npm run test:room）：跑在本地 workerd（miniflare）里，真的 Durable Object（SQLite 后端）、WebSocket 休眠接口和闹钟，
 * 入口是 tests/room/main.ts（部署用的 worker/main.ts 的全部导出 + 假钱包 FakeWallet / WalletBank，tests/room/wrangler.jsonc）。
 * 平台的 /api/me 用假的服务绑定代替：cookie __Host-sid=<userId> 认作这个人，__Host-sid=down 回 503，没带回 user: null。
 *
 * 测试文件叫 *.spec.ts：普通 npm test（vite.config.ts 只收 tests/**\/*.test.ts，跑在 Node 里）不会把它们吸进去。
 * 机器人对打的局数用环境变量调：ROOM_GAMES（4 真人）、ROOM_GAMES_SOLO（1 真人 + 3 电脑），默认各 4 局；npm run room-bulk 各 200 局。
 */
const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : def;
};

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './tests/room/wrangler.jsonc' },
      miniflare: {
        serviceBindings: {
          ARCADE(request: Request): Response {
            const id = /(?:^|;\s*)__Host-sid=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
            if (id === 'down') return new Response('down', { status: 503 });
            if (new URL(request.url).pathname !== '/api/me') return new Response('not found', { status: 404 });
            return Response.json({ user: id ? { id, displayName: `玩家${id}` } : null });
          },
        },
      },
    }),
  ],
  test: {
    include: ['tests/room/**/*.spec.ts'],
    fsModuleCache: false,
    provide: {
      roomGames: num('ROOM_GAMES', 4),
      roomGamesSolo: num('ROOM_GAMES_SOLO', 4),
      /** 机器人对打里，轮到真人时有多大比例故意不出、等 30 秒让房间超时代出 */
      roomIdleRate: num('ROOM_IDLE_RATE', 0.02),
    },
  },
});
