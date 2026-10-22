/**
 * 炮弹（DESIGN.md 2.2）：定点整数、固定步长。每帧（1/60 秒）vx += 风 × k、vy += 重力，位置累加；
 * 每帧的位移再切成不超过 2 个单位的小段逐点查碰撞，快的炮弹也穿不过薄地。
 * 碰到地或者没出局的角色就停（爆炸点）；飞出左、右、下边就没了；上边不封顶，飞出去还会落回来。
 */
import { cosDeg, FP, idiv, sinDeg } from './fixed.ts';
import { CELL, MAT_MASK, type Terrain } from './terrain.ts';
import type { Char, Dir } from './types.ts';

/** 重力（定点，每帧²） */
export const GRAVITY = 256;
/** 风每一级的加速度（定点，每帧²） */
export const WIND_K = 6;
/** 力度每一点的初速度（定点，每帧）：力度 100 约 25 单位/帧 */
export const POWER_K = 256;
/** 最多模拟多少帧（40 秒），防止卡死 */
export const MAX_TICKS = 2400;
/** 身体：命中圆的半径、圆心离脚底多高、要多高的空隙才站得下 */
export const BODY_R = 14;
export const BODY_CY = 18;
export const BODY_H = 34;
/** 炮弹从身体中心往外多远出膛 */
export const MUZZLE = 22;
const SUB = 2 * FP;

export interface Shot {
  /** 每帧的位置（世界单位，取整），x、y 交替 */
  path: number[];
  /** 爆炸点；飞出画本是 null */
  end: { x: number; y: number } | null;
  /** 直接打中的角色（chars 的下标） */
  hit: number | null;
}

/** 出膛点和初速度（定点）。angle 是相对朝向的仰角 */
export function launch(c: Pick<Char, 'x' | 'y'>, angle: number, power: number, facing: Dir): { x: number; y: number; vx: number; vy: number } {
  const cos = cosDeg(angle) * facing;
  const sin = sinDeg(angle);
  const ox = c.x * FP + idiv(MUZZLE * FP * cos, 1024);
  const oy = (c.y - BODY_CY) * FP - idiv(MUZZLE * FP * sin, 1024);
  const v = power * POWER_K;
  return { x: ox, y: oy, vx: idiv(v * cos, 1024), vy: -idiv(v * sin, 1024) };
}

/**
 * 模拟一发：terrain 不改。chars 里出局的不算。
 * width、height 是画本的大小（世界单位）。
 */
export function simulate(
  terrain: Terrain,
  chars: readonly Char[],
  width: number,
  height: number,
  wind: number,
  start: { x: number; y: number; vx: number; vy: number },
  record = true,
): Shot {
  let { x, y, vx, vy } = start;
  const path: number[] = [];
  const ax = wind * WIND_K;
  // 每一小段都要查：电脑一手试几十发、好友房的服务器每一步有 CPU 预算，所以这里写得直白、少分配（结果和逐个调 solidAt 一模一样）。
  // 定点坐标都是 int32 以内的整数（世界 3000 宽，往上最多飞约 1300），>> 10 就是除以 FP 向下取整
  const live: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (!c.out) live.push(c.x, c.y - BODY_CY, i);
  }
  const r2 = BODY_R * BODY_R;
  const { cols, rows, cells } = terrain;
  let end: { x: number; y: number } | null = null;
  let hit: number | null = null;
  /** 这一点碰到东西了吗：飞出画本（end 留 null）、打中人、碰到地都回 true */
  const check = (px: number, py: number): boolean => {
    const wx = px >> 10;
    const wy = py >> 10;
    if (wx < 0 || wx >= width || wy >= height) return true;
    for (let k = 0; k < live.length; k += 3) {
      const dx = wx - live[k]!;
      const dy = wy - live[k + 1]!;
      if (dx * dx + dy * dy <= r2) {
        end = { x: wx, y: wy };
        hit = live[k + 2]!;
        return true;
      }
    }
    if (wy >= 0) {
      const c = Math.floor(wx / CELL);
      const r = Math.floor(wy / CELL);
      if (c < cols && r < rows && (cells[r * cols + c]! & MAT_MASK) !== 0) {
        end = { x: wx, y: wy };
        return true;
      }
    }
    return false;
  };
  if (check(x, y)) {
    if (record) path.push(x >> 10, y >> 10);
    return { path, end, hit };
  }
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    if (record) path.push(x >> 10, y >> 10);
    vx += ax;
    vy += GRAVITY;
    const dx = vx;
    const dy = vy;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUB));
    for (let i = 1; i <= n; i++) {
      const px = x + idiv(dx * i, n);
      const py = y + idiv(dy * i, n);
      if (check(px, py)) {
        if (record) path.push(px >> 10, py >> 10);
        return { path, end, hit };
      }
    }
    x += dx;
    y += dy;
  }
  return { path, end: null, hit: null };
}
