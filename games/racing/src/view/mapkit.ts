/**
 * 桌游地图板的画法工具（DESIGN.md 第 8 节）：色板、线宽、SVG 字符串小工具，和摆场景用的"离赛道多远"距离场。
 * 地图板是印刷品的样子：墨线勾边、平涂、少量网点和排线，只有棋子和卡牌这些"实物"带投影。
 * 摆放用写死种子的随机数，同一条赛道每次画出来一样。
 */
import type { Geometry, Pt } from '../track/shape.ts';

/** 色板：明暗从深到浅，赛道最深，地面、水是中间调，沙滩、缓冲区、纸最亮 */
export const C = {
  ink: '#2b2622',
  track: '#454950',
  trackLine: '#5d6169',
  forest: '#5f8a52',
  forestDark: '#46703f',
  forestLight: '#7fa86a',
  autumn: '#d99a52',
  autumnDark: '#b8743a',
  grass: '#cdd7a3',
  water: '#9fcbd6',
  waterShallow: '#bfdfe5',
  waterLine: '#5f9aae',
  sand: '#efe2bd',
  runoff: '#e6dcc2',
  paper: '#f7f0dc',
  red: '#c63f2e',
  gold: '#e2a92b',
};

/** 线宽三档：主体、次要、装饰 */
export const LW = { major: 2.4, minor: 1.4, decor: 0.8 };

export const FONT = "-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

export const f1 = (n: number): string => n.toFixed(1);

/** 折线 */
export const poly = (pts: readonly Pt[]): string => `M${pts.map((p) => `${f1(p.x)},${f1(p.y)}`).join('L')}`;

/** 过各点中点的平滑曲线（二次贝塞尔）；closed 时首尾相接 */
export function smooth(pts: readonly Pt[], closed = true): string {
  const n = pts.length;
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (!closed) {
    let d = `M${f1(pts[0]!.x)},${f1(pts[0]!.y)}`;
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i]!, pts[i + 1]!);
      d += `Q${f1(pts[i]!.x)},${f1(pts[i]!.y)} ${f1(m.x)},${f1(m.y)}`;
    }
    return `${d}L${f1(pts[n - 1]!.x)},${f1(pts[n - 1]!.y)}`;
  }
  const m0 = mid(pts[n - 1]!, pts[0]!);
  let d = `M${f1(m0.x)},${f1(m0.y)}`;
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i]!, pts[(i + 1) % n]!);
    d += `Q${f1(pts[i]!.x)},${f1(pts[i]!.y)} ${f1(m.x)},${f1(m.y)}`;
  }
  return `${d}Z`;
}

/** 写死种子的 0–1 随机数（只给摆放用） */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 距离场：地图上每 6 个单位一格，记着离赛道边多远（near）和"离赛道边多远、维修区那一段再多让 70"（clear）。
 * 场景摆放要成千上万次地问"这里离赛道多远"，一次次去比赛道上的几百个点太慢（手机上要好几秒），先算好查表
 */
export interface Field {
  near(x: number, y: number): number;
  clear(x: number, y: number): number;
}

const STEP = 6;

export function distanceField(geo: Geometry, cells: number, area: Rect, pit: ReadonlySet<number>): Field {
  const per = geo.length / cells;
  const pts = geo.strip(0, cells, 0, 8);
  const cols = Math.ceil(area.w / STEP) + 1;
  const rows = Math.ceil(area.h / STEP) + 1;
  const near = new Float32Array(cols * rows).fill(Infinity);
  const clear = new Float32Array(cols * rows).fill(Infinity);
  const half = geo.width / 2;
  // 先比平方（省掉开方），最后再开
  const extra = pts.map((_, i) => (pit.has(Math.floor((i * 8) / per) % cells) ? 70 : 0));
  for (let r = 0; r < rows; r++) {
    const y = area.y + r * STEP;
    for (let c = 0; c < cols; c++) {
      const x = area.x + c * STEP;
      let n2 = Infinity;
      let cl = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dx = x - pts[i]!.x;
        const dy = y - pts[i]!.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < n2) n2 = d2;
        if (extra[i]) {
          const d = Math.sqrt(d2) - extra[i]!;
          if (d < cl) cl = d;
        }
      }
      const k = r * cols + c;
      near[k] = Math.sqrt(n2) - half;
      clear[k] = Math.min(near[k]!, cl - half);
    }
  }
  const at = (f: Float32Array, x: number, y: number): number => {
    const c = Math.round((x - area.x) / STEP);
    const r = Math.round((y - area.y) / STEP);
    // 地图外面按离边多远往外推算：只会被问到"够不够远"，偏大没关系
    if (c < 0 || r < 0 || c >= cols || r >= rows) return 400;
    return f[r * cols + c]!;
  };
  return { near: (x, y) => at(near, x, y), clear: (x, y) => at(clear, x, y) };
}

