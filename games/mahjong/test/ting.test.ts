/** 听牌提示只按自己看得见的算：别人手里藏着的不减（不漏信息），桌上亮出来的才减 */
import { describe, expect, it } from 'vitest';
import { sichuanXuezhan as XZ } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { tingOf } from '../src/view/variants/sichuan-xuezhan/ting.ts';
import { kinds } from './helpers.ts';
import { RON, act, tileIn } from './xz-table.ts';

const k = (s: string): number => kinds(s)[0]!;

describe('听牌提示', () => {
  it('现在这手：别人手里的不算，打到河里的才减', () => {
    const s = RON();
    // 1 号听 5p；0 号手里藏着一张 5p，1 号看不见，还是剩 4 张
    expect(tingOf(XZ.view(s, 1), null)).toEqual([{ kind: k('5p'), left: 4 }]);
    const t = act(s, 0, { t: 'discard', tile: tileIn(s, 0, '5p') });
    expect(t.phase).toBe('claim');
    expect(tingOf(XZ.view(t, 1), null)).toEqual([{ kind: k('5p'), left: 3 }]);
  });

  it('轮到我打：打哪张能听、听什么；打的那张自己的不算剩', () => {
    const s = RON();
    const v = XZ.view(s, 0);
    // 打 5p 听 6p、9p：2 号手里的 6p 看不见，不减
    expect(tingOf(v, tileIn(s, 0, '5p'))).toEqual([
      { kind: k('6p'), left: 4 },
      { kind: k('9p'), left: 4 },
    ]);
    expect(tingOf(v, tileIn(s, 0, '1s'))).toBeNull();
    // 14 张时"现在这手"没有意义
    expect(tingOf(v, null)).toBeNull();
  });

  it('手里还有缺门就不算听', () => {
    const s = RON();
    // 3 号手里只有一张 9m，不是 13 张，不提示；1 号改成缺筒（手里还有筒）就不算听
    expect(tingOf(XZ.view(s, 3), null)).toBeNull();
    s.players[1]!.que = 1;
    expect(tingOf(XZ.view(s, 1), null)).toBeNull();
  });
});
