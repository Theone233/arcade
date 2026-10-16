/** 电脑说话（0.3.0 实打后）：推全下和跟全下分开说；同一个电脑同一句话至少隔 REPEAT_HANDS 手 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPEAT_HANDS, Talk } from '../src/view/talk.ts';

afterEach(() => vi.restoreAllMocks());

/** 顺序同 PERSONAS */
const LAOHAO = 2;
const JIANGHU = 5;

describe('电脑说话', () => {
  it('自己推全下和跟别人的全下说的不一样（老好推的时候不说"跟到底"）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(new Talk().line(1, LAOHAO, 1, 'allin', true)).toBe('全押上了！');
    expect(new Talk().line(1, LAOHAO, 1, 'callAllin', true)).toBe('跟到底！');
  });

  it(`同一个电脑同一句话隔 ${REPEAT_HANDS} 手才再说；有别的说法就换一句，没有就不说`, () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const t = new Talk();
    // 江湖诈唬成了有两句："嘿嘿"、"承蒙关照"
    expect(t.line(3, JIANGHU, 1, 'bluffWon', true)).toBe('嘿嘿');
    expect(t.line(3, JIANGHU, 2, 'bluffWon', true)).toBe('承蒙关照');
    expect(t.line(3, JIANGHU, 3, 'bluffWon', true)).toBeNull();
    // 别的座位不受影响
    expect(t.line(4, JIANGHU, 3, 'bluffWon', true)).toBe('嘿嘿');
    expect(t.line(3, JIANGHU, 1 + REPEAT_HANDS - 1, 'bluffWon', true)).toBeNull();
    expect(t.line(3, JIANGHU, 1 + REPEAT_HANDS, 'bluffWon', true)).toBe('嘿嘿');
  });
});
