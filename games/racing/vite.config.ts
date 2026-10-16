import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * 页面挂在 /games/racing/ 下，资源一律相对路径（build 用 base './'）。
 * 开发时页面也放在 /games/racing/：设了 RACING_WORKER（本地 Worker 的端口）就把开房、进房转过去；平台的 /api 转给平台的本地接口 5181。
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/games/racing/',
  define: { __RACING_VERSION__: JSON.stringify(version) },
  server: {
    host: '0.0.0.0',
    port: 5177,
    strictPort: true,
    proxy: {
      ...(process.env.RACING_WORKER ? { '/games/racing/rooms': { target: `http://127.0.0.1:${process.env.RACING_WORKER}`, ws: true } } : {}),
      '/api': 'http://127.0.0.1:5181',
    },
  },
  preview: { host: '0.0.0.0', port: 4177, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
}));
