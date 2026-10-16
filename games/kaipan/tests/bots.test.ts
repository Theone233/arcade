import { describe, expect, it } from 'vitest';
import { replay } from '../src/core/index.ts';
import { BOTS, botByName, playRun, useExt } from '../tools/bots.ts';

/** 机器人只给出合法操作（playRun 遇到非法操作会抛错），整局可以回放。 */
describe('机器人（模糊测试）', () => {
  for (const [name, runs] of [
    ['random', 40],
    ['follower', 20],
    ['chaser', 20],
    ['normal', 20],
    ['qunzhu', 10],
    ['smart', 4],
    ['smart-focus2', 2],
    ['smart-spread', 2],
    ['oracle', 3],
    // 0.4 C：重仓派、押跌派、抵押赌徒（总是打开新机制）
    ['heavy', 6],
    ['shorter', 6],
    ['gambler', 6],
  ] as const) {
    it(`${name} 能把一局打完，且可以回放`, () => {
      for (let i = 0; i < runs; i++) {
        const s = playRun(`fuzz-${name}-${i}`, botByName(name), i % 3 === 1 ? { items: ['double_buy', 'extra_slot'] } : null);
        expect(['won', 'lost']).toContain(s.phase);
        if (i < 2) expect(replay(s.seed, s.actions, s.setup, { ext: !!s.ext })).toEqual(s);
      }
    }, 60_000);
  }

  it('新机制打开时 smart、oracle 也能押跌、整局可以回放', () => {
    useExt(true);
    try {
      for (const name of ['smart', 'oracle'] as const) {
        const s = playRun(`fuzz-ext-${name}`, botByName(name), { items: ['short_permit'] });
        expect(s.ext).toBeTruthy();
        expect(replay(s.seed, s.actions, s.setup, { ext: true })).toEqual(s);
      }
    } finally {
      useExt(false);
    }
  }, 60_000);

  it('关闭群聊时 smart 也能玩', () => {
    const s = playRun('fuzz-nochat', botByName('smart'), { noChat: true });
    expect(['won', 'lost']).toContain(s.phase);
  });

  it('名录里的机器人都能创建', () => {
    for (const name of Object.keys(BOTS)) expect(botByName(name)().name).toBe(name);
    expect(() => botByName('nope')).toThrow();
  });
});
