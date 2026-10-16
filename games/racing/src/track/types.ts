/**
 * 规则层认的赛道（DESIGN.md 3.1）：一圈多少格、弯道线在哪、限速多少。不带坐标和画法（画法在 shape.ts，只给画面层）。
 *
 * 位置用"从起终点线往前数第几格"的绝对格数 pos：线后第一格是 0，发车格在线前（-1、-2……），跑完 laps 圈就是 pos ≥ laps × spaces。
 * 弯道线 at 在第 at - 1 格和第 at 格之间：车停在 pos ≥ at + k × spaces 就算跨过了第 k 圈的这条线。
 */
export interface Corner {
  /** 弯道线在第几格前面（0 < at < spaces） */
  at: number;
  /** 限速 */
  limit: number;
}

export interface Track {
  id: string;
  /** 给玩家看的名字 */
  name: string;
  /** 一句话的性格 */
  blurb: string;
  /** 一圈多少格 */
  spaces: number;
  /** 默认圈数 */
  laps: number;
  /** 按 at 从小到大 */
  corners: Corner[];
  /** 每辆车引擎里的热量 */
  heat: number;
  /** 每辆车牌堆里的手抖牌 */
  stress: number;
}
