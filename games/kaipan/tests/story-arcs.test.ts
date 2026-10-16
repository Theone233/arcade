import { describe, expect, it } from 'vitest';
import { createRun, playStyle, runSummary } from '../src/core/index.ts';
import { FRIENDS } from '../src/core/content/index.ts';
import { STORY_ARCS, arcFor, beatAt, storyBeat } from '../src/view/trade/storyArcs.ts';
import { botByName, playRun, useExt, useMarket } from '../tools/bots.ts';

/** 0.6.3 群友连载和按打法的评语。 */

describe('群友连载', () => {
  it('六段按一局的月数摊开：12 个月每两个月一段，半年每月一段，每段只讲一次', () => {
    const shown = (months: number): number[] => Array.from({ length: months }, (_, i) => beatAt(i + 1, months)).filter((b) => b >= 0);
    expect(shown(12)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(shown(6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(beatAt(13, 12)).toBe(-1);
  });

  it('讲故事的都是开局就在群里的群友；同一种子挑同一个；第二段起引用上一段', () => {
    const founding = FRIENDS.filter((f) => f.founding).map((f) => f.id);
    for (const a of STORY_ARCS) {
      expect(founding).toContain(a.friendId);
      expect(a.beats).toHaveLength(6);
    }
    expect(arcFor('abc').id).toBe(arcFor('abc').id);
    expect(new Set(Array.from({ length: 40 }, (_, i) => arcFor(`s${i}`).id)).size).toBe(STORY_ARCS.length);
    const arc = arcFor('abc');
    const b1 = storyBeat({ seed: 'abc', month: 1, months: 6, friendIds: founding });
    const b2 = storyBeat({ seed: 'abc', month: 2, months: 6, friendIds: founding });
    expect(b1).toEqual({ friendId: arc.friendId, quote: `连载 · ${arc.title}`, text: arc.beats[0] });
    expect(b2?.quote).toBe(`上回：${arc.beats[0]}`);
    expect(storyBeat({ seed: 'abc', month: 1, months: 6, friendIds: [] })).toBeNull();
  });
});

describe('按打法的评语', () => {
  it('一笔没买是观望大师；正常打完有标签和一句话', () => {
    expect(playStyle(createRun('zen', null, { ext: true }).state).id).toBe('zen');
    useExt(true);
    useMarket(null);
    const ids = new Set<string>();
    for (const bot of ['normal', 'random', 'gambler', 'smart']) {
      for (let i = 0; i < 3; i++) {
        const st = runSummary(playRun(`style-${bot}-${i}`, botByName(bot), null)).style;
        expect(st.tag.length).toBeGreaterThan(0);
        expect(st.line.length).toBeGreaterThan(5);
        ids.add(st.id);
      }
    }
    // 不同打法给的评语不全一样
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('观望大师的边界', () => {
  it('开局自带持仓、自己没买过：有交易就不算观望', () => {
    const s = createRun('zen-held', { themes: ['ai', 'newenergy', 'consumer', 'pharma', 'finance', 'pig'], holdings: ['con_blue'] }, { ext: true }).state;
    expect(playStyle(s).id).not.toBe('zen');
  });
});
