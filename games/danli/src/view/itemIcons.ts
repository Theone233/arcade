/**
 * 道具图标（B2 手绘绘本风，美术 2026-10-21 定稿，照美术给的源码改写成 TypeScript）：程序画的 SVG，48×48 的 viewBox，不画边框。
 * 按钮的边框、体力小签、次数章、四种状态（够 / 不够 / 选中 / 用完）由 hud.ts 的 DOM 和 style.css 画。
 * 画法约定：不用滤镜、渐变、图案、id（可以随便复制多份，手机上画起来便宜）；手绘的抖动直接画进路径里；
 * 按钮上不放汉字，只有数字和符号（+1、+2、10%）；同一组共用一个记号：发射方式 = 一道蓝色的拖尾，加力 = 火焰（等级越高火越多），特殊 = 不画包子主体。
 */

export type IconId = 'burst1' | 'burst2' | 'fork' | 'power10' | 'power20' | 'power50' | 'plane' | 'lid';
type Pal = Record<keyof typeof PAL, string>;

export const PAL = {
  ink: '#46291a',
  paper: '#fffaf0',
  hi: '#ffffff',
  dough: '#fdebc6',
  doughShade: '#ecc48a',
  pleat: '#b98d5a',
  trail: '#8fc2f2',
  flame: '#ff8a1c',
  flameHot: '#e2432a',
  flameCore: '#ffd23a',
  num10: '#f08a1c',
  num20: '#ea5a1c',
  num50: '#e2432a',
  plane: '#ffffff',
  planeFold: '#d6e0ec',
  paw: '#46291a',
  steel: '#c4d2dc',
  steelDark: '#7f93a3',
  knob: '#d99a55',
  wind: '#4f9ee8',
};

const hex = (c: string): [number, number, number] => {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (a: number[]): string => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number): string => {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => v + (B[i]! - v) * t));
};
const gray = (c: string, lift: number): string => {
  const [r, g, b] = hex(c);
  const y = 0.3 * r + 0.59 * g + 0.11 * b;
  return toHex([y, y, y].map((v) => v + (255 - v) * lift));
};
const mapPal = (fn: (v: string, k: string) => string): Pal => Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, fn(v, k)])) as Pal;

/** 体力不够：整体往暖灰压暗一点，线条不变 */
export const PAL_DIM = mapPal((v, k) => (k === 'ink' ? v : mix(v, '#8a7f72', 0.42)));
/** 用完了：去色、提亮，线条也变浅 */
export const PAL_GRAY = mapPal((v, k) => (k === 'ink' || k === 'paw' ? '#9a8e80' : gray(v, 0.35)));

const FONT = "system-ui,-apple-system,'PingFang SC','Noto Sans CJK SC',sans-serif";
const n = (v: number): string => (Math.round(v * 100) / 100).toString();
const num = (x: number, y: number, s: string, size: number, fill: string, p: Pal): string =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="900" text-anchor="middle" fill="${fill}" stroke="${p.paper}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke">${s}</text>`;

const BUN = 'M-10,4.5C-10.8,-2.5 -5.2,-8.6 0.2,-8.4C5.6,-8.2 10.6,-2.6 10,4.6Q0.4,8.8 -10,4.5Z';
/** 包子：直径约 20（s=1），(x,y) 是中心，r 旋转角 */
function bun(p: Pal, x: number, y: number, s = 1, r = 0): string {
  const w = (v: number): string => n(v / s);
  return (
    `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">` +
    `<path d="${BUN}" fill="${p.dough}"/>` +
    `<path d="M-9.9,3.1Q0,7.3 9.9,3.3L10,4.6Q0.4,8.8 -10,4.5Z" fill="${p.doughShade}"/>` +
    `<path d="M0,-7.4Q-3.2,-3.6 -6.6,-1.6M0,-7.4Q0.5,-3.2 -0.5,0.6M0,-7.4Q3.4,-3.4 6.8,-1.4" fill="none" stroke="${p.pleat}" stroke-width="${w(1.15)}" stroke-linecap="round"/>` +
    `<ellipse cx="-4.8" cy="-3.4" rx="2.3" ry="1.1" transform="rotate(-35 -4.8 -3.4)" fill="${p.hi}" opacity=".85"/>` +
    `<path d="${BUN}" fill="none" stroke="${p.ink}" stroke-width="${w(1.8)}" stroke-linejoin="round"/>` +
    `<ellipse cx="0" cy="-8.1" rx="2.2" ry="1.4" fill="${p.dough}" stroke="${p.ink}" stroke-width="${w(1.2)}"/></g>`
  );
}

