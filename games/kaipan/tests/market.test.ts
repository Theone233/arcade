import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  STAGES,
  advanceStage,
  baseMarketRules,
  baseRules,
  createRng,
  createRun,
  dirOf,
  effectiveDH,
  failChance,
  feelOf,
  hashSeed,
  marketReturn,
  moveStocks,
  nextMood,
  rngFor,
  rollDH,
  settleTheme,
  stageDH,
  stageDays,
  turnOf,
  type GameState,
  type Stage,
  type ThemeState,
} from '../src/core/index.ts';
import { SIX, quiet, withBalance } from './helpers.ts';

function theme(stage: Stage, heat = 50, left = 3, id: ThemeState['id'] = 'pharma'): ThemeState {
  return { id, heat, history: [heat], stage, lastStage: stage, left, sure: false, boost: null };
}

describe('随机数', () => {
  it('同种子同序列；按用途分流互不影响；范围正确', () => {
    const a = rngFor('s', 'x');
    const b = rngFor('s', 'x');
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    expect(rngFor('s', 'x').next()).not.toBe(rngFor('s', 'y').next());
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    const r = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      expect(r.int(7)).toBeLessThan(7);
    }
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < 5000; i++) {
      const z = r.normal();
      sum += z;
      sq += z * z;
    }
    expect(Math.abs(sum / 5000)).toBeLessThan(0.05);
    expect(sq / 5000).toBeGreaterThan(0.9);
    expect(sq / 5000).toBeLessThan(1.1);
  });
});

