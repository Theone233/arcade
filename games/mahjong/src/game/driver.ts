/**
 * 不经过房间、在一个地方把一场推下去（单机、模拟器、测试共用）：电脑的座位用玩法的 auto 出手，
 * 一直推到轮到真人、或者停在一局结算、或者打完。房间里这件事由 kit 做（4.4 的批量出牌），这里是同样的规矩：
 * 一组人同时出手时组里的电脑一个个代出，剩下的真人各自点。
 */
import { AIS } from '../ai/index.ts';
import type { AnyVariant } from '../core/variants/index.ts';
import type { SeatKind } from '../core/variants/types.ts';

export interface Step<S> {
  seat: number;
  state: S;
}

/**
 * 从 state 起让电脑出手，直到某个真人必须出手（或者谁也不用出手：停顿、打完）。
 * humans 里的座位不代出；返回每一步之后的状态（画面按顺序播放）。
 * waitFor：这些真人座位在名单里也不挡（声明窗口里没有选择的真人：名单里有他，但不用等他）
 */
export function runAuto<S>(v: AnyVariant, state: S, kinds: readonly SeatKind[], maxSteps = 500): Step<S>[] {
  const ai = AIS[v.id]!;
  const steps: Step<S>[] = [];
  let s = state;
  for (let n = 0; n < maxSteps; n++) {
    const act = v.actors(s);
    if (!act || !act.seats.length || v.over(s)) break;
    const seat = act.seats.find((i) => kinds[i] === 'ai');
    if (seat === undefined) break;
    const next = v.apply(s, seat, v.auto(s, seat, ai));
    if ('error' in next) throw new Error(`ai move rejected: ${(next as { error: string }).error}`);
    s = next as S;
    steps.push({ seat, state: s });
  }
  return steps;
}
