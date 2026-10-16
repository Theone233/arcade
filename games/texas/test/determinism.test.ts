import { describe, expect, it } from 'vitest';
import { purposeHash } from 'arcade-kit/rng';
import { RNG, type Table } from '../src/core/table.ts';
import { runBots } from './bots.ts';
import { SEED } from './helpers.ts';

/** 打 200 手，记下每一步的状态 */
function record(seed: number[]): string[] {
  const out: string[] = [];
  runBots({ seed, size: 6, hands: 200, onStep: (t: Table) => out.push(JSON.stringify(t)) });
  return out;
}

describe('同种子同操作同结果', () => {
  it('同一个种子打两遍，每一步的状态完全一样', () => {
    const a = record(SEED);
    const b = record(SEED);
    expect(b.length).toBe(a.length);
    expect(b).toEqual(a);
  });

  it('换一个种子，牌就不一样', () => {
    const a = record(SEED);
    const b = record([...SEED.slice(0, 7), SEED[7]! + 1]);
    expect(b.slice(0, 50)).not.toEqual(a.slice(0, 50));
  });

  it('状态 JSON 存取前后一样（存档、房间都直接存 JSON）', () => {
    runBots({
      seed: SEED,
      size: 4,
      hands: 50,
      onStep: (t) => expect(JSON.parse(JSON.stringify(t))).toEqual(t),
    });
  });

  it('随机数的用途名哈希互不相同（arcade-kit/rng 的要求）', () => {
    const names = [...Object.values(RNG), 'bots', 'preflop'];
    expect(new Set(names.map(purposeHash)).size).toBe(names.length);
  });
});
