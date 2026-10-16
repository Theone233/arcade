/**
 * 0.5.4 审阅：结算的几个数要对得上账，旧存档接着玩不能按半截数评。
 * 本钱 + 炒股净赚 − 账单 + 其他 (+ 没还的借款) = 最后剩；炒股净赚 = 每天收盘的赚亏 + 持仓上的道具加成 − 买入的冲击成本和手续费。
 */
import { describe, expect, it } from 'vitest';
import { dispatch, itemById, runSummary, type GameEvent, type GameState } from '../src/core/index.ts';
import { reviveState } from '../src/platform/storage.ts';
import { endSubtitle, ledgerRows } from '../src/view/labels.ts';
import { botByName, playRun, useExt, useMarket } from '../tools/bots.ts';
import { segmentForSeed } from '../tools/segments-disk.ts';

const r2 = (v: number): number => Math.round(v * 100) / 100;

describe('结算对得上账', () => {
  it('炒股净赚、还掉的账单和逐日逐月事件的合计一致；几个数加起来等于最后剩', () => {
    useMarket(segmentForSeed);
    useExt(true);
    try {
      let runs = 0;
      for (const bot of ['smart', 'gambler', 'random']) {
        for (let i = 0; i < 6; i++) {
          let trade = 0;
          let bills = 0;
          const s = playRun(`ledger-${bot}-${i}`, botByName(bot), null, (_st, events: readonly GameEvent[]) => {
            for (const e of events) {
              if (e.type === 'dayClosed') trade += e.report.account.after - e.report.account.before;
              if (e.type === 'bought' && e.cost) trade -= e.cost;
              // 月底持仓上的道具加成（白马分红）；收盘时的道具效果已经在当天的赚亏里
              if (e.type === 'itemTriggered' && e.slot !== null && itemById(e.itemId).onMonthEnd) trade += e.delta;
              if (e.type === 'billPaid' && !e.credit) bills += e.amount;
            }
          });
          const sum = runSummary(s);
          expect(sum.tradeMoney, `${s.seed} 炒股`).toBeCloseTo(r2(trade), 0);
          expect(sum.billMoney, `${s.seed} 账单`).toBeCloseTo(r2(bills), 0);
          expect(sum.otherMoney).not.toBeNull();
          expect(r2(sum.startAccount + (sum.tradeMoney ?? 0) - (sum.billMoney ?? 0) + (sum.otherMoney ?? 0) + sum.debtLeft)).toBeCloseTo(sum.account, 1);
          runs++;
        }
      }
      expect(runs).toBe(18);
    } finally {
      useMarket(null);
      useExt(false);
    }
  });
});

describe('旧存档接着玩', () => {
  /** 0.5.3 的存档没有这两项 */
  function legacy(s: GameState): GameState {
    const raw = JSON.parse(JSON.stringify(s)) as GameState;
    delete raw.stats.tradeMoney;
    delete raw.stats.billMoney;
    return raw;
  }

  it('读档后不从半路记起，结算走旧说法', () => {
    let s = playRun('ledger-legacy', botByName('smart'), null, undefined, 60);
    expect(s.stats.tradeMoney).toBeDefined();
    const back = reviveState(legacy(s));
    expect(back).not.toBeNull();
    s = back as GameState;
    for (let i = 0; i < 400 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
      const a = s.phase === 'reward' ? ({ type: 'skipReward' } as const) : s.phase === 'event' ? ({ type: 'choose', option: 0 } as const) : ({ type: 'open' } as const);
      s = dispatch(s, a).state;
    }
    expect(s.stats.tradeMoney).toBeUndefined();
    expect(s.stats.billMoney).toBeUndefined();
    const sum = runSummary(s);
    expect([sum.tradeMoney, sum.billMoney, sum.otherMoney]).toEqual([null, null, null]);
    expect(ledgerRows(sum).map((r) => r[0])).toEqual(['本钱', '最后剩']);
    const sub = endSubtitle(sum);
    expect(sub).not.toContain('炒股');
    expect(sub).toMatch(sum.won ? /12 个月的钱全还上了/ : /游戏结束/);
  });

  it('存档里这两项坏了：一起丢掉，不补 0', () => {
    const s = playRun('ledger-bad', botByName('smart'), null, undefined, 30);
    const raw = JSON.parse(JSON.stringify(s)) as { stats: Record<string, unknown> };
    raw.stats.tradeMoney = 'x';
    const back = reviveState(raw) as GameState;
    expect(back.stats.tradeMoney).toBeUndefined();
    expect(back.stats.billMoney).toBeUndefined();
  });
});
