import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  ITEMS,
  createRun,
  dispatch,
  fx,
  itemView,
  rulesOf,
  stockById,
  themeBoard,
  type GameEvent,
  type GameState,
} from '../src/core/index.ts';
import { SIX, fixedDay, must, quiet, withBalance } from './helpers.ts';

const C = (): number => BALANCE.heat.coef;

/** 安静行情下开盘一次，返回新局面、事件和某只股票那一格的结算。 */
function openOnce(s: GameState): { state: GameState; events: GameEvent[]; ret: (id: string) => number | undefined } {
  const r = must(s, { type: 'open' });
  const ret = (id: string) => r.state.lastDay?.holdings.find((h) => h.stockId === id)?.ret;
  return { ...r, ret };
}

function triggers(events: readonly GameEvent[], id: string): GameEvent[] {
  return events.filter((e) => e.type === 'itemTriggered' && e.itemId === id);
}

describe('道具（24 + 0.4 C 4 个，id 固定）', () => {
  it('id 与设计稿一致，每个都有说明和分类', () => {
    expect(ITEMS.map((d) => d.id)).toEqual([
      'longtou',
      'genfeng',
      'baima',
      'yaogu',
      'lianban',
      'dixi',
      'zhisun',
      'zhiying',
      'extra_slot',
      'double_buy',
      'margin',
      'ipo',
      'credit',
      'paid_group',
      'notebook',
      'mood_meter',
      'hot_money',
      'value_eye',
      'fan_qunzhu',
      'diversify',
      'fomo',
      'night_review',
      'crowd_fund',
      'rumor_mill',
      // 0.4 C（只在有新机制的局里出现）
      'short_permit',
      'sunglasses',
      'banker',
      'pyramid',
    ]);
    for (const d of ITEMS) {
      const v = itemView(d.id);
      expect(v.desc.length).toBeGreaterThan(4);
      expect(v.flavor.length).toBeGreaterThan(2);
      expect(['打法', '工具', '人脉']).toContain(v.kindLabel);
    }
  });

  it('龙头战法：持有的龙头涨停时，同题材其他持仓再 +3%', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['longtou'], holdings: ['ai_leader', 'ai_meme', 'ne_meme'] }, { ai: 20, newenergy: 20 });
      const { ret, events } = openOnce(s);
      expect(ret('ai_leader')).toBe(10);
      expect(ret('ai_meme')).toBeCloseTo(Math.min(10, C() * 20) + fx('longtou', 'bonus'), 2);
      expect(ret('ne_meme')).toBeCloseTo(Math.min(10, C() * 20), 2);
      expect(triggers(events, 'longtou')).toHaveLength(1);
    });
  });

  it('跟风大法：跟风股跟涨龙头的效果 ×2', () => {
    withBalance(quiet, () => {
      const dH = Math.ceil(10 / (1.5 * C())) + 1;
      const base = fixedDay({ holdings: ['ai_follower'] }, { ai: dH });
      const plain = openOnce(base).ret('ai_follower') ?? 0;
      const s = fixedDay({ items: ['genfeng'], holdings: ['ai_follower'] }, { ai: dH });
      const { ret, events } = openOnce(s);
      expect(ret('ai_follower')).toBeCloseTo(plain + BALANCE.chain, 2);
      expect(triggers(events, 'genfeng')).toHaveLength(1);
    });
  });

  it('白马信仰：白马股的亏损减半，赚钱不变', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['baima'], holdings: ['con_blue', 'fin_blue'] }, { consumer: -10, finance: 10 });
      const { ret } = openOnce(s);
      expect(ret('con_blue')).toBeCloseTo(0.5 * 0.5 * C() * -10, 1);
      expect(ret('fin_blue')).toBeCloseTo(0.5 * C() * 10, 1);
    });
  });

  it('妖股猎人：妖股涨停当天按 +15% 计', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['yaogu'], holdings: ['ai_meme', 'ai_leader'] }, { ai: 40 });
      const { ret, events } = openOnce(s);
      expect(ret('ai_meme')).toBe(fx('yaogu', 'limitUpAs'));
      expect(ret('ai_leader')).toBe(10);
      expect(triggers(events, 'yaogu')).toHaveLength(1);
    });
  });

  it('连板梦：持仓的连板动量 ×2（炸板率 ×1.5 见行情测试）', () => {
    withBalance(
      (b) => {
        quiet(b);
        b.boards.blow = 0;
      },
      () => {
        const s = fixedDay({ items: ['lianban'], holdings: ['ai_leader'] }, { ai: 0, newenergy: 0 });
        const st = s.stocks.ai_leader;
        if (st) st.boards = 2;
        const ne = s.stocks.ne_leader;
        if (ne) ne.boards = 2;
        const { state } = openOnce(s);
        expect(state.lastDay?.stocks.find((m) => m.id === 'ai_leader')?.move).toBeCloseTo(2 * 2 * BALANCE.boards.momentum, 2);
        expect(state.lastDay?.stocks.find((m) => m.id === 'ne_leader')?.move).toBeCloseTo(2 * BALANCE.boards.momentum, 2);
        expect(rulesOf(state).blowMult).toBe(fx('lianban', 'blowMult'));
      },
    );
  });

  it('低吸大师：冷门或降温时买入的股票，之后每逢主升日额外 +2%', () => {
    withBalance(quiet, () => {
      let s = createRun('dixi', { themes: SIX, items: ['dixi'] }).state;
      const rec = s.today.recs[0];
      if (!rec) throw new Error('no rec');
      const id = stockById(rec.stockId).theme;
      const th = s.themes[id];
      if (!th) throw new Error('no theme');
      // 把推荐第一只的题材摆成冷门，再买
      th.heat = 10;
      th.history = [10, 10];
      s = must(s, { type: 'buy', rec: 0, slot: 0 }).state;
      expect(s.slots[0]?.lowBuy).toBe(true);
      const t1 = s.themes[id];
      if (t1) t1.stage = 'rally';
      s.today.plan.dH[id] = 0;
      const first = openOnce(s);
      expect(first.state.lastDay?.holdings[0]?.steps.some((x) => x.source === 'dixi')).toBe(true);
      expect(triggers(first.events, 'dixi')).toHaveLength(1);
      // 非主升日不触发
      const s2 = first.state;
      const t2 = s2.themes[id];
      if (t2) t2.stage = 'climax';
      s2.today.plan.dH[id] = 0;
      expect(triggers(openOnce(s2).events, 'dixi')).toHaveLength(0);
    });
  });

  it('止损单：单只持仓当日跌超 4% 时按 −4% 卖出（当天买入的不触发）', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['zhisun'], holdings: ['ai_leader', 'ne_leader'] }, { ai: -20, newenergy: -5 });
      const { ret, state, events } = openOnce(s);
      expect(ret('ai_leader')).toBe(fx('zhisun', 'stop'));
      expect(state.slots[0]).toBeNull();
      expect(ret('ne_leader')).toBeCloseTo(-1.5 * C() * 5, 1);
      expect(state.slots[1]?.stockId).toBe('ne_leader');
      expect(events.find((e) => e.type === 'autoSold')).toMatchObject({ stockId: 'ai_leader', reason: 'stop' });
      // 当天买入的不触发
      let t = createRun('stop-t1', { themes: SIX, items: ['zhisun'] }).state;
      t = must(t, { type: 'buy', rec: 0, slot: 0 }).state;
      const id = t.slots[0]?.stockId ?? '';
      for (const th of t.themeIds) {
        t.today.plan.dH[th] = -30;
        const tm = t.themes[th];
        if (tm) tm.heat = 80;
      }
      const r = openOnce(t);
      expect(r.state.slots[0]?.stockId).toBe(id);
      expect(r.ret(id)).toBeLessThan(fx('zhisun', 'stop'));
    });
  });

  it('止盈单：累计盈利超过 25% 之后，哪天一跌就自动卖出并额外 +3%；还在涨就继续拿', () => {
    withBalance(quiet, () => {
      const up = fixedDay({ items: ['zhiying'], holdings: ['ai_leader'] }, { ai: 30 });
      const hu = up.slots[0];
      if (hu) hu.value = 1.3;
      const ru = openOnce(up);
      expect(ru.ret('ai_leader')).toBe(10);
      expect(ru.state.slots[0]?.stockId).toBe('ai_leader');
      const down = fixedDay({ items: ['zhiying'], holdings: ['ai_leader', 'ne_leader'] }, { ai: -4, newenergy: -4 });
      const hd = down.slots[0];
      if (hd) hd.value = 1.3;
      const hn = down.slots[1];
      if (hn) hn.value = 1.2;
      const { ret, state } = openOnce(down);
      expect(ret('ai_leader')).toBeCloseTo(-1.5 * C() * 4 + fx('zhiying', 'bonus'), 2);
      expect(state.slots[0]).toBeNull();
      expect(state.slots[1]?.stockId).toBe('ne_leader');
      expect(state.stats.trades.at(-1)).toMatchObject({ reason: 'take' });
    });
  });

  it('多开一格：持仓格 +1；不满 5 只时每只仍占 1/4，拿满 5 只时每只占 1/(4 + share)', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['extra_slot'], holdings: ['ai_leader'] }, { ai: 10 });
      expect(s.slots).toHaveLength(5);
      const { state } = openOnce(s);
      expect(state.lastDay?.account.gross).toBeCloseTo((1.5 * C() * 10) / 4, 1);
      const full = fixedDay({ items: ['extra_slot'], holdings: ['ai_leader', 'ne_leader', 'con_leader', 'fin_leader', 'pig_leader'] }, { ai: 10 });
      const r = openOnce(full).state.lastDay;
      expect(r?.account.gross).toBeCloseTo((1.5 * C() * 10) / (4 + fx('extra_slot', 'share')), 1);
    });
  });

  it('手快：每天可以多买一只', () => {
    let s = createRun('fast', { items: ['double_buy'] }).state;
    expect(s.today.buysLeft).toBe(2);
    s = must(s, { type: 'buy', rec: 0 }).state;
    s = must(s, { type: 'buy', rec: 1 }).state;
    expect(dispatch(s, { type: 'buy', rec: 2 }).error).toBe('今天能买的次数用完了');
  });

  it('两融账户：账户日收益 ×倍数，亏损也一样', () => {
    withBalance(quiet, () => {
      for (const dH of [10, -10]) {
        const s = fixedDay({ items: ['margin'], holdings: ['ai_leader'] }, { ai: dH });
        const { state } = openOnce(s);
        const r = state.lastDay;
        expect(r?.account.ret).toBeCloseTo((r?.account.gross ?? 0) * fx('margin', 'mult'), 1);
      }
    });
  });

  it('打新中签：每月初账户 +x%', () => {
    let s = createRun('ipo', { items: ['ipo'] }).state;
    // 开局时已经是 1 月初：createRun 里先给道具再开月
    expect(s.account).toBeCloseTo(BALANCE.startAccount * (1 + fx('ipo', 'pct') / 100), 0);
    let ev: GameEvent[] = [];
    for (let i = 0; i < 10 && s.month === 1; i++) {
      const a = s.phase === 'premarket' ? { type: 'open' as const } : s.phase === 'reward' ? { type: 'skipReward' as const } : { type: 'choose' as const, option: 1 };
      const r = must(s, a);
      s = r.state;
      ev = r.events;
    }
    const t = triggers(ev, 'ipo')[0];
    expect(t).toBeDefined();
  });

  it('信用卡：还不上月供时代还一次（见引擎测试），只能用一次', () => {
    let s = createRun('cc', { account: 100, items: ['credit'] }).state;
    for (let i = 0; i < 30 && s.phase !== 'lost' && s.phase !== 'won'; i++) {
      const a = s.phase === 'premarket' ? { type: 'open' as const } : s.phase === 'reward' ? { type: 'skipReward' as const } : { type: 'choose' as const, option: 1 };
      s = must(s, a).state;
    }
    expect(s.phase).toBe('lost');
    expect(s.month).toBe(2);
  });

  it('付费群：内幕哥加群；之后不再出现内幕哥卡', () => {
    const s = createRun('paid', { items: ['paid_group'] }).state;
    const f = s.friends.find((x) => x.id === 'neimu');
    expect(f?.topics).toHaveLength(2);
    for (const t of f?.topics ?? []) expect(s.themeIds).toContain(t);
  });

  it('老王的小本本：老王的可信度变成 1（统计见群聊测试）', () => {
    const s = createRun('nb', { items: ['notebook'] }).state;
    expect(rulesOf(s).credOverride.laowang).toBe(1);
  });

  it('情绪指标：题材看板显示（上一个交易日的）真实阶段；没有时不显示', () => {
    const plain = createRun('mood').state;
    for (const c of themeBoard(plain)) expect(c.stage).toBeNull();
    const s = createRun('mood', { items: ['mood_meter'] }).state;
    for (const c of themeBoard(s)) {
      expect(c.stage).toBe(s.themes[c.id]?.lastStage);
      expect(c.stageLabel).not.toBeNull();
    }
  });
});

