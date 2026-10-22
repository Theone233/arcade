/**
 * 焦痕要用的坑序列（DESIGN.md 2.3.1，0.3.0）：焦痕只是画面，不进规则，也不由房间下发；
 * 画面按 boom 事件记下这一局挖过的坑（按先后），画法在 scorchPaint.ts，跟着地形分块烘焙（terrainArt.ts）。
 * 读档、重连、跳到最新的局面时，用重放出来的爆炸事件从地图原样一个坑一个坑重来（先挖、再画），和一手一手放出来的一样。
 */
import type { Ev } from '../core/types.ts';
import type { WeaponId } from '../core/weapons.ts';

/** 一个坑：坑心、大小、谁的坑形（boom 事件里的那几个数） */
export interface Burn {
  x: number;
  y: number;
  r: number;
  w: WeaponId;
}

export function burnsOf(events: readonly Ev[]): Burn[] {
  return events.flatMap((e) => (e.t === 'boom' ? [{ x: e.x, y: e.y, r: e.r, w: e.w }] : []));
}
