/**
 * 美术公共工具：字体栈、调色板、花色路径、确定性伪随机、SVG 外壳。
 * 本目录全部是纯字符串函数，不依赖 DOM / Phaser，可在 Node 与浏览器里同样运行。
 */

/** 标题 / 书法感中文字体栈 */
/** "GD Serif" 是游戏内嵌的宋体子集（见 view/fonts.ts，只在浏览器里烘焙纹理时注入）；工具里渲染时按系统字体回退。 */
export const SERIF = `"GD Serif","Noto Serif SC","Songti SC","STSong","SimSun",serif`;
/** 牌面数字字体栈（配合 font-weight 900） */
export const SANS = `"Arial Black","Helvetica Neue",Arial,"DejaVu Sans",sans-serif`;

/** 全局调色板 */
export const C = {
  ink: '#1d1612', // 描边墨色（偏暖的深褐黑）
  red: '#b3202a', // 中国红
  redDeep: '#7d1218',
  redLight: '#d8434a',
  gold: '#d4a64a', // 暗金
  goldLight: '#f3d98b',
  goldDeep: '#9a6f22',
  ivory: '#fbf6e9',
  ivoryDeep: '#efe5cc',
  felt: '#1f5a3e',
  feltDeep: '#0e3324',
  wood: '#6b3a1e',
  woodDeep: '#3b1d0c',
  blackSuit: '#1c1a24', // 黑桃 / 梅花的墨色
  redSuit: '#c21f2c', // 红桃 / 方块的红
} as const;

/** 牌面 / 叠层统一尺寸 */
export const CARD_W = 200;
export const CARD_H = 280;
export const CARD_R = 14;

/** SVG 外壳：带 width/height 与 viewBox */
export function svg(w: number, h: number, body: string, vb?: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb ?? `0 0 ${w} ${h}`}">${body}</svg>`;
}

/** 数字保留两位小数，缩短输出 */
export function f(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 文本转义 */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 确定性伪随机（mulberry32），只用于美术装饰的散点，结果对同一种子稳定 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串哈希，给 prng 当种子 */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 0xRRGGBB → #rrggbb */
export function hex(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

/** 颜色按比例变亮(t>0)/变暗(t<0)，t∈[-1,1] */
export function shade(color: string, t: number): string {
  const n = parseInt(color.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const r = t >= 0 ? v + (255 - v) * t : v * (1 + t);
    return Math.max(0, Math.min(255, Math.round(r)));
  });
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- 花色
/** 四种花色在 100×100 框内的路径（中心约 50,50） */
const SUIT_PATHS: readonly string[] = [
  // 0 黑桃
  'M50 3C58 20 96 38 96 63C96 77 86 86 74 86C65 86 58 81 54 74C55 84 59 91 68 97L32 97C41 91 45 84 46 74C42 81 35 86 26 86C14 86 4 77 4 63C4 38 42 20 50 3Z',
  // 1 红桃
  'M50 92C20 70 3 52 3 31C3 15 15 5 29 5C39 5 46 11 50 19C54 11 61 5 71 5C85 5 97 15 97 31C97 52 80 70 50 92Z',
  // 2 梅花（由圆组成，见 suitShape）
  '',
  // 3 方块
  'M50 2C61 21 75 37 92 50C75 63 61 79 50 98C39 79 25 63 8 50C25 37 39 21 50 2Z',
];

/** 花色图形：中心 (cx,cy)，边长 size，flip 为倒置 */
export function suitShape(suit: number, cx: number, cy: number, size: number, fill: string, flip = false, extra = ''): string {
  const s = size / 100;
  const rot = flip ? ` rotate(180 50 50)` : '';
  const tr = `translate(${f(cx - size / 2)} ${f(cy - size / 2)}) scale(${f(s)})${rot}`;
  if (suit === 2) {
    return `<g transform="${tr}" fill="${fill}" ${extra}><circle cx="50" cy="27" r="22"/><circle cx="25" cy="59" r="22"/><circle cx="75" cy="59" r="22"/><circle cx="50" cy="52" r="14"/><path d="M50 50C51 74 56 88 68 97L32 97C44 88 49 74 50 50Z"/></g>`;
  }
  return `<path transform="${tr}" fill="${fill}" ${extra} d="${SUIT_PATHS[suit] ?? ''}"/>`;
}

/** 花色颜色 */
export function suitColor(suit: number): string {
  return suit === 1 || suit === 3 ? C.redSuit : C.blackSuit;
}

/** 回纹（方折连续纹）一段的路径：在 (x,y) 起、单元边长 u，横向重复 n 次 */
export function huiwenRow(x: number, y: number, u: number, n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const x0 = x + i * u;
    const q = u / 4;
    // 一个回字单元：⌐ 形向内卷
    d += `M${f(x0)} ${f(y + u)}V${f(y)}H${f(x0 + 3 * q)}V${f(y + 3 * q)}H${f(x0 + q)}V${f(y + q)}H${f(x0 + 2 * q)}V${f(y + 2 * q)}`;
    d += `M${f(x0 + 3 * q)} ${f(y + u)}H${f(x0 + u)}`;
  }
  return d;
}

/** 祥云（一朵卷云）路径：中心 (cx,cy)，宽约 w */
export function cloudPath(cx: number, cy: number, w: number): string {
  const s = w / 100;
  const p = (x: number, y: number) => `${f(cx + (x - 50) * s)} ${f(cy + (y - 30) * s)}`;
  return `M${p(8, 44)}C${p(0, 44)} ${p(0, 30)} ${p(10, 28)}C${p(10, 14)} ${p(28, 10)} ${p(36, 20)}C${p(42, 6)} ${p(64, 6)} ${p(68, 20)}C${p(78, 12)} ${p(96, 18)} ${p(90, 32)}C${p(100, 36)} ${p(98, 46)} ${p(88, 46)}Z` +
    `M${p(36, 30)}C${p(36, 24)} ${p(46, 24)} ${p(46, 30)}C${p(46, 36)} ${p(38, 36)} ${p(40, 32)}` +
    `M${p(60, 32)}C${p(60, 24)} ${p(72, 24)} ${p(72, 32)}C${p(72, 38)} ${p(64, 38)} ${p(65, 34)}`;
}
