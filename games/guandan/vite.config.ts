import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// 云存档接口：本地开发时代理到平台接口的本地服务（平台目录里 `npm run dev:api`，即 wrangler dev，SITE_ORIGIN 是 http://localhost:5181）。
// 平台按 Origin 校验写请求，所以把 Host 和 Origin 都改成 5181；在浏览器里先到 5181 登录拿 cookie 才能同步。
const API = 'http://localhost:5181';

// 监听所有网卡。在 Paseo 守卫内启动时只绑定在隔离区网卡上，需再执行 `paseo-svc publish 5174` 才能从内网访问。
export default defineConfig({
  // 相对路径：游戏挂在 /games/guandan/ 下，不假设自己在域名根
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: true, headers: { origin: API } } },
  },
  preview: { host: '0.0.0.0', port: 4174, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
});
