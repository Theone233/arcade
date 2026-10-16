/**
 * 生成平台首页封面 public/cover.png（1280×720）与 public/favicon.svg。
 *
 *   node tools/cover.ts
 *
 * 封面 = 标题主视觉 titleArtSvg(1280,720) + 右上方 logo；用无头 Chromium 栅格化。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { faviconSvg, logoSvg, titleArtSvg } from '../src/view/art/index.ts';

const PUB = new URL('../public/', import.meta.url).pathname;
mkdirSync(PUB, { recursive: true });
writeFileSync(`${PUB}favicon.svg`, faviconSvg());

const uri = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000}img{position:absolute;display:block}</style></head><body>` +
  `<img src="${uri(titleArtSvg(1280, 720))}" width="1280" height="720" style="left:0;top:0">` +
  `<div style="position:absolute;left:640px;top:40px;width:680px;height:400px;background:radial-gradient(closest-side,rgba(255,170,80,.28),rgba(255,140,60,0))"></div>` +
  `<img src="${uri(logoSvg())}" width="546" height="231" style="left:706px;top:118px">` +
  `</body></html>`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(html);
  await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
  await page.screenshot({ path: `${PUB}cover.png` });
  process.stdout.write('public/cover.png、public/favicon.svg 已生成\n');
} finally {
  await browser.close();
}
