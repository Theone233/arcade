import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  STOCKS,
  itemById,
  themeById,
  type StockMove,
  canSell,
  createRun,
  dispatch,
  type Action,
  type DayReport,
  type GameEvent,
  type GameState,
  type RetPart,
  type RunSetup,
  validate,
} from '../src/core/index.ts';
import { SIX } from './helpers.ts';
import { THEME_NEWS, MARKET_NEWS } from '../src/core/content/news.ts';
import { ROLE_QUIPS, STOCK_QUIPS } from '../src/core/content/quips.ts';
import { quipLines, stockQuip } from '../src/core/story.ts';
import { effectLabel, holdingParts, leadPart } from '../src/core/explain.ts';

/** 一个简单的玩法：有空格就买第一条推荐，持有超过 5 天能卖就卖，奖励拿第一张，事件选"不"。 */
function act(s: GameState): Action {
  if (s.phase === 'reward') return validate(s, { type: 'pickReward', index: 0 }) === null ? { type: 'pickReward', index: 0 } : { type: 'skipReward' };
  if (s.phase === 'event') return { type: 'choose', option: 1 };
  const old = s.slots.findIndex((h, i) => h !== null && s.dayIndex - h.boughtDay > 5 && canSell(s, i));
  if (old >= 0 && validate(s, { type: 'sell', slot: old }) === null && !STOCKS.some((d) => d.id === s.slots[old]?.stockId && d.role === 'st')) {
    return { type: 'sell', slot: old };
  }
  const rec = s.today.recs.findIndex((r) => !r.taken);
  if (rec >= 0 && validate(s, { type: 'buy', rec }) === null) return { type: 'buy', rec };
  return { type: 'open' };
}

/** 玩一局，收集每天的结算和全部事件。 */
function play(seed: string, setup: RunSetup | null, days = 400): { reports: DayReport[]; events: GameEvent[]; state: GameState } {
  let s = createRun(seed, setup).state;
  const reports: DayReport[] = [];
  const events: GameEvent[] = [];
  for (let i = 0; i < days * 4 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    let a = act(s);
    if (s.busyDay === s.today.day && (a.type === 'buy' || a.type === 'sell')) a = { type: 'open' };
    const r = dispatch(s, a);
    if (r.error) throw new Error(`${seed}: ${r.error}`);
    s = r.state;
    events.push(...r.events);
    for (const e of r.events) if (e.type === 'dayClosed') reports.push(e.report);
  }
  return { reports, events, state: s };
}

/**
 * 小白试读后的写法：每项都说"让它涨 / 跌了百分之几"，和最终方向相反的项说"少跌 / 少涨"；
 * 道具前加"道具「」"；不出现乘号、"随机波动""摘帽"。
 */
function checkLabel(p: RetPart, ret: number): void {
  expect(p.label, p.label).not.toMatch(/×|随机波动|摘帽|跟风|龙头/);
  if (p.kind === 'item') expect(p.label).toMatch(/^道具「.+」/);
  if (p.kind === 'noise') expect(p.label.startsWith('运气（每天都有的小起伏）')).toBe(true);
  if (p.kind === 'limit') {
    expect(p.label).toMatch(p.value < 0 ? /^涨停了：股票一天最多涨 \d+%，多出来的 .+ 不算（道具的加成另算/ : /^跌停了：股票一天最多跌 \d+%，少亏了 .+（道具的效果另算）$/);
    return;
  }
  if (p.value === 0) {
    expect(p.label).toContain('对它没有影响');
    return;
  }
  expect(p.label).toMatch(/\d%|不到 0\.1%/);
  const against = ret !== 0 && Math.sign(p.value) !== Math.sign(ret);
  if (against) expect(p.label, `${p.label} / ${ret}`).toMatch(/帮它少跌了|让它少涨了/);
  else expect(p.label, `${p.label} / ${ret}`).not.toMatch(/少跌|少涨/);
}

