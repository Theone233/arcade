import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  DIFFICULTIES,
  MONTHS,
  fx,
  SURPRISE_BILLS,
  baseBill,
  canSell,
  createRun,
  credibility,
  marketRulesFor,
  rulesOf,
  type DifficultyDef,
  daysInMonth,
  dispatch,
  replay,
  stockById,
  surprisePlan,
  totalDays,
  validate,
  type Action,
  type GameState,
} from '../src/core/index.ts';
import { botByName, playRun } from '../tools/bots.ts';
import { SIX, fixedDay, must, quiet, run, withBalance } from './helpers.ts';

/** 一直开盘（奖励都不要、事件都选 1），直到满足条件。 */
function openUntil(s: GameState, stop: (s: GameState) => boolean, limit = 200): GameState {
  let st = s;
  for (let i = 0; i < limit && !stop(st) && st.phase !== 'won' && st.phase !== 'lost'; i++) {
    const a: Action = st.phase === 'premarket' ? { type: 'open' } : st.phase === 'reward' ? { type: 'skipReward' } : { type: 'choose', option: 1 };
    st = must(st, a).state;
  }
  return st;
}

describe('开局与日历', () => {
  it('开局：账户 10 万、4 格空仓、6 个群友、6 个题材、1 月第 1 天', () => {
    const s = createRun('start').state;
    expect(s.account).toBe(BALANCE.startAccount);
    expect(s.slots).toEqual([null, null, null, null]);
    expect(s.friends.map((f) => f.id)).toEqual(['xiaoli', 'laowang', 'zhangjie', 'qunzhu', 'laozhao', 'dav']);
    expect(s.themeIds).toHaveLength(6);
    expect(s.items).toEqual([]);
    expect(s.month).toBe(1);
    expect(s.dayInMonth).toBe(0);
    expect(s.phase).toBe('premarket');
    expect(s.today.recs).toHaveLength(3);
    expect(s.today.messages.length).toBeGreaterThanOrEqual(2);
    expect(s.today.messages.length).toBeLessThanOrEqual(4);
    expect(s.bill).toEqual({ month: 1, name: '房租', amount: baseBill(1), extras: [] });
  });

  it('一局 12 个月、58 个交易日，10 月只有 3 天', () => {
    expect(MONTHS).toBe(12);
    expect(totalDays()).toBe(58);
    expect(daysInMonth(10)).toBe(3);
    expect(daysInMonth(1)).toBe(5);
  });

  it('月供逐月上涨，12 月约为 1 月的 3–5 倍', () => {
    for (let m = 2; m <= MONTHS; m++) expect(baseBill(m)).toBeGreaterThan(baseBill(m - 1));
    expect(baseBill(MONTHS) / baseBill(1)).toBeGreaterThanOrEqual(3);
    expect(baseBill(MONTHS) / baseBill(1)).toBeLessThanOrEqual(5);
  });

  it('不同种子登场的题材不同，同一种子相同', () => {
    const a = createRun('themes-a').state.themeIds;
    expect(createRun('themes-a').state.themeIds).toEqual(a);
    const all = new Set<string>();
    for (let i = 0; i < 30; i++) for (const t of createRun(`themes-${i}`).state.themeIds) all.add(t);
    expect(all.size).toBe(8);
  });

  it('开局设置：道具、群友、持仓、指定题材；非法设置报错', () => {
    const s = createRun('setup', { themes: SIX, items: ['extra_slot', 'paid_group'], holdings: ['ai_leader'] }).state;
    expect(s.slots).toHaveLength(5);
    expect(s.slots[0]?.stockId).toBe('ai_leader');
    expect(s.friends.map((f) => f.id)).toContain('neimu');
    expect(() => createRun('x', { items: ['nope'] })).toThrow();
    expect(() => createRun('x', { themes: ['ai'] })).toThrow();
    expect(() => createRun('x', { themes: SIX, holdings: ['gm_leader'] })).toThrow();
  });
});

