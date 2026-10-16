/** 测试共用：安静的行情（去掉所有噪声）、临时改数值、按需摆好局面。 */
import { BALANCE, createRun, dispatch, type Action, type Balance, type GameEvent, type GameState, type RunSetup, type ThemeId } from '../src/core/index.ts';

/** 临时修改 BALANCE，回调结束后恢复。 */
export function withBalance<T>(patch: (b: Balance) => void, fn: () => T): T {
  const saved = structuredClone(BALANCE);
  patch(BALANCE);
  try {
    return fn();
  } finally {
    Object.assign(BALANCE, saved);
  }
}

/** 去掉所有随机噪声：个股涨跌 = 题材系数 × 题材涨幅 + 连板动量（大盘为 0）。 */
export function quiet(b: Balance): void {
  b.heat.noise = 0;
  b.market.noise = 0;
  b.market.ret = { bull: 0, flat: 0, bear: 0 };
  for (const r of Object.values(b.roles)) {
    r.noise = 0;
    r.jumpProb = 0;
  }
  b.st.uncap = 0;
  b.st.warn = 0;
}

export const SIX: ThemeId[] = ['ai', 'newenergy', 'consumer', 'finance', 'lowalt', 'pig'];

export function must(s: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  const r = dispatch(s, a);
  if (r.error) throw new Error(`${JSON.stringify(a)}：${r.error}`);
  return { state: r.state, events: r.events };
}

/** 开一局并把今天要结算的题材热度变化定下来（未提到的题材 ΔH 为 0），大盘为 0。 */
export function fixedDay(setup: RunSetup, dH: Partial<Record<ThemeId, number>>, heat: Partial<Record<ThemeId, number>> = {}): GameState {
  const s = createRun('fixed', { themes: SIX, ...setup }).state;
  for (const id of s.themeIds) {
    const t = s.themes[id];
    if (!t) continue;
    t.heat = heat[id] ?? 50;
    t.history = [t.heat];
    t.stage = 'rally';
    t.left = 5;
    s.today.plan.dH[id] = dH[id] ?? 0;
  }
  s.today.plan.marketRet = 0;
  s.today.plan.mood = s.mood;
  return s;
}

/** 按顺序执行操作，遇到非法操作抛错。 */
export function run(s: GameState, actions: readonly Action[]): GameState {
  let st = s;
  for (const a of actions) st = must(st, a).state;
  return st;
}
