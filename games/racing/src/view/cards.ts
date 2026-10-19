/**
 * 卡面（DESIGN.md 第 8 节、ASSETS.md）：印刷卡的样子，墨线描边、平涂，卡纸是 public/art/paper.webp 的纹理（scripts/art.ts 生成）；不用外部图片、不用 emoji 字体。
 * - 速度牌：顶上一条按点数配色的色带（点数越大越热），中间一块速度表（指针指着点数），下面大号数字；
 * - 改装牌 0、5：色带上写"改装"，卡边一圈金线；
 * - 热量：红底上一台线描的引擎，火从引擎里窜出来；别处（引擎热量、名次栏、预览、飘字）的热量都用火苗图标（flameSvg）；
 * - 手抖：紫底上两道歪歪扭扭的轮胎拖痕，中间一个问号；
 * - 牌背：深绿底，一圈细线框和"飞驰"字样。
 */
import { HEAT, STRESS } from '../core/cards.ts';

const INK = '#2b2622';
const PAPER = '#f7f0dc';

/** 色带颜色：点数越大越热 */
const BAND = ['#8a8f96', '#3f9a8f', '#3d78c9', '#7a5ac9', '#cc4b3a', '#d9a124'];

let uid = 0;

function frame(id: string, inner: string, label: string, bg = ''): string {
  return `<svg viewBox="0 0 60 84" aria-label="${label}"><defs>
<pattern id="${id}p" patternUnits="userSpaceOnUse" width="60" height="60"><image href="art/paper.webp" width="60" height="60"/></pattern>
<clipPath id="${id}k"><rect x="1" y="1" width="58" height="82" rx="6"/></clipPath></defs>
<rect x="1" y="1" width="58" height="82" rx="6" fill="url(#${id}p)"/>${bg ? `<rect x="1" y="1" width="58" height="82" rx="6" fill="${bg}"/>` : ''}
<g clip-path="url(#${id}k)">${inner}</g>
<rect x="1" y="1" width="58" height="82" rx="6" fill="none" stroke="${INK}" stroke-width="1.4"/></svg>`;
}

/** 速度表：半圆刻度 0–5，指针指着 v */
function gauge(v: number, color: string): string {
  const cx = 30;
  const cy = 50;
  const r = 13;
  const ang = (k: number): number => Math.PI * (1 - k / 5);
  const ticks = Array.from({ length: 6 }, (_, k) => {
    const a = ang(k);
    return `<path d="M${(cx + Math.cos(a) * (r - 3)).toFixed(1)} ${(cy - Math.sin(a) * (r - 3)).toFixed(1)}L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy - Math.sin(a) * r).toFixed(1)}" stroke="${INK}" stroke-width="1"/>`;
  }).join('');
  const a = ang(v);
  return `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${INK}" stroke-width="1.4"/>${ticks}
<path d="M${cx} ${cy}L${(cx + Math.cos(a) * (r - 2)).toFixed(1)} ${(cy - Math.sin(a) * (r - 2)).toFixed(1)}" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy}" r="2.2" fill="${INK}"/>`;
}

const FLAME = 'M12 1C13 6 19 9.5 20.5 15.5C21.8 21 19 28.5 12 30.5C5 28.5 2.2 22 3.6 16.5C4.4 13.2 6.6 11.4 7.6 9.5C8.2 12 9.2 13.4 10.4 14C9.4 9.6 10.4 5 12 1Z';
const CORE = 'M12 12.5C14.4 16 16.6 18.6 16.4 22.8C16.2 26.4 14.2 28.6 12 28.8C9.8 28.6 7.8 26.6 7.8 23.6C7.8 21.2 9 19.6 10.2 18.6C10.4 20 11 21 11.8 21.4C11.2 18.4 11.2 15.4 12 12.5Z';

/** 热量的图标（一簇火苗，墨线描边）；lit 为 false 是用掉了的那格（灰的） */
export function flameSvg(lit = true): string {
  if (!lit) return `<svg viewBox="0 0 24 32" aria-hidden="true"><path d="${FLAME}" fill="#cfc4a6" stroke="#9a8f74" stroke-width="1.2"/></svg>`;
  return `<svg viewBox="0 0 24 32" aria-hidden="true"><path d="${FLAME}" fill="#e2562e" stroke="${INK}" stroke-width="1.2"/><path d="${CORE}" fill="#f6c34a"/></svg>`;
}

