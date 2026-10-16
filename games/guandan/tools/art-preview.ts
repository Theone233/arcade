/**
 * 美术预览：把 src/view/art 生成的全部 SVG 排成几张 HTML 页面，用无头 Chromium 截图到 shots/art/。
 *
 *   node tools/art-preview.ts
 *
 * 产物：cards.png（54 张牌面 + 牌背 + 覆盖层）、cards-big.png（原尺寸细看）、avatars.png、icons.png、
 * table.png、title.png、misc.png（logo / 印章 / 粒子 / 名牌 / favicon）、hand-88.png、hand-46.png（模拟手牌叠放）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import {
  avatarSvg, cardBackSvg, cardFaceSvg, faviconSvg, iconSvg, levelMarkSvg, logoSvg, particleSvg, PERSONAS,
  seatPlateSvg, stampSvg, tableSvg, titleArtSvg, wildMarkSvg, type AvatarId, type IconName, type Mood,
} from '../src/view/art/index.ts';

const OUT = new URL('../shots/art/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const uri = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const img = (s: string, w: number, h: number, style = '') => `<img src="${uri(s)}" width="${w}" height="${h}" style="${style}">`;
const page0 = (body: string, bg = '#183f2c') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;background:${bg};font:14px sans-serif;color:#fff7e6}` +
  `.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:12px}.cap{font-size:12px;opacity:.8;text-align:center}img{display:block}</style></head><body>${body}</body></html>`;

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** 模拟手牌：8 列，每列 2–4 张，纵向偏移 34/124、列距 70/88 */
function handPage(w: number): string {
  const h = Math.round(w * 124 / 88);
  const dy = h * 34 / 124, dx = w * 70 / 88;
  const level = 2; // 打 2：2 是级牌，红桃 2 是逢人配
  const cols: Array<Array<[number, number]>> = [
    [[17, -1], [16, -1]],
    [[2, 1], [2, 0], [2, 3]],
    [[14, 0], [14, 1], [14, 2], [14, 3]],
    [[13, 1], [13, 2]],
    [[12, 3], [12, 0], [12, 1]],
    [[11, 2], [11, 0]],
    [[10, 1], [10, 3], [10, 0], [10, 2]],
    [[9, 0], [8, 3], [7, 2]],
  ];
  let html = '';
  cols.forEach((col, ci) => {
    col.forEach(([r, s], i) => {
      const st = `position:absolute;left:${ci * dx}px;top:${i * dy}px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))`;
      html += img(cardFaceSvg(r, s), w, h, st);
      if (r === level) html += img(s === 1 ? wildMarkSvg() : levelMarkSvg(), w, h, `position:absolute;left:${ci * dx}px;top:${i * dy}px`);
    });
  });
  const W = Math.ceil(dx * 7 + w + 2), H = Math.ceil(dy * 3 + h + 2);
  return page0(`<div style="position:relative;width:${W}px;height:${H}px">${html}</div>`);
}

