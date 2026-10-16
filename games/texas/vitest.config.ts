import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test/worker/ 跑在 workerd 里，见 vitest.worker.config.ts
    include: ['test/*.test.ts'],
    // 全量 1.34 亿手的牌力测试单个就要几秒
    testTimeout: 60_000,
  },
});