/** 线描的引擎：缸体、两排红色气门室盖、中间的空滤、前面的皮带轮、底下的排气管；火从缸体上面窜出来 */
const ENGINE = `<path d="M30 6C33 15 44 20 44 33C44 38 42 41 40 43H20C18 41 16 38 16 34C16 28 20 25 22 21C23 26 25 28 27 29C25 22 27 13 30 6Z" fill="#f6a83a" stroke="${INK}" stroke-width="1.2"/>
<path d="M30 22C33 27 37 30 37 36C37 40 35 42 33 43H27C25 42 23 40 23 37C23 33 26 31 27 29C27.5 32 29 33.5 30.5 34C29.5 30 29.5 26 30 22Z" fill="#fff3c8" stroke="${INK}" stroke-width=".8"/>
<rect x="13" y="43" width="34" height="18" rx="2" fill="#6b7178" stroke="${INK}" stroke-width="1.2"/>
<path d="M15 48H45M15 53H45" stroke="${INK}" stroke-width=".7" opacity=".6"/>
<rect x="9" y="39" width="18" height="7" rx="2" fill="#c63f2e" stroke="${INK}" stroke-width="1.1" transform="rotate(-8 18 42.5)"/>
<rect x="33" y="39" width="18" height="7" rx="2" fill="#c63f2e" stroke="${INK}" stroke-width="1.1" transform="rotate(8 42 42.5)"/>
<ellipse cx="30" cy="42" rx="7" ry="3.2" fill="#d9dde0" stroke="${INK}" stroke-width="1.1"/>
<circle cx="20" cy="56" r="4" fill="#d9dde0" stroke="${INK}" stroke-width="1"/><circle cx="20" cy="56" r="1.2" fill="${INK}"/>
<path d="M36 61V65M42 61V65" stroke="${INK}" stroke-width="2.4"/>`;

/** 一张牌的 SVG（viewBox 0 0 60 84） */
export function cardSvg(kind: number): string {
  const id = `c${uid++}`;
  if (kind === HEAT) {
    const inner = `<rect x="5" y="5" width="50" height="62" rx="3" fill="#c63f2e" stroke="${INK}" stroke-width="1"/>${ENGINE}
<text x="30" y="78" font-size="9" font-weight="900" text-anchor="middle" fill="${INK}" letter-spacing="1">热量</text>`;
    return frame(id, inner, '热量');
  }
  if (kind === STRESS) {
    const inner = `<rect x="5" y="5" width="50" height="62" rx="3" fill="#7d6a9e" stroke="${INK}" stroke-width="1"/>
<path d="M14 64C18 52 10 44 18 34S12 18 18 8M44 64C48 52 40 44 46 34S40 18 46 8" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="2 1.6" opacity=".55"/>
<circle cx="30" cy="36" r="12" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
<text x="30" y="43" font-size="19" font-weight="900" text-anchor="middle" fill="${INK}">?</text>
<text x="30" y="78" font-size="9" font-weight="900" text-anchor="middle" fill="${INK}" letter-spacing="1">手抖</text>`;
    return frame(id, inner, '手抖');
  }
  const col = BAND[kind] ?? BAND[0]!;
  const upgrade = kind === 0 || kind === 5;
  const inner = `<rect x="0" y="0" width="60" height="20" fill="${col}"/><path d="M0 20H60" stroke="${INK}" stroke-width="1"/>
<text x="7" y="15" font-size="12" font-weight="900" fill="#fff">${kind}</text>
<text x="54" y="13.5" font-size="7" text-anchor="end" fill="#fff" font-weight="800">${upgrade ? '改装' : '速度'}</text>
${gauge(kind, col)}
<text x="30" y="77" font-size="20" text-anchor="middle" fill="${col}" stroke="${INK}" stroke-width=".6" font-weight="900">${kind}</text>`;
  const svg = frame(id, inner, `${upgrade ? '改装' : '速度'} ${kind}`);
  return upgrade ? svg.replace('</svg>', `<rect x="3" y="3" width="54" height="78" rx="4.5" fill="none" stroke="#d9a124" stroke-width="2"/></svg>`) : svg;
}

/** 牌背（出牌区里盖着的牌、牌堆）：深绿底，细线框，"飞驰" */
export function backSvg(): string {
  return `<svg viewBox="0 0 60 84" aria-label="牌背"><rect x="1" y="1" width="58" height="82" rx="6" fill="#2f4a3c" stroke="${INK}" stroke-width="1.4"/>
<rect x="5" y="5" width="50" height="74" rx="3" fill="none" stroke="${PAPER}" stroke-width="1"/>
<path d="M5 30H55M5 54H55" stroke="${PAPER}" stroke-width=".8" stroke-dasharray="3 3"/>
<path d="M18 30L30 22L42 30M18 54L30 62L42 54" fill="none" stroke="#e2a92b" stroke-width="1.2"/>
<text x="30" y="47" font-size="12" font-weight="900" text-anchor="middle" fill="${PAPER}" font-style="italic">飞驰</text></svg>`;
}
