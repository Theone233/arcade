/**
 * 冒烟（AGENTS.md 第 4 节"每个游戏一个无头浏览器冒烟"）：起 vite 开发服务器（系统分配端口），单机打完一整局（?turbo 动画加速），
 * 手机横屏 844×390、竖屏 390×844 各一遍（都按手机模拟：触屏、像素比 3、CPU 降速 4 倍当省内存设备）。检查：
 * - 控制台零报错。开发时平台接口没起，只放过 /api/ 下的 502、504 和掐断；别的请求失败或 4xx、5xx 都算失败；
 * - "全图"能切过去再切回来；对局中点"大厅"先问一次（点"接着打"留下）；
 * - 横屏那一遍：模拟一次双指放大（visualViewport.scale = 2 时画布和 HUD 不能重排）；轮到我时刷新页面，选桌页有"接着上一局"，接着打回合数对得上；
 * - 道具：第一手用一次纸飞机（看人真的飞过去了、纸飞机剩 1 次），之后照电脑的建议选道具（常用道具几乎每手都用），
 *   查存档里记下了带连发或加力的出手；
 * - 打完：结算出来、有"大厅"按钮，danli.solo 删掉了，整个画面没被滚走（点道具按钮时浏览器会把按钮滚进视野）。
 * "我"这边照电脑的建议用真按钮出手（scripts/drive.ts），电脑那边照常。
 * 用法：npm run smoke。截图在 shots/smoke-*.png。
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { launch } from './browser.ts';
import { myTurn, playTurn } from './drive.ts';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}shots`, { recursive: true });
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/games/danli/`;
const browser = await launch();
let failed = false;

const turnOf = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __danli: { state(): { turn: number } } }).__danli.state().turn);

type Hooked = { __danli: { state(): { turn: number; chars: { x: number; special: { plane: number } }[] } } };
const meOf = (page: Page): Promise<{ x: number; plane: number }> =>
  page.evaluate(() => {
    const c = (window as unknown as Hooked).__danli.state().chars[0]!;
    return { x: c.x, plane: c.special.plane };
  });

/** 这一局记下的出手（从页面内存里拿：打完存档就删了，一局又很短） */
const fires = (page: Page): Promise<{ mode?: string; boost?: number; plane?: boolean }[]> =>
  page.evaluate(() =>
    (window as unknown as { __danli: { log(): { t: string; mode?: string; boost?: number; plane?: boolean }[] } }).__danli.log().filter((a) => a.t === 'fire'),
  );

/** 一直打到结算出来；回打了几手。第一手用纸飞机 */
async function playToEnd(page: Page, name: string, errors: string[], onTurn?: (n: number) => Promise<void>): Promise<number> {
  let mine = 0;
  let comboSeen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 600_000) {
    if (await page.$('.dl-mask.end')) {
      if (!comboSeen && (await fires(page)).some((a) => (a.mode && a.mode !== 'single') || a.boost)) comboSeen = true;
      if (!comboSeen) errors.push('一局打完都没用过连发或加力');
      return mine;
    }
    if (await myTurn(page)) {
      if (mine === 0) {
        const before = await meOf(page);
        await playTurn(page, undefined, { mode: 'single', boost: 0, lid: false, plane: true });
        while (!(await myTurn(page)) && !(await page.$('.dl-mask.end'))) await page.waitForTimeout(100);
        const after = await meOf(page);
        if (after.plane !== 1) errors.push(`用了纸飞机，次数没扣（还剩 ${after.plane}）`);
        if (after.x === before.x) errors.push('纸飞机用了，人没动（可能飞出画本作废了）');
        const log = await fires(page);
        if (!log.some((a) => a.plane)) errors.push('操作记录里没有纸飞机那一手');
      } else await playTurn(page);
      if (!comboSeen && (await fires(page)).some((a) => (a.mode && a.mode !== 'single') || a.boost)) comboSeen = true;
      mine++;
      await onTurn?.(mine);
    } else await page.waitForTimeout(100);
  }
  throw new Error(`${name}: 十分钟还没打完`);
}

