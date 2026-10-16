import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  baseBill,
  createRun,
  dispatch,
  eventById,
  eventView,
  fx,
  holdingCards,
  rngFor,
  rulesOf,
  stockById,
  topBar,
  type GameEvent,
  type GameState,
  type RunSetup,
} from '../src/core/index.ts';
import { SIX, must } from './helpers.ts';

function atReward(seed: string, setup: RunSetup = {}): GameState {
  let s = createRun(seed, { account: 1e6, themes: SIX, ...setup }).state;
  for (let i = 0; i < 10 && s.phase === 'premarket'; i++) s = must(s, { type: 'open' }).state;
  if (s.phase !== 'reward') throw new Error(`没到奖励阶段：${s.phase}`);
  return s;
}

function atEvent(id: string, seed = 'evt2', setup: RunSetup = {}): GameState {
  const s = atReward(seed, setup);
  const data = eventById(id).prepare({ state: s, rng: rngFor(seed, 'prep', id), month: s.month });
  if (!data) throw new Error(`${id} 现在不会出现`);
  s.reward = null;
  s.phase = 'event';
  s.event = { ...data, id, month: s.month };
  return s;
}

/** 一直开盘直到 month 月月初，返回那一刻的局面和这一步的事件。 */
function toMonth(s: GameState, month: number): { state: GameState; events: GameEvent[] } {
  let st = s;
  let ev: GameEvent[] = [];
  for (let i = 0; i < 40 && st.month < month && st.phase !== 'won' && st.phase !== 'lost'; i++) {
    const a = st.phase === 'premarket' ? { type: 'open' as const } : st.phase === 'reward' ? { type: 'skipReward' as const } : { type: 'choose' as const, option: 1 };
    const r = must(st, a);
    st = r.state;
    ev = r.events;
  }
  return { state: st, events: ev };
}

