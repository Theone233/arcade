/**
 * 舞台和座位的位置（DESIGN.md 8.2）。舞台高固定 540 个设计单位，宽随屏幕在 860–1170 之间变（4:3 平板到 19.5:9 手机都铺满），
 * 再整体缩放到看得见的区域。座位按"离我第几个"排在椭圆桌边，我永远在正下方。
 */
export const STAGE_H = 540;
export const STAGE_MIN_W = 860;
export const STAGE_MAX_W = 1170;

export interface Pt {
  x: number;
  y: number;
}

/** 桌子：椭圆的中心和半轴（设计单位，宽按舞台宽算） */
export function felt(w: number): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: w / 2, cy: 250, rx: w / 2 - 120, ry: 168 };
}

/**
 * 我的座位（0.1.1 重排）：底牌在上、名牌在下、头像在名牌左边，三样不叠；下注在底牌上方，再往上是池子和公共牌。
 * 座位的点是名牌上沿往上一点，各部件按它摆（style.css 的 .seat.me）
 */
const ME_Y = 470;

/** 每种人数的座位位置：[x 占舞台宽的比例, y]，第 0 个是我 */
const SLOTS: Record<number, [number, number][]> = {
  2: [[0.5, ME_Y], [0.5, 66]],
  3: [[0.5, ME_Y], [0.24, 92], [0.76, 92]],
  4: [[0.5, ME_Y], [0.085, 250], [0.5, 66], [0.915, 250]],
  5: [[0.5, ME_Y], [0.085, 280], [0.27, 70], [0.73, 70], [0.915, 280]],
  6: [[0.5, ME_Y], [0.11, 360], [0.11, 128], [0.5, 66], [0.89, 128], [0.89, 360]],
  // 7–9 人（0.2.0）：左右各两个贴着桌边（再往下是操作区和左下角的按钮，放不下），其余排在顶上
  7: [[0.5, ME_Y], [0.08, 340], [0.12, 130], [0.36, 62], [0.64, 62], [0.88, 130], [0.92, 340]],
  8: [[0.5, ME_Y], [0.07, 330], [0.08, 175], [0.27, 66], [0.5, 60], [0.73, 66], [0.92, 175], [0.93, 330]],
  9: [[0.5, ME_Y], [0.07, 335], [0.07, 190], [0.2, 78], [0.39, 60], [0.61, 60], [0.8, 78], [0.93, 190], [0.93, 335]],
};

/** 第 seat 号座位在舞台上的位置（me 是我坐的座位，画在正下方） */
export function seatPos(seat: number, me: number, size: number, w: number): Pt {
  const [fx, y] = SLOTS[size]![(seat - me + size) % size]!;
  return { x: fx * w, y };
}

/** 下注的筹码放在座位和桌子中心之间（我的在底牌正上方） */
export function betPos(p: Pt, w: number, mine: boolean): Pt {
  const f = felt(w);
  // 我的：底边在底牌上面一点（.bet.mine 按底边摆），往上长不碰底池
  if (mine) return { x: f.cx, y: p.y - 100 };
  const k = 0.42;
  return { x: p.x + (f.cx - p.x) * k, y: p.y + (f.cy - p.y) * k + 6 };
}

/** 庄家按钮：在下注的位置旁边偏一点 */
export function buttonPos(p: Pt, w: number, mine: boolean): Pt {
  const b = betPos(p, w, mine);
  // 别人的放在下注那摞筹码的左边（数字在右边），不压数字
  return mine ? { x: b.x - 96, y: b.y - 12 } : { x: b.x - 64, y: b.y };
}

/** 公共牌：5 张的中心 */
export const boardPos = (w: number, i: number): Pt => ({ x: w / 2 + (i - 2) * 66, y: 232 });
/** 池子在公共牌下面（0.1.1：原来在上面，和顶上座位的下注、庄家按钮挤在一起） */
export const potPos = (w: number): Pt => ({ x: w / 2, y: 304 });
/** 一手的结果条：公共牌和池子下面（0.1.1：放在上面会盖住顶上座位的庄家按钮），按上边摆 */
export const resultPos = (w: number): Pt => ({ x: w / 2, y: 326 });
/** 牌堆：发牌从这里出，弃的牌、收的牌飞回这里。在桌子正中（公共牌的位置）；放在偏上会压住顶上座位的名牌 */
export const deckPos = (w: number): Pt => ({ x: w / 2, y: 232 });

/** 按看得见的区域算舞台的宽和缩放 */
export function fit(availW: number, availH: number): { w: number; scale: number } {
  let scale = availH / STAGE_H;
  let w = availW / scale;
  if (w < STAGE_MIN_W) {
    scale = availW / STAGE_MIN_W;
    w = STAGE_MIN_W;
  }
  return { w: Math.min(STAGE_MAX_W, w), scale };
}
