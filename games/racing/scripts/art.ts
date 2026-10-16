/**
 * 写实纹理（ASSETS.md）：全部由这里的 SVG 程序生成，用无头浏览器光栅化成 webp，存到 public/art/。没有任何外部图片或第三方素材。
 * 每张都是能无缝平铺的方块（feTurbulence 的 stitchTiles），噪声种子写死，同一份脚本每次生成的一样。
 * 运行时只当图片平铺（SVG pattern、CSS background），不在手机上实时算滤镜。
 *
 *   node scripts/art.ts          重新生成 public/art/*.webp，并截一张总览到 shots/art.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './browser.ts';

const root = new URL('..', import.meta.url).pathname;
const OUT = `${root}public/art`;

interface Tex {
  name: string;
  /** 平铺纹理是方块（size）；图片（热量牌、挡位板、挡把）给 w、h */
  size: number;
  w?: number;
  h?: number;
  svg: string;
  /** webp 质量 */
  q?: number;
}

/** 一层分形噪声，按 matrix 着色（R、G、B、A 行），用来叠颗粒 */
const noise = (id: string, freq: number | string, oct: number, seed: number, matrix: string): string =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="${matrix}"/></filter>`;

const TEX: Tex[] = [
  {
    // 草坪：深浅两色的修剪条纹 + 细草颗粒 + 大块的明暗
    name: 'grass',
    size: 512,
    svg: `<defs>${noise('g1', 0.75, 3, 3, '0 0 0 0 0.08  0 0 0 0 0.22  0 0 0 0 0.06  0 0 0 1.1 -0.35')}${noise('g3', 0.75, 3, 4, '0 0 0 0 0.55  0 0 0 0 0.75  0 0 0 0 0.35  0 0 0 0.9 -0.45')}${noise('g2', 0.01, 2, 7, '0 0 0 0 0.05  0 0 0 0 0.14  0 0 0 0 0.04  0 0 0 0.9 -0.3')}</defs>
<rect width="512" height="512" fill="#3f7d3b"/>
${Array.from({ length: 8 }, (_, i) => `<rect y="${i * 64}" width="512" height="32" fill="#4f9147" opacity=".6"/>`).join('')}
<rect width="512" height="512" filter="url(#g2)"/><rect width="512" height="512" filter="url(#g1)"/><rect width="512" height="512" filter="url(#g3)"/>`,
  },
  {
    // 沥青：深灰底 + 细砂粒 + 亮色的碎石点
    name: 'asphalt',
    size: 256,
    svg: `<defs>${noise('a1', 1.4, 2, 11, '0 0 0 0 0.75  0 0 0 0 0.75  0 0 0 0 0.78  0 0 0 0.9 -0.42')}${noise('a2', 0.7, 3, 5, '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0.02  0 0 0 0.7 -0.25')}${noise('a3', 0.02, 2, 9, '0 0 0 0 0.2  0 0 0 0 0.2  0 0 0 0 0.22  0 0 0 0.35 -0.12')}</defs>
<rect width="256" height="256" fill="#3b3e43"/><rect width="256" height="256" filter="url(#a3)"/><rect width="256" height="256" filter="url(#a2)"/><rect width="256" height="256" filter="url(#a1)"/>`,
  },
  {
    // 砂石缓冲区：米黄色碎石，带深浅颗粒和小阴影
    name: 'gravel',
    size: 256,
    svg: `<defs><filter id="r0" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="3" seed="21" stitchTiles="stitch" result="n"/>
<feDiffuseLighting in="n" surfaceScale="6" lighting-color="#efe2c4" result="l"><feDistantLight azimuth="235" elevation="40"/></feDiffuseLighting>
<feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter>
${noise('r2', 1.1, 2, 4, '0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0.9 -0.4')}</defs>
<rect width="256" height="256" fill="#c7b285" filter="url(#r0)"/><rect width="256" height="256" filter="url(#r2)"/>`,
  },
  {
    // 水面：深浅蓝的波纹，用光照滤镜打出起伏的高光
    name: 'water',
    size: 512,
    svg: `<defs><filter id="w" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="3" seed="8" stitchTiles="stitch" result="n"/>
