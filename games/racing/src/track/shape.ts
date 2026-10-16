/**
 * 赛道的画法（DESIGN.md 3.1）：只给画面层和 scripts/track.ts 用，规则核心不 import（test/arch.test.ts 检查）。
 * 一条赛道是一圈控制点，按向心 Catmull-Rom 样条连成平滑的闭合曲线，再按弧长把一圈均匀分成 spaces 格；
 * 每格两个车位：内线（0）在行进方向左边，外线（1）在右边。这里用浮点和三角函数没关系，不影响规则。
 */
import type { Track } from './types.ts';

export interface Pt {
  x: number;
  y: number;
}

export interface ShapeDef {
  /** 控制点（逆时针或顺时针都行），画布约 1000 × 620 */
  points: [number, number][];
  /** 路面宽 */
  width: number;
  /** 场景：湖、楼、海，画面层按它画背景 */
  scene: 'lake' | 'city' | 'harbor';
}

export const SHAPES: Record<string, ShapeDef> = {
  lakeside: {
    scene: 'lake',
    width: 46,
    points: [
      [430, 548],
      [690, 540],
      [850, 505],
      [905, 400],
      [880, 250],
      [800, 130],
      [650, 95],
      [540, 150],
      [470, 240],
      [380, 200],
      [300, 110],
      [170, 100],
      [95, 190],
      [85, 360],
      [100, 480],
      [170, 540],
    ],
  },
  hillcity: {
    scene: 'city',
    width: 42,
    points: [
      [420, 565],
      [640, 555],
      [760, 500],
      [740, 400],
      [600, 370],
      [560, 290],
      [650, 220],
      [820, 230],
      [910, 160],
      [860, 70],
      [650, 55],
      [430, 70],
      [330, 150],
      [380, 260],
      [330, 340],
      [180, 330],
      [95, 400],
      [100, 500],
      [180, 560],
    ],
  },
  harbor: {
    scene: 'harbor',
    width: 48,
    points: [
      [420, 562],
      [700, 560],
      [880, 545],
      [935, 470],
      [880, 400],
      [700, 380],
      [560, 330],
      [560, 250],
      [700, 200],
      [870, 170],
      [900, 90],
      [780, 50],
      [500, 52],
      [250, 60],
      [110, 110],
      [70, 300],
      [80, 480],
      [150, 560],
    ],
  },
};

export interface Geometry {
  /** 赛道中心线的 SVG path */
  path: string;
  /** 一圈的长度 */
  length: number;
  width: number;
  scene: ShapeDef['scene'];
  /** 第 i 格（0 到 spaces-1）中点：位置、行进方向（弧度）、两个车位 */
  cells: { c: Pt; angle: number; spots: [Pt, Pt] }[];
  /** 第 i 格的起点（格线）：位置、方向 */
  edges: { c: Pt; angle: number }[];
  /** 每格的弯曲程度（这一格里方向转了多少弧度，带正负） */
  turn: number[];
  /** 弧长 s 处的点和行进方向（s 可以是任意实数，按一圈取模） */
  at(s: number): { c: Pt; angle: number };
  /**
   * 沿赛道从第 from 格到第 to 格（可以跨过 0 号格，to < from 时按下一圈算），往左偏 offset（负数往右）的一条折线，每 step 取一个点。
   * 画路肩、砂石区、轮胎墙、看台用
   */
  strip(from: number, to: number, offset: number, step?: number): Pt[];
}

/** 向心 Catmull-Rom：p1 到 p2 之间的一段，t 从 0 到 1 */
function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const d = (a: Pt, b: Pt): number => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => ({
    x: ((tb - u) / (tb - ta)) * a.x + ((u - ta) / (tb - ta)) * b.x,
    y: ((tb - u) / (tb - ta)) * a.y + ((u - ta) / (tb - ta)) * b.y,
  });
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** 闭合曲线密密地采样 */
function sample(def: ShapeDef, per = 80): Pt[] {
  const P = def.points.map(([x, y]) => ({ x, y }));
  const n = P.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n]!;
    const p1 = P[i]!;
    const p2 = P[(i + 1) % n]!;
    const p3 = P[(i + 2) % n]!;
    for (let k = 0; k < per; k++) out.push(catmull(p0, p1, p2, p3, k / per));
  }
  return out;
}

const cache = new Map<string, Geometry>();

export function geometry(track: Track): Geometry {
  const hit = cache.get(track.id);
  if (hit) return hit;
  const def = SHAPES[track.id];
  if (!def) throw new Error(`no shape for ${track.id}`);
  const pts = sample(def);
  const m = pts.length;
  const acc: number[] = [0];
  for (let i = 1; i <= m; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i % m]!.x - pts[i - 1]!.x, pts[i % m]!.y - pts[i - 1]!.y));
  const length = acc[m]!;
  /** 弧长 s 处的点和方向 */
  const at = (s: number): { c: Pt; angle: number } => {
    const L = ((s % length) + length) % length;
    let lo = 0;
    let hi = m;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (acc[mid]! <= L) lo = mid;
      else hi = mid;
    }
    const a = pts[lo]!;
    const b = pts[(lo + 1) % m]!;
    const f = (L - acc[lo]!) / Math.max(1e-9, acc[lo + 1]! - acc[lo]!);
    return { c: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const N = track.spaces;
  const step = length / N;
  const off = def.width / 4;
  const cells = Array.from({ length: N }, (_, i) => {
    const { c, angle } = at((i + 0.5) * step);
    // 行进方向的左边：(sin, -cos)
    const nx = Math.sin(angle);
    const ny = -Math.cos(angle);
    const spots: [Pt, Pt] = [
      { x: c.x + nx * off, y: c.y + ny * off },
      { x: c.x - nx * off, y: c.y - ny * off },
    ];
    return { c, angle, spots };
  });
  const edges = Array.from({ length: N }, (_, i) => at(i * step));
  const turn = Array.from({ length: N }, (_, i) => {
    let d = at((i + 1) * step).angle - at(i * step).angle;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  });
  const path = `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}Z`;
  const strip = (from: number, to: number, offset: number, stepPx = 4): Pt[] => {
    const a = from * step;
    let b = to * step;
    if (b <= a) b += length;
    const out: Pt[] = [];
    for (let s = a; s <= b + 1e-6; s += stepPx) {
      const p = at(s);
      out.push({ x: p.c.x + Math.sin(p.angle) * offset, y: p.c.y - Math.cos(p.angle) * offset });
    }
    return out;
  };
  const g: Geometry = { path, length, width: def.width, scene: def.scene, cells, edges, turn, at, strip };
  cache.set(track.id, g);
  return g;
}

/** 绝对格数 → 这一圈里的第几格 */
export function cellOf(track: Track, pos: number): number {
  return ((pos % track.spaces) + track.spaces) % track.spaces;
}