describe('确定性与回放', () => {
  it('同一种子 + 同样的操作得到同样的局面；回放与逐步执行一致', () => {
    for (const name of ['normal', 'smart', 'random']) {
      const s = playRun(`det-${name}`, botByName(name));
      expect(['won', 'lost']).toContain(s.phase);
      expect(replay(s.seed, s.actions, s.setup)).toEqual(s);
      const again = playRun(`det-${name}`, botByName(name));
      expect(again).toEqual(s);
    }
  });

  it('dispatch 不修改传入的状态（除非 inPlace）', () => {
    const s = createRun('pure').state;
    const snapshot = structuredClone(s);
    dispatch(s, { type: 'buy', rec: 0 });
    dispatch(s, { type: 'open' });
    expect(s).toEqual(snapshot);
  });

  it('玩家的操作不扰动行情：买不买股票，题材热度走势都一样', () => {
    const a = openUntil(createRun('market-iso').state, (s) => s.dayIndex >= 8);
    let b = must(createRun('market-iso').state, { type: 'buy', rec: 0 }).state;
    b = openUntil(b, (s) => s.dayIndex >= 8);
    for (const id of a.themeIds) expect(b.themes[id]?.history).toEqual(a.themes[id]?.history);
  });

  it('非法操作返回原因、状态不变', () => {
    const s = createRun('invalid').state;
    expect(dispatch(s, { type: 'sell', slot: 0 }).error).toBe('这个位置是空的');
    expect(dispatch(s, { type: 'buy', rec: 9 }).error).toBe('没有这条推荐');
    expect(dispatch(s, { type: 'pickReward', index: 0 }).error).toBe('现在不是领奖励的时候');
    expect(dispatch(s, { type: 'choose', option: 0 }).error).toBe('现在没有事件');
    expect(validate(s, { type: 'nope' } as unknown as Action)).toContain('未知操作');
    const r = dispatch(s, { type: 'sell', slot: 0 });
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });
});

describe('持仓', () => {
  it('每格占账户的 1/格数，空格是现金：账户日收益 = Σ 每格收益 / 格数', () => {
    withBalance(quiet, () => {
      let s = fixedDay({ holdings: ['ai_leader', 'ne_leader'] }, { ai: 10, newenergy: -10 });
      s = must(s, { type: 'open' }).state;
      const r = s.lastDay;
      expect(r).not.toBeNull();
      const ai = r?.holdings.find((h) => h.stockId === 'ai_leader')?.ret ?? 0;
      const ne = r?.holdings.find((h) => h.stockId === 'ne_leader')?.ret ?? 0;
      expect(ai).toBeCloseTo(1.5 * BALANCE.heat.coef * 10, 1);
      expect(ne).toBeCloseTo(-1.5 * BALANCE.heat.coef * 10, 1);
      expect(r?.account.gross).toBeCloseTo((ai + ne) / 4, 1);
      expect(s.account).toBeCloseTo(BALANCE.startAccount * (1 + (ai + ne) / 400), 0);
    });
  });

  it('T+1：当天买入的不能卖，也不能被替换；第二天可以卖', () => {
    let s = createRun('t1').state;
    s = must(s, { type: 'buy', rec: 0, slot: 2 }).state;
    expect(s.slots[2]?.stockId).toBe(s.today.recs[0]?.stockId);
    expect(canSell(s, 2)).toBe(false);
    expect(dispatch(s, { type: 'sell', slot: 2 }).error).toBe('今天买的，明天才能卖');
    s = must(s, { type: 'open' }).state;
    expect(canSell(s, 2)).toBe(true);
    const sold = must(s, { type: 'sell', slot: 2 });
    expect(sold.state.slots[2]).toBeNull();
    expect(sold.events.some((e) => e.type === 'sold')).toBe(true);
  });

  it('每天只能买 1 只；同一只不能重复持有；满仓要指定替换的格子', () => {
    let s = createRun('buys').state;
    s = must(s, { type: 'buy', rec: 0 }).state;
    expect(s.today.recs[0]?.taken).toBe(true);
    expect(dispatch(s, { type: 'buy', rec: 1 }).error).toBe('今天能买的次数用完了');
    s = run(s, [{ type: 'open' }]);
    // 塞满 4 格
    s = run(createRun('full', { themes: SIX, holdings: ['ai_leader', 'ne_leader', 'con_leader', 'fin_leader'] }).state, []);
    expect(dispatch(s, { type: 'buy', rec: 0 }).error).toBe('手里已经拿满了，要先卖掉一只，或者选一只换掉');
    const rec = s.today.recs.findIndex((r) => !s.slots.some((h) => h?.stockId === r.stockId));
    const r = must(s, { type: 'buy', rec, slot: 1 });
    expect(r.events.find((e) => e.type === 'bought')).toMatchObject({ slot: 1, replaced: 'ne_leader' });
    expect(r.state.stats.trades.at(-1)).toMatchObject({ stockId: 'ne_leader', reason: 'replace' });
  });

  it('持有收益按复利累计', () => {
    withBalance(quiet, () => {
      let s = fixedDay({ holdings: ['ai_leader'] }, { ai: 10 });
      s = must(s, { type: 'open' }).state;
      const first = s.slots[0]?.value ?? 0;
      expect(first).toBeCloseTo(1 + (1.5 * BALANCE.heat.coef * 10) / 100, 4);
      expect(s.slots[0]?.todayRet).toBeCloseTo(1.5 * BALANCE.heat.coef * 10, 1);
    });
  });
});

