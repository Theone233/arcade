/** 测试用的小工具：一把固定的密钥、全电脑跑完一场。 */
import { decide } from '../src/ai/index.ts';
import { apply, begin, current, pending } from '../src/core/rules.ts';
import type { Action, Opts, State } from '../src/core/types.ts';
import { view } from '../src/core/view.ts';

export function keyOf(n: number): number[] {
  return [n, n * 7 + 1, n * 13 + 2, 3, 4, 5, 6, 7].map((x) => x >>> 0);
}

/** 现在能出手的座位（交计划时是还没交的，之后是轮到回答的那辆） */
export function actors(s: State): number[] {
  if (s.phase === 'plan') return pending(s);
  const c = current(s);
  return c === null ? [] : [c];
}

/** 电脑替 seat 出一手；不合法就抛错 */
export function step(s: State, seat: number, a: Action = decide(view(s, seat), seat)): State {
  const r = apply(s, seat, a);
  if ('error' in r) throw new Error(`seat ${seat} ${JSON.stringify(a)}: ${r.error}`);
  return r;
}

/** 全电脑跑完一场，返回终局和每一步的状态数 */
export function race(n: number, opts: Opts, personas: number[] = [], maxSteps = 5_000, onStep?: (s: State) => void): { s: State; steps: number } {
  let s = begin(keyOf(n), opts, Array.from({ length: opts.cars }, () => 'ai'), personas);
  let steps = 0;
  while (s.phase !== 'over') {
    const who = actors(s);
    if (who.length === 0) throw new Error('nobody to act');
    s = step(s, who[0]!);
    onStep?.(s);
    if (++steps > maxSteps) throw new Error('race too long');
  }
  return { s, steps };
}
