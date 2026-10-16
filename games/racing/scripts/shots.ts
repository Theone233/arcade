/**
 * PR 用的截图（CONTRIBUTING.md 的模板：电脑 1280×720、手机横屏）：选桌页、挂挡、出牌预览、亮牌后的问题、结算，存到 shots/pr-*.png。
 * 我这辆车挂得越高越好、能冲就冲，好让画面里出现热量、打滑这些。用法：node scripts/shots.ts
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { launch } from './browser.ts';
import { drive } from './drive.ts';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}shots`, { recursive: true });
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await launch();

async function run(page: Page, name: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${port}/games/racing/?turbo`);
  await page.waitForSelector('.track-card');
  await page.screenshot({ path: `${root}shots/pr-${name}-lobby.png` });
  await page.click('.track-card[data-id="hillcity"]');
  await page.click('.seg[data-laps="1"]');
  await page.click('text=单机开跑');
  await page.waitForSelector('.gearbox');
  await page.screenshot({ path: `${root}shots/pr-${name}-gear.png` });
  // 第一回合手动走：挂 2 挡 → 挂好了 → 放两张牌进出牌区，截出牌这一步（预览、虚影车、预设）
  await page.click('.gate-btn[aria-label="2 挡"]');
  await page.click('.dash-action .act.go:has-text("挂好了")');
  for (let k = 0; k < 2; k++) await page.click('.hand.live .card:not(:disabled) >> nth=-1');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${root}shots/pr-${name}-plan.png` });
  let plan = true;
  let ask = false;
  for (let i = 0; i < 3_000; i++) {
    if (await page.$('.mask.end')) break;
    if (!ask && (await page.$('.ask'))) {
      ask = true;
      await page.screenshot({ path: `${root}shots/pr-${name}-ask.png` });
    }
    if (!plan && i > 8 && (await page.$('.dash-action .preview .speed'))) {
      plan = true;
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${root}shots/pr-${name}-plan.png` });
    }
    // 我这辆车挂得越高越好、能冲就冲
    if (!(await drive(page, [4, 3, 2, 1], true))) await page.waitForTimeout(25);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${root}shots/pr-${name}-end.png` });
}

for (const [name, viewport] of [
  ['pc', { width: 1280, height: 720 }],
  ['phone', { width: 844, height: 390 }],
] as const) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: name === 'phone' ? 2 : 1 });
  await run(page, name);
  await page.close();
}
await browser.close();
await server.close();
