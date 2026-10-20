/**
 * 地形网格（DESIGN.md 2.3）：每格 4×4 世界单位，一格一个字节：低 7 位是材质（0 = 没地），最高位是"被炸焦"的标记（画坑边用）。
 * 悬空的地形断开以后原地不动（不做塌落）；只有挖空的地方会掉人。
 * 光栅化用多边形的扫描线（偶奇规则），只用加减乘除，同样的输入在哪儿算都一样。
 */
import { clamp } from './fixed.ts';

export const CELL = 4;
export const SCORCH = 0x80;
export const MAT_MASK = 0x7f;

/** 材质编号（画坑边颜色和碎屑用；规则上都一样能炸穿） */
export const MAT = { empty: 0, dough: 1 } as const;

export interface Terrain {
  /** 宽、高，单位是格 */
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;
}

/** 世界坐标的整数点 */
export type Pt = readonly [number, number];

export function emptyTerrain(width: number, height: number): Terrain {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

export function cloneTerrain(t: Terrain): Terrain {
  return { cols: t.cols, rows: t.rows, cells: t.cells.slice() };
}

/** 世界坐标 (x, y) 上有没有地；网格外一律没有（上边不封顶，左、右、下是画本外） */
export function solidAt(t: Terrain, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false;
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (c >= t.cols || r >= t.rows) return false;
  return (t.cells[r * t.cols + c]! & MAT_MASK) !== 0;
}

export function cellAt(t: Terrain, c: number, r: number): number {
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return 0;
  return t.cells[r * t.cols + c]!;
}

/** 把一个多边形（世界坐标的点，首尾自动相连）按偶奇规则填进网格：格子中心落在里面就算 */
export function fillPolygon(t: Terrain, poly: readonly Pt[], mat: number): void {
  const n = poly.length;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const r0 = clamp(Math.floor(y0 / CELL), 0, t.rows - 1);
  const r1 = clamp(Math.ceil(y1 / CELL), 0, t.rows - 1);
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const cy = r * CELL + CELL / 2;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      // 半开区间：顶点正好在扫描线上时只算一次
      if (a[1] <= cy !== b[1] <= cy) xs.push(a[0] + ((cy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // 中心 c*CELL+2 在 [xa, xb) 里的格子
      const c0 = Math.max(0, Math.ceil((xs[k]! - CELL / 2) / CELL));
      const c1 = Math.min(t.cols - 1, Math.ceil((xs[k + 1]! - CELL / 2) / CELL) - 1);
      for (let c = c0; c <= c1; c++) t.cells[r * t.cols + c] = mat;
    }
  }
}

/** 格子范围（含两端），画面层按它只重画相交的地形块 */
export interface CellBox {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

/**
 * 挖一个圆（DESIGN.md 2.3 爆炸挖坑）：格子中心离圆心不到 r 的挖掉；再往外 SCORCH_RING 个单位还剩下的地标成"焦"。
 * 直接改 t（调用方先复制）；回被改过的格子范围。整数运算。
 */
export const SCORCH_RING = 6;

export function carve(t: Terrain, cx: number, cy: number, r: number): CellBox {
  const outer = r + SCORCH_RING;
  const c0 = clamp(Math.floor((cx - outer) / CELL), 0, t.cols - 1);
  const c1 = clamp(Math.floor((cx + outer) / CELL), 0, t.cols - 1);
  const r0 = clamp(Math.floor((cy - outer) / CELL), 0, t.rows - 1);
  const r1 = clamp(Math.floor((cy + outer) / CELL), 0, t.rows - 1);
  const rr = r * r;
  const oo = outer * outer;
  for (let row = r0; row <= r1; row++) {
    const dy = row * CELL + CELL / 2 - cy;
    for (let c = c0; c <= c1; c++) {
      const dx = c * CELL + CELL / 2 - cx;
      const d2 = dx * dx + dy * dy;
      const i = row * t.cols + c;
      if (d2 < rr) t.cells[i] = 0;
      else if (d2 < oo && t.cells[i]! & MAT_MASK) t.cells[i] = t.cells[i]! | SCORCH;
    }
  }
  return { c0, r0, c1, r1 };
}

/** 一列里从 y 往下找第一块地的顶（世界坐标）；找到 yMax 还没有就回 null */
export function groundBelow(t: Terrain, x: number, y: number, yMax: number): number | null {
  for (let yy = Math.max(0, y); yy <= yMax; yy++) if (solidAt(t, x, yy)) return yy;
  return null;
}
