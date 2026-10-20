import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * 页面挂在 /games/danli/ 下，资源一律相对路径（build 用 base './'）。
 * 开发时页面也放在 /games/danli/；平台的 /api 转给平台的本地接口 5181（没起时 detectPlatform 自己掐断，当作不知道）。
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/games/danli/',
  define: { __DANLI_VERSION__: JSON.stringify(version) },
  server: {
    host: '0.0.0.0',
    port: 5179,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5181' },
  },
  preview: { host: '0.0.0.0', port: 4179, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0 },
}));