const SETUPS: [string, RunSetup][] = [
  ['裸开局', {}],
  ['借钱炒股 + 分散投资', { items: ['margin', 'diversify'], account: 1e6 }],
  ['止损、止盈、跟风、过山车、老实股', { items: ['zhisun', 'zhiying', 'genfeng', 'yaogu', 'baima', 'longtou', 'lianban', 'dixi', 'hot_money'], account: 1e6 }],
  ['危险股', { holdings: ['st_lazy', 'st_bye', 'st_dream', 'st_ghost'], themes: SIX, account: 1e6 }],
];

describe('F1 归因：每只持仓的拆解加起来等于当天涨跌，金额加起来等于账户变化', () => {
  const seen = new Set<string>();
  for (const [name, setup] of SETUPS) {
    it(name, () => {
      for (let k = 0; k < 4; k++) {
        const { reports } = play(`explain-${name}-${k}`, setup);
        expect(reports.length).toBeGreaterThan(20);
        for (const r of reports) {
          let money = 0;
          for (const h of r.holdings) {
            const sum = h.parts.reduce((a, p) => a + p.value, 0);
            expect(Math.abs(sum - h.ret), `${r.day} ${h.stockId}`).toBeLessThanOrEqual(0.01 + 1e-9);
            expect(h.parts[0]?.kind).toBe('theme');
            for (const p of h.parts) {
              seen.add(p.kind);
              expect(p.label.length).toBeGreaterThan(1);
              expect(Object.keys(p).every((x) => ['kind', 'value', 'label', 'theme', 'dH', 'itemId'].includes(x))).toBe(true);
              checkLabel(p, h.ret);
            }
            // 最大的一项：|value| 最大，相同时取靠前的
            const lead = h.parts.reduce<RetPart | null>((b, p) => (!b || Math.abs(p.value) > Math.abs(b.value) ? p : b), null);
            expect(h.lead).toEqual(lead);
            money += h.amount;
          }
          for (const e of r.account.effects) {
            seen.add(`effect:${e.source === 'leverage' ? 'leverage' : 'item'}`);
            expect(e.label).not.toMatch(/×|倍/);
            if (e.source === 'leverage') expect(e.label).toMatch(e.amount >= 0 ? /^借钱炒股：多赚了 ¥[\d,.]+（亏的时候也会多亏）$/ : /^借钱炒股：多亏了 ¥[\d,.]+（赚的时候也会多赚）$/);
            else expect(e.label).toMatch(/^道具「.+」：(少亏了|多亏了) ¥/);
            money += e.amount;
          }
          expect(Math.abs(money - (r.account.after - r.account.before)), `day ${r.day}`).toBeLessThanOrEqual(0.005 + 1e-9);
        }
      }
    });
  }

  it('覆盖到涨跌停截断、大哥带小弟、过山车跳空、个股消息、道具、借钱炒股、分散投资等各项', () => {
    for (const kind of ['theme', 'role', 'market', 'limit', 'chain', 'jump', 'news', 'item', 'noise', 'effect:leverage', 'effect:item']) {
      expect(seen, kind).toContain(kind);
    }
  });

  it('风口那一项带着风口 id 和当天的热度变化；不含真实阶段', () => {
    const { reports } = play('explain-theme', {});
    for (const r of reports) {
      for (const h of r.holdings) {
        const t = h.parts[0];
        const move = r.themes.find((x) => x.id === t?.theme);
        expect(move).toBeDefined();
        expect(t?.dH).toBe(move?.dH);
        expect(JSON.stringify(h.parts)).not.toMatch(/stage|萌芽|发酵|主升|高潮|退潮/);
      }
    }
  });
});

