import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  CALENDAR,
  EVENTS,
  ITEMS,
  baseMarketRules,
  calendarView,
  createRun,
  daysInMonth,
  dispatch,
  eventById,
  eventView,
  fx,
  marketRulesFor,
  rngFor,
  rollDH,
  stockById,
  type GameState,
} from '../src/core/index.ts';
import { SIX, must } from './helpers.ts';

/** 跑到第一个月底的奖励阶段（账户很多，不会爆仓）。 */
function atReward(seed: string, account = 1e6): GameState {
  let s = createRun(seed, { account, themes: SIX }).state;
  for (let i = 0; i < 10 && s.phase === 'premarket'; i++) s = must(s, { type: 'open' }).state;
  if (s.phase !== 'reward') throw new Error(`没到奖励阶段：${s.phase}`);
  return s;
}

/** 摆出某个事件（跳过随机触发）。 */
function atEvent(id: string, seed = 'evt', mutate?: (s: GameState) => void): GameState {
  const s = atReward(seed);
  mutate?.(s);
  const data = eventById(id).prepare({ state: s, rng: rngFor(seed, 'prep', id), month: s.month });
  if (!data) throw new Error(`${id} 现在不会出现`);
  s.reward = null;
  s.phase = 'event';
  s.event = { ...data, id, month: s.month };
  return s;
}

