/** 牌桌各座位的锚点（世界坐标）。座位 0 我在下，1 下家在右，2 对家在上，3 上家在左（逆时针出牌）。 */
export interface SeatAnchor {
  /** 头像中心 */
  ax: number;
  ay: number;
  /** 头像直径 */
  size: number;
  /** 出牌区锚点：align 决定牌从这里向哪边排 */
  px: number;
  py: number;
  align: 'left' | 'center' | 'right';
  /** 气泡位置与尾巴方向 */
  bx: number;
  by: number;
  bdir: 'left' | 'right' | 'up' | 'down';
}

export const TOPBAR_H = 58;
export const BUTTON_Y = 412;

export function seatAnchors(W: number): SeatAnchor[] {
  return [
    { ax: 60, ay: 396, size: 72, px: W / 2, py: 294, align: 'center', bx: 132, by: 330, bdir: 'down' },
    { ax: W - 86, ay: 262, size: 96, px: W - 200, py: 262, align: 'right', bx: W - 150, by: 176, bdir: 'down' },
    { ax: W / 2 - 250, ay: 112, size: 90, px: W / 2, py: 196, align: 'center', bx: W / 2 - 112, by: 92, bdir: 'left' },
    { ax: 86, ay: 262, size: 96, px: 200, py: 262, align: 'left', bx: 150, by: 176, bdir: 'down' },
  ];
}
