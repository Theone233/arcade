/** 0.4 C：仓位、押跌、抵押、小知识（规则层）。 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  EVENTS,
  KNOWLEDGE,
  bankRisk,
  bankView,
  buyOptions,
  collateralTerms,
  createRun,
  daysLeftInMonth,
  debtOf,
  dispatch,
  eventById,
  freeUnits,
  replay,
  rngFor,
  runSummary,
  storyView,
  validate,
  type Action,
  type GameState,
  type Segment,
} from '../src/core/index.ts';
import { SENSITIVE_WORDS } from '../src/core/content/tales.ts';
import { revealShown } from '../src/view/labels.ts';
import { emptyProfile, learnKnowledge, recordRun } from '../src/platform/profile.ts';

function must(s: GameState, a: Action): { state: GameState; events: ReturnType<typeof dispatch>['events'] } {
  const r = dispatch(s, a);
  if (r.error) throw new Error(`${JSON.stringify(a)}：${r.error}`);
  return { state: r.state, events: r.events };
}

/** 一直开盘 / 跳过奖励 / 事件选 1，直到 month 月月初。 */
function toMonth(s: GameState, month: number): GameState {
  let st = s;
  for (let i = 0; i < 80 && st.month < month && st.phase !== 'won' && st.phase !== 'lost'; i++) {
    const a: Action = st.phase === 'premarket' ? { type: 'open' } : st.phase === 'reward' ? { type: 'skipReward' } : { type: 'choose', option: 1 };
    st = must(st, a).state;
  }
  return st;
}

const ext = (seed: string, setup: Parameters<typeof createRun>[1] = null): GameState => createRun(seed, setup, { ext: true }).state;

describe('0.4 C：默认不打开时和 0.3 一样', () => {
  it('没有 ext 的局不认新操作，买入也不带份数', () => {
    const s = createRun('legacy').state;
    expect(s.ext).toBeUndefined();
    expect(validate(s, { type: 'buy', rec: 0, size: 'heavy' })).toBe('这一局没有这个玩法');
    expect(validate(s, { type: 'borrow', id: 'car' })).toBe('这一局没有这个玩法');
    const r = must(s, { type: 'buy', rec: 0 }).state;
    expect(r.slots[0]?.units).toBeUndefined();
  });
});

describe('仓位', () => {
  it('试一口 1 份、半仓 2 份、重仓 = 剩下的全部；现金用完就不能再买', () => {
    let s = ext('size-1', { items: ['double_buy'] });
    const o = buyOptions(s, 0);
    expect(o.sizes.map((x) => x.units)).toEqual([1, 2, 4]);
    s = must(s, { type: 'buy', rec: 0, size: 'half' }).state;
    expect(freeUnits(s)).toBe(2);
    expect(buyOptions(s, 1).sizes.map((x) => x.units)).toEqual([1, 2, 2]);
    s = must(s, { type: 'buy', rec: 1, size: 'heavy' }).state;
    expect(freeUnits(s)).toBe(0);
    expect(s.ext?.learned).toEqual(['size', 'heavy']);
    s = must(s, { type: 'open' }).state;
    expect(validate(s, { type: 'buy', rec: 0 })).toMatch(/现金用完了/);
  });

  it('账户涨跌按份数加权；加仓摊薄持有收益、减一半按半份取整', () => {
    let s = ext('size-2');
    s = must(s, { type: 'buy', rec: 0, size: 'heavy' }).state;
    const r = must(s, { type: 'open' });
    s = r.state;
    const rep = s.lastDay;
    expect(rep?.holdings[0]?.units).toBe(4);
    expect(rep?.account.gross).toBeCloseTo(rep?.holdings[0]?.ret ?? 0, 1);
    s = must(s, { type: 'trim', slot: 0 }).state;
    expect(s.slots[0]?.units).toBe(2);
    const v = s.slots[0]?.value ?? 1;
    s = must(s, { type: 'add', slot: 0 }).state;
    expect(s.slots[0]?.units).toBe(3);
    expect(s.slots[0]?.value).toBeCloseTo(1 + (2 * (v - 1)) / 3, 9);
    expect(s.ext?.learned).toEqual(['size', 'heavy', 'trim', 'add']);
  });
});

