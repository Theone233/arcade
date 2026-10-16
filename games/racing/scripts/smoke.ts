/**
 * 冒烟（AGENTS.md 第 4 节"每个游戏一个无头浏览器冒烟"）：起 vite 开发服务器（系统分配端口），单机跑完一整场（?turbo 动画和电脑不停顿），
 * 横屏、竖屏各一遍；检查控制台零报错（开发时平台接口没起，/api 的 502、504 不算）、结算出来、比赛中点"大厅"先确认、"跟车"和"全图"能点。
 * 我这辆车：挂 2–3 挡、出最小的牌（稳着开）；问冲刺、拼劲、尾流一律"不了"，问弃牌"不弃"。
 * 用法：npm run smoke。截图在 shots/smoke-*.png。
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { launch } from './browser.ts';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}shots`, { recursive: true });
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await launch();
let failed = false;

async function race(page: Page, name: string): Promise<boolean> {
  let shot = 0;
  for (let i = 0; i < 4_000; i++) {
    if (await page.$('.mask.end')) return true;
    if (await page.$('.ask')) {
      const no = (await page.$('.ask button:has-text("不弃")')) ?? (await page.$('.ask button:has-text("不了")'));
      await no?.click().catch(() => {});
      continue;
    }
    const go = await page.$('.dash-side .act.go');
    if (go) {
      if (shot < 2 && i > 20 * (shot + 1)) {
        shot++;
        await page.screenshot({ path: `${root}shots/smoke-${name}-${shot}.png` });
      }
      const gears = await page.$$('.lever .gear:not([disabled])');
      // 2 挡或 3 挡（能挂哪个挂哪个）
      const want = (await page.$('.lever .gear:not([disabled]):has-text("3")')) ?? (await page.$('.lever .gear:not([disabled]):has-text("2")')) ?? gears[0];
      await want?.click().catch(() => {});
      // 每点一张驾驶台都重画，所以每次重新找：点没选上的、不是热量的牌，直到"出牌"能点
      for (let k = 0; k < 8 && (await page.$('.dash-side .act.go:disabled')); k++) {
        const c = await page.$('.hand .card:not(.heat):not(.sel)');
        if (!c) break;
        await c.click().catch(() => {});
      }
      const btn = await page.$('.dash-side .act.go:not(:disabled)');
      if (btn) await btn.click().catch(() => {});
      else await page.waitForTimeout(20);
      continue;
    }
    await page.waitForTimeout(25);
  }
  return false;
}

for (const [name, viewport] of [
  ['land', { width: 1000, height: 560 }],
  ['port', { width: 390, height: 780 }],
] as const) {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/status of 50[24]|Failed to load resource/.test(t)) return;
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/games/racing/?turbo`);
  await page.waitForSelector('.track-card');
  await page.screenshot({ path: `${root}shots/smoke-${name}-lobby.png` });
  await page.click('.seg[data-laps="1"]');
  await page.click('.seg[data-cars="4"]');
  await page.click('text=单机开跑');
  await page.waitForSelector('.board-svg');
  await page.click('.board-tools button:has-text("跟车")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${root}shots/smoke-${name}-follow.png` });
  await page.click('.board-tools button:has-text("全图")');
  // 比赛中点"大厅"：先问一次，点"接着跑"留下
  await page.click('.topbar .home');
  await page.waitForSelector('.mask.confirm');
  await page.click('.mask.confirm button:has-text("接着跑")');
  const ok = await race(page, name);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${root}shots/smoke-${name}-end.png` });
  if (!ok) {
    failed = true;
    console.error(`${name}: 没跑完`);
  }
  if (errors.length) {
    failed = true;
    console.error(`${name}: 控制台报错\n  ${errors.join('\n  ')}`);
  }
  console.log(`${name}: ${ok && !errors.length ? '通过' : '失败'}`);
  await page.close();
}

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