describe('题材生命周期（状态机）', () => {
  const mr = baseMarketRules();

  it('阶段循环：冷门 → 萌芽 → 发酵 → 主升 → 高潮 → 退潮 → 冷门', () => {
    const next: Partial<Record<Stage, Set<Stage>>> = {};
    for (const from of STAGES) {
      const seen = new Set<Stage>();
      for (let i = 0; i < 400; i++) {
        const t = theme(from, 50, 0);
        advanceStage(t, mr, rngFor('cycle', from, i));
        seen.add(t.stage);
      }
      next[from] = seen;
    }
    expect([...(next.cold ?? [])]).toEqual(['sprout']);
    expect([...(next.sprout ?? [])].sort()).toEqual(['cold', 'ferment']);
    expect([...(next.ferment ?? [])].sort()).toEqual(['ebb', 'rally']);
    expect([...(next.rally ?? [])]).toEqual(['climax']);
    expect([...(next.climax ?? [])]).toEqual(['ebb']);
    expect([...(next.ebb ?? [])]).toEqual(['cold']);
  });

  it('失败岔路的概率：假启动约 25%，证伪约 20%（低空经济萌芽更容易夭折）', () => {
    const rate = (stage: Stage, id: ThemeState['id'], to: Stage): number => {
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        const t = theme(stage, 50, 0, id);
        advanceStage(t, mr, rngFor('fail', stage, id, i));
        if (t.stage === to) n += 1;
      }
      return n / 4000;
    };
    expect(rate('sprout', 'pharma', 'cold')).toBeCloseTo(failChance('sprout', 'pharma'), 1);
    expect(rate('ferment', 'pharma', 'ebb')).toBeCloseTo(failChance('ferment', 'pharma'), 1);
    expect(failChance('sprout', 'lowalt')).toBeGreaterThan(failChance('sprout', 'pharma'));
    // 稀有股票拉起的萌芽不会夭折
    for (let i = 0; i < 200; i++) {
      const t = { ...theme('sprout', 50, 0), sure: true };
      advanceStage(t, mr, rngFor('sure', i));
      expect(t.stage).toBe('ferment');
      expect(t.sure).toBe(false);
    }
  });

  it('阶段天数在范围内；没用完时不换阶段', () => {
    for (const from of STAGES) {
      for (let i = 0; i < 200; i++) {
        const t = theme(from, 30, 0);
        advanceStage(t, mr, rngFor('days', from, i));
        const [lo, hi] = stageDays(t.stage, 'pharma');
        expect(t.left).toBeGreaterThanOrEqual(lo);
        expect(t.left).toBeLessThanOrEqual(hi);
      }
      const t = theme(from, 30, 2);
      advanceStage(t, mr, rngFor('stay', from));
      expect(t.stage).toBe(from);
    }
    // 题材速度：AI 周期更快，金融更慢；养猪冷门更久
    expect(stageDays('rally', 'ai')[1]).toBeLessThan(stageDays('rally', 'finance')[1]);
    expect(stageDays('cold', 'pig')[1]).toBeGreaterThan(stageDays('cold', 'pharma')[1]);
  });

  it('热度触顶：萌芽 / 发酵 / 主升强制进入高潮，高潮进入退潮', () => {
    for (const stage of ['sprout', 'ferment', 'rally'] as Stage[]) {
      const t = theme(stage, 100, 3);
      advanceStage(t, mr, rngFor('top', stage));
      expect(t.stage).toBe('climax');
    }
    const t = theme('climax', 100, 3);
    advanceStage(t, mr, rngFor('top2'));
    expect(t.stage).toBe('ebb');
  });

  it('每天热度变化在该阶段的范围内；热度截断在 0..100', () => {
    for (const stage of STAGES) {
      if (stage === 'cold') continue;
      const [lo, hi] = stageDH(stage, 'pharma', mr);
      for (let i = 0; i < 200; i++) {
        const d = rollDH(theme(stage, 50), mr, rngFor('dh', stage, i));
        expect(d).toBeGreaterThanOrEqual(Math.round(lo));
        expect(d).toBeLessThanOrEqual(Math.round(hi));
      }
    }
    // 冷门期热度慢慢回落
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += rollDH(theme('cold', 60), mr, rngFor('cold', i));
    expect(sum / 200).toBeLessThan(-2);
    expect(effectiveDH(95, 20)).toBe(5);
    expect(effectiveDH(5, -20)).toBe(-5);
    const t = theme('rally', 95);
    const r = settleTheme(t, 20, mr, rngFor('settle'));
    expect(t.heat).toBe(100);
    expect(r.dH).toBe(5);
    expect(t.left).toBe(2);
  });

  it('题材当日涨幅 = coef × 实际热度变化 + 噪声', () => {
    for (let i = 0; i < 100; i++) {
      const t = theme('rally', 40);
      const r = settleTheme(t, 10, mr, rngFor('ret', i));
      const noise = BALANCE.heat.noise * BALANCE.themes.pharma.noise;
      expect(Math.abs(r.ret - BALANCE.heat.coef * 10)).toBeLessThanOrEqual(noise + 0.01);
    }
  });

  it('体感标签只由公开数据算出', () => {
    expect(feelOf([20, 21])).toBe('cold');
    expect(feelOf([20, 26])).toBe('warming');
    expect(feelOf([50, 60])).toBe('hot');
    expect(feelOf([80, 90])).toBe('overheated');
    expect(feelOf([90, 70])).toBe('cooling');
    expect(dirOf(3)).toBe('up');
    expect(dirOf(2)).toBe('flat');
    expect(dirOf(-3)).toBe('down');
  });
});

describe('拐点（隐藏）', () => {
  it('阶段今天刚切换时是拐点：启动、见顶、退潮（含证伪）、假启动；其余切换和延续都不是', () => {
    const at = (last: Stage, now: Stage): ReturnType<typeof turnOf> => turnOf({ ...theme(now), lastStage: last });
    expect(at('cold', 'sprout')).toBe('start');
    expect(at('rally', 'climax')).toBe('top');
    expect(at('sprout', 'climax')).toBe('top');
    expect(at('climax', 'ebb')).toBe('ebb');
    expect(at('ferment', 'ebb')).toBe('ebb');
    expect(at('sprout', 'cold')).toBe('fizzle');
    expect(at('ebb', 'cold')).toBeNull();
    expect(at('sprout', 'ferment')).toBeNull();
    expect(at('ferment', 'rally')).toBeNull();
    for (const st of STAGES) expect(at(st, st)).toBeNull();
  });
});

