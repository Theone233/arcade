import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  baseBill,
  canSell,
  createRun,
  daysInMonth,
  dirOf,
  dispatch,
  effectiveDH,
  flipDir,
  fx,
  itemView,
  rulesOf,
  stockById,
  themeBoard,
  chatView,
  type GameEvent,
  type GameState,
} from '../src/core/index.ts';
import { SIX, fixedDay, must, quiet, withBalance } from './helpers.ts';

function triggers(events: readonly GameEvent[], id: string): GameEvent[] {
  return events.filter((e) => e.type === 'itemTriggered' && e.itemId === id);
}

/** 开盘前把所有题材今天的热度变化定成 dH（热度 30、主升）。 */
function setAll(s: GameState, dH: number): void {
  for (const id of s.themeIds) {
    const t = s.themes[id];
    if (!t) continue;
    t.heat = 30;
    t.history = [30];
    t.stage = 'rally';
    t.left = 5;
    s.today.plan.dH[id] = dH;
  }
  s.today.plan.marketRet = 0;
}

describe('0.3.0 新增道具（8 个）', () => {
  it('每个都有说明、分类和俏皮话', () => {
    for (const id of ['hot_money', 'value_eye', 'fan_qunzhu', 'diversify', 'fomo', 'night_review', 'crowd_fund', 'rumor_mill']) {
      const v = itemView(id);
      expect(v.desc.length, id).toBeGreaterThan(6);
      expect(v.flavor.length, id).toBeGreaterThan(4);
    }
  });

  it('游资席位：当天第一只买入的股票当天涨停，额外 +3%；第二只不算', () => {
    withBalance(quiet, () => {
      let s = createRun('hot', { themes: SIX, items: ['hot_money', 'double_buy'], account: 1e6 }).state;
      setAll(s, 60);
      s = must(s, { type: 'buy', rec: 0, slot: 0 }).state;
      s = must(s, { type: 'buy', rec: 1, slot: 1 }).state;
      expect(s.slots[0]?.firstBuy).toBe(true);
      expect(s.slots[1]?.firstBuy).toBe(false);
      const r = must(s, { type: 'open' });
      const h0 = r.state.lastDay?.holdings.find((h) => h.slot === 0);
      const h1 = r.state.lastDay?.holdings.find((h) => h.slot === 1);
      const limit = (id: string): number => BALANCE.roles[stockById(id).role].limit;
      expect(h0?.ret).toBeCloseTo(limit(h0?.stockId ?? '') + fx('hot_money', 'bonus'), 5);
      expect(h1?.ret).toBeCloseTo(limit(h1?.stockId ?? ''), 5);
      expect(triggers(r.events, 'hot_money')).toHaveLength(1);
      // 第二天（不是买入当天）不再触发
      setAll(r.state, 60);
      expect(triggers(must(r.state, { type: 'open' }).events, 'hot_money')).toHaveLength(0);
    });
  });

  it('价值眼光：月底还月供前，持有的白马每只 +2%，账户按权重同步增加', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['value_eye'], holdings: ['con_blue', 'ai_leader'], account: 1e6 }, {});
      s.dayInMonth = daysInMonth(1) - 1;
      const r = must(s, { type: 'open' });
      const t = triggers(r.events, 'value_eye');
      expect(t).toHaveLength(1);
      expect(t[0]).toMatchObject({ stockId: 'con_blue' });
      const blue = r.state.slots.find((h) => h?.stockId === 'con_blue');
      expect(blue?.value).toBeCloseTo(1 + fx('value_eye', 'bonus') / 100, 6);
      const paid = r.events.find((e) => e.type === 'billPaid');
      const before = r.state.lastDay?.account.after ?? 0;
      expect(paid && paid.type === 'billPaid' ? paid.before : 0).toBeCloseTo(before * (1 + fx('value_eye', 'bonus') / 4 / 100), 0);
    });
  });

  it('反着信群主：群主的消息带"反指"标记，反过来读约 70% 准', () => {
    let n = 0;
    let hit = 0;
    for (let k = 0; k < 40; k++) {
      let s = createRun(`fan-${k}`, { account: 1e9, items: ['fan_qunzhu'] }).state;
      for (let d = 0; d < 58 && s.phase !== 'won'; d++) {
        if (s.phase === 'premarket') {
          for (const m of s.today.messages) {
            if (m.friendId !== 'qunzhu') {
              expect(m.reverse).toBeUndefined();
              continue;
            }
            expect(m.reverse).toBe(true);
            const t = s.themes[m.theme];
            const truth = dirOf(t ? effectiveDH(t.heat, s.today.plan.dH[m.theme] ?? 0) : 0);
            n += 1;
            if (flipDir(m.claim) === truth) hit += 1;
          }
          const v = chatView(s).messages.find((m) => m.reverse);
          if (v) expect(v.readAs).toBe(flipDir(v.claim));
        }
        const a = s.phase === 'premarket' ? { type: 'open' as const } : s.phase === 'reward' ? { type: 'skipReward' as const } : { type: 'choose' as const, option: 1 };
        s = dispatch(s, a, { inPlace: true, events: false }).state;
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(Math.abs(hit / n - fx('fan_qunzhu', 'acc'))).toBeLessThan(0.05);
  });

  it('分散投资：持仓覆盖 4 个题材时账户亏损 ×0.7；3 个题材不打折；赚钱不打折', () => {
    withBalance(quiet, () => {
      const four = fixedDay({ items: ['diversify'], holdings: ['ai_leader', 'ne_leader', 'con_leader', 'fin_leader'] }, { ai: -10, newenergy: -10, consumer: -10, finance: -10 });
      const r4 = must(four, { type: 'open' });
      expect(r4.state.lastDay?.account.ret).toBeCloseTo((r4.state.lastDay?.account.gross ?? 0) * fx('diversify', 'lossMult'), 1);
      expect(triggers(r4.events, 'diversify')).toHaveLength(1);
      const three = fixedDay({ items: ['diversify'], holdings: ['ai_leader', 'ne_leader', 'con_leader'] }, { ai: -10, newenergy: -10, consumer: -10 });
      const r3 = must(three, { type: 'open' }).state.lastDay;
      expect(r3?.account.ret).toBeCloseTo(r3?.account.gross ?? 0, 2);
      const up = fixedDay({ items: ['diversify'], holdings: ['ai_leader', 'ne_leader', 'con_leader', 'fin_leader'] }, { ai: 10, newenergy: 10, consumer: 10, finance: 10 });
      const ru = must(up, { type: 'open' }).state.lastDay;
      expect(ru?.account.ret).toBeCloseTo(ru?.account.gross ?? 0, 2);
    });
  });

  it('FOMO 体质：取消 T+1（当天买的当天能卖、能换，止损当天生效）；推荐多 1 只', () => {
    let s = createRun('fomo', { themes: SIX, items: ['fomo', 'zhisun'] }).state;
    expect(s.today.recs).toHaveLength(BALANCE.recs + fx('fomo', 'recs'));
    s = must(s, { type: 'buy', rec: 0, slot: 0 }).state;
    expect(canSell(s, 0)).toBe(true);
    expect(dispatch(s, { type: 'sell', slot: 0 }).error).toBeNull();
    withBalance(quiet, () => {
      setAll(s, -40);
      const r = must(s, { type: 'open' });
      expect(r.state.slots[0]).toBeNull();
      expect(r.events.find((e) => e.type === 'autoSold')).toMatchObject({ reason: 'stop' });
    });
    const plain = must(createRun('fomo', { themes: SIX }).state, { type: 'buy', rec: 0, slot: 0 }).state;
    expect(canSell(plain, 0)).toBe(false);
  });

  it('熬夜复盘：每天收盘后揭示一个题材当天的真实阶段，只在第二天盘前显示；没有道具时不揭示', () => {
    const s = createRun('night', { items: ['night_review'] }).state;
    const r = must(s, { type: 'open' });
    const rev = r.state.review;
    expect(rev).not.toBeNull();
    expect(rev?.day).toBe(0);
    expect(rev?.stage).toBe(r.state.lastDay?.themes.find((t) => t.id === rev?.theme)?.stage);
    expect(r.events.find((e) => e.type === 'themeReviewed')).toMatchObject({ theme: rev?.theme, stage: rev?.stage });
    const board = themeBoard(r.state);
    const shown = board.filter((c) => c.stage !== null);
    expect(shown.map((c) => c.id)).toEqual([rev?.theme]);
    expect(shown[0]?.reviewed).toBe(true);
    // 过了一天，旧的揭示失效（换成新的一条）
    const r2 = must(r.state, { type: 'open' });
    expect(r2.state.review?.day).toBe(1);
    expect(themeBoard(r2.state).filter((c) => c.stage !== null)).toHaveLength(1);
    // 没有道具
    const plain = must(createRun('night').state, { type: 'open' }).state;
    expect(plain.review).toBeNull();
    expect(themeBoard(plain).every((c) => c.stage === null)).toBe(true);
  });

  it('众筹炒股：常规月供 ×0.9（突发账单不打折）', () => {
    const s = createRun('crowd', { items: ['crowd_fund'] }).state;
    const extras = (s.bill.extras ?? []).reduce((a, x) => a + x.amount, 0);
    expect(s.bill.amount - extras).toBe(Math.round((baseBill(1) * fx('crowd_fund', 'billMult')) / 100) * 100);
    expect(rulesOf(s).billMult).toBeCloseTo(fx('crowd_fund', 'billMult'));
  });

  it('小道消息：群聊每天多 1 条消息', () => {
    for (let k = 0; k < 20; k++) {
      const s = createRun(`rumor-${k}`, { items: ['rumor_mill'] }).state;
      expect(s.today.messages.length).toBeGreaterThanOrEqual(BALANCE.messages[0] + 1);
      expect(s.today.messages.length).toBeLessThanOrEqual(BALANCE.messages[1] + 1);
    }
  });
});