describe('押跌', () => {
  it('没解锁不能押；押跌许可证、炒股大佬能押（难度不送：第 6 级起送会让高难度比低难度还好打）', () => {
    expect(validate(ext('short-0'), { type: 'buy', rec: 0, short: true })).toBe('还没解锁押跌');
    expect(validate(ext('short-0', { difficulty: 8 }), { type: 'buy', rec: 0, short: true })).toBe('还没解锁押跌');
    for (const s of [ext('short-0', { items: ['short_permit'] }), ext('short-0', { persona: 'youzi' })]) {
      expect(validate(s, { type: 'buy', rec: 0, short: true })).toBeNull();
      expect(s.friends.some((f) => f.id === 'kongjun')).toBe(true);
    }
  });

  it('它跌你赚、它涨你亏，扣一点手续费；涨停被轧多亏一截', () => {
    let squeezes = 0;
    for (let k = 0; k < 6; k++) {
      let s = ext(`short-${k}`, { holdings: ['ai_meme', 'gm_meme', 'ne_meme', 'pig_meme'].filter((id) => createRun(`short-${k}`).state.stocks[id]).slice(0, 2) });
      for (const h of s.slots) if (h) h.short = true;
      for (let d = 0; d < 20 && s.phase === 'premarket'; d++) {
        s = must(s, { type: 'open' }).state;
        for (const hm of s.lastDay?.holdings ?? []) {
          const sq = hm.squeeze ? -hm.move * (BALANCE.ext.squeeze - 1) : 0;
          expect(hm.short).toBe(true);
          const mood = s.lastDay?.market.mood;
          const wind = mood === 'bull' ? -BALANCE.ext.shortWeather : mood === 'bear' ? BALANCE.ext.shortWeather : 0; // 合成行情看天气
          expect(hm.ret).toBeCloseTo(-hm.move - BALANCE.ext.shortFee + wind + sq, 1);
          expect(hm.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(hm.ret, 1);
          if (hm.squeeze) {
            squeezes += 1;
            // 回归：被轧那天持仓卡先揭晓的就是这一格的亏损，不会先闪一下股票本身的 +10%
            const st = s.lastDay?.stocks.find((x) => x.id === hm.stockId);
            const shown = revealShown({ ...hm, stock: { chain: st?.chain ?? 0 } });
            expect(shown).toBe(hm.ret);
            expect(shown).toBeLessThan(0);
          }
        }
      }
    }
    expect(squeezes).toBeGreaterThan(0);
  });
});

describe('抵押借钱', () => {
  it('第 2 个月起能借；借款加进账户，月底另付利息；家底太薄不借', () => {
    let s = ext('bank-1');
    expect(validate(s, { type: 'borrow', id: 'car' })).toMatch(/第 2 个月/);
    s = toMonth(s, 2);
    const t = collateralTerms('car', 1);
    const before = s.account;
    s = must(s, { type: 'borrow', id: 'car' }).state;
    expect(s.account).toBeCloseTo(before + (t?.amount ?? 0), 2);
    expect(debtOf(s)).toBe(t?.amount);
    expect(validate(s, { type: 'borrow', id: 'house' })).toBe('这个难度还押不了这件东西');
    let ev: string[] = [];
    while (s.month === 2 && s.phase === 'premarket') ev = must(s, { type: 'open' }).events.map((e) => e.type), (s = must(s, { type: 'open' }).state);
    void ev;
    expect(s.ext?.log.interest).toBeCloseTo((t?.amount ?? 0) * (t?.rate ?? 0), 2);
    expect(s.ext?.learned).toContain('interest');
  });

  it('跌破警戒线银行打电话；再跌收走东西、扣回借款和违约金；能赎回', () => {
    let s = toMonth(ext('bank-2', { difficulty: 3 }), 2);
    s = must(s, { type: 'borrow', id: 'house' }).state;
    const debt = debtOf(s);
    // 账户掉到两条线之间：打电话
    s.account = debt * (BALANCE.ext.callLine - 0.05);
    let r = must(s, { type: 'open' });
    s = r.state;
    if (s.ext?.loans.length) {
      expect(r.events.some((e) => e.type === 'bankCalled') || s.account >= debt * BALANCE.ext.callLine).toBe(true);
    }
    // 掉到收走线以下：收走
    s = toMonth(ext('bank-2', { difficulty: 3 }), 2);
    s = must(s, { type: 'borrow', id: 'house' }).state;
    s.account = debt * (BALANCE.ext.seizeLine - 0.1);
    r = must(s, { type: 'open' });
    const seized = r.events.find((e) => e.type === 'seized');
    expect(seized && seized.type === 'seized' ? seized.id : null).toBe('house');
    expect(r.state.ext?.log.seized).toEqual(['house']);
    expect(validate(r.state, { type: 'borrow', id: 'house' })).toMatch(/收走/);
    // 赎回
    s = toMonth(ext('bank-3'), 2);
    s = must(s, { type: 'borrow', id: 'bracelet' }).state;
    const a = s.account;
    s = must(s, { type: 'repay', id: 'bracelet' }).state;
    expect(s.account).toBeCloseTo(a - (collateralTerms('bracelet', 1)?.amount ?? 0), 2);
    expect(s.ext?.log.redeemed).toEqual(['bracelet']);
    expect(bankView(s).loans).toEqual([]);
  });

  it('月底付账单前先提醒；付完账单跌破线被收走时说清起因', () => {
    let s = toMonth(ext('bank-4', { difficulty: 3 }), 2);
    s = must(s, { type: 'borrow', id: 'house' }).state;
    // 不是付账单那天不提醒
    expect(bankRisk(s)).toBeNull();
    for (let i = 0; i < 40 && s.phase === 'premarket' && daysLeftInMonth(s) > 1; i++) {
      s.account = Math.max(s.account, debtOf(s) * 3 + s.bill.amount);
      s = must(s, { type: 'open' }).state;
    }
    expect(s.phase).toBe('premarket');
    const debt = debtOf(s);
    const interest = bankView(s).monthlyInterest;
    // 钱够：不提醒
    s.account = debt * 3 + s.bill.amount + interest;
    expect(bankRisk(s)).toBeNull();
    // 付完账单落在两条线之间：提醒会打电话
    s.account = debt * (BALANCE.ext.callLine - 0.05) + s.bill.amount + interest;
    expect(bankRisk(s)?.kind).toBe('call');
    // 付完账单跌破收东西的线：提醒会被收走，点名先收哪件
    s.account = debt * (BALANCE.ext.seizeLine - 0.1) + s.bill.amount + interest;
    const risk = bankRisk(s);
    expect(risk?.kind).toBe('seize');
    expect(risk?.first).toBe('房子');
    expect(risk?.short).toBeGreaterThan(0);
    // 手里有信用卡、钱不够付账单时信用卡垫上，账户不扣账单：不该提醒
    {
      const c = structuredClone(s);
      c.account = debt * 3 + interest;
      c.bill = { ...c.bill, amount: debt * 3 + 1000 };
      expect(bankRisk(c)?.kind).toBe('seize');
      c.items = [...c.items, 'credit'];
      expect(bankRisk(c)).toBeNull();
    }
    const r = must(s, { type: 'open' });
    const seized = r.events.find((e) => e.type === 'seized');
    expect(seized && seized.type === 'seized' ? { cause: seized.cause, debt: seized.debt, line: seized.line } : null).toEqual({
      cause: 'bill',
      debt,
      line: Math.round(debt * BALANCE.ext.seizeLine * 100) / 100,
    });
  });

  it('整局可以回放（含押跌、借钱、加减仓）', () => {
    let s = ext('replay-c', { items: ['short_permit'] });
    const rng = rngFor('replay-c', 'test');
    for (let i = 0; i < 400 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
      const cands: Action[] = [];
      if (s.phase === 'premarket') {
        for (let k = 0; k < s.today.recs.length; k++) for (const size of ['taste', 'half', 'heavy'] as const) cands.push({ type: 'buy', rec: k, size, short: rng.next() < 0.3 });
        for (let k = 0; k < s.slots.length; k++) cands.push({ type: 'add', slot: k }, { type: 'trim', slot: k }, { type: 'sell', slot: k });
        for (const id of ['bracelet', 'car'] as const) cands.push({ type: 'borrow', id }, { type: 'repay', id });
      }
      const ok = cands.filter((a) => validate(s, a) === null);
      const a: Action = ok.length > 0 && rng.next() < 0.5 ? (ok[rng.int(ok.length)] as Action) : s.phase === 'premarket' ? { type: 'open' } : s.phase === 'reward' ? { type: 'pickReward', index: 0 } : { type: 'choose', option: 0 };
      const r = dispatch(s, a);
      s = r.error ? must(s, s.phase === 'reward' ? { type: 'skipReward' } : { type: 'open' }).state : r.state;
    }
    expect(['won', 'lost']).toContain(s.phase);
    expect(replay(s.seed, s.actions, s.setup, { ext: true })).toEqual(s);
  });
});

describe('事件、小知识、故事', () => {
  it('0.4 C 的事件只在有新机制的局里出现，文案齐全', () => {
    const ids = ['bank_manager', 'bear_live', 'mother_in_law', 'parents_call'];
    const plain = createRun('evt-c').state;
    for (const id of ids) expect(eventById(id).prepare({ state: plain, rng: rngFor('x', id), month: 3 })).toBeNull();
    let s = toMonth(ext('evt-c', { difficulty: 5, account: 1_000_000 }), 2);
    s = must(s, { type: 'borrow', id: 'house' }).state;
    s = must(s, { type: 'borrow', id: 'pension' }).state;
    for (const id of ids) {
      const data = eventById(id).prepare({ state: s, rng: rngFor('x', id), month: 3 });
      if (id === 'bank_manager' && !data) continue;
      expect(data, id).not.toBeNull();
      const e = { ...data, id, month: 3 };
      expect(eventById(id).text(e, s).length).toBeGreaterThan(8);
      for (const o of eventById(id).options(e, s)) expect(o.length).toBeGreaterThan(2);
    }
    expect(EVENTS.length).toBe(19);
  });

  it('小知识：一句大白话 + 一句真实世界里叫什么；局中点亮、记进档案', () => {
    for (const k of KNOWLEDGE) {
      expect(k.text.length).toBeLessThan(40);
      expect(k.real.startsWith('真实世界里')).toBe(true);
    }
    const p = learnKnowledge(emptyProfile(), ['short', 'nope', 'size']);
    expect(p.profile.knowledge).toEqual(['size', 'short']);
    expect(p.added).toEqual(['size', 'short']);
    let s = ext('kn-1');
    s = must(s, { type: 'buy', rec: 0, size: 'heavy' }).state;
    s.phase = 'lost';
    const rec = recordRun(emptyProfile(), runSummary(s), '2026-10-12');
    expect(rec.newKnowledge).toEqual(['size', 'heavy']);
    expect(rec.profile.knowledge).toEqual(['size', 'heavy']);
  });

  it('结局故事讲到押了的东西、押跌、重仓', () => {
    const seg = JSON.parse(readFileSync('public/data/segments/' + JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')).segments[0].file, 'utf8')) as Segment;
    let s = createRun('tale-c', { items: ['short_permit'] }, { segment: seg, ext: true }).state;
    s = must(s, { type: 'buy', rec: 0, size: 'heavy' }).state;
    s = toMonth(s, 2);
    s = must(s, { type: 'borrow', id: 'car' }).state;
    s = must(s, { type: 'repay', id: 'car' }).state;
    s.phase = 'won';
    const story = storyView(s);
    expect(story?.lines.join('')).toMatch(/把车押了，又赎了回来|押车借的那笔钱/);
    expect(story?.lines.length).toBeLessThanOrEqual(8);
  });

  it('故事过滤伤亡、选举类的真实大事（含灾难停市）', () => {
    const src = readFileSync('tools/data/events.ts', 'utf8');
    const texts = [...src.matchAll(/date: '([^']+)', text: '([^']+)'/g)].map((m) => [m[1] as string, m[2] as string] as const);
    const bad = ['2001-09-11', '2001-09-17', '2005-08-29', '2011-03-11', '2012-10-29', '1999-09-21', '2000-11-08', '2008-11-04'];
    for (const [date, text] of texts) if (bad.includes(date)) expect(SENSITIVE_WORDS.some((w) => text.includes(w)), `${date} ${text}`).toBe(true);
  });
});