describe('0.3.0 新增事件（9 个）', () => {
  it('文案齐全：每个事件都能摆出来，正文和两个选项都不空', () => {
    // 0.4 C 的事件只在有新机制的局里出现，见 tests/ext.test.ts
    for (const d of EVENTS.filter((x) => !['bank_manager', 'bear_live', 'mother_in_law', 'parents_call'].includes(x.id))) {
      const s = atEvent(d.id, 'evt2');
      const v = eventView(s);
      expect(v?.text.length, d.id).toBeGreaterThan(8);
      expect(v?.options[0].length, d.id).toBeGreaterThan(1);
      expect(v?.options[1].length, d.id).toBeGreaterThan(1);
      for (const o of [0, 1]) {
        const r = must(atEvent(d.id, 'evt2'), { type: 'choose', option: o });
        const res = r.events.find((e) => e.type === 'eventResolved');
        expect(res && res.type === 'eventResolved' ? res.text.length : 0, `${d.id} 选 ${o}`).toBeGreaterThan(4);
      }
    }
  });

  it('房东涨租：答应则下月常规月供 ×1.1；搬家则花 2.5% 搬家费', () => {
    const s = atEvent('landlord');
    const yes = must(s, { type: 'choose', option: 0 }).state;
    const extras = (yes.bill.extras ?? []).reduce((a, x) => a + x.amount, 0);
    expect(yes.bill.amount - extras).toBe(Math.round((baseBill(2) * fx('landlord', 'billMult')) / 100) * 100);
    const before = s.account;
    const no = must(atEvent('landlord'), { type: 'choose', option: 1 }).state;
    expect(no.account).toBeCloseTo(before - Math.round((before * fx('landlord', 'moveCost')) / 100), 0);
  });

  it('老同学借钱：借出 5%，两个月后月初连本带利还（可能忘了）；不借无事', () => {
    let back = 0;
    let forgot = 0;
    for (let i = 0; i < 40; i++) {
      const s = atEvent('classmate_loan', `loan-${i}`);
      const amount = s.event?.amount ?? 0;
      const lent = must(s, { type: 'choose', option: 0 }).state;
      expect(lent.pending).toEqual([{ id: 'classmate_loan', month: 3, amount }]);
      expect(topBar(lent).pending[0]).toMatchObject({ month: 3, amount });
      const { state, events } = toMonth(lent, 3);
      expect(state.pending).toEqual([]);
      const e = events.find((x) => x.type === 'pendingSettled');
      expect(e).toBeDefined();
      if (e && e.type === 'pendingSettled') {
        if (e.delta > 0) {
          back += 1;
          expect(e.delta).toBeCloseTo(Math.round((amount * (100 + fx('classmate_loan', 'interest'))) / 100), 0);
        } else forgot += 1;
      }
    }
    expect(back).toBeGreaterThan(0);
    expect(forgot).toBeGreaterThan(0);
  });

  it('周末摆摊：入伙花 2%，两个月后月初拿回本金的 50%~220%', () => {
    for (let i = 0; i < 20; i++) {
      const s = atEvent('side_hustle', `stall-${i}`);
      const amount = s.event?.amount ?? 0;
      const { events } = toMonth(must(s, { type: 'choose', option: 0 }).state, 3);
      const e = events.find((x) => x.type === 'pendingSettled');
      const d = e && e.type === 'pendingSettled' ? e.delta : -1;
      expect(d).toBeGreaterThanOrEqual(Math.round(amount * fx('side_hustle', 'min')) - 1);
      expect(d).toBeLessThanOrEqual(Math.round(amount * fx('side_hustle', 'max')) + 1);
    }
  });

  it('猫踩键盘：留着就把一只跟风股放进持仓；撤单无事', () => {
    const s = atEvent('cat_keyboard');
    const id = s.event?.stockId ?? '';
    expect(stockById(id).role).toBe('follower');
    expect(must(s, { type: 'choose', option: 0 }).state.slots.some((h) => h?.stockId === id)).toBe(true);
    expect(must(atEvent('cat_keyboard'), { type: 'choose', option: 1 }).state.slots.every((h) => h === null)).toBe(true);
  });

  it('群里抢红包：多半抢到一点，手气最差要回发 0.5%；不抢无事', () => {
    let up = 0;
    let down = 0;
    for (let i = 0; i < 60; i++) {
      const s = atEvent('red_packet', `rp-${i}`);
      const before = s.account;
      const after = must(s, { type: 'choose', option: 0 }).state.account;
      if (after > before) {
        up += 1;
        expect(after / before - 1).toBeLessThanOrEqual(fx('red_packet', 'max') / 100 + 1e-6);
      } else {
        down += 1;
        expect(after).toBeCloseTo(before * (1 - fx('red_packet', 'lose') / 100), 0);
      }
    }
    expect(up).toBeGreaterThan(down);
    expect(down).toBeGreaterThan(0);
  });

  it('量化软件试用：下个月有情绪指标（临时道具，月底失效），再下个月月初自动续费 1%', () => {
    const s = atEvent('quant_trial');
    const fee = s.event?.amount ?? 0;
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.items).toContain('mood_meter');
    expect(rulesOf(yes).revealStages).toBe(true);
    expect(yes.expiring).toEqual([{ id: 'mood_meter', month: 2 }]);
    expect(yes.stats.itemsTaken).toContain('mood_meter');
    const { state, events } = toMonth(yes, 3);
    expect(state.items).not.toContain('mood_meter');
    expect(events.find((e) => e.type === 'itemExpired')).toMatchObject({ itemId: 'mood_meter' });
    expect(events.find((e) => e.type === 'pendingSettled')).toMatchObject({ id: 'quant_trial', delta: -fee });
    // 已经有情绪指标时不会出现
    const has = atReward('qt', { items: ['mood_meter'] });
    expect(eventById('quant_trial').prepare({ state: has, rng: rngFor('x'), month: 1 })).toBeNull();
  });

  it('炒股盲盒：花 3% 随机得到一个还没有的道具；不抽无事', () => {
    const s = atEvent('blind_box');
    const before = s.account;
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.items).toHaveLength(1);
    expect(yes.account).toBeCloseTo(before - (s.event?.amount ?? 0), 0);
    expect(must(atEvent('blind_box'), { type: 'choose', option: 1 }).state.items).toEqual([]);
  });

  it('理财经理：锁 10% 到两个月后月初，连本带利 +3% 拿回；锁着的钱不算账户', () => {
    const s = atEvent('fund_manager');
    const amount = s.event?.amount ?? 0;
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeCloseTo(s.account - amount, 0);
    const { events } = toMonth(yes, 3);
    expect(events.find((e) => e.type === 'pendingSettled')).toMatchObject({
      id: 'fund_manager',
      delta: Math.round((amount * (100 + fx('fund_manager', 'ret'))) / 100),
    });
  });

  it('老板喊加班：账户 +2%，下一个交易日不能买卖（只能开盘）', () => {
    const s = atEvent('overtime');
    const before = s.account;
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeGreaterThan(before);
    expect(yes.busyDay).toBe(yes.today.day);
    expect(yes.today.buysLeft).toBe(0);
    expect(topBar(yes).busy).toBe(true);
    expect(dispatch(yes, { type: 'buy', rec: 0 }).error).toBe('今天在加班，没空买卖');
    const next = must(yes, { type: 'open' }).state;
    expect(topBar(next).busy).toBe(false);
    expect(next.today.buysLeft).toBeGreaterThan(0);
  });

  it('加班日持仓的卖出按钮也是灰的（canSell 为 false），第二天恢复', () => {
    const s = atEvent('overtime', 'evt-hold', { holdings: ['ai_leader'], themes: SIX });
    const slot = s.slots.findIndex((h) => h?.stockId === 'ai_leader');
    expect(slot).toBeGreaterThanOrEqual(0);
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(holdingCards(yes)[slot]?.canSell).toBe(false);
    expect(dispatch(yes, { type: 'sell', slot }).error).toBe('今天在加班，没空买卖');
    const next = must(yes, { type: 'open' }).state;
    expect(holdingCards(next)[slot]?.canSell).toBe(true);
  });

  it('延后结算的事件在 11 月之后不再出现（没有"两个月后"）', () => {
    const s = atReward('late');
    for (const id of ['classmate_loan', 'side_hustle', 'quant_trial', 'fund_manager']) {
      expect(eventById(id).prepare({ state: s, rng: rngFor('x'), month: 11 }), id).toBeNull();
      expect(eventById(id).prepare({ state: s, rng: rngFor('x'), month: 10 }), id).not.toBeNull();
    }
  });

  it('第 8 级"末日"：事件里的花费和损失 × badMult', () => {
    const easy = atEvent('landlord', 'doom', { difficulty: 1 });
    const hard = atEvent('landlord', 'doom', { difficulty: 8 });
    const lossEasy = easy.account - must(easy, { type: 'choose', option: 1 }).state.account;
    const lossHard = hard.account - must(hard, { type: 'choose', option: 1 }).state.account;
    expect(lossHard / Math.max(1, hard.event?.amount ?? 1)).toBeCloseTo((fx('doom', 'badMult') * lossEasy) / Math.max(1, easy.event?.amount ?? 1), 2);
  });
});
