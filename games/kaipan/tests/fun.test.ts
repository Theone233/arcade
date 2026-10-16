import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementHints, codex, createRun } from '../src/core/index.ts';
import { makeFluff } from '../src/view/trade/chatFluff.ts';
import { unlocksOf } from '../src/view/meta/unlocks.ts';

/** 0.6.4 隐藏结局和群聊小彩蛋（只用来看，不发筹码）。 */
describe('隐藏结局', () => {
  it('4 个隐藏成就；图鉴条目带 hidden；结束时每个隐藏结局单独先弹', () => {
    const hidden = ACHIEVEMENTS.filter((d) => d.hidden).map((d) => d.id);
    expect(hidden).toEqual(['lucky_88', 'busy_nothing', 'nail', 'phoenix']);
    expect(codex().achievements.filter((e) => e.hidden).map((e) => e.id)).toEqual(hidden);
    const u = unlocksOf({ ignored: null, newAchievements: ['first_win', 'nail', 'first_limitup', 'phoenix'], newPersonas: [], newDifficulty: null });
    expect(u).toEqual([
      { kind: 'achievement', id: 'nail', secret: true },
      { kind: 'achievement', id: 'phoenix', secret: true },
      { kind: 'achievements', ids: ['first_win', 'first_limitup'] },
    ]);
  });
});

describe('群聊小彩蛋', () => {
  it('稀有：一局大约碰上几回；确定性；不改其他热闹元素的挑选', () => {
    const friends = [
      { id: 'laowang', name: '老王' },
      { id: 'zhangjie', name: '张姐' },
      { id: 'xiaoli', name: '小李' },
    ];
    let notes = 0;
    for (let day = 0; day < 58; day++)
      for (const salt of ['pre', 'close', 'month']) {
        const a = makeFluff({ seed: 'fun', day, salt, tone: 'flat', friends, said: [], max: 9 });
        expect(makeFluff({ seed: 'fun', day, salt, tone: 'flat', friends, said: [], max: 9 })).toEqual(a);
        const rest = a.filter((f) => f.kind !== 'note');
        expect(rest).toHaveLength(4);
        notes += a.length - rest.length;
      }
    expect(notes).toBeGreaterThanOrEqual(1);
    expect(notes).toBeLessThanOrEqual(10);
  });
});

describe('结束页"下次可以试试"（0.6.8）', () => {
  const ended = (mutate: (s: ReturnType<typeof createRun>['state']) => void) => {
    const s = createRun('hints').state;
    s.phase = 'lost';
    mutate(s);
    return s;
  };

  it('按完成度从高到低取前两个；拿到了的、档案里有的不算；局没结束为空', () => {
    const s = ended((x) => {
      x.stats.limitUpDays = 15;
      x.stats.maxBoards = 3;
      x.stats.maxThemes = 1;
    });
    expect(achievementHints(s, []).map((h) => [h.id, h.have, h.need])).toEqual([
      ['limitup_crew', 15, 20],
      ['lianban_5', 3, 5],
    ]);
    expect(achievementHints(s, ['limitup_crew']).map((h) => h.id)).toEqual(['lianban_5', 'diversified']);
    expect(achievementHints(createRun('mid').state, [])).toEqual([]);
  });

  it('隐藏结局不出现；这局一点没做到的不出现', () => {
    const hidden = new Set(ACHIEVEMENTS.filter((d) => d.hidden).map((d) => d.id));
    expect(ACHIEVEMENTS.filter((d) => d.hidden && d.progress)).toEqual([]);
    const s = ended(() => {});
    expect(achievementHints(s, []).some((h) => hidden.has(h.id) || h.have <= 0)).toBe(false);
  });
});
