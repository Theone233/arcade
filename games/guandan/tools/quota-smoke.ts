/**
 * 额度冒烟（0.3.0）：本地联机栈（tools/online-dev.ts）把每天的额度调得极紧，几个无头浏览器各登一个号，看页面上每种额度提示都说得出人话：
 * - ?online=1 直接打开好友房面板；不带它时标题页也有"好友房"；
 * - 同时开着的房间到上限（409 has_room）：说清楚、不把人送回旧房间（0.6.0 起"开房间"永远开新的，正式环境每人同时 5 个）；
 * - 今天联机的人太多（503 busy）：别人开房被拒；
 * - 今天额度快满了不进新人（4503）：拿房间码进房被拒；
 * - 额度满了房间收场（4000 + quota）：房主那边说清楚是额度满了，不是"房间散了"；
 * - 今天开房次数用完（429 daily_limit）：房间关了、名额还了，再开就是这一句。
 * 额度怎么算、什么时候还在 arcade-kit 的测试里测；这里只看页面接得对不对。控制台零报错（被拒的请求浏览器自己打的那行不算）。
 *
 * 门槛：busyWrites = stopWrites = 2（第一个房间占名额那一下计量写 2 行，之后就"满了"）、每人同时 1 个、每天 1 个房间。
 *
 * 用法：node tools/quota-smoke.ts [--out <截图目录>] [--no-build]
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { QUOTA_TEXT } from '../src/view/quota-text.ts';
import { startOnlineStack, type OnlineStack } from './online-dev.ts';

const OUT = ((): string => {
  const i = process.argv.indexOf('--out');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : `${process.cwd()}/shots/quota`;
})();
const QUOTA = { busyWrites: 2, stopWrites: 2, roomsPerUser: 1, dailyRoomsPerUser: 1 };

const errors: string[] = [];
const notes: string[] = [];

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`断言失败：${msg}`);
}

async function openPage(browser: Browser, stack: OnlineStack, user: string, query: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addCookies([{ name: '__Host-sid', value: user, domain: new URL(stack.origin).hostname, path: '/', secure: true }]);
  await context.route('**/api/me', (r) => r.fulfill({ json: { user: { id: user, displayName: `玩家${user}` } } }));
  await context.addInitScript(() => localStorage.setItem('guandan.tutorial', JSON.stringify({ v: 1, done: true })));
  const page = await context.newPage();
  page.on('console', (m) => {
    // 开房被拒（409/429/503）、进房被拒时浏览器自己打的那一行不算
    if (m.type() === 'error' && !/WebSocket connection|Failed to load resource/.test(m.text())) errors.push(`[${user}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] pageerror: ${e.message}`));
  await page.goto(`${stack.origin}/games/guandan/?debug=1&anim=0${query}`);
  return page;
}

async function noteIs(page: Page, text: string, what: string): Promise<void> {
  try {
    await page.waitForFunction((t) => document.getElementById('ol-note')?.textContent === t || [...document.querySelectorAll('#online .ol-note')].some((e) => e.textContent === t), text, { timeout: 15_000, polling: 100 });
  } catch {
    const now = await page.evaluate(() => [...document.querySelectorAll('#online .ol-note')].map((e) => e.textContent)).catch(() => null);
    throw new Error(`${what}：等不到提示"${text}"（现在是 ${JSON.stringify(now)}）`);
  }
}

