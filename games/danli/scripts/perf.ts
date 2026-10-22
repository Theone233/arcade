/**
 * 手机性能（照飞驰的做法）：手机横屏 844×390、像素比 3（画布按封顶 2 画）、CPU 降速 4 倍，量三段各约 3 秒的帧：
 * 跟随（镜头停在当前角色上）、拖动镜头（手指一直在拖）、跟炮弹（发一发，镜头跟着炮弹走）；
 * 再接一局打到第 12 轮的存档（3v3、8 把武器里的 6 把、坑很多）：读档时重建焦痕花多久，局末跟随、跟炮弹的帧，新坑画焦痕、重烘焙一块各花多久。
 * 打印每段的帧间隔（中位数、95 分位）和每帧画画花的时间（中位数、95 分位），毫秒。无头浏览器关了 GPU，画布是软件画的，数只作参考。
 * 用法：node scripts/perf.ts [降速倍数，默认 4] [像素比，默认 3]
 */
import { createServer } from 'vite';
import { launch } from './browser.ts';
import { plan, planActions } from '../src/ai/index.ts';
import { apply, newGame } from '../src/core/rules.ts';
import type { Action, State } from '../src/core/types.ts';
import { defaultRoom, roomSetup } from '../src/room.ts';
import { SOLO_KEY, SOLO_VERSION } from '../src/solo.ts';
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
await page.waitForSelector('.dl-lobby .start');
await page.click('.dl-lobby .start');
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
// 局末：电脑把一局 3v3 打到第 12 轮（轮到我时停），存成单机存档，从首页"接着上一局"读进来
type Stats = { burns: number; burnMs: number; bakes: number; bakeMs: number; resets: number; resetMs: number; layers: number };
const room = roomSetup({ ...defaultRoom(), size: 3, map: 'nightmarket' }, '我', () => 'nightmarket');
room.players.forEach((p, i) => (p.weapon = (['melon', 'carrot', 'rocket', 'slipper', 'milktea', 'paddle'] as const)[i]!));
// 我出局了、提前打完的种子换下一个
let key: number[] = [];
let st!: State;
let log: Action[] = [];
let booms = 0;
for (let seed = 5; seed < 60; seed++) {
  key = [seed, 7, 7, 7, 7, 7, 7, 7];
  st = newGame(key, room);
  log = [];
  booms = 0;
  while (st.phase === 'play' && !st.chars[0]!.out && !(st.round >= 12 && st.actor === 0)) {
    for (const a of planActions(plan(st, {}))) {
      const r = apply(st, a);
      if (!r.ok) throw new Error(r.error);
      booms += r.events.filter((e) => e.t === 'boom').length;
      log.push(a);
      st = r.state;
    }
  }
  if (st.phase === 'play' && !st.chars[0]!.out) break;
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.evaluate(([k, v]) => localStorage.setItem(k!, v!), [SOLO_KEY, JSON.stringify({ v: SOLO_VERSION, key, setup: room, log })]);
await page.goto(`http://127.0.0.1:${port}/games/danli/`);
await page.waitForSelector('.dl-lobby .resume');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[2] ?? 4) });
await page.click('.dl-lobby .resume');
while (!(await myTurn(page))) await page.waitForTimeout(100);
await page.waitForTimeout(1500);
const s0 = (await page.evaluate('window.__danli.terrainStats()')) as Stats;
console.log(`局末存档：第 ${st.round} 轮、${log.length} 步、${booms} 个坑；读档重建焦痕 ${s0.resetMs.toFixed(0)} ms（画了 ${s0.layers} 张焦痕层），首次烘焙 ${s0.bakes} 块共 ${s0.bakeMs.toFixed(0)} ms`);
await measure('局末跟随', () => page.waitForTimeout(3000));
await measure('局末跟炮弹', async () => {
  const b = (await page.locator('.dl-fire').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();
  // 等这一发炸完（最多 15 秒）
  const t0 = Date.now();
  await page.waitForTimeout(500);
  while (Date.now() - t0 < 15_000 && ((await page.evaluate('window.__danli.terrainStats().burns')) as number) === s0.burns) await page.waitForTimeout(200);
  await page.waitForTimeout(1000);
});
const s1 = (await page.evaluate('window.__danli.terrainStats()')) as Stats;
const nb = s1.burns - s0.burns;
const nk = s1.bakes - s0.bakes;
console.log(`局末一发：画焦痕 ${nb} 次、平均 ${nb ? ((s1.burnMs - s0.burnMs) / nb).toFixed(1) : '-'} ms；重烘焙 ${nk} 块、平均 ${nk ? ((s1.bakeMs - s0.bakeMs) / nk).toFixed(1) : '-'} ms（降速后）`);
await browser.close();
await server.close();
