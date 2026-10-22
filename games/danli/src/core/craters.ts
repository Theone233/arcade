/**
 * 坑形（DESIGN.md 2.3.1，0.3.0；美术代理 2026-10-22 交付的坑形函数，照原样改写进模块）：每把武器挖出来的坑形状不一样，
 * 是规则的一部分（浏览器和房间要挖出一模一样的格子），所以按格子判断"在不在坑里"，只用整数。
 *
 * 约定：
 * - dx 向右为正，dy 向下为正（和世界坐标一样）；r 是挖坑半径（整数，已按颗数缩小过）。伤害照旧按圆形的伤害半径算，不跟坑形走。
 * - 坑形相对水平固定，不随炮弹飞行方向转，也不随左右镜像（拖鞋不翻，策划定）。
 * - 只用整数加减乘、比较、移位、取绝对值和取大取小；没有除法、开方、三角函数、浮点。
 *   内部把长度放大 64 倍（X = dx << 6，形状参数写成 r × k，k 以 1/64 r 为单位），所以参数不会被取整吃掉。
 *   最大的中间值约 3e13（r ≤ 64 时），在 JS 的安全整数（2^53）以内。
 * - 包围盒：|dx|、|dy| 都不超过 craterReach(r) = (83 r) >> 6（≈ 1.297 r）；函数开头就按它挡掉，挖坑（terrain.ts 的 dig）只扫这个方框。
 * - 包子蒸笼的坑和 0.2.0 的圆一模一样（dx² + dy² < r²）。
 * - 小半径时有"最小宽度"（世界单位），保证缩小后也没有 1 格宽的细缝；见各形状的注释。
 */
import type { WeaponId } from './weapons.ts';

/** 坑形就按武器分：每把武器一种 */
export type CraterKind = WeaponId;

/** 包围盒的半边长（world 单位）：|dx| 或 |dy| 超过它的格子一定不在坑里 */
export function craterReach(r: number): number {
  return (83 * r) >> 6;
}

/** 点 (X, Y) 在不在圆 (cx, cy, rad) 里（都是 64 倍长度） */
function inCircle(X: number, Y: number, cx: number, cy: number, rad: number): boolean {
  const a = X - cx;
  const b = Y - cy;
  return a * a + b * b < rad * rad;
}

/**
 * 烟花的六角星（碎口）：顶点表，单位 1/64 r，y 向下。尖、凹点交替，长短略有参差，像炸开的碎口而不是规整的五角星。
 * 尖的那一项多带一个垂直方向（×64），芒尖切成平头：平头半宽 max(0.08 r, 4) 单位，芒尖至少 2 格宽。
 * 角度只在出表时用过（离线算好写死），运行时只有整数乘加。
 */
const STAR: readonly (readonly [number, number] | readonly [number, number, number, number])[] = [
  [0, -80, 64, 0], [24, -41], [64, -37, 32, 55], [50, 0], [71, 41, -32, 55], [25, 42],
  [0, 83, -64, 0], [-24, 42], [-68, 39, -32, -55], [-50, 0], [-62, -36, 32, -55], [-23, -40],
];

/** 整数多边形（偶奇规则）：xs、ys 是 64 倍长度的顶点 */
function inPoly(X: number, Y: number, xs: readonly number[], ys: readonly number[]): boolean {
  let inside = false;
  const n = xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xs[i]!, yi = ys[i]!, xj = xs[j]!, yj = ys[j]!;
    if (yi > Y !== yj > Y) {
      // 交点横坐标 xi + (Y - yi)(xj - xi)/(yj - yi)，两边乘 (yj - yi) 比较
      const lhs = (X - xi) * (yj - yi);
      const rhs = (Y - yi) * (xj - xi);
      if (yj > yi ? lhs < rhs : lhs > rhs) inside = !inside;
    }
  }
  return inside;
}