<feDiffuseLighting in="n" surfaceScale="3" lighting-color="#bfe6ff" result="l"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting>
<feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="0.9" k2="0" k3="0" k4="0"/></filter></defs>
<rect width="512" height="512" fill="#2c6f9e"/><rect width="512" height="512" fill="#3d8cc0" filter="url(#w)" opacity=".85"/>`,
  },
  {
    // 混凝土地面：浅灰板块 + 接缝 + 细颗粒和污渍
    name: 'concrete',
    size: 256,
    svg: `<defs>${noise('c1', 0.9, 2, 13, '0 0 0 0 0.3  0 0 0 0 0.3  0 0 0 0 0.3  0 0 0 0.5 -0.15')}${noise('c2', 0.03, 3, 2, '0 0 0 0 0.25  0 0 0 0 0.24  0 0 0 0 0.22  0 0 0 0.45 -0.15')}</defs>
<rect width="256" height="256" fill="#9da1a3"/><rect width="256" height="256" filter="url(#c2)"/><rect width="256" height="256" filter="url(#c1)"/>
<path d="M0 0.5H256M0 128.5H256M0.5 0V256M128.5 0V256" stroke="#6f7375" stroke-width="2" opacity=".7"/>`,
  },
  {
    // 碳纤维：斜纹编织，每格两个方向的丝束，带反光
    name: 'carbon',
    size: 64,
    q: 0.9,
    svg: `<defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f35"/><stop offset=".5" stop-color="#16191d"/><stop offset="1" stop-color="#0c0e10"/></linearGradient>
<linearGradient id="v" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#25292e"/><stop offset=".5" stop-color="#121417"/><stop offset="1" stop-color="#0a0b0d"/></linearGradient></defs>
<rect width="64" height="64" fill="#0d0f12"/>
${[0, 1, 2, 3]
  .flatMap((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 ? `<rect x="${c * 16 + 1}" y="${r * 16 + 1}" width="14" height="14" rx="2" fill="url(#h)"/>` : `<rect x="${c * 16 + 1}" y="${r * 16 + 1}" width="14" height="14" rx="2" fill="url(#v)"/>`)))
  .join('')}`,
  },
  {
    // 拉丝铝：横向的细拉丝纹 + 一道柔和的反光
    name: 'metal',
    size: 256,
    // 均匀的拉丝纹（能平铺）；斜向的反光在用的地方用渐变叠
    svg: `<defs><filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.003 0.8" numOctaves="2" seed="17" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.7 -0.2"/></filter>
${noise('m2', '0.004 0.6', 2, 19, '0 0 0 0 0.2  0 0 0 0 0.22  0 0 0 0 0.25  0 0 0 0.6 -0.2')}</defs>
<rect width="256" height="256" fill="#a7aeb5"/><rect width="256" height="256" filter="url(#m2)"/><rect width="256" height="256" filter="url(#m)"/>`,
  },
  {
    // 卡纸：米白底 + 极细的纸纤维
    name: 'paper',
    size: 256,
    q: 0.85,
    svg: `<defs>${noise('p1', 0.8, 3, 23, '0 0 0 0 0.55  0 0 0 0 0.5  0 0 0 0 0.42  0 0 0 0.25 -0.05')}</defs>
<rect width="256" height="256" fill="#f4efe4"/><rect width="256" height="256" filter="url(#p1)"/>`,
  },
];

/**
 * 不平铺的图片（2 倍尺寸画，页面上按 1 倍显示）：
 * - heat-card：热量牌的牌面，一台烧起来的 V8 引擎（气门室盖、进气歧管、空滤、皮带轮、烧红的排气管），火从引擎里窜出来，上面是烟和火星；
 * - gate：开放式金属挡位板（抛光铝、铣出来带倒角的 H 槽、四颗十字螺丝、刻着挡位数字），对应驾驶台挡位箱的 viewBox 0 0 120 104；
 * - knob：黑色球头挡把，顶上刻着换挡图。
 */
const flame = (id: string, d: string, from: string, mid: string, to: string): string =>
  `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${from}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${to}" stop-opacity=".2"/></linearGradient><path id="${id}p" d="${d}"/>`;

