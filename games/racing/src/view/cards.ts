/**
 * 卡面（DESIGN.md 第 8 节、ASSETS.md）：程序画的 SVG，纸纹、碳纤维是 public/art/ 里的纹理（scripts/art.ts 生成），不用外部图片、不用 emoji 字体。
 * - 速度牌：象牙白卡纸，顶上一条按点数配色的赛车条纹，中间一块速度表（指针指着点数）和大号数字；
 * - 改装牌 0、5：金箔边、"改装"飘带；
 * - 热量：一台烧起来的引擎（public/art/heat-card.webp）；热量在别处（引擎、名次栏、预览）都用火苗图标（flameSvg）；
 * - 手抖：卡纸上两道歪歪扭扭的轮胎拖痕，中间一个问号；
 * - 牌背：碳纤维，一道红色赛车条纹和"飞驰"字样。
 */
import { HEAT, STRESS } from '../core/cards.ts';

/** 点数越大颜色越热 */
const BAND: Record<number, [string, string]> = {
  0: ['#6b7280', '#3f4652'],
  1: ['#1c9a8f', '#0d5c56'],
  2: ['#2f74d6', '#163f85'],
  3: ['#7a4fd1', '#40238a'],
  4: ['#d8402f', '#7d1b12'],
  5: ['#e2a51c', '#8a5a00'],
};

let uid = 0;

function frame(id: string, inner: string, label: string): string {
  return `<svg viewBox="0 0 60 84" aria-label="${label}"><defs>
<pattern id="${id}p" patternUnits="userSpaceOnUse" width="60" height="60"><image href="art/paper.webp" width="60" height="60"/></pattern>
<clipPath id="${id}k"><rect x="1" y="1" width="58" height="82" rx="6"/></clipPath></defs>
<rect x="1" y="1" width="58" height="82" rx="6" fill="url(#${id}p)"/>
<g clip-path="url(#${id}k)">${inner}</g>
<rect x="1" y="1" width="58" height="82" rx="6" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/></svg>`;
}

/** 速度表：半圆刻度 0–5，指针指着 v */
function gauge(v: number, color: string): string {
  const cx = 30;
  const cy = 50;
  const r = 15;
  const ang = (k: number): number => Math.PI * (1 - k / 5);
  const ticks = Array.from({ length: 6 }, (_, k) => {
    const a = ang(k);
    return `<line x1="${cx + Math.cos(a) * (r - 3)}" y1="${cy - Math.sin(a) * (r - 3)}" x2="${cx + Math.cos(a) * r}" y2="${cy - Math.sin(a) * r}" stroke="#2a2a2a" stroke-width="1.2"/>`;
  }).join('');
  const a = ang(v);
  const red = `M${cx + Math.cos(ang(4)) * r} ${cy - Math.sin(ang(4)) * r}A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#2a2a2a" stroke-opacity=".25" stroke-width="5"/>
<path d="${red}" fill="none" stroke="#d8402f" stroke-opacity=".7" stroke-width="5"/>${ticks}
<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * (r - 2)}" y2="${cy - Math.sin(a) * (r - 2)}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy}" r="2.6" fill="#2a2a2a"/>`;
}

/** 火焰的渐变（外焰、内焰），id 前缀要在页面里唯一 */
function flameDefs(id: string): string {
  return `<linearGradient id="${id}o" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c81e0a"/><stop offset=".45" stop-color="#ff6a14"/><stop offset="1" stop-color="#ffb03a"/></linearGradient>
<linearGradient id="${id}i" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd23f"/><stop offset=".7" stop-color="#fff2a8"/><stop offset="1" stop-color="#ffffff"/></linearGradient>`;
}

/** 火焰本体（viewBox 0 0 24 32 的坐标）：外焰带两条火舌、内焰、焰心 */
function flameBody(id: string): string {
  return `<path d="M12 1C13 6 19 9.5 20.5 15.5C21.8 21 19 28.5 12 30.5C5 28.5 2.2 22 3.6 16.5C4.4 13.2 6.6 11.4 7.6 9.5C8.2 12 9.2 13.4 10.4 14C9.4 9.6 10.4 5 12 1Z" fill="url(#${id}o)"/>
<path d="M16.6 8.5C18.6 11.2 19.4 13.6 19.2 16C18 13.8 16.8 12.6 15.6 12C16.4 10.8 16.7 9.7 16.6 8.5Z" fill="#ff8a2a"/>
<path d="M12 12.5C14.4 16 16.6 18.6 16.4 22.8C16.2 26.4 14.2 28.6 12 28.8C9.8 28.6 7.8 26.6 7.8 23.6C7.8 21.2 9 19.6 10.2 18.6C10.4 20 11 21 11.8 21.4C11.2 18.4 11.2 15.4 12 12.5Z" fill="url(#${id}i)"/>
<ellipse cx="12" cy="25.4" rx="2.2" ry="3" fill="#ffffff" opacity=".85"/>`;
}

