/** 快照体积预算：snapshotBytes 取所有座位和"没入座"里最大的那份快照。游戏在自己的测试里用它断言上限。 */
import { describe, expect, it } from 'vitest';
import { snapshotBytes } from '../src/game.ts';
import { toyGame } from './worker.ts';

describe('snapshotBytes', () => {
  it('取最大的那份：手牌多的座位比没入座的人大；玩具游戏开局的快照在 1 KB 以内', () => {
    const s = toyGame.start(42, 1);
    const big = { ...s, hands: s.hands.map((h, i) => (i === 2 ? [...h, ...Array.from({ length: 200 }, () => 99)] : h)) };
    expect(snapshotBytes(toyGame, big)).toBeGreaterThan(snapshotBytes(toyGame, s) + 200 * 3 - 1);
    expect(snapshotBytes(toyGame, s)).toBeLessThan(1024);
  });
});
