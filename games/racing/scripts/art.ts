/**
 * 纹理（ASSETS.md）：全部由这里的 SVG 程序生成，用无头浏览器光栅化成 webp，存到 public/art/。没有任何外部图片或第三方素材。
 * 每张都是能无缝平铺的方块（feTurbulence 的 stitchTiles），噪声种子写死，同一份脚本每次生成的一样。
 * 运行时只当图片平铺（SVG pattern、CSS background），不在手机上实时算滤镜。地图板、棋子、卡面的图案都是运行时画的 SVG，不在这里。
 *
 *   node scripts/art.ts          重新生成 public/art/*.webp，并截一张总览到 shots/art.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './browser.ts';

const root = new URL('..', import.meta.url).pathname;
const OUT = `${root}public/art`;

interface Tex {
  name: string;
  /** 平铺纹理是方块的边长 */
  size: number;
  svg: string;
  /** webp 质量 */
  q?: number;
}

/** 一层分形噪声，按 matrix 着色（R、G、B、A 行），用来叠颗粒 */
const noise = (id: string, freq: number | string, oct: number, seed: number, matrix: string): string =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="${matrix}"/></filter>`;

const TEX: Tex[] = [
  {
    // 卡纸（卡面）：米白底 + 极细的纸纤维
    name: 'paper',
    size: 256,
    q: 0.85,
    svg: `<defs>${noise('p1', 0.8, 3, 23, '0 0 0 0 0.55  0 0 0 0 0.5  0 0 0 0 0.42  0 0 0 0.25 -0.05')}</defs>
<rect width="256" height="256" fill="#f4efe4"/><rect width="256" height="256" filter="url(#p1)"/>`,
  },
  {
    // 木桌面（地图板摆在上面）：横向拉长的噪声是木纹，再叠一层细颗粒
    name: 'wood',
    size: 512,
    q: 0.8,
    svg: `<defs>${noise('w1', '0.002 0.06', 3, 4, '0 0 0 0 0.62  0 0 0 0 0.4  0 0 0 0 0.22  0 0 0 0.9 -0.1')}${noise('w2', 0.9, 2, 5, '0 0 0 0 0.3  0 0 0 0 0.18  0 0 0 0 0.08  0 0 0 0.35 -0.1')}</defs>
<rect width="512" height="512" fill="#b98a55"/><rect width="512" height="512" filter="url(#w1)"/><rect width="512" height="512" filter="url(#w2)"/>`,
  },
  {
    // 地图板的纸纹颗粒（透明底，只有深色的细点）：盖在整块地图上
    name: 'grain',
    size: 128,
    q: 0.6,
    svg: `<defs>${noise('g1', 0.9, 2, 2, '0 0 0 0 .3  0 0 0 0 .25  0 0 0 0 .2  0 0 0 .22 0')}</defs><rect width="128" height="128" filter="url(#g1)"/>`,
  },
  {
    // 地面的斑驳（透明底，大块的浅色）：印刷时墨色不匀的样子。只有低频，画小图、用的时候放大 4 倍铺
    name: 'mottle',
    size: 128,
    q: 0.8,
    svg: `<defs>${noise('m1', 0.032, 2, 8, '0 0 0 0 .55  0 0 0 0 .6  0 0 0 0 .35  0 0 0 .7 -.22')}</defs><rect width="128" height="128" filter="url(#m1)"/>`,
  },
];

mkdirSync(OUT, { recursive: true });
mkdirSync(`${root}shots`, { recursive: true });
const browser = await launch();
const page = await browser.newPage();
const made: { name: string; size: number; url: string }[] = [];
for (const t of TEX) {
  const w = t.size;
  const h = t.size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${t.svg}</svg>`;
  const url = await page.evaluate(
    async ({ svg, w, h, q }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return c.toDataURL('image/webp', q);
    },
    { svg, w, h, q: t.q ?? 0.8 },
  );
  const buf = Buffer.from(url.split(',')[1]!, 'base64');
  writeFileSync(`${OUT}/${t.name}.webp`, buf);
  made.push({ name: t.name, size: t.size, url });
  console.log(`${t.name}.webp ${w}×${h} ${(buf.length / 1024).toFixed(1)} KB`);
}
// 总览：每张平铺 2×2，看接缝和观感
await page.setViewportSize({ width: 1500, height: 940 });
await page.setContent(
  `<body style="margin:0;display:flex;flex-wrap:wrap;gap:8px;background:#111;font:14px sans-serif;color:#fff">${made
    .map((t) =>
      t.size
        ? `<div><div style="width:290px;height:280px;background:url(${t.url});background-size:${Math.min(t.size, 145)}px"></div>${t.name}</div>`
        : `<div><img src="${t.url}" style="height:280px;background:#333">${t.name}</div>`,
    )
    .join('')}</body>`,
);
await page.screenshot({ path: `${root}shots/art.png` });
await browser.close();
