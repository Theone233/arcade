/**
 * 翻牌前查表（DESIGN.md 3.4）：169 种起手牌 × 1–8 个随机对手的胜率（千分数；0.2.0 起 9 人桌，从 5 扩到 8）。
 * 表由 scripts/gen-preflop.ts 用固定种子离线生成（每格 3 万次蒙特卡洛），写在 preflop-table.ts；test/ai.test.ts 抽几格重算核对。
 */
import { rankOf, suitOf, type Card } from '../core/cards.ts';
import { PREFLOP } from './preflop-table.ts';

/**
 * 表里最多几个对手（9 人桌 = 8 个）。不能少于桌上的对手数：电脑按"胜率 ×（对手数 + 1）"比门槛，
 * 8 个对手却查 5 个对手的胜率，每手牌的相对强度都虚高一半，9 人桌的电脑个个乱加注（0.2.0 调教时发现）
 */
export const PREFLOP_OPP = 8;

/**
 * 起手牌的类别 0–168：13 × 13 的格子，对子在对角线，同花放在"大点数行、小点数列"，不同花反过来。
 */
export function handClass(a: Card, b: Card): number {
  const hi = Math.max(rankOf(a), rankOf(b));
  const lo = Math.min(rankOf(a), rankOf(b));
  return suitOf(a) === suitOf(b) ? hi * 13 + lo : lo * 13 + hi;
}

/** 这一类的一手代表牌（生成表时用）：同花用黑桃，不同花和对子用黑桃 + 红桃 */
export function classCards(k: number): [Card, Card] {
  const r = Math.floor(k / 13);
  const c = k % 13;
  if (r > c) return [r * 4 + 3, c * 4 + 3];
  return [c * 4 + 3, r * 4 + 2];
}

/** 胜率千分数；opponents 1–8 */
export function preflopEquity(a: Card, b: Card, opponents: number): number {
  return PREFLOP[handClass(a, b) * PREFLOP_OPP + Math.min(PREFLOP_OPP, Math.max(1, opponents)) - 1]!;
}

/** 起手牌的强度：对 1 个随机对手的胜率千分数。拿来排"前百分之几的牌" */
export const strength = (a: Card, b: Card): number => PREFLOP[handClass(a, b) * PREFLOP_OPP]!;

/**
 * TOP[p]：前 p% 的起手牌（按组合数算，一共 1326 种）里最弱的那一类的强度，p 取 0–100。
 * 对子 6 种组合、同花 4 种、不同花 12 种。
 */
export const TOP: readonly number[] = (() => {
  const ks = Array.from({ length: 169 }, (_, k) => k).sort((x, y) => PREFLOP[y * PREFLOP_OPP]! - PREFLOP[x * PREFLOP_OPP]! || x - y);
  const out: number[] = [];
  let acc = 0;
  let i = 0;
  for (let p = 0; p <= 100; p++) {
    while (i < ks.length && acc * 100 < p * 1326) {
      const k = ks[i++]!;
      const r = Math.floor(k / 13);
      const c = k % 13;
      acc += r === c ? 6 : r > c ? 4 : 12;
    }
    out.push(i === 0 ? 1000 : PREFLOP[ks[i - 1]! * PREFLOP_OPP]!);
  }
  return out;
})();
