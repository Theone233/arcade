/**
 * 右边的名次栏：按名次（冲线的在前，其余按位置）列出每辆车：颜色、名字、第几圈、挡位、引擎热量、这回合的速度和状态。
 * 大家同时出牌时，出完了的那一行边框变绿。
 * 只用公开信息。
 */
import type { View } from '../core/view.ts';
import { getTrack } from '../track/index.ts';
import { el } from './dom.ts';
import { flameSvg } from './cards.ts';
import { pieceIcon } from './piece.ts';

export interface SeatName {
  name: string;
  bot: boolean;
  /** 好友房：掉线了 / 电脑托管中 */
  away?: boolean;
}

function standing(v: View): number[] {
  return v.cars
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = v.cars[a]!;
      const cb = v.cars[b]!;
      if (ca.rank !== null || cb.rank !== null) return (ca.rank ?? 99) - (cb.rank ?? 99);
      return cb.pos - ca.pos || ca.lane - cb.lane || a - b;
    });
}

export function renderSide(parent: HTMLElement, v: View, names: SeatName[], thinking: number[]): void {
  parent.replaceChildren();
  const track = getTrack(v.opts.track);
  const spaces = track?.spaces ?? 1;
  const head = el('div', 'side-head', parent);
  const leader = v.cars.reduce((a, c) => Math.max(a, c.pos), -99);
  const lap = Math.min(v.opts.laps, Math.floor(Math.max(0, leader) / spaces) + 1);
  el('span', '', head, `第 ${v.round} 回合`);
  el('span', '', head, `领先 第 ${lap}/${v.opts.laps} 圈`);
  const list = el('ol', 'standings', parent);
  standing(v).forEach((seat, i) => {
    const c = v.cars[seat]!;
    const n = names[seat] ?? { name: `车${seat + 1}`, bot: true };
    // 交计划是大家同时出牌：出完了的那一行边框变绿，一眼看出还在等谁
    const ready = v.phase === 'plan' && c.ready && c.rank === null;
    const li = el('li', `row${v.me?.seat === seat ? ' me' : ''}${c.rank !== null ? ' done' : ''}${ready ? ' ready' : ''}`, list);
    if (ready) li.title = '这回合出好了';
    li.dataset.seat = String(seat);
    el('span', 'place', li, String(i + 1));
    // 车的颜色和号码：一枚小棋子（高光渐变定义在赛道的 SVG 里，同一个页面能引用到）
    const dot = el('span', 'dot car-icon', li);
    dot.innerHTML = pieceIcon(seat);
    const who = el('span', 'who', li);
    el('span', 'nm', who, n.name);
    const meta: string[] = [];
    if (c.rank !== null) meta.push('冲线');
    else meta.push(`${Math.min(v.opts.laps, Math.floor(Math.max(0, c.pos) / spaces) + 1)} 圈`);
    if (n.away) meta.push('托管');
    el('span', 'meta', who, meta.join(' · '));
    el('span', 'gear', li, String(c.gear)).title = '挡位';
    const heat = el('span', 'heat', li);
    heat.innerHTML = `${flameSvg(c.engine > 0)}${c.engine}`;
    heat.title = '引擎里的热量';
    let st = '';
    if (c.rank !== null) st = `第${c.rank + 1}`;
    else if (v.phase === 'plan') st = c.ready ? '✓' : thinking.includes(seat) ? '…' : '';
    else if (c.stalled) st = '熄火';
    else if (c.spun) st = '打滑';
    else if (c.speed !== null) st = `${c.speed}`;
    const s = el('span', `st${c.adren && c.rank === null ? ' adren' : ''}`, li, st);
    if (c.adren && c.rank === null) s.title = '这回合有拼劲';
  });
}