async function shot(page: Page, file: string): Promise<void> {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${file}.png` });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const stack = await startOnlineStack({ build: !process.argv.includes('--no-build'), vars: { KIT_QUOTA: JSON.stringify(QUOTA) } });
  console.log(`本地联机栈：${stack.origin}（KIT_QUOTA ${JSON.stringify(QUOTA)}）`);
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
  try {
    // ① 不带 ?online=1：标题页也有"好友房"，不自动弹面板
    const plain = await openPage(browser, stack, 'q-plain', '');
    await plain.waitForFunction(() => !!window.__game?.ready && window.__game.scene === 'title', null, { timeout: 60_000 });
    const ctl = await plain.evaluate(() => window.__game!.controls());
    assert(ctl['online'], '标题页没有"好友房"按钮');
    assert(!(await plain.$('#online')), '不带 ?online=1 也弹了面板');
    await shot(plain, '10-title');
    notes.push('标题页一直有"好友房"（不带 ?online=1）');

    // ② 带 ?online=1：直接打开面板；房主开房
    const host = await openPage(browser, stack, 'q-host', '&online=1');
    await host.waitForSelector('#ol-create', { timeout: 60_000 });
    notes.push('?online=1 直接打开好友房面板');
    await host.click('#ol-create');
    await host.waitForSelector('#ol-room-code', { timeout: 30_000 });
    const code = (await host.textContent('#ol-room-code'))!.trim();
    assert(/^\d{6}$/.test(code), `房间码不对：${code}`);

    // ③ 房主离开再开：同时开着的到上限 → 说清楚，不把人送回旧房间
    await host.click('#ol-leave');
    await host.waitForSelector('#ol-create');
    await host.click('#ol-create');
    await noteIs(host, QUOTA_TEXT.has_room, '同时开着的房间到上限');
    assert(!(await host.$('#ol-back-room')), '不该再给"回到房间"把人送回旧房间');
    await shot(host, '20-has-room');
    // 后面要看这个房间收场：自己拿房间码回去
    await host.fill('#ol-code', code);
    await host.click('#ol-join');
    await host.waitForFunction((c) => document.getElementById('ol-room-code')?.textContent?.trim() === c && window.__game?.net()?.status === 'open', code, { timeout: 30_000 });
    notes.push(`同时开着的房间到上限：提示"${QUOTA_TEXT.has_room}"，不送回旧房间`);

    // ④ 别人开房：今天人太多
    const other = await openPage(browser, stack, 'q-other', '&online=1');
    await other.waitForSelector('#ol-create', { timeout: 60_000 });
    await other.click('#ol-create');
    await noteIs(other, QUOTA_TEXT.busy, '今天人太多（开房）');
    await shot(other, '30-busy');
    notes.push(`今天人太多：别人开房提示"${QUOTA_TEXT.busy}"`);

    // ⑤ 别人拿码进房：不进新人（4503）
    const late = await openPage(browser, stack, 'q-late', '&online=1');
    await late.waitForSelector('#ol-code', { timeout: 60_000 });
    await late.fill('#ol-code', code);
    await late.click('#ol-join');
    await late.waitForFunction(() => window.__game?.net()?.closeCode === 4503, null, { timeout: 15_000 });
    await noteIs(late, QUOTA_TEXT.joinBusy, '不进新人（进房）');
    await shot(late, '40-join-busy');
    notes.push(`不进新人：拿码进房 4503，提示"${QUOTA_TEXT.joinBusy}"`);

    // ⑥ 房主的房间：计量说满了，等人的房间马上收场（4000 + quota）。房间在有事件时才去看门槛，房主换个座位叫醒它
    const closed = () => host.evaluate(() => window.__game?.net()?.closeCode === 4000);
    if (!(await closed())) {
      await host.waitForSelector('#ol-sit-1', { timeout: 5_000 }).then(() => host.click('#ol-sit-1')).catch(() => undefined);
    }
    await host.waitForFunction(() => window.__game?.net()?.closeCode === 4000, null, { timeout: 15_000 });
    const reason = await host.evaluate(() => window.__game?.net()?.closeReason ?? null);
    assert(reason === 'quota', `关房原因不是 quota：${reason}`);
    await noteIs(host, QUOTA_TEXT.closed, '额度满了收场');
    await shot(host, '50-quota-closed');
    notes.push(`额度满了收场：4000 + quota，房主看到"${QUOTA_TEXT.closed}"`);

    // ⑦ 房主再开房：名额已经还了，今天的次数（1 个）用完了
    await host.click('#ol-ok');
    await host.waitForSelector('#ol-create');
    await host.click('#ol-create');
    await noteIs(host, QUOTA_TEXT.daily_limit, '今天开房次数用完');
    assert(!(await host.$('#ol-back-room')), '名额已经还了，不该再给"回到房间"');
    await shot(host, '60-daily-limit');
    notes.push(`今天开房次数用完：提示"${QUOTA_TEXT.daily_limit}"`);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
    await stack.stop();
  }
  for (const n of notes) console.log(`· ${n}`);
  console.log(`截图 → ${OUT}`);
  if (errors.length) {
    console.log(`失败 ${errors.length} 项：`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    process.exitCode = 1;
  } else console.log('额度冒烟通过：五种提示都对，控制台零报错');
}

await main();
