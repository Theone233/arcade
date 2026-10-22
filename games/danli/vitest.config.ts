import { defineConfig } from 'vitest/config';

/**
 * 好友房的测试在 Node 里跑真的 kit 房间（test/room-do.test.ts）：'cloudflare:workers' 换成 test/fake-workers.ts，
 * kit 要跟着一起转译（不然它的 import 不走这里的别名）。
 */
export default defineConfig({
  resolve: { alias: { 'cloudflare:workers': new URL('./test/fake-workers.ts', import.meta.url).pathname } },
  test: {
    include: ['test/*.test.ts'],
    testTimeout: 60_000,
    server: { deps: { inline: ['arcade-kit'] } },
  },
});
