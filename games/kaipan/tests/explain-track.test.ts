/**
 * 0.5.3 审阅：照搬真实走势时，收盘小结里"个股自己"那一项的说法必须和当天最终涨跌同方向。
 * 个股那一项是"比同风口多涨 / 多跌"的相对值，风口大涨、它涨得少时值是负的——以前会写成"涨 1.2%｜有资金在卖它"。
 * 另外补上 0.5.3 新逻辑的单测：买入次数文字、"谁说对了"、事件快捷键。
 */
import { describe, expect, it } from 'vitest';
import { type DayReport, type HoldingMove, type RetPart, type StockMove } from '../src/core/index.ts';
import { holdingParts } from '../src/core/explain.ts';
import { calledBy } from '../src/view/recap.ts';
import { EVENT_ORDER, buysText, eventOptionForKey } from '../src/view/labels.ts';
import { botByName, playRun, useMarket } from '../tools/bots.ts';
import { loadSegment, segmentIndex } from '../tools/segments-disk.ts';

/** 短签里说"往上"的词：当天必须是涨的；说"往下"的词：当天必须是跌的。 */
const UP = /往上冲|有资金在买|大好消息|有人抢|跟着冲|赌翻身|趁涨卖出|比同风口的多涨/;
const DOWN = /往下砸|有资金在卖|坏消息|没封住|没人敢接|比同风口的多跌|有资金托着，帮它少跌/;

function wrongWay(p: RetPart, ret: number): boolean {
  if (UP.test(p.label) && !(ret > 0)) return true;
  if (DOWN.test(p.label) && !(ret < 0)) return true;
  // 风口强弱和热度旁注不能打架
  return /比大环境弱（热度涨|比大环境强（热度掉/.test(p.label);
}

describe('照搬真实走势：原因的方向和涨跌一致', () => {
  it('135 段真实行情、两种机器人，零反例', () => {
    const segs = new Map(segmentIndex().segments.map((e) => [`ex-${e.id}`, e.id]));
    useMarket((seed) => {
      const id = segs.get(seed.replace(/-(smart|follower)$/, ''));
      return id ? loadSegment(id) : null;
    });
    const bad: string[] = [];
    let lines = 0;
    try {
      for (const key of segs.keys()) {
        for (const bot of ['smart', 'follower']) {
          playRun(`${key}-${bot}`, botByName(bot), null, (_s, events) => {
            for (const e of events) {
              if (e.type !== 'dayClosed') continue;
              for (const h of e.report.holdings) {
                if (!h.stockId || h.short) continue;
                lines++;
                for (const p of h.parts) if (p.kind === 'noise' || p.kind === 'theme') if (wrongWay(p, h.ret) && bad.length < 10) bad.push(`${h.stockId} ${h.ret}%｜${p.label}`);
              }
            }
          });
        }
      }
    } finally {
      useMarket(null);
    }
    expect(lines).toBeGreaterThan(5000);
    expect(bad).toEqual([]);
  }, 120_000);

  it('相对值和涨跌反着时顺着结果说；过山车按当天实际涨跌说方向', () => {
    const mv = (move: number, extra: Partial<StockMove> = {}): StockMove => ({ id: 'ai_leader', move, limitUp: false, limitDown: false, boards: 0, blown: false, jump: 0, chain: 0, st: null, ...extra });
    const own = (theme: number, noise: number, extra: Partial<StockMove> = {}, stockId = 'ai_leader'): string => {
      const ret = Math.round((theme + noise) * 100) / 100;
      const parts = holdingParts([{ kind: 'theme', value: theme }, { kind: 'noise', value: noise }], [], ret, { stockId, move: mv(ret, extra), dH: 0, marketRet: 0, boardsBefore: 0, track: true });
      return parts.find((p) => p.kind === 'noise')?.label ?? '';
    };
    // 风口大涨、它涨得少：涨 1.2%，不能说"有资金在卖它"
    expect(own(4, -2.8)).toMatch(/^有人趁涨卖出，让它少涨了 2\.8%$/);
    // 风口大跌、它跌得少：跌 0.4%，不能说"有资金在买它"
    expect(own(-3, 2.6)).toMatch(/^有资金托着，帮它少跌了 2\.6%$/);
    // 同方向照旧说资金 / 消息
    expect(own(1, 2)).toMatch(/^有资金在买它，比同风口的多涨 2%$/);
    expect(own(-1, -7)).toMatch(/^自家出了坏消息，比同风口的多跌 7%$/);
    // 没封住、连板这类只在方向对得上时说
    expect(own(5, -2, { blown: true })).not.toMatch(/没封住/);
    expect(own(-5, -2, { blown: true })).toMatch(/^昨天涨停今天没封住/);
    // 过山车：相对值是正的、当天却跌了 8%，要说"往下砸"
    expect(own(-12, 4, { wild: true }, 'pig_meme')).toMatch(/^过山车脾气发作，突然往下砸，帮它少跌了 4%$/);
    expect(own(12, -4, { wild: true }, 'pig_meme')).toMatch(/^过山车脾气发作，突然往上冲，让它少涨了 4%$/);
  });

  it('风口强弱和热度反着走时不提热度', () => {
    const lab = (v: number, dH: number): string =>
      holdingParts([{ kind: 'theme', value: v }], [], v, { stockId: 'ai_leader', move: { id: 'ai_leader', move: v, limitUp: false, limitDown: false, boards: 0, blown: false, jump: 0, chain: 0, st: null }, dH, marketRet: 0, boardsBefore: 0, track: true }).find((p) => p.kind === 'theme')?.label ?? '';
    expect(lab(-2, 6)).not.toMatch(/热度/);
    expect(lab(2, 6)).toMatch(/比大环境强（热度涨了 6）/);
  });
});

