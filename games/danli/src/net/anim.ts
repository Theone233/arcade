/**
 * 好友房里一回合放完要多久（毫秒）：房间按它"停一会儿"（kit 的 pause），等大家的页面把这一发放完，下一个人的 30 秒才开始算；
 * 电脑也按它一手一手来，不会一下子连着打好几手、页面排着放不完。
 * 数和画面（view/scene.ts 的 play、online 页面的"瞄准、蓄力"）对得上，偏长一点：别人那一手先"想、转角度盘、蓄力"再放事件。
 * 纯函数（房间里算），只用整数。
 */
import { isqrt } from '../core/fixed.ts';
import type { Ev } from '../core/types.ts';

/** 别人出手前：想一下、转角度盘（页面 AIM_MS），再按力度蓄力（满力 CHARGE_MS） */
export const AIM_MS = 900;
export const CHARGE_MS = 3000;
/** 每回合额外留的余量：网络、手机慢一点 */
export const SLACK_MS = 1200;
/** 开局先停这么久：大家的页面换到对局、烘焙地形 */
export const START_MS = 3000;
/** 弃权时页面上"某某弃权"的小牌停多久 */
export const PASS_MS = 900;

/**
 * 连发的节奏：一手扔好几轮时，第 3 轮起放快（第 3 轮 2 倍、第 4 轮 3 倍……第 n 轮 n − 1 倍），炮弹飞、爆炸、掉血、往下掉都按这个倍数缩短；
 * 出局、换人不加速（要看清谁出局了）。k 是这一手的第几轮（从 0 数）。不然三个 +2 满力往天上打（7 轮）一手要停 30 秒。
 */
export function volleyPace(k: number): number {
  return k < 2 ? 1 : k;
}

/** 一段动画按节奏缩短后的毫秒数（整数）：画面（view/scene.ts）和房间的停顿用同一个数 */
export function paced(ms: number, pace: number): number {
  return Math.floor(ms / pace);
}

/** 一轮炮弹飞多久：飞得最久那一颗的步数，每秒 60 步 */
export function flightMs(steps: number, pace: number): number {
  return paced(Math.floor((steps * 1000) / 60), pace);
}

/** 掉一段（高 h）放多久：和画面（view/scene.ts 的 playFall）同一个数；连发第 3 轮起的掉落也跟着放快 */
export function fallMs(h: number, pace: number): number {
  return paced(140 + isqrt(Math.max(1, h)) * 26, pace);
}

export function playMs(events: readonly Ev[], power: number | null): number {
  let ms = SLACK_MS + (power === null ? 0 : AIM_MS + Math.floor((CHARGE_MS * power) / 100));
  let shots = 0;
  let pace = 1;
  for (const e of events) {
    switch (e.t) {
      case 'move':
        ms += 60;
        break;
      case 'fire':
        shots = 0;
        pace = 1;
        break;
      case 'shot':
        pace = volleyPace(shots++);
        ms += flightMs(Math.max(0, ...e.flights.map((f) => f.path.length / 2)), pace);
        break;
      case 'warp':
        ms += 500;
        break;
      case 'boom':
        ms += paced(260, pace);
        break;
      case 'hurt':
        ms += paced(160, pace);
        break;
      case 'fall':
        ms += fallMs(e.to - e.from, pace);
        break;
      case 'out':
        ms += 500;
        break;
      case 'pass':
        ms += PASS_MS;
        break;
      case 'turn':
        ms += 600;
        pace = 1;
        break;
      case 'over':
        ms += 500;
        break;
      default:
        break;
    }
  }
  return ms;
}
