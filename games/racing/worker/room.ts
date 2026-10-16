/**
 * 好友房（DESIGN.md 第 6 节）：kit 的房间 + 赛车的规则（src/room/rules.ts）。娱乐模式，没有对外的事要办。
 */
import { DEFAULT_LIMITS, GameRoom, type RoomLimits } from 'arcade-kit/room';
import { AI_DELAY_MS, racingRoom, TURN_MS, type RoomAction, type RoomOpts, type RoomState, type RoomView } from '../src/room/rules.ts';
import type { Env } from './main.ts';

/**
 * 限额（DESIGN.md 6.1）：一场 6 个真人约 300 条操作，加短语表情，入站给 3,000 够跑好几场；寿命 3 小时。
 * 电脑一帧停 0.7 秒：页面在这段时间里放这一步的走车动画
 */
export const ROOM_LIMITS: RoomLimits = { ...DEFAULT_LIMITS, turnMs: TURN_MS.plan, aiDelayMs: AI_DELAY_MS, maxAiBatch: 64 };

export class RacingRoom extends GameRoom<RoomState, RoomAction, RoomView, Env, RoomOpts> {
  protected readonly game = racingRoom;
  protected override readonly limits = ROOM_LIMITS;
}
