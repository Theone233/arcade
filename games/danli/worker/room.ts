/**
 * 好友房（DESIGN.md 5.6）：kit 的 GameRoom，规则全在 src/net/rules.ts（和页面共用的纯函数）。
 * 一次只算一个电脑（maxAiBatch 1）：电脑想一步加结算一发在开发机上 p99 不超过 3 ms（test/cpu.test.ts），
 * 下一个电脑等这一手的动画停顿（rules 的 pause）过去、闹钟响了再算。其余限制用 kit 的默认（3 小时、3000 条入站、30 秒一手、掉线 60 秒托管）。
 */
import { DEFAULT_LIMITS, GameRoom, type RoomLimits } from 'arcade-kit/room';
import { ROOM_RULES, type NetAction, type RoomState, type RoomView } from '../src/net/rules.ts';

export class DanliRoom extends GameRoom<RoomState, NetAction, RoomView> {
  protected readonly game = ROOM_RULES;
  protected override readonly limits: RoomLimits = { ...DEFAULT_LIMITS, maxAiBatch: 1 };
}