describe('大盘', () => {
  it('牛 / 平 / 熊持续性很强（约 0.9）', () => {
    const mr = baseMarketRules();
    let stay = 0;
    for (let i = 0; i < 4000; i++) if (nextMood('bull', mr, rngFor('mood', i)) === 'bull') stay += 1;
    expect(stay / 4000).toBeCloseTo(BALANCE.market.persist, 1);
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += marketReturn('bull', mr, rngFor('mret', i));
    expect(sum / 2000).toBeCloseTo(BALANCE.market.ret.bull, 1);
  });
});

/** 安静行情下，指定题材涨幅，算一遍所有股票。 */
function moves(s: GameState, themeRet: number, held: string[] = [], rules = baseRules()) {
  return moveStocks({
    seed: s.seed,
    day: s.today.day,
    state: s,
    themeRet: Object.fromEntries(s.themeIds.map((id) => [id, themeRet])),
    marketRet: 0,
    mr: baseMarketRules(),
    rules,
    held: new Set(held),
  });
}

describe('个股涨跌', () => {
  it('当日涨幅 = 题材系数 × 题材涨幅（安静行情）；涨跌停 ±10%，ST ±5%', () => {
    withBalance(quiet, () => {
      const s = createRun('stock', { themes: SIX }).state;
      const m = moves(s, 2);
      const get = (id: string) => m.find((x) => x.id === id);
      expect(get('ai_leader')?.move).toBeCloseTo(3, 2);
      expect(get('ai_follower')?.move).toBeCloseTo(1.6, 2);
      expect(get('con_blue')?.move).toBeCloseTo(1, 2);
      expect(get('ai_meme')?.move).toBeCloseTo(2, 2);
      expect(get('st_lazy')?.move).toBeCloseTo(0.6, 2);
      const up = moves(createRun('stock', { themes: SIX }).state, 30);
      expect(up.find((x) => x.id === 'ai_leader')).toMatchObject({ move: 10, limitUp: true, boards: 1 });
      expect(up.find((x) => x.id === 'st_lazy')).toMatchObject({ move: 5, limitUp: true });
      const down = moves(createRun('stock', { themes: SIX }).state, -30);
      expect(down.find((x) => x.id === 'ai_leader')).toMatchObject({ move: -10, limitDown: true, boards: 0 });
    });
  });

  it('龙头涨停时，同题材跟风股 +2%（龙头带动）', () => {
    withBalance(quiet, () => {
      const s = createRun('chain', { themes: SIX }).state;
      const m = moves(s, 7); // 龙头 10.5 → 涨停；跟风 5.6 + 2
      expect(m.find((x) => x.id === 'ai_leader')?.limitUp).toBe(true);
      expect(m.find((x) => x.id === 'ai_follower')).toMatchObject({ chain: BALANCE.chain, move: 7.6 });
      expect(m.find((x) => x.id === 'ai_meme')?.chain).toBe(0);
      const calm = moves(createRun('chain', { themes: SIX }).state, 3);
      expect(calm.find((x) => x.id === 'ai_follower')?.chain).toBe(0);
    });
  });

  it('连板：涨停连板数 +1，没涨停清零；连板数 c 越高第二天越强（+1.5% × c）', () => {
    withBalance(
      (b) => {
        quiet(b);
        b.boards.blow = 0;
      },
      () => {
        const s = createRun('boards', { themes: SIX }).state;
        moves(s, 30);
        expect(s.stocks.ai_leader?.boards).toBe(1);
        s.today.day += 1;
        moves(s, 30);
        expect(s.stocks.ai_leader?.boards).toBe(2);
        s.today.day += 1;
        const m = moves(s, 0);
        expect(m.find((x) => x.id === 'ai_leader')?.move).toBeCloseTo(2 * BALANCE.boards.momentum, 2);
        expect(s.stocks.ai_leader?.boards).toBe(0);
      },
    );
  });

  it('炸板概率 = 10% × 连板数，炸板当天按 −6% 计；连板梦让持仓炸板率 ×1.5、动量 ×2', () => {
    withBalance(quiet, () => {
      let blown = 0;
      let blownHeld = 0;
      const N = 3000;
      const rules = baseRules();
      rules.blowMult = 1.5;
      rules.momentumMult = 2;
      // 局面只开一次、每轮把连板数摆回 2（每轮新开一局太慢，全量并行跑时会超时）
      const s = createRun('blow', { themes: SIX }).state;
      const s2 = createRun('blow', { themes: SIX }).state;
      for (let i = 0; i < N; i++) {
        s.today.day = i;
        const leader = s.stocks.ai_leader;
        if (leader) leader.boards = 2;
        const m = moves(s, 0).find((x) => x.id === 'ai_leader');
        if (m?.blown) {
          blown += 1;
          expect(m.move).toBe(BALANCE.boards.blowMove);
        } else {
          expect(m?.move).toBeCloseTo(2 * BALANCE.boards.momentum, 2);
        }
        s2.today.day = i;
        if (s2.stocks.ai_leader) s2.stocks.ai_leader.boards = 2;
        const m2 = moves(s2, 0, ['ai_leader'], rules).find((x) => x.id === 'ai_leader');
        if (m2?.blown) blownHeld += 1;
        else expect(m2?.move).toBeCloseTo(4 * BALANCE.boards.momentum, 2);
      }
      expect(blown / N).toBeCloseTo(0.2, 1);
      expect(blownHeld / N).toBeCloseTo(0.3, 1);
    });
  });

  it('妖股：8% 概率跳空 ±6~10%', () => {
    withBalance(
      (b) => {
        quiet(b);
        b.roles.meme.jumpProb = 0.08;
      },
      () => {
        let jumps = 0;
        for (let i = 0; i < 3000; i++) {
          const s = createRun('meme', { themes: SIX }).state;
          s.today.day = i;
          const m = moves(s, 0).find((x) => x.id === 'ai_meme');
          if (m && m.jump !== 0) {
            jumps += 1;
            expect(Math.abs(m.jump)).toBeGreaterThanOrEqual(6);
            expect(Math.abs(m.jump)).toBeLessThanOrEqual(10);
          }
        }
        expect(jumps / 3000).toBeCloseTo(0.08, 1);
      },
    );
  });

  it('ST：摘帽后连续涨停；两次退市警告即退市（跌 90%）', () => {
    withBalance(
      (b) => {
        quiet(b);
        b.st.uncap = 1;
        b.st.uncapDays = [3, 3];
      },
      () => {
        const s = createRun('st', { themes: SIX }).state;
        const m1 = moves(s, 0).find((x) => x.id === 'st_lazy');
        expect(m1).toMatchObject({ st: 'uncap', move: 5, limitUp: true });
        expect(s.stocks.st_lazy?.uncap).toBe(2);
        s.today.day += 1;
        const m2 = moves(s, -5).find((x) => x.id === 'st_lazy');
        expect(m2).toMatchObject({ move: 5, limitUp: true, boards: 2 });
      },
    );
    withBalance(
      (b) => {
        quiet(b);
        b.st.warn = 1;
      },
      () => {
        const s = createRun('st2', { themes: SIX }).state;
        const m1 = moves(s, 0).find((x) => x.id === 'st_bye');
        expect(m1?.st).toBe('warning');
        expect(s.stocks.st_bye?.warnings).toBe(1);
        s.today.day += 1;
        const m2 = moves(s, 0).find((x) => x.id === 'st_bye');
        expect(m2).toMatchObject({ st: 'delisted', move: BALANCE.st.delistMove });
        expect(s.stocks.st_bye?.delisted).toBe(true);
        s.today.day += 1;
        expect(moves(s, 0).find((x) => x.id === 'st_bye')).toBeUndefined();
      },
    );
  });
});
