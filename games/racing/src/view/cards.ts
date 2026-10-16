/**
 * 卡面（DESIGN.md 第 8 节）：全部程序生成的 SVG，不用图片、不用 emoji 字体。来源写在 ASSETS.md。
 * 速度牌：大号数字 + 斜向速度条纹，点数越大颜色越热；改装牌金边；热量是橙红散热片加火苗；手抖是抖动的波纹加问号。
 */
import { HEAT, STRESS } from '../core/cards.ts';

const SPEED_BG: Record<number, [string, string]> = {
  0: ['#5b6170', '#383c47'],
  1: ['#1f8a8a', '#0f4f52'],
  2: ['#2f6fd6', '#173b80'],
  3: ['#7b4fd6', '#3f2580'],
  4: ['#d2453c', '#7d1d18'],
  5: ['#e0a21b', '#8a5a00'],
};

let uid = 0;

/** 一张牌的 SVG（viewBox 0 0 60 84） */
export function cardSvg(kind: number): string {
  const id = `c${uid++}`;
  if (kind === HEAT) {
    return `<svg viewBox="0 0 60 84" aria-label="热量"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a2f"/><stop offset="1" stop-color="#b3200e"/></linearGradient></defs>
<rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="url(#${id})" stroke="#5c1206" stroke-width="2"/>
${[12, 20, 28, 36, 44].map((x) => `<rect x="${x}" y="8" width="4" height="30" rx="2" fill="#ffd2a8" opacity=".55"/>`).join('')}
<path d="M30 44c7 7 10 12 10 18a10 10 0 0 1-20 0c0-4 2-7 4-9 0 4 2 6 4 6-1-6 0-10 2-15z" fill="#ffe08a" stroke="#fff3c4" stroke-width="1.2"/>
<text x="30" y="80" font-size="9" text-anchor="middle" fill="#fff" font-weight="700">热量</text></svg>`;
  }
  if (kind === STRESS) {
    return `<svg viewBox="0 0 60 84" aria-label="手抖"><rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="#4a3f5c" stroke="#231b31" stroke-width="2"/>
<path d="M8 20q4-5 8 0t8 0 8 0 8 0 8 0 8 0" fill="none" stroke="#b9a6db" stroke-width="2"/>
<path d="M8 66q4-5 8 0t8 0 8 0 8 0 8 0 8 0" fill="none" stroke="#b9a6db" stroke-width="2"/>
<text x="30" y="54" font-size="30" text-anchor="middle" fill="#f1e9ff" font-weight="800">?</text>
<text x="30" y="80" font-size="9" text-anchor="middle" fill="#e6dcf7" font-weight="700">手抖</text></svg>`;
  }
  const [a, b] = SPEED_BG[kind] ?? SPEED_BG[0]!;
  const upgrade = kind === 0 || kind === 5;
  const stripes = Array.from({ length: 6 }, (_, i) => `<path d="M${-20 + i * 16} 84 L${10 + i * 16} 0" stroke="#fff" stroke-opacity=".09" stroke-width="6"/>`).join('');
  const chevrons = Array.from({ length: kind }, (_, i) => `<path d="M${30 - kind * 4 + i * 8} 62l4 4-4 4" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2"/>`).join('');
  return `<svg viewBox="0 0 60 84" aria-label="${upgrade ? '改装' : '速度'} ${kind}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><clipPath id="${id}k"><rect x="1.5" y="1.5" width="57" height="81" rx="7"/></clipPath></defs>
<rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="url(#${id})"/>
<g clip-path="url(#${id}k)">${stripes}</g>
<rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="none" stroke="${upgrade ? '#ffd76a' : 'rgba(0,0,0,.45)'}" stroke-width="${upgrade ? 3 : 2}"/>
<text x="30" y="50" font-size="36" text-anchor="middle" fill="#fff" font-weight="800" font-style="italic">${kind}</text>
${chevrons}
${upgrade ? `<text x="30" y="80" font-size="9" text-anchor="middle" fill="#ffe7a3" font-weight="700">改装</text>` : ''}
<text x="8" y="14" font-size="10" fill="#fff" fill-opacity=".85" font-weight="700">${kind}</text></svg>`;
}
