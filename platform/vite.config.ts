import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时，/games/<id>/ 由各游戏自己的开发服务器提供（见 src/games.ts 的 devUrl）。
// /api 转给本地接口（npm run dev:api，5181）。接口只认 SITE_ORIGIN（.dev.vars 里是 http://localhost:5181）的 Host 和 Origin，
// 所以转发时把两样都改成 5181 的；cookie 落在 localhost 上，不分端口，两边都带得上。
const API = 'http://localhost:5181';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        headers: { origin: API },
      },
    },
  },
  preview: { host: '0.0.0.0', port: 4180, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
});