describe('A 股日历', () => {
  it('12 个日历事件每个都改市场规则（国庆长假：节前缩量）', () => {
    const base = baseMarketRules();
    for (let k = 1; k <= 12; k++) expect(marketRulesFor(k, 1), `${k} 月`).not.toEqual(base);
  });

  it('固定 12 个月，提前可见；10 月只有 3 个交易日', () => {
    expect(CALENDAR.map((c) => c.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(CALENDAR.map((c) => c.name)).toEqual(['元旦红包', '春季躁动', '开春政策窗口', '年报季', '五穷', '六绝', '七翻身', '中报季', '金九', '国庆长假', '双十一', '年底排名']);
    const view = calendarView(createRun('cal').state);
    expect(view).toHaveLength(12);
    expect(view[0]?.current).toBe(true);
    expect(daysInMonth(10)).toBe(3);
  });

  it('每月的市场规则', () => {
    const base = baseMarketRules();
    const m = (k: number) => marketRulesFor(k, 0);
    expect(m(1).bullBias).toBeGreaterThan(0);
    expect(m(2).sprout).toBeGreaterThan(base.sprout);
    expect(m(3).themeDH.newenergy).toBeGreaterThan(0);
    expect(m(3).themeDH.lowalt).toBeGreaterThan(0);
    expect(m(4).memeDown).toBeGreaterThan(0.5);
    expect(m(4).stWarnMult).toBeGreaterThan(1);
    expect(m(4).noise.bluechip).toBeLessThan(1);
    expect(m(5).bearBias).toBeGreaterThan(0);
    expect(m(6).bearBias).toBeGreaterThan(0);
    expect(m(6).ebbMult).toBeGreaterThan(1);
    expect(m(7).bullBias).toBeGreaterThan(0);
    expect(m(8).beta.leader).toBeGreaterThan(1);
    expect(m(8).beta.follower).toBeLessThan(1);
    expect(m(9).themeDH.consumer).toBeGreaterThan(0);
    expect(m(10)).toEqual({ ...base, vol: fx('guoqing', 'vol') });
    expect(m(11).themeDH.consumer).toBeGreaterThan(0);
    expect(m(11).themeDH.gaming).toBeGreaterThan(0);
    expect(m(12).vol).toBeCloseTo(fx('yearend', 'vol'));
    // 没有日历的预跑
    expect(marketRulesFor(0, 0)).toEqual(base);
  });

  it('利好月份：相关题材的热度变化更高；春季躁动让冷门题材更容易萌芽', () => {
    const t = { id: 'newenergy' as const, heat: 30, history: [30], stage: 'rally' as const, lastStage: 'rally' as const, left: 3, sure: false, boost: null };
    let jan = 0;
    let mar = 0;
    for (let i = 0; i < 500; i++) {
      jan += rollDH(t, marketRulesFor(1, 0), rngFor('lh', i));
      mar += rollDH(t, marketRulesFor(3, 0), rngFor('lh', i));
    }
    expect((mar - jan) / 500).toBeCloseTo(fx('policy_spring', 'dH'), 0);
    expect(marketRulesFor(2, 0).sprout).toBeCloseTo(fx('spring', 'sprout'));
  });

  it('月初公布月供与日历事件', () => {
    const r = createRun('month');
    expect(r.events.find((e) => e.type === 'monthStarted')).toMatchObject({ month: 1, calendar: 'newyear', days: 5 });
  });
});

describe('事件（15 + 0.4 C 4 个，二选一）', () => {
  it('id 与设计稿一致；领完奖励后按概率触发', () => {
    expect(EVENTS.map((e) => e.id)).toEqual([
      'cousin',
      'livestream',
      'lottery_party',
      'course',
      'lottery',
      'bonus',
      'landlord',
      'classmate_loan',
      'side_hustle',
      'cat_keyboard',
      'red_packet',
      'quant_trial',
      'blind_box',
      'fund_manager',
      'overtime',
      'bank_manager',
      'bear_live',
      'mother_in_law',
      'parents_call',
    ]);
    let n = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const s = atReward(`evt-rate-${i}`);
      const r = must(s, { type: 'skipReward' });
      if (r.state.phase === 'event') {
        n += 1;
        const v = eventView(r.state);
        expect(v?.options).toHaveLength(2);
        expect(v?.text.length).toBeGreaterThan(5);
      } else {
        expect(r.state.phase).toBe('premarket');
        expect(r.state.month).toBe(2);
      }
    }
    expect(n / N).toBeCloseTo(BALANCE.events.chance, 1);
  });

  it('表哥荐股：买下一只妖股（放进空格，满仓时换掉持有收益最低的）；不买则无事', () => {
    const s = atEvent('cousin');
    const id = s.event?.stockId ?? '';
    expect(stockById(id).role).toBe('meme');
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.slots.some((h) => h?.stockId === id)).toBe(true);
    expect(yes.month).toBe(2);
    const no = must(atEvent('cousin'), { type: 'choose', option: 1 }).state;
    expect(no.slots.every((h) => h === null)).toBe(true);
  });

  it('大V直播间：跟单后推荐的题材接下来 3 天热度每天额外 +3', () => {
    const s = atEvent('livestream');
    const theme = s.event?.theme;
    if (!theme) throw new Error('no theme');
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.themes[theme]?.boost).toEqual({ dH: fx('livestream', 'dH'), days: fx('livestream', 'days') });
    let st = yes;
    for (let d = 0; d < 3; d++) st = must(st, { type: 'open' }).state;
    expect(st.themes[theme]?.boost).toBeNull();
    const no = must(atEvent('livestream'), { type: 'choose', option: 1 }).state;
    expect(no.themes[theme]?.boost).toBeNull();
  });

  it('年会抽奖：账户 +1~5%', () => {
    const s = atEvent('lottery_party');
    const before = s.account;
    const r = must(s, { type: 'choose', option: 0 });
    const ratio = r.state.account / before - 1;
    expect(ratio).toBeGreaterThanOrEqual(0.01 - 1e-6);
    expect(ratio).toBeLessThanOrEqual(0.05 + 1e-6);
    expect(r.events.find((e) => e.type === 'eventResolved')).toMatchObject({ id: 'lottery_party', option: 0 });
  });

  it('群主卖课：花账户的 5% 换一个随机战法；拒绝则不花钱', () => {
    const s = atEvent('course');
    const before = s.account;
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeCloseTo(before - Math.round(before * 0.05), 0);
    const tactic = yes.items.find((id) => ITEMS.find((d) => d.id === id)?.kind === 'tactic');
    expect(tactic).toBeDefined();
    const no = must(atEvent('course'), { type: 'choose', option: 1 }).state;
    expect(no.account).toBe(before);
    expect(no.items).toEqual([]);
  });

  it('买彩票：花 1%，有小概率得到 +20%', () => {
    let wins = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const s = atEvent('lottery', `lot-${i % 4}`);
      s.month = 1 + (i % 11);
      if (s.event) s.event.month = s.month;
      const before = s.account;
      const cost = s.event?.amount ?? 0;
      const after = dispatch(s, { type: 'choose', option: 0 }).state.account;
      if (after > before) wins += 1;
      else expect(after).toBeCloseTo(before - cost, 0);
    }
    expect(wins).toBeGreaterThan(0);
    expect(wins / N).toBeLessThan(0.2);
  });

  it('公司发年终奖：账户 +3%，只在 1 月底或 12 月初出现', () => {
    const s = atEvent('bonus');
    const before = s.account;
    expect(must(s, { type: 'choose', option: 0 }).state.account).toBeCloseTo(before * 1.03, -1);
    const prep = (month: number) => eventById('bonus').prepare({ state: s, rng: rngFor('b'), month });
    expect(prep(1)).not.toBeNull();
    expect(prep(11)).not.toBeNull();
    for (const m of [2, 5, 9, 10]) expect(prep(m)).toBeNull();
  });
});
