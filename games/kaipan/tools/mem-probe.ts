/**
 * 显存估算（0.5.9，iOS Safari "网页已崩溃"排查）：起 vite（系统挑的空闲端口）→ 无头 Chromium 按几种设备的视口和 DPR 打开，
 * 记下渲染倍数、主画布、纹理（图集页或单独光栅化的 SVG）和文字画布的像素，按每像素 4 字节折成 MB。
 * Chromium 不会像 iOS 那样因为超内存而崩，这里只比较"要多少"，不模拟崩溃。
 *
 *   node tools/mem-probe.ts              开始菜单 + 交易画面，几种设备各一遍
 *   node tools/mem-probe.ts --json       只输出 JSON（给 PR 贴数）
 *   node tools/mem-probe.ts --only iPad --query scale=1 --top   只跑名字含 iPad 的设备、网址加 scale=1、列出最大的几张纹理
 */
import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';

interface Device {
  name: string;
  width: number;
  height: number;
  dpr: number;
  touch: boolean;
}

/** iOS 按横屏算（竖屏时游戏被"横过来"提示盖住，但画布照样建好了） */
const ALL: Device[] = [
  { name: 'iPhone 8（667×375@2）', width: 667, height: 375, dpr: 2, touch: true },
  { name: 'iPhone 8 Plus（736×414@3）', width: 736, height: 414, dpr: 3, touch: true },
  { name: 'iPhone 15（844×390@3）', width: 844, height: 390, dpr: 3, touch: true },
  { name: 'iPhone 15 Pro Max（932×430@3）', width: 932, height: 430, dpr: 3, touch: true },
  { name: 'iPad Pro 12.9（1366×1024@2）', width: 1366, height: 1024, dpr: 2, touch: true },
  { name: 'iPad 10.9（1180×820@2）', width: 1180, height: 820, dpr: 2, touch: true },
  { name: '电脑（1280×720@1）', width: 1280, height: 720, dpr: 1, touch: false },
  { name: '电脑 4K（1920×1080@2）', width: 1920, height: 1080, dpr: 2, touch: false },
];

interface Mem {
  textures: number;
  texturePx: number;
  texts: number;
  textPx: number;
  canvasPx: number;
  top: string[];
}

/** --only <名字片段> 只跑匹配的设备 */
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] ?? '' : '';
const DEVICES = ALL.filter((d) => d.name.includes(only));
/** --query 加在网址后面（比如 scale=1 对比） */
const extra = process.argv.includes('--query') ? `&${process.argv[process.argv.indexOf('--query') + 1] ?? ''}` : '';

const MB = (px: number): number => Math.round((px * 4) / 1e5) / 10;

async function probe(browser: Browser, base: string, d: Device, query: string, scene: string): Promise<Record<string, unknown>> {
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    screen: { width: d.width, height: d.height },
    deviceScaleFactor: d.dpr,
    ...(d.touch ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(`window.__game && window.__game.scene === ${JSON.stringify(scene)}`, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const g = window.__game!;
    const a = g.atlas() as unknown as Record<string, { status: string }>;
    return { scale: g.renderScale, atlas: `${a.game?.status}/${a.meta?.status}`, mem: g.memory() as Mem };
  });
  await ctx.close();
  const m = r.mem;
  return {
    device: d.name,
    scene,
    renderScale: r.scale,
    atlas: r.atlas,
    canvasMB: MB(m.canvasPx),
    textures: m.textures,
    textureMB: MB(m.texturePx),
    texts: m.texts,
    textMB: MB(m.textPx),
    totalMB: MB(m.canvasPx + m.texturePx + m.textPx),
    ...(process.argv.includes('--top') ? { top: m.top.join(' | ') } : {}),
  };
}

async function main(): Promise<void> {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  try {
    server = await createServer({ root: process.cwd(), logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false } });
    await server.listen();
    const addr = server.httpServer?.address();
    if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
    const base = `http://127.0.0.1:${addr.port}/`;
    browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
    const rows: Record<string, unknown>[] = [];
    for (const d of DEVICES) {
      rows.push(await probe(browser, base, d, `x=1${extra}`, 'title'));
      rows.push(await probe(browser, base, d, `seed=pre-1&anim=0${extra}`, 'trade'));
    }
    if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
    else console.table(rows);
  } finally {
    await browser?.close();
    await server?.close();
  }
}

await main();
