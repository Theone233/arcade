/**
 * 规则和电脑之间的胶水：给某个座位算电脑的操作。单机的页面、房间的 ai()、测试和模拟都走这里，
 * 保证电脑只拿到视图，随机数按"第几手、第几步、哪个座位"分流（DESIGN.md 1.5、4.1）。
 */
import { decide } from './ai/decide.ts';
import { stream } from 'arcade-kit/rng';
import { RNG, type Action, type Table } from './core/table.ts';
import { view } from './core/view.ts';

export function aiAction(t: Table, seat: number): Action {
  // 序号 = 第几手、这一手第几步、哪个座位（一手的操作记录远少于 2^17 条）
  return decide(view(t, seat), stream(t.seed, RNG.ai, (t.handNo * 0x20000 + t.log.length) * 8 + seat));
}
