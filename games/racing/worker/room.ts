/**
 * 好友房（DESIGN.md 第 6 节）：kit 的房间 + 赛车的规则（src/room/rules.ts）。娱乐模式，没有对外的事要办。
 * 电脑的互动（kit 0.10 的 onStep + botEmote、0.10.1 的 onEmote）：
 * - onStep：每一步广播完，拿这一步的公开视图和上一次的比，认出打滑、尾流、超车、冲线这些公开的事，按性格让电脑发一句（game/banter.ts）。
 *   电脑连着出手时 kit 一批推好几步，onStep 只看得到最后一步，所以按"公开统计的变化"认，不按这一步的事件认，中间的不会漏；
 * - onEmote：真人冲某个电脑扔道具、点名说话，被冲着的电脑按脾气回一句。只调 botEmote，不记真人说了什么，不写存储；
 * 快照和冷却只在内存里（房间被驱逐了就从头来，最多少说一两句）。
 */
import { DEFAULT_LIMITS, GameRoom, type RoomLimits } from 'arcade-kit/room';
import { Banter, factsOf, react, reply, snapOf, type Snap } from '../src/game/banter.ts';
import { view } from '../src/core/view.ts';
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
  private snap: Snap[] | null = null;
  private kinds: ('human' | 'ai')[] = [];
  private readonly banter = new Banter();

  protected override onStep(state: RoomState): void {
    const g = state.g;
    const cur = snapOf(view(g, null).cars);
    const prev = this.snap;
    this.snap = cur;
    this.kinds = g.kinds.slice();
    const now = Date.now();
    for (const t of react(factsOf(prev, cur), cur, (seat) => g.kinds[seat] === 'ai', g.n)) {
      if (this.banter.pass(t, now)) this.botEmote(t.seat, t.id, t.to);
    }
  }

  protected override onEmote(from: number, id: number, to?: number): void {
    if (to === undefined || this.kinds[to] !== 'ai') return;
    const t = reply(to, this.snap?.[to]?.persona ?? -1, from, id, Date.now() >>> 10);
    if (t && this.banter.pass(t, Date.now())) this.botEmote(t.seat, t.id, t.to);
  }
}