describe('月供、奖励与结局', () => {
  it('月底收盘后还月供；够还就进入三选一奖励', () => {
    let s = createRun('bill').state;
    s = openUntil(s, (x) => x.phase !== 'premarket');
    expect(s.phase === 'reward' || s.phase === 'lost').toBe(true);
    if (s.phase === 'reward') {
      expect(s.stats.billsPaid).toBe(1);
      expect(s.reward?.cards.length).toBe(BALANCE.reward.cards);
    }
  });

  it('账户不够还月供就爆仓；有信用卡时代还一次，下月月供 ×1.2，信用卡用掉', () => {
    let s = createRun('broke', { account: 1000 }).state;
    s = openUntil(s, (x) => x.phase !== 'premarket');
    expect(s.phase).toBe('lost');
    expect(s.endReason).toBe('bankrupt');

    let c = createRun('broke', { account: 1000, items: ['credit'] }).state;
    const events: string[] = [];
    for (let i = 0; i < 10 && c.month === 1 && c.phase === 'premarket'; i++) {
      const r = must(c, { type: 'open' });
      c = r.state;
      for (const e of r.events) events.push(e.type);
    }
    expect(events).toContain('billPaid');
    expect(c.items).not.toContain('credit');
    expect(c.phase).toBe('reward');
    c = must(c, { type: 'skipReward' }).state;
    if (c.phase === 'event') c = must(c, { type: 'choose', option: 1 }).state;
    const extra2 = (c.bill.extras ?? []).reduce((t, x) => t + x.amount, 0);
    expect(c.bill.amount - extra2).toBe(Math.round((baseBill(2) * 1.2) / 100) * 100);
  });

  it('突发账单：一局 2–3 次，各落在自己的窗口里，名目不重复，金额在范围内（取整到百元）', () => {
    const counts = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const plan = surprisePlan(`sp-${i}`);
      counts.add(plan.length);
      expect(plan.length).toBeGreaterThanOrEqual(BALANCE.surprise.count[0]);
      expect(plan.length).toBeLessThanOrEqual(BALANCE.surprise.count[1]);
      expect(new Set(plan.map((p) => p.extra.id)).size).toBe(plan.length);
      plan.forEach((p, k) => {
        const [lo, hi] = BALANCE.surprise.windows[k] as readonly [number, number];
        expect(p.month).toBeGreaterThanOrEqual(lo);
        expect(p.month).toBeLessThanOrEqual(hi);
        const [a, b] = BALANCE.surprise.amounts[p.extra.id] as readonly [number, number];
        expect(p.extra.amount % 100).toBe(0);
        expect(p.extra.amount).toBeGreaterThanOrEqual(Math.floor(a / 100) * 100);
        expect(p.extra.amount).toBeLessThanOrEqual(Math.ceil(b / 100) * 100);
        expect(SURPRISE_BILLS.find((d) => d.id === p.extra.id)?.name).toBe(p.extra.name);
      });
      expect(surprisePlan(`sp-${i}`)).toEqual(plan);
    }
    expect(counts).toEqual(new Set([2, 3]));
  });

  it('突发账单在月初和月供一起公布：总额 = 常规月供 + 突发，月底按总额扣', () => {
    let seen = 0;
    for (let i = 0; i < 20 && seen < 3; i++) {
      const seed = `spm-${i}`;
      const plan = surprisePlan(seed);
      let s = createRun(seed, { account: 1e9 }).state;
      for (let k = 0; k < 400 && s.phase !== 'won'; k++) {
        const r = must(s, s.phase === 'premarket' ? { type: 'open' } : s.phase === 'reward' ? { type: 'skipReward' } : { type: 'choose', option: 1 });
        s = r.state;
        for (const e of r.events) {
          if (e.type === 'monthStarted') {
            const want = plan.filter((p) => p.month === e.month).map((p) => p.extra);
            expect(e.bill.extras ?? []).toEqual(want);
            expect(e.bill.amount).toBe(baseBill(e.month) + want.reduce((t, x) => t + x.amount, 0));
            if (want.length > 0) seen += 1;
          }
          if (e.type === 'billPaid') expect(e.before - e.after).toBeCloseTo(e.amount, 2);
        }
      }
      expect(s.phase).toBe('won');
    }
    expect(seen).toBeGreaterThanOrEqual(3);
  });

  it('还清 12 个月即通关，最终账户记录在局面里', () => {
    const s = openUntil(createRun('win', { account: 1e9 }).state, () => false, 500);
    expect(s.phase).toBe('won');
    expect(s.stats.billsPaid).toBe(12);
    expect(s.month).toBe(12);
    expect(s.dayIndex).toBe(58);
    expect(dispatch(s, { type: 'open' }).error).toBe('本局已结束');
  });

  it('领奖励：道具、群友、稀有股票（所在题材进入萌芽并放进持仓）', () => {
    let found = { item: false, friend: false, stock: false };
    for (let i = 0; i < 40 && !(found.item && found.friend && found.stock); i++) {
      const s = openUntil(createRun(`reward-${i}`, { account: 1e7 }).state, (x) => x.phase === 'reward');
      const cards = s.reward?.cards ?? [];
      cards.forEach((c, index) => {
        if (found[c.kind]) return;
        const r = must(s, c.kind === 'stock' ? { type: 'pickReward', index, slot: 3 } : { type: 'pickReward', index });
        if (c.kind === 'item') expect(r.state.items).toContain(c.id);
        if (c.kind === 'friend') expect(r.state.friends.map((f) => f.id)).toContain(c.id);
        if (c.kind === 'stock') {
          expect(r.state.slots[3]?.stockId).toBe(c.id);
          const theme = r.state.themes[stockById(c.id).theme];
          expect(theme?.stage).toBe('sprout');
          expect(theme?.sure).toBe(true);
        }
        found = { ...found, [c.kind]: true };
      });
    }
    expect(found).toEqual({ item: true, friend: true, stock: true });
  });
});