describe('买入次数文字', () => {
  it('次数用完、现金用完、还能买', () => {
    expect(buysText(0, 5)).toEqual({ text: '今天买够了', can: false });
    expect(buysText(2, 0)).toEqual({ text: '没现金了', can: false });
    expect(buysText(2, null)).toEqual({ text: '今天还能买 2 只', can: true });
    expect(buysText(1, 3)).toEqual({ text: '今天还能买 1 只', can: true });
  });
});

describe('谁说对了', () => {
  const hold = (move: number, short = false): HoldingMove => ({ slot: 0, stockId: 'ai_leader', move, ret: move, parts: [], lead: null, amount: 0, steps: [], holdRet: 0, short }) as unknown as HoldingMove;
  const report = (judges: DayReport['messages'], intel: DayReport['messages'] = []): DayReport => ({ messages: judges, intel }) as unknown as DayReport;
  const j = (friendId: string, claim: 'up' | 'down', hit: boolean, theme = 'ai'): DayReport['messages'][number] => ({ index: 0, friendId, theme, claim, truth: hit ? claim : claim === 'up' ? 'down' : 'up', hit }) as DayReport['messages'][number];

  it('同风口、同方向、说对了的群友', () => {
    expect(calledBy(report([j('laowang', 'up', true)]), hold(3))).toBe('老王');
    // 隔天揭晓的也算
    expect(calledBy(report([], [j('xiaoli', 'down', true)]), hold(-2))).toBe('小李');
  });

  it('方向反了、没说对、别的风口、押跌、没动：都不算', () => {
    expect(calledBy(report([j('laowang', 'down', true)]), hold(3))).toBe('');
    expect(calledBy(report([j('laowang', 'up', false)]), hold(3))).toBe('');
    expect(calledBy(report([j('laowang', 'up', true, 'pharma')]), hold(3))).toBe('');
    expect(calledBy(report([j('laowang', 'up', true)]), hold(3, true))).toBe('');
    expect(calledBy(report([j('laowang', 'up', true)]), hold(0.01))).toBe('');
  });
});

describe('事件快捷键', () => {
  it('按位置从左往右是 1、2', () => {
    expect(EVENT_ORDER.map((_, col) => eventOptionForKey(col + 1))).toEqual([...EVENT_ORDER]);
    expect(eventOptionForKey(1)).toBe(1);
    expect(eventOptionForKey(2)).toBe(0);
    expect(eventOptionForKey(3)).toBeNull();
    expect(eventOptionForKey(0)).toBeNull();
  });
});