/** 格子中心相对爆心 (dx, dy)、挖坑半径 r 时，这一格挖不挖 */
export function inCrater(kind: CraterKind, dx: number, dy: number, r: number): boolean {
  const reach = craterReach(r);
  if (dx > reach || dx < -reach || dy > reach || dy < -reach) return false;
  const X = dx << 6;
  const Y = dy << 6;
  const ax = X < 0 ? -X : X;
  switch (kind) {
    case 'steamer':
      // 包子：圆（和 0.2.0 一样）
      return X * X + Y * Y < (r << 6) * (r << 6);

    case 'melon': {
      // 西瓜：又宽又平的大椭圆，半宽 1.297 r、半高 0.75 r（宽高比 1.73）
      const A = r * 83;
      const B = r * 48;
      const a = X * B;
      const b = Y * A;
      const ab = A * B;
      return a * a + b * b < ab * ab;
    }

    case 'frisbee': {
      // 飞盘：扁长的浅槽，横着的胶囊：中段半长 0.72 r，两头圆、半高 0.58 r；总半宽 1.297 r
      const hl = r * 44;
      const h = r * 39;
      const ex = ax > hl ? ax - hl : 0;
      return ex * ex + Y * Y < h * h;
    }

    case 'paddle': {
      // 球拍：拍面印。8 单位（2 格）一块的方块拼成竖着的拍面，坑边是一级级的台阶，像球拍的网眼压出来的。
      // 块在横向以 8 的倍数为界（块中心 8k+4），纵向以 8k±4 为界（块中心 8k），所以拍面比宽高（r = 19 时 8 格宽、10 格高）。
      // 块中心离爆心不到 0.97 r 的块整块挖掉。半径小于 10 时一块都太粗，退回圆坑（网格只留在焦痕上）。
      if (r < 10) return X * X + Y * Y < (r << 6) * (r << 6);
      const px = (((dx >> 3) << 3) + 4) << 6; // 块中心 × 64
      const py = (((dy + 4) >> 3) << 3) << 6;
      const rp = r * 62;
      return px * px + py * py < rp * rp;
    }

    case 'carrot': {
      // 萝卜：又窄又深的竖坑，上宽下尖像一根倒插的萝卜。
      // 上头一个圆（圆心在爆心上方 0.4 r，半径 0.8 r），往下收成圆头的尖（半径 0.25 r，最小 6 单位 = 3 格宽），尖底到 1.297 r。
      const y1 = -r * 26;
      const r1 = r * 54;
      let rt = r * 17;
      if (rt < 6 << 6) rt = 6 << 6;
      const y2 = r * 83 - rt;
      if (inCircle(X, Y, 0, y1, r1) || inCircle(X, Y, 0, y2, rt)) return true;
      if (Y < y1 || Y > y2) return false;
      // 两圆之间按高度线性收窄：|X| < r1 + (rt - r1)(Y - y1)/(y2 - y1)，两边乘 (y2 - y1)
      return ax * (y2 - y1) < r1 * (y2 - y1) + (rt - r1) * (Y - y1);
    }

    case 'rocket': {
      // 烟花：六角星碎口。正下、正上两个尖最长（1.297 r、1.25 r），四个斜尖 1.1–1.28 r；凹点在 0.72–0.78 r。
      let wt = r * 5;
      if (wt < 4 << 6) wt = 4 << 6;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const v of STAR) {
        const vx = v[0] * r;
        const vy = v[1] * r;
        if (v.length === 2) { xs.push(vx); ys.push(vy); continue; }
        // 平头：沿垂直方向各让出 wt（v[2], v[3] 是 64 倍的单位向量，>> 6 还原）
        const ox = (v[2] * wt) >> 6;
        const oy = (v[3] * wt) >> 6;
        xs.push(vx - ox, vx + ox);
        ys.push(vy - oy, vy + oy);
      }
      return inPoly(X, Y, xs, ys);
    }

    case 'slipper': {
      // 拖鞋：鞋底印，横着摆、鞋头朝右。鞋头一个大椭圆、鞋跟一个小圆，中间是收窄的足弓：底下看是一深一浅两个窝，中间拱起。
      // 鞋头：中心 (0.5 r, 0.06 r)，半宽 0.8 r、半高 0.69 r（右边到 1.297 r）；鞋跟：中心 (-0.8 r, 0)，半径 0.5 r（左边到 1.297 r）；
      // 足弓：x 在两个中心之间，y 在 -0.56 r 到 0.25 r。
      const tx = r * 32;
      const ty = r * 4;
      const ta = r * 51;
      const tb = r * 47;
      const p = (X - tx) * tb;
      const q = (Y - ty) * ta;
      if (p * p + q * q < ta * tb * (ta * tb)) return true;
      const hx = -r * 51;
      if (inCircle(X, Y, hx, 0, r * 34)) return true;
      // 半径小于 14 时足弓拱起只有 1 格，会留下一根细刺：填平，退成一头大一头小的鞋底
      const arch = r < 14 ? r * 34 : r * 16;
      return X > hx && X < tx && Y > -r * 36 && Y < arch;
    }

    case 'milktea': {
      // 奶茶：圆坑 + 一道往下淌的流痕，流痕尽头鼓成一颗圆滴（像杯壁上挂下来的一滴）。
      // 碗半径 0.89 r；流痕在 x = -0.3 r，半宽 0.14 r（最小 5 单位），圆滴半径 0.25 r（最小 8 单位），滴底到 1.297 r。
      // 两道流痕在格子上会读成"牙"，所以只留一道，第二道交给焦痕的茶渍去画。
      if (X * X + Y * Y < r * 57 * (r * 57)) return true;
      let wd = r * 9;
      if (wd < 5 << 6) wd = 5 << 6;
      let rd = r * 16;
      if (rd < 8 << 6) rd = 8 << 6;
      const xd = -r * 19;
      const yd = r * 83 - rd;
      if (inCircle(X, Y, xd, yd, rd)) return true;
      const d = X - xd;
      return Y >= 0 && Y <= yd && d < wd && d > -wd;
    }
  }
}