describe('难度接口（1..8 级，逐级叠加）', () => {
  it('缺省 1 级（0.3.0-alpha.1 的 0 也按 1）；高等级包含低等级的全部约束', () => {
    const list = DIFFICULTIES as DifficultyDef[];
    expect(list.map((d) => d.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(createRun('diff').state.difficulty).toBe(1);
    expect(createRun('diff', { difficulty: 0 }).state.difficulty).toBe(1);
    expect(() => createRun('diff', { difficulty: 9 })).toThrow();
    const s1 = createRun('diff', { difficulty: 1 }).state;
    const s4 = createRun('diff', { difficulty: 4 }).state;
    expect(s4.bill.amount).toBe(Math.round((baseBill(1) * fx('choppy', 'billMult')) / 100) * 100 + (s4.bill.extras ?? []).reduce((a, x) => a + x.amount, 0));
    const noise = fx('fake_news', 'noise');
    expect(credibility(s4, 'laowang', 'finance', rulesOf(s4))).toBeCloseTo(credibility(s1, 'laowang', 'finance', rulesOf(s1)) * (1 - noise) + noise / 3);
    expect(marketRulesFor(1, 3).bearBias).toBeGreaterThan(marketRulesFor(1, 2).bearBias);
    expect(marketRulesFor(1, 5).blowMult).toBeCloseTo(fx('regulation', 'blowMult'));
    expect(marketRulesFor(1, 4).blowMult).toBe(1);
  });
});
