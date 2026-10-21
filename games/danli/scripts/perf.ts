/**
 * 手机性能（照飞驰的做法）：手机横屏 844×390、像素比 3（画布按封顶 2 画）、CPU 降速 4 倍，量三段各约 3 秒的帧：
 * 跟随（镜头停在当前角色上）、拖动镜头（手指一直在拖）、跟炮弹（发一发，镜头跟着炮弹走）。
 * 打印每段的帧间隔（中位数、95 分位）和每帧画画花的时间（中位数、95 分位），毫秒。无头浏览器关了 GPU，画布是软件画的，数只作参考。
 * 用法：node scripts/perf.ts [降速倍数，默认 4] [像素比，默认 3]
 */
import { createServer } from 'vite';
import { launch } from './browser.ts';
import { myTurn } from './drive.ts';

const root = new URL('..', import.meta.url).pathname;
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: Number(process.argv[3] ?? 3), isMobile: true, hasTouch: true });
const cdp = await page.context().newCDPSession(page);
await page.goto(`http://127.0.0.1:${port}/games/danli/?seed=1`);
await page.waitForSelector('.dl-lobby');
await page.evaluate(() => localStorage.removeItem('danli.solo'));
await page.reload();
await page.click('text=单机开房');
await page.waitForSelector('.dl-room-go');
await page.click('.dl-room-go');
while (!(await myTurn(page))) await page.waitForTimeout(100);
await page.waitForTimeout(1500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[2] ?? 4) });

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};
async function measure(name: string, during: () => Promise<void>): Promise<void> {
  await page.evaluate('window.__danli.resetFrames()');
  await during();
  const { frames, draws } = (await page.evaluate('window.__danli.frames()')) as { frames: number[]; draws: number[] };
  console.log(`${name}: ${frames.length} 帧，帧间隔 中位 ${q(frames, 0.5).toFixed(1)} / p95 ${q(frames, 0.95).toFixed(1)} ms，画一帧 中位 ${q(draws, 0.5).toFixed(1)} / p95 ${q(draws, 0.95).toFixed(1)} ms`);
}

await measure('跟随', () => page.waitForTimeout(3000));
await measure('拖动', async () => {
  // 从空白处按下拖来拖去（不碰角色身边的角度盘）
  await page.mouse.move(700, 120);
  await page.mouse.down();
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < 3000) {
    await page.mouse.move(700 - (k % 40) * 8, 120 + Math.sin(k / 5) * 30);
    k++;
  }
  await page.mouse.up();
});
await measure('跟炮弹', async () => {
  const b = (await page.locator('.dl-fire').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForTimeout(3000);
});
await browser.close();
await server.close();