describe('F2 收盘新闻', () => {
  it('文案池：每个风口 × 涨 / 跌至少 5 条，全场新闻涨跌各至少 5 条', () => {
    for (const [id, pool] of Object.entries(THEME_NEWS)) {
      expect(pool.up.length, id).toBeGreaterThanOrEqual(5);
      expect(pool.down.length, id).toBeGreaterThanOrEqual(5);
    }
    expect(MARKET_NEWS.up.length).toBeGreaterThanOrEqual(5);
    expect(MARKET_NEWS.down.length).toBeGreaterThanOrEqual(5);
  });

  it('只解释已经发生的：风口新闻对应当天热度变化最大的风口、方向一致；全场新闻对应大环境的大涨大跌；同种子同操作结果相同', () => {
    const a = play('news', { account: 1e7 });
    const b = play('news', { account: 1e7 });
    let themed = 0;
    a.reports.forEach((r, i) => {
      expect(r.news).toEqual(b.reports[i]?.news);
      const themeNews = r.news.filter((n) => n.theme !== null);
      expect(themeNews.length).toBeLessThanOrEqual(BALANCE.news.themes);
      const top = Math.max(...r.themes.map((t) => Math.abs(t.dH)));
      if (top > 0) expect(Math.abs(themeNews[0]?.value ?? 0)).toBe(top);
      for (const n of themeNews) {
        const t = r.themes.find((x) => x.id === n.theme);
        expect(n.value).toBe(t?.dH);
        expect(n.dir).toBe((t?.dH ?? 0) > 0 ? 'up' : 'down');
        themed += 1;
      }
      const market = r.news.filter((n) => n.theme === null);
      expect(market.length).toBe(Math.abs(r.market.ret) >= BALANCE.news.market ? 1 : 0);
      for (const n of market) expect(n.dir).toBe(r.market.ret > 0 ? 'up' : 'down');
    });
    expect(themed).toBeGreaterThanOrEqual(a.reports.length);
    expect(a.events.filter((e) => e.type === 'news').length).toBe(a.reports.reduce((x, r) => x + r.news.length, 0));
  });
});

describe('F5 股票小人台词', () => {
  it('每只股票至少 4 条自己的台词；每个角色每个时机都有通用台词', () => {
    for (const d of STOCKS) {
      const n = Object.values(STOCK_QUIPS[d.id] ?? {}).reduce((a, l) => a + l.length, 0);
      expect(n, d.id).toBeGreaterThanOrEqual(4);
    }
    for (const [role, pools] of Object.entries(ROLE_QUIPS)) {
      for (const [moment, lines] of Object.entries(pools)) expect(lines.length, `${role} ${moment}`).toBeGreaterThan(0);
    }
    expect(quipLines('ai_leader', 'limitUp')).toContain('今天谁也别想割我。');
  });

  it('收盘时涨停、连续涨停、跌停、退市、被自动卖出各有台词；买入、卖出时也冒一句；同样的输入同一句', () => {
    const moments = new Set<string>();
    for (const [name, setup, k] of SETUPS.flatMap(([n, st]) => [0, 1, 2].map((i) => [n, st, i] as const))) {
      const { reports, events } = play(`quip-${name}-${k}`, setup);
      for (const r of reports) {
        for (const q of r.quips) {
          moments.add(q.moment);
          expect(q.text.length).toBeGreaterThan(1);
          expect(q.text).not.toMatch(/\{\w+\}/);
          const m = r.stocks.find((x) => x.id === q.stockId);
          if (q.moment === 'limitUp') expect(m?.limitUp && m.boards === 1).toBe(true);
          if (q.moment === 'streak') expect(m?.limitUp && (m?.boards ?? 0) >= 2).toBe(true);
          if (q.moment === 'limitDown') expect(m?.limitDown).toBe(true);
          if (q.moment === 'delisted') expect(m?.st).toBe('delisted');
        }
      }
      for (const e of events) if (e.type === 'quip') moments.add(e.moment);
    }
    for (const m of ['limitUp', 'streak', 'limitDown', 'delisted', 'bought', 'sold']) expect(moments, m).toContain(m);
    const s = createRun('quip-same').state;
    expect(stockQuip(s, 'ai_leader', 'bought', 3)).toBe(stockQuip(s, 'ai_leader', 'bought', 3));
  });
});

