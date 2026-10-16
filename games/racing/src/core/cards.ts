/**
 * 牌（DESIGN.md 2.1、2.4）。每辆车的牌各管各的：一张牌是这辆车里的一个编号（id），编号对应的种类记在 Car.kinds 里。
 * 种类用小整数：0–5 是速度（1–4 是速度牌，0 和 5 是改装牌），10 是热量，11 是手抖。
 */

export const HEAT = 10;
export const STRESS = 11;
/** 起手和补牌补到几张 */
export const HAND = 7;

/** 能打出去的：热量以外都能打（手抖牌打出去是为了清手） */
export function playable(kind: number): boolean {
  return kind !== HEAT;
}

/** 能弃的：热量和手抖都不能弃 */
export function discardable(kind: number): boolean {
  return kind !== HEAT && kind !== STRESS;
}

/** 手抖、冲刺翻牌时算数的只有 1–4 的速度牌；改装牌 0、5 和热量、手抖翻到了进弃牌堆接着翻 */
export function flipCounts(kind: number): boolean {
  return kind >= 1 && kind <= 4;
}

/** 打出去算几点（手抖牌在翻牌时另算，这里给 0） */
export function faceValue(kind: number): number {
  return kind >= 0 && kind <= 5 ? kind : 0;
}

/** 一辆车开局的牌：12 张速度牌（1–4 各 3 张）、改装牌（0、5、一张多出来的热量）、stress 张手抖；引擎里 heat 张热量 */
export function startingKinds(heat: number, stress: number): { kinds: number[]; deck: number[]; engine: number[] } {
  const kinds: number[] = [];
  const deck: number[] = [];
  const engine: number[] = [];
  const add = (kind: number, to: number[]): void => {
    to.push(kinds.length);
    kinds.push(kind);
  };
  for (let v = 1; v <= 4; v++) for (let i = 0; i < 3; i++) add(v, deck);
  add(0, deck);
  add(5, deck);
  add(HEAT, deck);
  for (let i = 0; i < stress; i++) add(STRESS, deck);
  for (let i = 0; i < heat; i++) add(HEAT, engine);
  return { kinds, deck, engine };
}
