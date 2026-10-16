import { describe, expect, it } from 'vitest';
import {
  billView,
  chatView,
  createRun,
  dispatch,
  eventView,
  faceOf,
  friendsView,
  holdingCards,
  itemView,
  rewardView,
  runSummary,
  stockCard,
  themeBoard,
  topBar,
  type GameState,
} from '../src/core/index.ts';
import { botByName, playRun } from '../tools/bots.ts';
import { must } from './helpers.ts';

/** 把对象里所有键名收集起来（检查有没有漏出隐藏字段）。 */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysOf(x, out);
    }
  }
  return out;
}

const HIDDEN = ['plan', 'left', 'sure', 'buyStage', 'truth', 'lastStage'];

describe('查询函数（画面用）', () => {
  it('题材看板：热度、近 5 日走势、体感；没有情绪指标时不给真实阶段', () => {
    const s = createRun('board').state;
    const board = themeBoard(s);
    expect(board).toHaveLength(6);
    for (const c of board) {
      expect(c.heat).toBe(s.themes[c.id]?.heat);
      expect(c.trend.length).toBeLessThanOrEqual(5);
      expect(c.stage).toBeNull();
      expect(c.stocks.length).toBeGreaterThanOrEqual(3);
    }
    const keys = keysOf(board);
    for (const k of HIDDEN) expect(keys.has(k)).toBe(false);
  });

  it('持仓卡、群聊、顶栏、月供、日历、道具说明都不含隐藏字段', () => {
    let s = createRun('views', { items: ['notebook', 'credit'] }).state;
    s = must(s, { type: 'buy', rec: 0 }).state;
    const views = [holdingCards(s), chatView(s), topBar(s), billView(s), friendsView(s), stockCard(s, s.today.recs[1]?.stockId ?? 'ai_leader')];
    for (const v of views) {
      const keys = keysOf(v);
      for (const k of HIDDEN) expect(keys.has(k), `${k}`).toBe(false);
    }
    const cards = holdingCards(s);
    expect(cards[0]).toMatchObject({ slot: 0, canSell: false, todayRet: null, holdRet: 0, weight: 0.25 });
    expect(cards[1]).toBeNull();
    const chat = chatView(s);
    expect(chat.recs[0]?.taken).toBe(true);
    expect(chat.recs[1]?.error).toBe('今天能买的次数用完了');
    expect(chat.messages.every((m) => m.friend.record === '新来的')).toBe(true);
    expect(chat.messages.filter((m) => m.friend.id === 'laowang').every((m) => m.certain)).toBe(true);
    expect(topBar(s)).toMatchObject({ month: 1, day: 1, daysInMonth: 5, daysLeft: 5, slots: 4 });
    expect(billView(s)).toMatchObject({ month: 1, name: '房租', credit: true, extras: [], base: s.bill.amount });
    expect(itemView('margin').kindLabel).toBe('工具');
  });

  it('月供视图：总额、常规月供和突发账单明细', () => {
    const s = createRun('billview').state;
    s.bill = { month: 3, name: '花呗', amount: 15_000, extras: [{ id: 'vet', name: '猫进了宠物医院', amount: 6_000 }] };
    const v = billView(s);
    expect(v).toMatchObject({ month: 3, name: '花呗', amount: 15_000, base: 9_000 });
    expect(v.extras).toEqual([{ id: 'vet', name: '猫进了宠物医院', amount: 6_000 }]);
    v.extras[0]!.amount = 1;
    expect(s.bill.extras?.[0]?.amount).toBe(6_000);
  });

  it('股票小人的表情', () => {
    expect(faceOf(10, 10)).toBe('limitup');
    expect(faceOf(-10, 10)).toBe('limitdown');
    expect(faceOf(3, 10)).toBe('happy');
    expect(faceOf(-3, 10)).toBe('worried');
    expect(faceOf(0.2, 10)).toBe('calm');
    expect(faceOf(5, 5)).toBe('limitup');
    expect(faceOf(0, 10, true)).toBe('delisted');
  });

  it('奖励卡与事件的说明', () => {
    let s: GameState = createRun('rv', { account: 1e7 }).state;
    for (let i = 0; i < 10 && s.phase === 'premarket'; i++) s = must(s, { type: 'open' }).state;
    expect(s.phase).toBe('reward');
    const cards = rewardView(s);
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeGreaterThan(0);
      expect(c.item ?? c.friend ?? c.stock).not.toBeNull();
    }
    expect(eventView(s)).toBeNull();
    // 找一个触发了事件的种子
    for (let i = 0; i < 30; i++) {
      let t: GameState = createRun(`ev-${i}`, { account: 1e7 }).state;
      for (let k = 0; k < 10 && t.phase === 'premarket'; k++) t = must(t, { type: 'open' }).state;
      t = must(t, { type: 'skipReward' }).state;
      if (t.phase !== 'event') continue;
      const v = eventView(t);
      expect(v?.options).toHaveLength(2);
      expect(dispatch(t, { type: 'choose', option: 0 }).error).toBeNull();
      return;
    }
    throw new Error('30 个种子都没触发事件');
  });

  it('结束页小结', () => {
    const s = playRun('summary', botByName('normal'));
    const sum = runSummary(s);
    expect(sum.won).toBe(s.phase === 'won');
    expect(sum.totalDays).toBe(58);
    expect(sum.title.length).toBeGreaterThan(0);
    expect(sum.billsPaid).toBe(s.stats.billsPaid);
  });
});