/** 一块自然边界的区域（湖、山）：外缘点、缩放后的外缘、判断点在不在里面 */
export interface Blob {
  c: Pt;
  pts(k: number, dr?: number): Pt[];
  d: string;
  inside(x: number, y: number, m?: number): boolean;
  size: number;
}

const RAYS = 96;

/**
 * 从 c 往四周按起伏的椭圆伸，碰到 stop 就收住，再抹平：岸线跟着赛道弯，但不发抖、不出缺口。
 * ph 是起伏的相位（同一张图上几块不一样）
 */
export function blob(c: Pt, rx: number, ry: number, ph: number, stop: (x: number, y: number) => boolean): Blob {
  const rClear: number[] = [];
  const r0: number[] = [];
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    const base = (rx * ry) / Math.sqrt((ry * Math.cos(a)) ** 2 + (rx * Math.sin(a)) ** 2);
    r0.push(base * (1 + 0.14 * Math.sin(2 * a + ph) + 0.1 * Math.sin(3 * a + 1.1 + ph) + 0.06 * Math.sin(5 * a + 2.3) + 0.03 * Math.sin(8 * a + 0.4 + ph)));
    let r = 6;
    while (r < 800 && !stop(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r)) r += 2;
    rClear.push(r);
  }
  let rad = r0.map((r, i) => Math.min(r, rClear[i]!));
  for (let it = 0; it < 6; it++) {
    const sm = rad.map((_, i) => {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += rad[(i + k + RAYS) % RAYS]!;
      return s / 9;
    });
    rad = sm.map((r, i) => Math.min(r, rClear[i]!, r0[i]!));
  }
  const pts = (k: number, dr = 0): Pt[] =>
    rad.map((r, i) => {
      const a = (i / RAYS) * Math.PI * 2;
      const rr = Math.max(3, r * k + dr);
      return { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr };
    });
  const inside = (x: number, y: number, m = 0): boolean => {
    const a = Math.atan2(y - c.y, x - c.x);
    const i = Math.round((((a / (Math.PI * 2)) * RAYS) % RAYS + RAYS) % RAYS) % RAYS;
    return Math.hypot(x - c.x, y - c.y) < rad[i]! + m;
  };
  return { c, pts, d: smooth(pts(1)), inside, size: Math.min(...rad) };
}

/** 俯视的攒尖顶：n 角，边往里凹、角往外翘，屋脊汇到宝顶（亭子、塔） */
export function pavilion(x: number, y: number, R: number, n: number, color: string): string {
  const corner = (i: number): Pt => {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    return { x: x + Math.cos(a) * R * 1.12, y: y + Math.sin(a) * R * 1.12 };
  };
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = corner(i);
    const q = corner(i + 1);
    const m = { x: x + ((p.x + q.x) / 2 - x) * 0.8, y: y + ((p.y + q.y) / 2 - y) * 0.8 };
    d += `${i ? 'L' : 'M'}${f1(p.x)} ${f1(p.y)}Q${f1(m.x)} ${f1(m.y)} ${f1(q.x)} ${f1(q.y)}`;
  }
  let s = `<path d="${d}Z" fill="${color}" stroke="${C.ink}" stroke-width="${LW.minor}" stroke-linejoin="round"/>`;
  for (let i = 0; i < n; i++) {
    const p = corner(i);
    s += `<path d="M${f1(x)} ${f1(y)}L${f1(p.x)} ${f1(p.y)}" stroke="${C.ink}" stroke-width="${LW.decor * 1.3}"/>`;
    // 朝光的一半亮一点
    if (i < n / 2) s += `<path d="M${f1(x)} ${f1(y)}L${f1(p.x)} ${f1(p.y)}L${f1(corner(i + 1).x)} ${f1(corner(i + 1).y)}Z" fill="#fff" opacity=".12"/>`;
  }
  return `${s}<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(Math.max(2.4, R * 0.18))}" fill="${C.gold}" stroke="${C.ink}" stroke-width="${LW.decor}"/>`;
}

export function boat(x: number, y: number, a: number): string {
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${a})"><path d="M-11 0Q-9 -5 -2 -5H6Q11 -3 13 0Q11 3 6 5H-2Q-9 5 -11 0Z" fill="${C.paper}" stroke="${C.ink}" stroke-width="${LW.minor}"/><path d="M-3 -2.5V2.5M3 -2.5V2.5" stroke="${C.ink}" stroke-width="${LW.decor}"/><path d="M-20 0H-14M-19 -3H-15M-19 3H-15" stroke="${C.waterLine}" stroke-width="${LW.decor * 1.4}"/></g>`;
}
