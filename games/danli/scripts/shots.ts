/**
 * 验收截图（真实运行，正常速度，不开 ?turbo）：电脑 1280×720、手机竖屏 390×844，存到 shots/v020-<屏>-<场景>.png。
 * - lobby 首页；room-weapons 准备房间（3v3、我的武器页签）、room-maps（地图页签）、room-maps-2（往下滑，"快图""慢图"角标）、room-bot（给黄队 2 号换人物和武器）；
 * - map-<id> 6 张图各开一局 3v3，轮到我时截一张；
 * - lobby-resume 打到一半回首页（有"接着上一局"）；
 * - out 最后一张图上我故意把自己炸出局（烟花筒正上方连发 +2），出现"快进""跳到结果"；end 跳到结果以后的结算页。
 * "我"用真按钮和手势出手（scripts/drive.ts），电脑那边照常。种子写死（?seed=1），每屏一样。
 * 用法：npm run shots [desk|port]
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { launch } from './browser.ts';
import { aimAndFire, myTurn } from './drive.ts';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}shots`, { recursive: true });
const only = process.argv[2];
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await launch();
const MAPS = ['kitchen', 'icecream', 'dumpling', 'bento', 'nightmarket', 'breakfast'];

type Hook = { __danli: { state(): { phase: string; actor: number; chars: { x: number; out: boolean; ai: boolean }[] }; preview(a: unknown): { ok: boolean; events?: { t: string; x?: number }[] } } };

/** 等到轮到我；我出局了或者打完了回 false */
async function waitMine(page: Page, ms = 240_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.$('.dl-spect:not([hidden]), .dl-result')) return false;
    if (await myTurn(page)) return true;
    await page.waitForTimeout(80);
  }
  throw new Error('等太久了');
}

/** 往正上方打（88°）、连发 +2，挑落点离自己最近的力度 */
async function selfDestruct(page: Page): Promise<void> {
  const power = await page.evaluate(() => {
    const d = (window as unknown as Hook).__danli;
    const me = d.state().chars[d.state().actor]!;
    let best = { power: 6, dist: 1e9 };
    for (let p = 1; p <= 30; p++) {
      const r = d.preview({ t: 'fire', angle: 88, power: p, facing: 1, mode: 'triple' });
      const booms = (r.ok ? (r.events ?? []) : []).filter((e) => e.t === 'boom');
      if (!booms.length) continue;
      const dist = booms.reduce((n, e) => n + Math.abs((e.x ?? 0) - me.x), 0) / booms.length;
      if (dist < best.dist) best = { power: p, dist };
    }
    return best.power;
  });
  await page.click('.dl-item[data-item="triple"]');
  await aimAndFire(page, 88, 1, power);
}

/** 从首页进房间，选好 3v3、这张图、我拿冲天烟花筒，开打 */
async function startOn(page: Page, map: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${port}/games/danli/?seed=1`);
  await page.waitForSelector('.dl-lobby .start');
  await page.click('.dl-lobby .start');
  await page.waitForSelector('.dl-room');
  await page.click('.dl-seg button[data-size="3"]');
  await page.click('.tabs button[data-tab="map"]');
  await page.click(`.dl-mapcard[data-map="${map}"]`);
  await page.click('.dl-room-go');
  await page.waitForSelector('.dl-hud');
}

for (const [name, opts] of [
  ['desk', { viewport: { width: 1280, height: 720 } }],
  ['port', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
] as const) {
  if (only && only !== name) continue;
  const page = await browser.newPage(opts);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const file = (s: string): string => `${root}shots/v020-${name}-${s}.png`;
  await page.goto(`http://127.0.0.1:${port}/games/danli/?seed=1`);
  await page.waitForSelector('.dl-lobby');
  await page.evaluate(() => {
    localStorage.removeItem('danli.solo');
    localStorage.removeItem('danli.prefs');
  });
  await page.reload();
  await page.waitForSelector('.dl-lobby .start');
  await page.waitForTimeout(400);
  await page.screenshot({ path: file('lobby') });

  // 准备房间三张：我的武器、地图、给黄队 2 号换
  await page.click('.dl-lobby .start');
  await page.waitForSelector('.dl-room');
  await page.click('.dl-seg button[data-size="3"]');
  await page.click('.dl-wcard[data-weapon="rocket"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: file('room-weapons') });
  await page.click('.tabs button[data-tab="map"]');
  await page.click('.dl-mapcard[data-map="dumpling"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: file('room-maps') });
  // 地图页签往下滑：第二排（便当群岛"快图"、早餐吐司桥"慢图"）
  await page.evaluate(() => {
    const sheet = document.querySelector('.dl-room .sheet') as HTMLElement;
    sheet.scrollTo(0, (document.querySelector('.dl-mapcard[data-map="bento"]') as HTMLElement).offsetTop - 14);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: file('room-maps-2') });
  await page.click('.dl-slot[data-seat="3"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: file('room-bot') });

  // 6 张图各开一局，轮到我时截一张；最后一张接着打：把自己炸出局、跳到结果
  for (const map of MAPS) {
    await startOn(page, map);
    await waitMine(page, 120_000);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: file(`map-${map}`) });
  }
  // 打到一半回首页：有"接着上一局"
  await page.goto(`http://127.0.0.1:${port}/games/danli/?seed=1`);
  await page.waitForSelector('.dl-lobby .resume');
  await page.waitForTimeout(300);
  await page.screenshot({ path: file('lobby-resume') });
  await page.click('.dl-lobby .resume');
  await page.waitForSelector('.dl-hud');
  let n = 0;
  while (await waitMine(page)) {
    await selfDestruct(page);
    if (++n > 12) throw new Error('炸了 12 手自己还没出局');
  }
  if (!(await page.$('.dl-result'))) {
    await page.waitForSelector('.dl-spect:not([hidden])');
    await page.waitForTimeout(600);
    await page.screenshot({ path: file('out') });
    await page.click('.dl-skip-btn');
  }
  await page.waitForSelector('.dl-result', { timeout: 300_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: file('end') });
  console.log(`${name}: ${errors.length ? errors.join('；') : '截完'}`);
  await page.close();
}

await browser.close();
await server.close();