const SPRITES: Tex[] = [
  {
    name: 'heat-card',
    size: 0,
    w: 240,
    h: 336,
    q: 0.85,
    svg: `<defs>
<radialGradient id="bg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#5a1d0c"/><stop offset=".55" stop-color="#1f0d08"/><stop offset="1" stop-color="#0a0605"/></radialGradient>
<linearGradient id="blk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7178"/><stop offset=".5" stop-color="#3a3e43"/><stop offset="1" stop-color="#1c1e21"/></linearGradient>
<linearGradient id="vc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2463a"/><stop offset=".5" stop-color="#a8241a"/><stop offset="1" stop-color="#5c0f0a"/></linearGradient>
<linearGradient id="chr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".4" stop-color="#9aa2aa"/><stop offset=".7" stop-color="#e6eaee"/><stop offset="1" stop-color="#5b6168"/></linearGradient>
<linearGradient id="hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".35" stop-color="#ff7a1a"/><stop offset=".75" stop-color="#b8220c"/><stop offset="1" stop-color="#3a1208"/></linearGradient>
${flame('f1', 'M120 160C96 132 84 104 98 72C104 92 112 98 118 100C110 72 118 40 138 18C136 48 154 66 162 92C170 118 156 146 120 160Z', '#c81e0a', '#ff7a1a', '#ffd23f')}
${flame('f2', 'M70 168C52 150 48 124 60 100C64 116 70 122 76 124C72 104 78 86 92 74C90 98 104 114 106 134C108 150 96 166 70 168Z', '#c81e0a', '#ff6a14', '#ffc23a')}
${flame('f3', 'M172 168C154 160 146 140 150 120C154 130 160 134 164 134C162 116 170 100 184 92C182 112 196 126 194 144C192 158 186 166 172 168Z', '#c81e0a', '#ff6a14', '#ffc23a')}
<linearGradient id="core" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#fff2a8"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></linearGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="smoke" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="28"/><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect width="240" height="336" fill="url(#bg)"/>
<g filter="url(#smoke)" opacity=".75"><ellipse cx="110" cy="40" rx="70" ry="34" fill="#3b3633"/><ellipse cx="160" cy="62" rx="56" ry="28" fill="#2c2826"/><ellipse cx="70" cy="70" rx="48" ry="26" fill="#2f2a27"/></g>
<g transform="translate(0 22)"><g filter="url(#glow)" opacity=".9"><use href="#f1p" fill="#ff6a14"/><use href="#f2p" fill="#ff5a10"/><use href="#f3p" fill="#ff5a10"/></g>
<use href="#f2p" fill="url(#f2)"/><use href="#f3p" fill="url(#f3)"/><use href="#f1p" fill="url(#f1)"/>
<path d="M120 156C108 140 106 124 114 108C116 118 120 122 124 122C122 110 126 98 134 90C134 106 142 118 142 132C142 146 134 154 120 156Z" fill="url(#core)"/></g>
<g transform="translate(-42 -78) scale(1.35)"><ellipse cx="120" cy="300" rx="96" ry="14" fill="#000" opacity=".55" filter="url(#soft)"/>
<path d="M54 284C40 280 34 268 40 258L46 230" fill="none" stroke="url(#hot)" stroke-width="10" stroke-linecap="round"/>
<path d="M186 284C200 280 206 268 200 258L194 230" fill="none" stroke="url(#hot)" stroke-width="10" stroke-linecap="round"/>
<path d="M66 290C56 284 54 272 58 262L62 238" fill="none" stroke="url(#hot)" stroke-width="9" stroke-linecap="round"/>
<path d="M174 290C184 284 186 272 182 262L178 238" fill="none" stroke="url(#hot)" stroke-width="9" stroke-linecap="round"/>
<path d="M66 214L174 214L182 272Q120 296 58 272Z" fill="url(#blk)" stroke="#111" stroke-width="2"/>
${[0, 1, 2, 3].map((i) => `<rect x="${78 + i * 22}" y="230" width="14" height="30" rx="3" fill="#2a2d31" stroke="#55595e"/>`).join('')}
<g transform="translate(62 190) rotate(-18)"><rect width="66" height="26" rx="8" fill="url(#vc)" stroke="#3a0a06" stroke-width="2"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${7 + i * 9.5}" y="5" width="4" height="16" rx="2" fill="#ff8a7a" opacity=".35"/>`).join('')}</g>
<g transform="translate(114 170) rotate(18)"><rect width="66" height="26" rx="8" fill="url(#vc)" stroke="#3a0a06" stroke-width="2"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${7 + i * 9.5}" y="5" width="4" height="16" rx="2" fill="#ff8a7a" opacity=".35"/>`).join('')}</g>
<path d="M96 196L144 196L150 222L90 222Z" fill="url(#chr)" stroke="#3b4148" stroke-width="1.5"/>
${[0, 1, 2, 3].map((i) => `<rect x="${98 + i * 11}" y="198" width="7" height="22" rx="2" fill="#c6ccd2" stroke="#6b7178"/>`).join('')}
<ellipse cx="120" cy="190" rx="40" ry="13" fill="url(#chr)" stroke="#3b4148" stroke-width="2"/>
<ellipse cx="120" cy="187" rx="28" ry="8" fill="#2a2d31"/><ellipse cx="120" cy="186" rx="16" ry="4" fill="url(#chr)"/>
<circle cx="120" cy="268" r="20" fill="#16181a" stroke="#6b7178" stroke-width="3"/><circle cx="120" cy="268" r="7" fill="url(#chr)"/>
<circle cx="92" cy="246" r="11" fill="#16181a" stroke="#6b7178" stroke-width="2"/><circle cx="148" cy="246" r="11" fill="#16181a" stroke="#6b7178" stroke-width="2"/>
<path d="M92 235L120 248L148 235M81 246L100 268M159 246L140 268" fill="none" stroke="#0b0c0d" stroke-width="5" stroke-linecap="round"/>
<g filter="url(#glow)" opacity=".6"><ellipse cx="120" cy="196" rx="80" ry="30" fill="#ff5a10"/></g>
</g>
${[
  [60, 120, 2.4],
  [180, 110, 2],
  [150, 60, 1.8],
  [84, 52, 1.6],
  [200, 150, 1.6],
  [36, 150, 1.8],
  [128, 30, 1.4],
  [100, 90, 1.2],
]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd27a"/><circle cx="${x}" cy="${y}" r="${(r as number) * 3}" fill="#ff8a2a" opacity=".25"/>`)
  .join('')}`,
  },
  {
    name: 'gate',
    size: 0,
    w: 240,
    h: 208,
    q: 0.9,
    svg: `<defs>
