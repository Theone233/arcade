/**
 * 《弹里个弹》标题字（美术代理 2026-10-21 交付的 title.mjs，照原样改写成 TS）：四个字像被弹起来一样高低错落、各歪一点；
 * 面团色渐变 + 深褐粗描边 + 纸色外描边 + 往右下压的影子；头上一道虚线抛物线，末尾一只包子，"个"字旁边一团"噗"。只用 SVG 文字和路径，没有滤镜。
 */
export function titleSvg({ w = 420, h = 150, size = 84 }: { w?: number; h?: number; size?: number } = {}): string {
  const chars = [
    { c: '弹', x: 0.13, y: 0.78, r: -8, s: 1 },
    { c: '里', x: 0.36, y: 0.64, r: 6, s: 0.92 },
    { c: '个', x: 0.57, y: 0.80, r: -5, s: 0.86 },
    { c: '弹', x: 0.82, y: 0.58, r: 9, s: 1.06 },
  ];
  const g = chars.map(({ c, x, y, r, s }) => {
    const X = x * w, Y = y * h, fz = size * s;
    const t = (attrs: string): string => `<text x="${X}" y="${Y}" font-size="${fz}" font-weight="900" text-anchor="middle" transform="rotate(${r} ${X} ${Y - fz * 0.35})" ${attrs}>${c}</text>`;
    return t(`fill="#46291a" opacity=".35" dx="5" dy="6" stroke="#46291a" stroke-width="10" stroke-linejoin="round"`) +
      t(`fill="none" stroke="#fffaf0" stroke-width="16" stroke-linejoin="round"`) +
      t(`fill="url(#dlTitleG)" stroke="#46291a" stroke-width="7" stroke-linejoin="round" paint-order="stroke"`);
  }).join('');
  // 抛物线和包子
  const ax = w * 0.06, ay = h * 0.22, bx = w * 0.98, by = h * 0.06;
  const arc = `<path d="M${ax},${ay + 20} Q${w * 0.5},${-h * 0.32} ${bx - 18},${by + 6}" fill="none" stroke="#46291a" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" opacity=".7"/>`;
  const bun = `<g transform="translate(${bx - 6},${by + 8}) rotate(18)"><path d="M-16,6 Q-17,-12 0,-13 Q17,-12 16,6 Q0,11 -16,6Z" fill="#fdebc6" stroke="#46291a" stroke-width="3" stroke-linejoin="round"/><path d="M-5,-12 Q-3,-5 -7,2 M0,-13 V0 M5,-12 Q3,-5 7,2" stroke="#c9a676" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M-26,4 h-10 M-24,-4 h-14 M-22,12 h-8" stroke="#46291a" stroke-width="2.4" stroke-linecap="round" opacity=".6"/></g>`;
  const puff = `<g transform="translate(${w * 0.69},${h * 0.30})" opacity=".95"><path d="M-14,4 q-6,-12 6,-14 q4,-10 14,-4 q10,-4 12,6 q8,4 0,12 q-4,8 -14,4 q-10,6 -16,-2 q-10,-2 -2,-2z" fill="#fffaf0" stroke="#46291a" stroke-width="2.4" stroke-linejoin="round"/><text x="2" y="7" font-size="15" font-weight="900" text-anchor="middle" fill="#e2432a">噗</text></g>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="overflow:visible"><defs><linearGradient id="dlTitleG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a6"/><stop offset=".45" stop-color="#ffc24a"/><stop offset="1" stop-color="#f0821c"/></linearGradient></defs>${arc}${g}${puff}${bun}</svg>`;
}