/** 热量的图标（一簇火苗）；lit 为 false 是用掉了的那格（灰的） */
export function flameSvg(lit = true): string {
  const id = `f${uid++}`;
  if (!lit) return `<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 1C13 6 19 9.5 20.5 15.5C21.8 21 19 28.5 12 30.5C5 28.5 2.2 22 3.6 16.5C4.4 13.2 6.6 11.4 7.6 9.5C8.2 12 9.2 13.4 10.4 14C9.4 9.6 10.4 5 12 1Z" fill="#2a3138" stroke="#3d4650" stroke-width="1.2"/></svg>`;
  return `<svg viewBox="0 0 24 32" aria-hidden="true"><defs>${flameDefs(id)}</defs>${flameBody(id)}</svg>`;
}

/** 一张牌的 SVG（viewBox 0 0 60 84） */
export function cardSvg(kind: number): string {
  const id = `c${uid++}`;
  if (kind === HEAT) {
    // 牌面是 public/art/heat-card.webp（scripts/art.ts 生成的一台烧起来的引擎），这里只加圆角、字条和描边
    return `<svg viewBox="0 0 60 84" aria-label="热量"><defs><clipPath id="${id}k"><rect x="1" y="1" width="58" height="82" rx="6"/></clipPath></defs>
<rect x="1" y="1" width="58" height="82" rx="6" fill="#170d0a"/>
<image href="art/heat-card.webp" x="0" y="0" width="60" height="84" clip-path="url(#${id}k)" preserveAspectRatio="xMidYMid slice"/>
<rect x="1" y="68" width="58" height="11" fill="#000" fill-opacity=".55"/>
<text x="30" y="76.6" font-size="8.5" text-anchor="middle" fill="#ffd9a0" font-weight="800" letter-spacing="1">热量</text>
<rect x="1" y="1" width="58" height="82" rx="6" fill="none" stroke="#ff7a2f" stroke-opacity=".7" stroke-width="1.4"/></svg>`;
  }
  if (kind === STRESS) {
    const inner = `<rect x="0" y="0" width="60" height="12" fill="#4a3f5c"/><rect x="0" y="12" width="60" height="1.5" fill="#2b2338"/>
<path d="M14 84C18 70 8 62 16 50S10 30 18 18" fill="none" stroke="#1d1d1d" stroke-opacity=".75" stroke-width="5" stroke-dasharray="2 1.2"/>
<path d="M42 84C46 72 36 60 44 50S38 30 46 18" fill="none" stroke="#1d1d1d" stroke-opacity=".75" stroke-width="5" stroke-dasharray="2 1.2"/>
<circle cx="30" cy="46" r="13" fill="#f4efe4" stroke="#4a3f5c" stroke-width="2"/>
<text x="30" y="53.5" font-size="20" text-anchor="middle" fill="#4a3f5c" font-weight="900">?</text>
<text x="30" y="9.5" font-size="7.5" text-anchor="middle" fill="#efe6ff" font-weight="800" letter-spacing="1">手抖</text>`;
    return frame(id, inner, '手抖');
  }
  const [a, b] = BAND[kind] ?? BAND[0]!;
  const upgrade = kind === 0 || kind === 5;
  const inner = `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".4" stop-color="#d9a21b"/><stop offset=".7" stop-color="#fff0a8"/><stop offset="1" stop-color="#a77208"/></linearGradient></defs>
<rect x="0" y="0" width="60" height="20" fill="url(#${id}b)"/>
<path d="M-4 20L14 0H20L2 20ZM8 20L26 0H29L11 20Z" fill="#fff" fill-opacity=".22"/>
<text x="7" y="15" font-size="13" fill="#fff" font-weight="900" font-style="italic">${kind}</text>
${upgrade ? `<text x="54" y="13" font-size="7" text-anchor="end" fill="#fff" font-weight="800">改装</text>` : `<text x="54" y="13" font-size="6.5" text-anchor="end" fill="#fff" fill-opacity=".85" font-weight="700">速度</text>`}
${gauge(kind, b)}
<text x="30" y="77" font-size="20" text-anchor="middle" fill="${b}" font-weight="900" font-style="italic">${kind}</text>`;
  const svg = frame(id, inner, `${upgrade ? '改装' : '速度'} ${kind}`);
  return upgrade ? svg.replace('</svg>', `<rect x="2" y="2" width="56" height="80" rx="5" fill="none" stroke="url(#${id}f)" stroke-width="3"/></svg>`) : svg;
}

/** 牌背（出牌区里盖着的牌、牌堆）：碳纤维 + 红色条纹 + 字 */
export function backSvg(): string {
  const id = `c${uid++}`;
  return `<svg viewBox="0 0 60 84" aria-label="牌背"><defs>
<pattern id="${id}c" patternUnits="userSpaceOnUse" width="16" height="16"><image href="art/carbon.webp" width="16" height="16"/></pattern>
<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect x="1" y="1" width="58" height="82" rx="6" fill="url(#${id}c)"/>
<path d="M22 1H32L28 83H18Z" fill="#d8402f"/><path d="M34 1H37L33 83H30Z" fill="#f2f2f2"/>
<rect x="1" y="1" width="58" height="82" rx="6" fill="url(#${id}s)"/>
<text x="30" y="47" font-size="11" text-anchor="middle" fill="#fff" font-weight="900" font-style="italic" stroke="#000" stroke-width="2" paint-order="stroke">飞驰</text>
<rect x="1" y="1" width="58" height="82" rx="6" fill="none" stroke="#000" stroke-width="1.4"/></svg>`;
}