/** 速度线：在 (x,y) 身后，deg 是飞行方向（SVG 角度，向右为 0、向上为负） */
function speed(p: Pal, x: number, y: number, deg: number, { back = 11, len = 6, offs = [-4, 0, 4] } = {}): string {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  let d = '';
  offs.forEach((o, i) => {
    const b = back + (i % 2) * 2;
    const l = len - (i % 2) * 1.5;
    const x0 = x - ux * b + px * o;
    const y0 = y - uy * b + py * o;
    d += `M${n(x0)},${n(y0)}L${n(x0 - ux * l)},${n(y0 - uy * l)}`;
  });
  return `<path d="${d}" stroke="${p.ink}" stroke-width="1.5" stroke-linecap="round"/>`;
}

const trail = (p: Pal, d: string, w = 5): string => `<path d="${d}" fill="none" stroke="${p.trail}" stroke-width="${w}" stroke-linecap="round" opacity=".95"/>`;

/** 火焰：根在 (x,y)，往 deg 方向拖出去 */
function flame(p: Pal, x: string, y: string, deg: number, len: number, w: number, fill: string): string {
  const f = `M2,${-w}Q${n(-len * 0.45)},${n(-w * 1.2)} ${-len},0Q${n(-len * 0.45)},${n(w * 1.2)} 2,${w}Q${n(w * 0.9)},0 2,${-w}Z`;
  const c = `M1.5,${n(-w * 0.5)}Q${n(-len * 0.3)},${n(-w * 0.55)} ${n(-len * 0.55)},0Q${n(-len * 0.3)},${n(w * 0.55)} 1.5,${n(w * 0.5)}Z`;
  return `<g transform="translate(${x} ${y}) rotate(${deg})"><path d="${f}" fill="${fill}" stroke="${p.ink}" stroke-width="1.4" stroke-linejoin="round"/><path d="${c}" fill="${p.flameCore}"/></g>`;
}

/** 包子都往右上飞 */
const DIR = -35;

