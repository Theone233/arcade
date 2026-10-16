import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// 监听所有网卡。在 Paseo 守卫内启动时只绑定在隔离区网卡上，
// 需再执行 `paseo-svc publish 5173`，内网才能用 http://<本机 IP>:5173 访问。
export default defineConfig({
  // 相对路径：构建产物放在任意目录或子路径下都能直接访问
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 云存档（0.5.7）：本地开发时 /api 转给平台的本地接口（平台目录 npm run dev:api，wrangler dev 在 5181）。
    // 平台本地的 SITE_ORIGIN 是 http://localhost:5181：Host 和写请求的 Origin 都要对上，所以改成它的
    proxy: { '/api': { target: 'http://localhost:5181', changeOrigin: true, headers: { origin: 'http://localhost:5181' } } },
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // 对外发布的构建不带 sourcemap（体积减半，也不把源码直接给玩家）；本机排查时用 KP_SOURCEMAP=1 npm run build
    sourcemap: process.env.KP_SOURCEMAP === '1',
    rollupOptions: {
      output: {
        // Phaser 单独成块：发新版本时浏览器缓存里的 Phaser 仍可复用
        manualChunks: (id: string) => (id.includes('/node_modules/phaser/') ? 'phaser' : undefined),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