async function shot(page: Page, html: string, name: string, w: number, h?: number, dpr = 1): Promise<void> {
  await page.setViewportSize({ width: w, height: h ?? 400 });
  await page.setContent(html);
  await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined))));
  void dpr;
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: h === undefined });
  process.stdout.write(`  ${name}.png\n`);
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
try {
  const p1 = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  // 1. 全部牌面
  let body = '';
  for (let s = 0; s < 4; s++) body += `<div class="row">${RANKS.map((r) => img(cardFaceSvg(r, s), 100, 140)).join('')}</div>`;
  body += `<div class="row">${img(cardFaceSvg(16, -1), 100, 140)}${img(cardFaceSvg(17, -1), 100, 140)}${img(cardBackSvg(0), 100, 140)}${img(cardBackSvg(1), 100, 140)}` +
    `<div style="position:relative">${img(cardFaceSvg(5, 3), 100, 140)}${img(levelMarkSvg(), 100, 140, 'position:absolute;left:0;top:0')}</div>` +
    `<div style="position:relative">${img(cardFaceSvg(5, 1), 100, 140)}${img(wildMarkSvg(), 100, 140, 'position:absolute;left:0;top:0')}</div></div>`;
  await shot(p1, page0(body), 'cards', 1440);
  // 2. 原尺寸细看
  const big: string[] = [cardFaceSvg(14, 0), cardFaceSvg(11, 1), cardFaceSvg(12, 0), cardFaceSvg(13, 3), cardFaceSvg(17, -1), cardFaceSvg(16, -1), cardFaceSvg(10, 2), cardBackSvg(0)];
  body = `<div class="row">${big.map((s) => img(s, 200, 280)).join('')}</div>` +
    `<div class="row"><div style="position:relative">${img(cardFaceSvg(7, 3), 200, 280)}${img(levelMarkSvg(), 200, 280, 'position:absolute;left:0;top:0')}</div>` +
    `<div style="position:relative">${img(cardFaceSvg(7, 1), 200, 280)}${img(wildMarkSvg(), 200, 280, 'position:absolute;left:0;top:0')}</div>${img(cardBackSvg(1), 200, 280)}${img(cardFaceSvg(12, 1), 200, 280)}${img(cardFaceSvg(13, 2), 200, 280)}${img(cardFaceSvg(11, 0), 200, 280)}</div>`;
  await shot(p1, page0(body), 'cards-big', 1700);
  // 3. 头像
  const ids: AvatarId[] = ['me', 'laozhang', 'xiaomei', 'aqiang'];
  const moods: Mood[] = ['normal', 'happy', 'sad', 'think', 'smug'];
  body = ids.map((id) => `<div class="row">${moods.map((m) => `<div>${img(avatarSvg(id, m), 160, 160)}<div class="cap">${id} ${m}</div></div>`).join('')}${img(avatarSvg(id, 'normal'), 56, 56)}</div>`).join('');
  await shot(p1, page0(body), 'avatars', 1000);
  // 4. 图标
  const icons: IconName[] = ['play', 'pass', 'hint', 'sort', 'undo', 'settings', 'rules', 'sound', 'mute', 'back', 'stats', 'home', 'close', 'check', 'crown', 'bomb', 'cards', 'robot', 'speed', 'restart'];
  body = `<div class="row">${icons.map((n) => `<div>${img(iconSvg(n), 64, 64)}<div class="cap">${n}</div></div>`).join('')}</div>` +
    `<div class="row">${icons.map((n) => img(iconSvg(n, '#d4a64a'), 32, 32)).join('')}</div>`;
  await shot(p1, page0(body), 'icons', 1100);
  // 5. 桌布、标题图
  await shot(p1, page0(img(tableSvg(1280, 720), 1280, 720), '#000').replace('padding:16px', 'padding:0'), 'table', 1280, 720);
  await shot(p1, page0(`<div style="position:relative">${img(titleArtSvg(1280, 720), 1280, 720)}${img(logoSvg(), 520, 220, 'position:absolute;left:700px;top:60px')}</div>`, '#000').replace('padding:16px', 'padding:0'), 'title', 1280, 720);
  await shot(p1, page0(img(titleArtSvg(1700, 720), 1700, 720), '#000').replace('padding:16px', 'padding:0'), 'title-wide', 1700, 720);
  // 6. 杂项
  const kinds = ['spark', 'petal', 'coin', 'confetti', 'star', 'smoke'] as const;
  body = `<div class="row">${img(logoSvg(), 520, 220)}${img(faviconSvg(), 64, 64)}${img(faviconSvg(), 32, 32)}</div>` +
    `<div class="row">${['头游', '二游', '三游', '末游', '接风', '炸'].map((t, i) => img(stampSvg(t, i === 3 ? '#555c66' : '#c0272f'), 150, 150)).join('')}${img(stampSvg('过', '#d4a64a'), 150, 150)}</div>` +
    `<div class="row">${kinds.map((k) => img(particleSvg(k), 64, 64)).join('')}${kinds.map((k) => img(particleSvg(k), 32, 32)).join('')}</div>` +
    `<div class="row">${Object.values(PERSONAS).map((p) => `<div style="position:relative">${img(seatPlateSvg(p.color), 200, 64)}<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px">${p.name}</div></div>`).join('')}${img(seatPlateSvg(0x2f5a8c), 200, 64)}</div>`;
  await shot(p1, page0(body), 'misc', 1200);
  // 7. 模拟手牌（两种显示尺寸，DPR 2）
  const p2 = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();
  await shot(p2, handPage(88), 'hand-88', 760);
  await shot(p2, handPage(46), 'hand-46', 420);
} finally {
  await browser.close();
}