<filter id="brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.9" numOctaves="2" seed="31"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 -0.15"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<linearGradient id="al" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7dce1"/><stop offset=".35" stop-color="#9da4ab"/><stop offset=".55" stop-color="#e9edf0"/><stop offset="1" stop-color="#7d848b"/></linearGradient>
<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#3b4148"/></linearGradient>
<linearGradient id="slot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#2a2d31"/></linearGradient>
<filter id="bevel" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur in="SourceAlpha" stdDeviation="2" result="b"/><feSpecularLighting in="b" surfaceScale="4" specularConstant=".9" specularExponent="22" lighting-color="#ffffff" result="s"><feDistantLight azimuth="235" elevation="38"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3=".6"/></filter>
<filter id="inset" x="-10%" y="-10%" width="120%" height="120%"><feOffset dx="0" dy="3"/><feGaussianBlur stdDeviation="2.5" result="o"/><feComposite in="SourceGraphic" in2="o" operator="out"/></filter>
<radialGradient id="screw" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#f1f3f5"/><stop offset=".6" stop-color="#9aa1a8"/><stop offset="1" stop-color="#4a5057"/></radialGradient>
</defs>
<rect x="4" y="4" width="232" height="200" rx="26" fill="#1c1f22"/>
<rect x="4" y="4" width="232" height="200" rx="26" fill="url(#al)" filter="url(#bevel)"/>
<rect x="4" y="4" width="232" height="200" rx="26" fill="#fff" filter="url(#brush)"/>
<rect x="5" y="5" width="230" height="198" rx="25" fill="none" stroke="url(#edge)" stroke-width="2" opacity=".8"/>
<path d="M52 40V168M188 40V168M52 104H188" fill="none" stroke="#f6f8fa" stroke-width="27" stroke-linecap="round" opacity=".9" transform="translate(0 2)"/>
<path d="M52 40V168M188 40V168M52 104H188" fill="none" stroke="#5d646b" stroke-width="25" stroke-linecap="round"/>
<path d="M52 40V168M188 40V168M52 104H188" fill="none" stroke="url(#slot)" stroke-width="20" stroke-linecap="round"/>
<path d="M52 40V168M188 40V168M52 104H188" fill="none" stroke="#000" stroke-width="14" stroke-linecap="round" opacity=".6" filter="url(#inset)"/>
${[
  [18, 18],
  [222, 18],
  [18, 190],
  [222, 190],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="url(#screw)" stroke="#3b4148"/><path d="M${x! - 4} ${y}h8M${x} ${y! - 4}v8" stroke="#3b4148" stroke-width="1.6"/>`)
  .join('')}
${[
  ['1', 22, 46],
  ['2', 22, 170],
  ['3', 218, 46],
  ['4', 218, 170],
]
  .map(([t, x, y]) => `<text x="${x}" y="${(y as number) + 1}" font-family="sans-serif" font-size="20" font-weight="800" text-anchor="middle" fill="#ffffff" opacity=".7">${t}</text><text x="${x}" y="${y}" font-family="sans-serif" font-size="20" font-weight="800" text-anchor="middle" fill="#33383e">${t}</text>`)
  .join('')}`,
  },
  {
    name: 'knob',
    size: 0,
    w: 96,
    h: 96,
    q: 0.92,
    svg: `<defs>
<radialGradient id="ball" cx=".38" cy=".32" r=".72"><stop offset="0" stop-color="#6a7078"/><stop offset=".35" stop-color="#25282c"/><stop offset=".8" stop-color="#08090a"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="rim" cx=".5" cy=".5" r=".5"><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#9aa3ad" stop-opacity=".55"/></radialGradient>
<filter id="hl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<circle cx="48" cy="48" r="44" fill="url(#ball)"/>
<circle cx="48" cy="48" r="44" fill="url(#rim)"/>
<g stroke="#c9ced3" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".85"><path d="M36 36V60M60 36V60M36 48H60"/></g>
<g font-family="sans-serif" font-size="9" font-weight="800" fill="#c9ced3" text-anchor="middle" opacity=".85"><text x="36" y="32">1</text><text x="36" y="70">2</text><text x="60" y="32">3</text><text x="60" y="70">4</text></g>
<ellipse cx="34" cy="26" rx="16" ry="9" fill="#fff" opacity=".45" filter="url(#hl)" transform="rotate(-25 34 26)"/>
<ellipse cx="31" cy="23" rx="6" ry="3" fill="#fff" opacity=".8"/>`,
  },
];
TEX.push(...SPRITES);

mkdirSync(OUT, { recursive: true });
mkdirSync(`${root}shots`, { recursive: true });
const browser = await launch();
const page = await browser.newPage();
const made: { name: string; size: number; url: string }[] = [];
for (const t of TEX) {
  const w = t.w ?? t.size;
  const h = t.h ?? t.size;
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
