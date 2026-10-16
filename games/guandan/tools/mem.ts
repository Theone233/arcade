/**
 * 内存估算：起 vite → Chromium 模拟老 iPhone 横屏，按 scale=1/2/3 和自动倍数各开一局，
 * 读调试桥 memory() 统计纹理、文字画布、主画布的像素数（×4 字节 = MB），再读 Chromium 进程树的 PSS 做旁证；
 * 最后模拟 Safari 地址栏收起/展开几次，看纹理会不会越攒越多。
 *
 * 用法：node tools/mem.ts [--scales auto,1,2,3]
 * 端口跟冒烟脚本共用 GD_SHOT_PORT（默认 5191），两者别同时跑。
 * Chromium 用软件 GL，PSS 只能说明趋势，不等于 iOS 上的真实占用；像素数是确定的。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.GD_SHOT_PORT ?? 5191);
const BASE = `http://127.0.0.1:${PORT}`;
const MB = 1024 * 1024;
const IOS15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';

const DEVICES = [
  { name: 'iPhone 8 横屏', w: 667, h: 375, dpr: 2, bar: 331 },
  { name: 'iPhone 8 Plus 横屏', w: 736, h: 414, dpr: 3, bar: 370 },
];

const argScales = process.argv.indexOf('--scales');
const SCALES = ((argScales > 0 ? process.argv[argScales + 1] : undefined) ?? 'auto,1,2,3').split(',');

interface Mem {
  textures: Record<string, number>;
  text: number;
  texts: number;
  canvas: number;
  webgl: boolean;
}

/** 进程树 PSS（KB）：Linux 才有 /proc，别的系统返回 0 */
function pssKB(root: number): number {
  let procs: string[] = [];
  try {
    procs = readdirSync('/proc').filter((d: string) => /^\d+$/.test(d));
  } catch {
    return 0;
  }
  const parent = new Map<number, number>();
  for (const p of procs) {
    try {
      const stat = readFileSync(`/proc/${p}/stat`, 'utf8');
      parent.set(Number(p), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
    } catch {
      // 进程刚退出
    }
  }
  const tree = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [pid, pp] of parent) if (!tree.has(pid) && tree.has(pp)) (tree.add(pid), (grew = true));
  }
  let kb = 0;
  for (const pid of tree) {
    try {
      const m = /^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'));
      if (m) kb += Number(m[1]);
    } catch {
      // 没权限或已退出
    }
  }
  return kb;
}

const mb = (px: number): string => ((px * 4) / MB).toFixed(1);

async function measure(page: Page): Promise<Mem> {
  return page.evaluate(() => window.__game!.memory());
}

function row(dev: string, scale: string, rs: number, m: Mem, pss: number): string {
  const t = m.textures;
  const card = (t.card ?? 0) + (t.back ?? 0) + (t.mark ?? 0);
  const backdrop = (t.table ?? 0) + (t.title ?? 0);
  const small = Object.entries(t)
    .filter(([k]) => !['card', 'back', 'mark', 'table', 'title'].includes(k))
    .reduce((a, [, v]) => a + v, 0);
  const all = card + backdrop + small + m.text + m.canvas;
  return `| ${dev} | ${scale} | ${rs} | ${mb(card)} | ${mb(backdrop)} | ${mb(small)} | ${mb(m.text)}（${m.texts} 个） | ${mb(m.canvas)} | **${mb(all)}** | ${pss ? (pss / 1024).toFixed(0) : '-'} | ${m.webgl ? 'WebGL' : 'Canvas'} |`;
}

async function main(): Promise<void> {
  const server = await createServer({ root: process.cwd(), logLevel: 'warn', server: { host: '127.0.0.1', port: PORT, strictPort: true, hmr: false } });
  await server.listen();
  const lines: string[] = [];
  const churn: string[] = [];
  try {
    for (const d of DEVICES) {
      for (const sc of SCALES) {
        // 每种情况单独起浏览器，PSS 才不互相污染
        const bs = await chromium.launchServer({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
        const browser = await chromium.connect(bs.wsEndpoint());
        try {
          const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, screen: { width: d.h, height: d.w }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, userAgent: IOS15 });
          const page = await ctx.newPage();
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          const q = sc === 'auto' ? '' : `&scale=${sc}`;
          await page.goto(`${BASE}/?debug=1&seed=mem&anim=0${q}`);
          await page.waitForFunction(() => window.__game?.ready && window.__game.scene === 'table' && window.__game.idle, null, { timeout: 60_000 });
          await page.waitForTimeout(500);
          const rs = await page.evaluate(() => window.__game!.renderScale);
          const m = await measure(page);
          lines.push(row(d.name, sc, rs, m, pssKB(bs.process().pid!)));
          if (sc === 'auto') {
            // Safari 横屏地址栏展开/收起会改 innerHeight → 世界宽度变 → 每个新宽度烘焙一套背景
            for (let i = 0; i < 3; i++) {
              for (const h of [d.bar, d.h]) {
                await page.setViewportSize({ width: d.w, height: h - i * 8 });
                await page.waitForTimeout(900);
              }
            }
            await page.waitForFunction(() => window.__game?.scene === 'table' && window.__game.idle, null, { timeout: 30_000 });
            const after = await measure(page);
            const bd = (x: Mem): number => (x.textures.table ?? 0) + (x.textures.title ?? 0);
            churn.push(`| ${d.name} | ${rs} | ${mb(bd(m))} | ${mb(bd(after))} | ${(pssKB(bs.process().pid!) / 1024).toFixed(0)} |`);
          }
          if (errors.length) throw new Error(`${d.name} scale=${sc} 页面报错：${errors.join('; ')}`);
          await ctx.close();
        } finally {
          await browser.close();
          await bs.close();
        }
      }
    }
  } finally {
    await server.close();
  }
  console.log('| 设备 | scale 参数 | 实际倍数 | 牌面/牌背 MB | 背景大图 MB | 头像图标等 MB | 文字画布 MB | 主画布 MB | 合计 MB | Chromium PSS MB | 渲染器 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const l of lines) console.log(l);
  if (churn.length) {
    console.log('\n地址栏收起/展开 6 次前后（自动倍数）：');
    console.log('| 设备 | 倍数 | 背景大图 MB（前） | 背景大图 MB（后） | Chromium PSS MB（后） |');
    console.log('|---|---|---|---|---|');
    for (const l of churn) console.log(l);
  }
}

await main();
