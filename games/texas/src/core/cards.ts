/**
 * 牌：0–51 的整数，点数 * 4 + 花色。点数 0 是 2、12 是 A；花色 0–3 只用来分同花，不分大小。
 * 用整数而不是对象：状态能直接 JSON 存取，牌力评估也只要移位。
 */
export type Card = number;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';

/** 测试用的写法，比如 'As'、'Td'、'2c' */
export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s[0]!);
  const u = SUITS.indexOf(s[1]!);
  if (s.length !== 2 || r < 0 || u < 0) throw new Error(`bad card ${s}`);
  return r * 4 + u;
}

/** 'As Kd 2c' → [Card] */
export const parseCards = (s: string): Card[] => (s.trim() ? s.trim().split(/\s+/).map(parseCard) : []);
