import { describe, expect, it } from 'vitest';
import { createRun, dispatch, type Action, type GameState, type RunSetup } from '../src/core/index.ts';
import { REPLAY_030 } from './fixtures/replay-030.ts';

/**
 * 0.3.1 只改文案、加归因 / 新闻 / 台词：同种子、同操作序列下，局面和 0.3.0（git 20f199f）逐位相同。
 * 基准 tests/fixtures/replay-030.ts 由 0.3.0 的代码和机器人生成（5 个人设 × 第 1、4、8 级 × normal / smart），
 * 记下了操作序列、每次开盘后的账户轨迹指纹和终局指纹。
 *
 * 0.4 重做：真实行情下涨跌来自行情段，不可能再和 0.3.0 逐位相同；这个测试只在"0.3 合成行情模式"下跑
 * （createRun 不给行情段，也是离线、数据加载失败时的兜底），保证兜底的合成行情还是原汁原味的 0.3。
 */
interface Run {
  seed: string;
  setup: RunSetup;
  bot: string;
  actions: string;
  account: number;
  phase: string;
  trail: string;
  final: string;
}

const fixture = REPLAY_030 as unknown as { runs: Run[] };

function dec(code: string): Action {
  const [a = '', b] = code.slice(1).split('.');
  const slot = b === undefined ? undefined : Number(b);
  switch (code[0]) {
    case 'o':
      return { type: 'open' };
    case 'b':
      return slot === undefined ? { type: 'buy', rec: Number(a) } : { type: 'buy', rec: Number(a), slot };
    case 's':
      return { type: 'sell', slot: Number(a) };
    case 'p':
      return slot === undefined ? { type: 'pickReward', index: Number(a) } : { type: 'pickReward', index: Number(a), slot };
    case 'k':
      return { type: 'skipReward' };
    case 'c':
      return { type: 'choose', option: Number(a) };
  }
  throw new Error(`坏操作 ${code}`);
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 和生成基准时同样的终局指纹（只取 0.3.0 就有的数值字段）。 */
function snap(s: GameState): unknown {
  const st = s.stats;
  return {
    phase: s.phase,
    month: s.month,
    dayIndex: s.dayIndex,
    account: s.account,
    mood: s.mood,
    slots: s.slots.map((h) => h && [h.stockId, h.value, h.boughtDay, h.todayRet]),
    items: s.items,
    friends: s.friends.map((f) => [f.id, f.hits, f.total]),
    themes: s.themeIds.map((id) => [id, s.themes[id]?.heat, s.themes[id]?.stage, s.themes[id]?.left]),
    stats: [st.days, st.buys, st.sells, st.limitUpDays, st.maxBoards, st.chains, st.peakAccount, st.billsPaid, st.trades.length, st.monthRets, st.crashRet],
    bill: s.bill.amount,
    reward: s.reward && s.reward.cards.map((c) => c.id),
    event: s.event && s.event.id,
  };
}

describe('规则不变：和 0.3.0 逐位相同', () => {
  it('基准覆盖 5 个人设 × 第 1、4、8 级', () => {
    const keys = new Set(fixture.runs.map((r) => `${r.setup.persona}:${r.setup.difficulty}`));
    expect(keys.size).toBe(15);
  });

  for (const run of fixture.runs) {
    it(`${run.seed}（${run.bot}，${run.phase}）`, () => {
      // 0.3 合成行情模式：不给行情段
      let s = createRun(run.seed, run.setup, { segment: null }).state;
      expect(s.real).toBeNull();
      const trail: unknown[] = [];
      for (const code of run.actions.split(',')) {
        const a = dec(code);
        const r = dispatch(s, a, { events: false });
        expect(r.error, code).toBeNull();
        s = r.state;
        if (a.type === 'open') trail.push([s.account, s.dayIndex, s.month, s.phase]);
      }
      expect(s.phase).toBe(run.phase);
      expect(s.account).toBe(run.account);
      expect(fnv(JSON.stringify(trail))).toBe(run.trail);
      expect(fnv(JSON.stringify(snap(s)))).toBe(run.final);
    });
  }
});
