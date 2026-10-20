/**
 * 定点数和整数角度表（DESIGN.md 2.2）。规则核心不用三角函数和开方：结果依赖平台，联机、回放会对不上。
 * 方向用一张写死的整数表：每 1° 一项，乘以 1024 取整（表是用 Math.sin 离线算好贴进来的，运行时不再算）。
 */

/** 定点数的 1：位置、速度都以 1/1024 世界单位存 */
export const FP = 1024;

/** sin(0°..90°) × 1024，四舍五入 */
const SIN90: readonly number[] = [
  0, 18, 36, 54, 71, 89, 107, 125, 143, 160, 178, 195, 213, 230, 248, 265, 282, 299, 316, 333, 350, 367, 384, 400, 416, 433, 449, 465, 481, 496, 512, 527,
  543, 558, 573, 587, 602, 616, 630, 644, 658, 672, 685, 698, 711, 724, 737, 749, 761, 773, 784, 796, 807, 818, 828, 839, 849, 859, 868, 878, 887, 896,
  904, 912, 920, 928, 935, 943, 949, 956, 962, 968, 974, 979, 984, 989, 994, 998, 1002, 1005, 1008, 1011, 1014, 1016, 1018, 1020, 1022, 1023, 1023, 1024,
  1024,
];

/** 角度规范到 0..359 */
function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** sin(deg) × 1024（deg 是整数度） */
export function sinDeg(deg: number): number {
  const a = norm(deg);
  if (a <= 90) return SIN90[a]!;
  if (a <= 180) return SIN90[180 - a]!;
  if (a <= 270) return -SIN90[a - 180]!;
  return -SIN90[360 - a]!;
}

/** cos(deg) × 1024 */
export function cosDeg(deg: number): number {
  return sinDeg(deg + 90);
}

/** 整数开方（向下取整），只用整数加减和移位，n 在 2^52 以内 */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** 整数除法，向零取整 */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
