/**
 * 验收截图（真实运行，正常速度，不开 ?turbo）：电脑 1280×720、手机竖屏 390×844，存到 shots/v010-<屏>-<场景>.png。
 * "我"照电脑的建议出手（scripts/drive.ts，用真按钮和手势），只有下面几手指定道具：
 * - start 开局；items 选好道具（连发 +1 加加力、拖好角度盘）；double 连发的第一颗、double-2 第二颗；
 * - fork 三岔三颗一起飞；plane 纸飞机在飞、plane-land 落地瞬移；
 * - tired 爬到体力不够，道具栏灰掉；
 * - fall 有人掉出画本（对局里自然发生的：一直打，碰到"掉出画本啦！"就截；这一局没有就再来一局，最多 4 局）；end 结算。
 * 种子写死（?seed=1），每屏一样。
 * 用法：npm run shots [desk|port]
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { launch } from './browser.ts';
import { aimAndFire, myTurn, playTurn } from './drive.ts';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}shots`, { recursive: true });
const only = process.argv[2];
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await launch();

const flying = (page: Page): Promise<boolean> => page.evaluate('window.__danli.flying()') as Promise<boolean>;
const stamina = (page: Page): Promise<number> => page.evaluate('window.__danli.state().stamina') as Promise<number>;
const ended = async (page: Page): Promise<boolean> => !!(await page.$('.dl-mask.end'));
const falling = async (page: Page): Promise<boolean> => ((await (await page.$('.dl-banner:not([hidden])'))?.textContent()) ?? '').includes('掉出画本');

async function until(page: Page, test: () => Promise<boolean>, ms = 120_000): Promise<boolean> {
  const t0 = Date.now();
  while (!(await test())) {
    if (Date.now() - t0 > ms) return false;
    await page.waitForTimeout(30);
  }
  return true;
}

/** 等到轮到我（或者结束）；中间有人掉出画本就截一张 */
async function waitMine(page: Page, onFall: () => Promise<void>): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    if (await ended(page)) return false;
    if (await falling(page)) await onFall();
    if (await myTurn(page)) return true;
    await page.waitForTimeout(40);
  }
  throw new Error('等太久了');
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
  const file = (s: string): string => `${root}shots/v010-${name}-${s}.png`;
  let fell = false;
  const onFall = async (): Promise<void> => {
    if (fell) return;
    fell = true;
    await page.waitForTimeout(350);
    await page.screenshot({ path: file('fall') });
  };
  await page.goto(`http://127.0.0.1:${port}/games/danli/?seed=1`);
  await page.waitForSelector('.dl-lobby');
  await page.evaluate(() => localStorage.removeItem('danli.solo'));
  await page.reload();
  await page.click('text=单机开打');
  await waitMine(page, onFall);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: file('start') });

  // 连发 +1（加力照建议，没有就加 20%）：截选好道具、第一颗、第二颗
  await playTurn(page, async () => void (await page.screenshot({ path: file('items') })), { mode: 'double', plane: false, boost: 20 });
  await until(page, () => flying(page));
  await page.waitForTimeout(700);
  await page.screenshot({ path: file('double') });
  await until(page, async () => !(await flying(page)));
  await until(page, () => flying(page), 5_000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: file('double-2') });

  // 三岔
  if (await waitMine(page, onFall)) {
    await playTurn(page, undefined, { mode: 'fork', plane: false, boost: 0 });
    await until(page, () => flying(page));
    await page.waitForTimeout(600);
    await page.screenshot({ path: file('fork') });
  }

  // 纸飞机：在心里试一圈（页面的 __danli.preview），挑一发落在我和对手之间、站得住的
  if (await waitMine(page, onFall)) {
    const pick = (await page.evaluate(`(() => {
      const s = window.__danli.state();
      const me = s.chars[s.actor];
      const foe = s.chars.find((c) => c.team !== me.team && !c.out);
      const dir = foe.x > me.x ? 1 : -1;
      let best = null;
      for (let angle = 30; angle <= 65; angle += 5) for (let power = 25; power <= 80; power += 3) {
        const r = window.__danli.preview({ t: 'fire', angle, power, facing: dir, plane: true });
        const w = r.ok && r.events.find((e) => e.t === 'warp');
        if (!w || !w.to) continue;
        const gain = (w.to.x - me.x) * dir;
        if (gain > 150 && (!best || Math.abs(gain - 400) < Math.abs(best.gain - 400))) best = { angle, power, facing: dir, gain };
      }
      return best;
    })()`)) as { angle: number; power: number; facing: 1 | -1 } | null;
    if (!pick) errors.push('纸飞机找不到能落的地方');
    await page.click('.dl-item[data-item="plane"]');
    await aimAndFire(page, pick?.angle ?? 45, pick?.facing ?? 1, pick?.power ?? 40);
    await until(page, () => flying(page));
    await page.waitForTimeout(600);
    await page.screenshot({ path: file('plane') });
    await until(page, async () => !(await flying(page)));
    await page.waitForTimeout(450);
    await page.screenshot({ path: file('plane-land') });
  }

  // 爬到体力不够：按住往对手那边爬，爬到剩 30 以下或爬不动
  if (await waitMine(page, onFall)) {
    await page.waitForTimeout(600);
    const dir = (await page.evaluate('(() => { const s = window.__danli.state(); const me = s.chars[s.actor]; const foe = s.chars.find((c) => c.team !== me.team); return foe.x < me.x ? "left" : "right"; })()')) as string;
    const b = (await page.locator(`.dl-climb-btn.${dir}`).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    let last = -1;
    for (;;) {
      await page.waitForTimeout(300);
      const st = await stamina(page);
      if (st < 30 || st === last) break;
      last = st;
    }
    await page.mouse.up();
    // 爬不动（掉在坑里、前面是悬崖）时，选上连发 +2 和锅盖把体力占住，剩下的道具一样会灰
    if ((await stamina(page)) > 45) {
      await page.click('.dl-item[data-item="triple"]');
      await page.click('.dl-item[data-item="lid"]').catch(() => {});
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: file('tired') });
    // 取消选上的，照建议打
    for (const k of ['triple', 'lid']) if (await page.$(`.dl-item[data-item="${k}"][data-state="selected"]`)) await page.click(`.dl-item[data-item="${k}"]`);
    await playTurn(page);
  }

  // 接着打完；没碰到掉出画本就再来一局（最多 4 局）
  for (let game = 0; game < 4; game++) {
    while (await waitMine(page, onFall)) await playTurn(page);
    await page.waitForTimeout(600);
    if (game === 0) await page.screenshot({ path: file('end') });
    if (fell) break;
    await page.click('.dl-mask.end button:has-text("再来一局")');
  }
  if (!fell) errors.push('打了 4 局都没人掉出画本');
  console.log(`${name}: ${errors.length ? errors.join('；') : '截完'}`);
  await page.close();
}

await browser.close();
await server.close();