describe('小白试读：归因文案的写法（固定例子）', () => {
  const ctx = (stockId: string, dH: number, marketRet: number, extra: Partial<StockMove> = {}) => ({
    stockId,
    dH,
    marketRet,
    boardsBefore: 0,
    move: { id: stockId, move: 0, limitUp: false, limitDown: false, boards: 0, blown: false, jump: 0, chain: 0, st: null, ...extra },
  });
  const leader = STOCKS.find((d) => d.role === 'leader')!;
  const follower = STOCKS.find((d) => d.role === 'follower' && d.theme === leader.theme)!;
  const tname = themeById(leader.theme).name;

  it('大哥涨的一天：热度只当原因，角色单列，零头并进运气', () => {
    const parts = holdingParts(
      [
        { kind: 'theme', value: 6.2 },
        { kind: 'role', value: 2.2 },
        { kind: 'market', value: 0.4 },
        { kind: 'noise', value: -0.3 },
      ],
      [],
      8.5,
      ctx(leader.id, 13, 0.4),
    );
    expect(parts.map((p) => p.label)).toEqual([
      `${tname}热度涨了 13，让它涨了 6.2%`,
      '它是带头大哥，风口的涨跌在它身上更猛，又多涨了 2.2%',
      '今天大环境好，大家都沾光，让它涨了 0.4%',
      '运气（每天都有的小起伏）让它少涨了 0.3%',
    ]);
    expect(parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(8.5, 6);
    expect(leadPart(parts)?.kind).toBe('theme');
  });

  it('跌的一天：反方向的项说"帮它少跌了"，小弟只跟一部分，道具加"道具「」"', () => {
    const parts = holdingParts(
      [
        { kind: 'theme', value: -10 },
        { kind: 'role', value: 5 },
        { kind: 'market', value: 0.8 },
        { kind: 'noise', value: 5.4 },
      ],
      [{ itemId: 'zhisun', value: 5.8 }],
      6 - 10 + 0.2,
      ctx(follower.id, -22, 1.1),
    );
    const share = BALANCE.roles.follower.beta;
    expect(parts[0]?.label).toBe(`${tname}热度掉了 22，让它跌了 10%`);
    expect(parts[1]?.label).toMatch(new RegExp(`^它是小弟，只跟了风口的(一半|[一二三四五六七八九]成)，帮它少跌了 5%$`));
    expect(share).toBeLessThan(1);
    expect(parts[2]?.label).toBe('今天大环境好，帮它少跌了 0.8%，但没扛住');
    expect(parts.find((p) => p.kind === 'item')?.label).toBe(`道具「${itemById('zhisun').name}」帮它少跌了 5.8%`);
    expect(parts.find((p) => p.kind === 'noise')?.label).toMatch(/^运气（每天都有的小起伏）/);
  });

  it('涨跌停说清楚"一天最多 10%，道具另算"；借钱炒股说多赚了多少钱', () => {
    const up = holdingParts([{ kind: 'theme', value: 9 }, { kind: 'role', value: 4 }, { kind: 'limit', value: -3 }], [], 10, ctx(leader.id, 20, 0, { limitUp: true }));
    expect(up.find((p) => p.kind === 'limit')?.label).toBe('涨停了：股票一天最多涨 10%，多出来的 3% 不算（道具的加成另算，可以超过 10%）');
    const down = holdingParts([{ kind: 'theme', value: -12 }, { kind: 'limit', value: 4.6 }], [], -7.4, ctx(follower.id, -25, 0));
    expect(down.find((p) => p.kind === 'limit')?.label).toMatch(/^跌停了：股票一天最多跌 \d+%，少亏了 4\.6%（道具的效果另算）$/);
    expect(effectLabel({ source: 'leverage', label: '', amount: 361 })).toBe('借钱炒股：多赚了 ¥361（亏的时候也会多亏）');
    expect(effectLabel({ source: 'leverage', label: '', amount: -120.5 })).toBe('借钱炒股：多亏了 ¥121（赚的时候也会多赚）');
    expect(effectLabel({ source: 'diversify', label: '', amount: 88 })).toBe(`道具「${itemById('diversify').name}」：少亏了 ¥88`);
  });
});