/** 加力：包子放右上，火焰从包子屁股往左下拖出去：1 级一团、2 级两团、3 级三团且最长、还带冲击线 */
function power(p: Pal, level: 1 | 2 | 3): string {
  const cx = 23;
  const cy = 26;
  const a = (DIR * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  const root = (o: number, back: number): [string, string] => [n(cx - ux * back + px * o), n(cy - uy * back + py * o)];
  const F: [number, number, number, number, string][] = {
    1: [[0, 6, 17, 5.6, p.flame]] as [number, number, number, number, string][],
    2: [
      [-4.6, 6, 18, 5, p.flame],
      [4.6, 6, 18, 5, p.flame],
    ] as [number, number, number, number, string][],
    3: [
      [-6.2, 5, 17, 4.8, p.flame],
      [6.2, 5, 17, 4.8, p.flame],
      [0, 6, 25, 6.2, p.flameHot],
    ] as [number, number, number, number, string][],
  }[level];
  let s = '';
  for (const [o, back, len, w, c] of F) {
    const [x, y] = root(o, back);
    s += flame(p, x, y, DIR, len, w, c);
  }
  s += bun(p, cx, cy, 0.9, -20);
  if (level >= 2) {
    const fx = cx + ux * 11.5;
    const fy = cy + uy * 11.5;
    const rays = level === 3 ? [-95, 40, 70] : [45, 72];
    const L2 = level === 3 ? 6 : 4.6;
    const d = rays
      .map((dd) => {
        const r = ((DIR + dd) * Math.PI) / 180;
        return `M${n(fx + Math.cos(r) * 1.5)},${n(fy + Math.sin(r) * 1.5)}L${n(fx + Math.cos(r) * (1.5 + L2))},${n(fy + Math.sin(r) * (1.5 + L2))}`;
      })
      .join('');
    s += `<path d="${d}" stroke="${p.ink}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  const t = ({ 1: ['10', 12, p.num10], 2: ['20', 13, p.num20], 3: ['50', 14.5, p.num50] } as const)[level];
  s += num(35, 13, `${t[0]}<tspan font-size="7.5">%</tspan>`, t[1], t[2], p);
  return s;
}

/** 爪印（体力的记号） */
export const pawSvg = (p: Pal, x: number, y: number, s: number, fill: string): string =>
  `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="2" rx="4.4" ry="3.6" fill="${fill}"/><circle cx="-4.2" cy="-3" r="1.7" fill="${fill}"/><circle cx="0" cy="-4.6" r="1.7" fill="${fill}"/><circle cx="4.2" cy="-3" r="1.7" fill="${fill}"/></g>`;

const ART: Record<IconId, (p: Pal) => string> = {
  burst1: (p) =>
    trail(p, 'M4,43Q11,36 17,30') +
    speed(p, 17, 29, DIR, { back: 10, len: 5, offs: [-4.5, 4.5] }) +
    bun(p, 17, 29, 0.82, -15) +
    speed(p, 31, 17, DIR) +
    bun(p, 31, 17, 0.95, -15) +
    num(9.5, 12, '+1', 10, p.ink, p),
  burst2: (p) =>
    trail(p, 'M3,46Q7,42 11,37', 4.4) +
    bun(p, 12, 36, 0.7, -15) +
    speed(p, 23, 26, DIR, { back: 9, len: 4.5, offs: [-4, 4] }) +
    bun(p, 23, 26, 0.78, -15) +
    speed(p, 34, 15, DIR, { back: 10, len: 5, offs: [-4.5, 0, 4.5] }) +
    bun(p, 34, 15, 0.88, -15) +
    num(9.5, 12, '+2', 10, p.ink, p),
  fork: (p) => {
    const o = [9, 39] as const;
    const to = [
      [37, 31, 0],
      [32, 15, -28],
      [17, 9, -55],
    ] as const;
    let s = trail(p, 'M3,46Q6,43 9,39', 4.4);
    s += `<path d="${to.map(([x, y]) => `M${o[0] + (x - o[0]) * 0.18},${o[1] + (y - o[1]) * 0.18}L${n(o[0] + (x - o[0]) * 0.62)},${n(o[1] + (y - o[1]) * 0.62)}`).join('')}" stroke="${p.ink}" stroke-width="1.4" stroke-dasharray="2.4 2.2" stroke-linecap="round"/>`;
    s += `<circle cx="9" cy="39" r="3.6" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.4"/><circle cx="12.5" cy="37" r="2.6" fill="${p.paper}" stroke="${p.ink}" stroke-width="1.2"/>`;
    for (const [x, y, r] of to) s += bun(p, x, y, 0.7, r);
    return s;
  },
  power10: (p) => power(p, 1),
  power20: (p) => power(p, 2),
  power50: (p) => power(p, 3),
  plane: (p) => {
    let s = `<path d="M3,42Q5,33 12,29" fill="none" stroke="${p.ink}" stroke-width="1.5" stroke-dasharray="2.6 2.4" stroke-linecap="round"/>`;
    s += `<path d="M43,8L24,37L19.5,26.5Z" fill="${p.planeFold}" stroke="${p.ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
    s += `<path d="M43,8L5.5,21.5L19.5,26.5Z" fill="${p.plane}" stroke="${p.ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
    s += `<path d="M43,8L19.5,26.5L18.6,33.6L23.2,29.4" fill="none" stroke="${p.ink}" stroke-width="1.4" stroke-linejoin="round"/>`;
    s += pawSvg(p, 21, 20.5, 0.62, p.paw);
    s += `<path d="M38,30l3,-1M37,35l4,1" stroke="${p.ink}" stroke-width="1.4" stroke-linecap="round"/>`;
    return s;
  },
  lid: (p) => {
    let s = `<path d="M2,14h10q4,0 4,-3M1,24h12M2,34h10q4,0 4,3" fill="none" stroke="${p.wind}" stroke-width="2.2" stroke-linecap="round"/>`;
    s += bun(p, 38, 26, 0.72, 0);
    s += `<path d="M27,6C16,9 12,17 12,24C12,31 16,39 27,42C29.5,33 29.5,15 27,6Z" fill="${p.steel}" stroke="${p.ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
    s += `<path d="M27,6C29.5,15 29.5,33 27,42" fill="none" stroke="${p.steelDark}" stroke-width="2.6"/><path d="M27,6C29.5,15 29.5,33 27,42" fill="none" stroke="${p.ink}" stroke-width="1.2"/>`;
    s += `<path d="M18.5,13.5Q15.2,19 15.6,26" fill="none" stroke="${p.hi}" stroke-width="2" stroke-linecap="round" opacity=".9"/>`;
    s += `<rect x="6.4" y="20.6" width="6.4" height="6.8" rx="2.2" fill="${p.knob}" stroke="${p.ink}" stroke-width="1.4"/>`;
    s += `<path d="M14,9.5q-2.5,-2.4 -5.5,-1.6M14,38.5q-2.5,2.4 -5.5,1.6" fill="none" stroke="${p.wind}" stroke-width="1.6" stroke-linecap="round"/>`;
    return s;
  },
};

/** 完整的图标 <svg>（viewBox 0 0 48 48，不画边框）；pal 按按钮状态换（够、选中用 PAL，不够用 PAL_DIM，用完用 PAL_GRAY） */
export function itemIconSvg(id: IconId, pal: Pal = PAL): string {
  return `<svg class="dl-item-ic" viewBox="0 0 48 48" aria-hidden="true">${ART[id](pal)}</svg>`;
}