for (const [name, viewport] of [
  ['land', { width: 844, height: 390 }],
  ['port', { width: 390, height: 844 }],
] as const) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  const isApi = (url: string): boolean => new URL(url).pathname.startsWith('/api/');
  page.on('response', (r) => {
    if (r.status() >= 400 && !(isApi(r.url()) && (r.status() === 502 || r.status() === 504))) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on('requestfailed', (r) => {
    if (!isApi(r.url())) errors.push(`请求失败 ${new URL(r.url()).pathname}：${r.failure()?.errorText ?? ''}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // 加载失败的资源由上面的 response 逐条核对（浏览器这条消息不带地址）
    if (/^Failed to load resource/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await page.goto(`${base}?turbo&seed=${name === 'land' ? 11 : 12}`);
    await page.waitForSelector('.dl-lobby');
    await page.evaluate(() => localStorage.removeItem('danli.solo'));
    await page.reload();
    await page.waitForSelector('.dl-lobby .dl-btn.go');
    await page.screenshot({ path: `${root}shots/smoke-${name}-lobby.png` });
    await page.click('text=单机开打');
    await page.waitForSelector('.dl-hud');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${root}shots/smoke-${name}-start.png` });
    // 全图来回切
    await page.click('.dl-view');
    await page.waitForTimeout(600);
    if (!(await page.$('.dl-view.on'))) errors.push('点了"全图"没切过去');
    await page.screenshot({ path: `${root}shots/smoke-${name}-overview.png` });
    await page.click('.dl-view');
    if (await page.$('.dl-view.on')) errors.push('再点"全图"没切回跟随');
    if (name === 'land') {
      // 双指放大：CDP 设页面缩放 = 手指捏开的结果；放大时画布和 HUD 的尺寸不能跟着变
      const dims = (): Promise<string> => page.evaluate(() => `${document.querySelector('canvas')!.width}x${document.querySelector('canvas')!.height} ${(document.querySelector('.dl-hud') as HTMLElement).style.cssText}`);
      const before = await dims();
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(600);
      const zoomed = await page.evaluate(() => window.visualViewport?.scale ?? 1);
      if (zoomed < 1.5) errors.push(`页面没放大（scale ${zoomed}）`);
      if ((await dims()) !== before) errors.push('双指放大时画布或 HUD 重排了');
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(600);
    }
    // 对局中点"大厅"：先问一次，点"接着打"留下
    await page.click('.dl-hud .dl-home');
    await page.waitForSelector('.dl-mask.confirm');
    await page.click('.dl-mask.confirm button:has-text("接着打")');
    if (name === 'land') {
      // 等到轮到我（电脑先手就先看它打一手），刷新，接着上一局：回合数要对得上
      // （一局现在很短，不能先打几手再刷新，可能已经打完了）
      const t0 = Date.now();
      while (!(await myTurn(page))) {
        if (Date.now() - t0 > 120_000) throw new Error('两分钟还没轮到我');
        await page.waitForTimeout(100);
      }
      const turn = await turnOf(page);
      if (!(await page.evaluate(() => localStorage.getItem('danli.solo')))) errors.push('打到一半没存 danli.solo');
      await page.reload();
      await page.waitForSelector('.dl-lobby');
      if (!(await page.$('.dl-lobby button:has-text("接着上一局")'))) errors.push('刷新以后没有"接着上一局"');
      else {
        await page.click('.dl-lobby button:has-text("接着上一局")');
        await page.waitForSelector('.dl-hud');
        await page.waitForTimeout(300);
        if ((await turnOf(page)) !== turn) errors.push(`接着上一局回合数对不上：${await turnOf(page)} ≠ ${turn}`);
      }
    }
    let shot = false;
    const mine = await playToEnd(page, name, errors, async (n) => {
      if (!shot && n >= 2) {
        shot = true;
        await page.screenshot({ path: `${root}shots/smoke-${name}-mid.png` });
      }
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${root}shots/smoke-${name}-end.png` });
    if (!(await page.$('.dl-mask.end .end-home'))) errors.push('结算里没有"大厅"');
    // 点道具按钮会把按钮"滚进视野"：整个画面不能被滚走（0.1.0 修过）
    const scrolled = await page.evaluate(() => {
      const a = document.querySelector('.dl-app')!;
      return a.scrollLeft + a.scrollTop + window.scrollX + window.scrollY;
    });
    if (scrolled) errors.push(`画面被滚走了 ${scrolled} 像素`);
    if (await page.evaluate(() => localStorage.getItem('danli.solo'))) errors.push('打完了 danli.solo 还在');
    const s = await page.evaluate(() => {
      const st = (window as unknown as { __danli: { state(): { turn: number; winner: number | null; endBy: string } } }).__danli.state();
      return `第 ${st.turn} 回合结束，${st.endBy}，赢家 ${st.winner}`;
    });
    console.log(`${name}: ${s}，我出手 ${mine} 次`);
  } catch (e) {
    errors.push(String(e));
    await page.screenshot({ path: `${root}shots/smoke-${name}-fail.png` }).catch(() => {});
  }
  if (errors.length) {
    failed = true;
    console.error(`${name}: ${errors.length} 个问题\n  ${errors.join('\n  ')}`);
  } else console.log(`${name}: 通过`);
  await page.close();
}

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
