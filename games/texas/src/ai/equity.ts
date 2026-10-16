/**
 * 蒙特卡洛估胜率（DESIGN.md 3.4）：只用自己的底牌和公共牌，对手的底牌和没发的公共牌从剩下的牌里随机抽。
 * 结果是千分数（0–1000）。平局按人数分，记分用 60（1–6 的最小公倍数）除以平局人数，全程整数，换平台结果也一样。
 * 次数见 decide.ts 的 mcIters。
 *
 * floors（可选）是每个对手底牌的下限：翻牌前的强度（preflop.ts 的 strength）不到的就重抽，
 * 用来表示"他翻牌前加注了，手里多半不是烂牌"（4.2）。不给时随机数的用法和以前一样，翻牌前胜率表不用重新生成。
 */
import type { Card } from '../core/cards.ts';
import { evalMasks } from '../core/eval.ts';
import type { RandomStream } from 'arcade-kit/rng';
import { strength } from './preflop.ts';

/** 抽不到够强的牌时最多重抽几次：范围再窄也有个上限，CPU 有底（top 15% 平均要抽 6–7 次） */
const RETRIES = 16;

// 复用的缓冲区：热点里不分配
const rest = new Int32Array(52);
const used = new Uint8Array(52);
const board = new Int32Array(4);
const hand = new Int32Array(4);

/** 把一张牌加进四门花色的掩码 */
const bit = (c: number): number => 1 << (c >> 2);

export function equity(
  hole: readonly Card[],
  known: readonly Card[],
  opponents: number,
  iters: number,
  r: RandomStream,
  floors?: readonly number[],
): number {
  used.fill(0);
  for (const c of hole) used[c] = 1;
  for (const c of known) used[c] = 1;
  let n = 0;
  for (let c = 0; c < 52; c++) if (!used[c]) rest[n++] = c;
  const need = 5 - known.length;
  const draw = need + 2 * opponents;
  let score = 0;
  for (let it = 0; it < iters; it++) {
    // 只洗要用到的那几张
    for (let i = 0; i < draw; i++) {
      const j = i + r.below(n - i);
      const t = rest[i]!;
      rest[i] = rest[j]!;
      rest[j] = t;
    }
    board[0] = board[1] = board[2] = board[3] = 0;
    for (const c of known) board[c & 3]! |= bit(c);
    for (let i = 0; i < need; i++) board[rest[i]! & 3]! |= bit(rest[i]!);
    // 有下限的对手：从还没用的牌里重抽到够强为止（换位置不影响剩下的牌仍是随机的）
    if (floors)
      for (let o = 0; o < opponents; o++) {
        const f = floors[o]!;
        const i = need + 2 * o;
        for (let k = 0; f > 0 && k < RETRIES && strength(rest[i]!, rest[i + 1]!) < f; k++) {
          for (let m = i; m < i + 2; m++) {
            const j = m + r.below(n - m);
            const t = rest[m]!;
            rest[m] = rest[j]!;
            rest[j] = t;
          }
        }
      }
    const mine = withTwo(hole[0]!, hole[1]!);
    let ties = 0;
    let lost = false;
    for (let o = 0; o < opponents && !lost; o++) {
      const v = withTwo(rest[need + 2 * o]!, rest[need + 2 * o + 1]!);
      if (v > mine) lost = true;
      else if (v === mine) ties++;
    }
    if (!lost) score += 60 / (ties + 1);
  }
  return Math.floor((score * 1000) / (60 * iters));
}

/** 公共牌（board）加两张底牌的牌力，不改 board */
function withTwo(a: number, b: number): number {
  hand.set(board);
  hand[a & 3]! |= bit(a);
  hand[b & 3]! |= bit(b);
  return evalMasks(hand[0]!, hand[1]!, hand[2]!, hand[3]!);
}
