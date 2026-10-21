/** 结算页的统计（stats.ts）：按存档重放，伤害只算打到对方的、命中按颗算、轰出画本、结果章 */
import { describe, expect, it } from 'vitest';
import { plan, planActions } from '../src/ai/index.ts';
import { apply, newGame } from '../src/core/rules.ts';
import type { Action } from '../src/core/types.ts';
import { computeStats } from '../src/stats.ts';
import { KEY, vs } from './helpers.ts';

/** 电脑对电脑打完一局，回操作记录 */
function playOut(key: number[], setup = vs(2)): Action[] {
  let s = newGame(key, setup);
  const log: Action[] = [];
  while (s.phase === 'play') {
    for (const a of planActions(plan(s))) {
      const r = apply(s, a);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      log.push(a);
    }
  }
  return log;
}

describe('结算统计', () => {
  it('重放到最后：结果章和规则核心的状态对得上，同样的输入算出来一样', () => {
    const setup = vs(2);
    const log = playOut(KEY, setup);
    const a = computeStats(KEY, setup, log);
    expect(a.state.phase).toBe('over');
    for (const p of a.players) {
      const c = a.state.chars[p.id]!;
      expect(p.end === 'alive').toBe(!c.out);
      expect(p.hp).toBe(c.hp);
      expect(p.hits).toBeLessThanOrEqual(p.shots);
    }
    expect(a.falls + a.busts).toBe(a.state.chars.filter((c) => c.out).length);
    expect(computeStats(KEY, setup, log)).toEqual(a);
  });

  it('伤害只算打到对方的：两队打出的伤害等于对方挨的血（不含自己炸自己、炸到队友）', () => {
    const setup = vs(1);
    const log = playOut([5, 5, 5, 5, 5, 5, 5, 5], setup);
    let s = newGame([5, 5, 5, 5, 5, 5, 5, 5], setup);
    const taken = [0, 0];
    for (const a of log) {
      const me = s.chars[s.actor]!;
      const r = apply(s, a);
      if (!r.ok) throw new Error(r.error);
      for (const e of r.events) if (e.t === 'hurt' && s.chars[e.id]!.team !== me.team) taken[s.chars[e.id]!.team]! += e.dmg;
      s = r.state;
    }
    const st = computeStats([5, 5, 5, 5, 5, 5, 5, 5], setup, log);
    expect(st.players[0]!.dmg).toBe(taken[1]);
    expect(st.players[1]!.dmg).toBe(taken[0]);
  });

  it('轰出画本：对方掉出画本的人数算给出手的人', () => {
    for (const k of [1, 2, 3, 4]) {
      const key = [k, 9, 9, 9, 9, 9, 9, 9];
      const st = computeStats(key, vs(2), playOut(key));
      const kos = st.players.reduce((n, p) => n + p.kos, 0);
      expect(kos).toBeLessThanOrEqual(st.falls);
    }
  });
});
