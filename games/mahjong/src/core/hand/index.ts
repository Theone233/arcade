/**
 * 手牌分析（DESIGN.md 3.2），所有玩法共用：向听数、有效牌、听牌、和牌拆解。
 *
 * 输入一律是计数数组（长 34，见 tiles）。副露另算：手里的牌加上"已经成组的副露数"一起判断。
 * 玩法的限制（川麻的缺门、日麻的役）不在这里，由玩法在外面套：
 * - 缺门这类"根本不能用的牌"用 dead（不可用的牌种）传进来：这些牌不参与拆解，向听数还要算上"打掉它们"的轮数（shanten 的注释）；
 * - 七对里四张一样算不算两对，各玩法不同（川麻算，日麻不算），用 sevenQuads 传。
 *
 * 一般型向听按门拆：每一门（9 种）单独用记忆化递归算出"凑几组、有没有将时最多几个搭子"的表，再四门合起来，
 * 所以 AI 一次决策几百次调用也只是查表加一点合并。
 */
import { HONOR0, KINDS } from '../tiles/index.ts';

export type Counts = number[];

/** 向听数的算法开关：玩法声明开哪几种（川麻：一般型 + 七对；日麻再开国士） */
export interface ShapeRules {
  seven: boolean;
  /** 七对里四张一样算两对（川麻的龙七对）；日麻不算 */
  sevenQuads: boolean;
  kokushi: boolean;
}

/**
 * 一门（或字牌）的拆法表：tab[p × 5 + m] = 凑出 m 组（0–4）、有（p = 1）或没有将时最多几个搭子，凑不出是 -1。
 * 向听数随搭子数单调减，所以每个 (m, p) 只要记最多的搭子数，四门合起来是一个很小的动态规划，热点路径上不分配内存。
 */
type Table = Int8Array;

const suitMemo = new Map<number, Table>();
const honorMemo = new Map<number, Table>();

function newTable(): Table {
  return new Int8Array(10).fill(-1);
}

function note(tab: Table, m: number, t: number, p: number): void {
  if (m > 4) m = 4;
  const i = p * 5 + m;
  if (t > tab[i]!) tab[i] = t;
}

/** 一门数牌（counts[from..from+8]）的拆法表 */
function suitTable(counts: Counts, from: number): Table {
  let key = 0;
  for (let i = 0; i < 9; i++) key = key * 5 + counts[from + i]!;
  const hit = suitMemo.get(key);
  if (hit) return hit;
  const c = counts.slice(from, from + 9);
  const tab = newTable();
  const walk = (i: number, m: number, t: number, p: number): void => {
    while (i < 9 && c[i] === 0) i++;
    if (i >= 9) return note(tab, m, t, p);
    // 刻子
    if (c[i]! >= 3) {
      c[i]! -= 3;
      walk(i, m + 1, t, p);
      c[i]! += 3;
    }
    // 顺子
    if (i <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
      c[i]!--, c[i + 1]!--, c[i + 2]!--;
      walk(i, m + 1, t, p);
      c[i]!++, c[i + 1]!++, c[i + 2]!++;
    }
    // 对子：当将，或者当搭子
    if (c[i]! >= 2) {
      c[i]! -= 2;
      if (!p) walk(i, m, t, 1);
      walk(i, m, t + 1, p);
      c[i]! += 2;
    }
    // 两面、边张（i, i+1）和嵌张（i, i+2）
    if (i <= 7 && c[i + 1]! > 0) {
      c[i]!--, c[i + 1]!--;
      walk(i, m, t + 1, p);
      c[i]!++, c[i + 1]!++;
    }
    if (i <= 6 && c[i + 2]! > 0) {
      c[i]!--, c[i + 2]!--;
      walk(i, m, t + 1, p);
      c[i]!++, c[i + 2]!++;
    }
    // 这一张不用（孤张）：剩下的同种牌也都当孤张跳过，免得重复枚举
    const keep = c[i]!;
    c[i] = 0;
    walk(i + 1, m, t, p);
    c[i] = keep;
  };
  walk(0, 0, 0, 0);
  suitMemo.set(key, tab);
  return tab;
}

/** 字牌：只能刻子、对子 */
function honorTable(counts: Counts): Table {
  let key = 0;
  for (let k = HONOR0; k < KINDS; k++) key = key * 5 + counts[k]!;
  const hit = honorMemo.get(key);
  if (hit) return hit;
  const tab = newTable();
  const walk = (k: number, m: number, t: number, p: number): void => {
    if (k >= KINDS) return note(tab, m, t, p);
    const x = counts[k]!;
    if (x >= 3) walk(k + 1, m + 1, t, p);
    if (x >= 2) {
      walk(k + 1, m, t + 1, p);
      if (!p) walk(k + 1, m, t, 1);
    }
    walk(k + 1, m, t, p);
  };
  walk(HONOR0, 0, 0, 0);
  honorMemo.set(key, tab);
  return tab;
}

const dpA = new Int8Array(10);
const dpB = new Int8Array(10);

/**
 * 一般型向听（不管缺门）：8 - 2×组 - 搭子 - 将，组 + 搭子最多 4（副露算组）。
 * 13 张（3n+1）时 0 是听牌；14 张（3n+2）时 -1 是和了。
 */
export function shantenGeneral(counts: Counts, melds: number): number {
  let cur = dpA;
  let nxt = dpB;
  cur.fill(-1);
  cur[Math.min(melds, 4)] = 0;
  const tables = [suitTable(counts, 0), suitTable(counts, 9), suitTable(counts, 18), honorTable(counts)];
  for (const g of tables) {
    nxt.fill(-1);
    for (let p = 0; p < 2; p++)
      for (let m = 0; m < 5; m++) {
        const t = cur[p * 5 + m]!;
        if (t < 0) continue;
        for (let p2 = 0; p2 + p < 2; p2++)
          for (let m2 = 0; m2 < 5; m2++) {
            const t2 = g[p2 * 5 + m2]!;
            if (t2 < 0) continue;
            const mm = Math.min(m + m2, 4);
            const i = (p + p2) * 5 + mm;
            const tt = Math.min(t + t2, 8);
            if (tt > nxt[i]!) nxt[i] = tt;
          }
      }
    const sw = cur;
    cur = nxt;
    nxt = sw;
  }
  let best = 8;
  for (let p = 0; p < 2; p++)
    for (let m = 0; m < 5; m++) {
      const t = cur[p * 5 + m]!;
      if (t < 0) continue;
      best = Math.min(best, 8 - 2 * m - Math.min(t, 4 - m) - p);
    }
  return best;
}

/** 七对向听：6 - 对子数（最多 7）；不许四张算两对时，种类不够 7 种还要多换 */
export function shantenSeven(counts: Counts, quads: boolean): number {
  let pairs = 0;
  let kinds = 0;
  for (const x of counts) {
    if (x > 0) kinds++;
    pairs += quads ? x >> 1 : x >= 2 ? 1 : 0;
  }
  pairs = Math.min(pairs, 7);
  return 6 - pairs + (quads ? 0 : Math.max(0, 7 - kinds));
}

const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 国士无双向听（日麻用）：13 - 幺九种类 - 有没有幺九对子 */
export function shantenKokushi(counts: Counts): number {
  let kinds = 0;
  let pair = 0;
  for (const k of YAOCHU) {
    if (counts[k]! > 0) kinds++;
    if (counts[k]! >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/**
 * 向听数。dead 是根本不能用的牌种（川麻的缺门）：拆解时当它们不存在，
 * 再算上"把它们一张张打掉"的轮数：13 张时至少要换 q 次才可能听（q 是 dead 的张数），14 张时这一手先打掉一张。
 * 两者取大：换缺门的那几轮可以同时摸进有用的牌，所以不是相加。
 */
export function shanten(counts: Counts, melds: number, rules: ShapeRules, dead: readonly number[] = []): number {
  let use = counts;
  let q = 0;
  if (dead.length) {
    use = counts.slice();
    for (const k of dead) {
      q += use[k]!;
      use[k] = 0;
    }
  }
  let s = shantenGeneral(use, melds);
  if (rules.seven && melds === 0) s = Math.min(s, shantenSeven(use, rules.sevenQuads));
  if (rules.kokushi && melds === 0) s = Math.min(s, shantenKokushi(use));
  if (q === 0) return s;
  const total = counts.reduce((a, b) => a + b, 0) + melds * 3;
  return Math.max(s, total % 3 === 2 ? q - 1 : q);
}

/** 14 张（含副露）是不是和了：一般型或七对（国士由玩法自己另判） */
export function isComplete(counts: Counts, melds: number, rules: ShapeRules): boolean {
  if (rules.seven && melds === 0 && isSeven(counts, rules.sevenQuads)) return true;
  return completeGeneral(counts.slice(), 4 - melds, false);
}

export function isSeven(counts: Counts, quads: boolean): boolean {
  let pairs = 0;
  for (const x of counts) {
    if (x % 2 === 1) return false;
    if (x === 4 && !quads) return false;
    pairs += x >> 1;
  }
  return pairs === 7;
}

function completeGeneral(c: number[], sets: number, pair: boolean): boolean {
  let i = 0;
  while (i < KINDS && c[i] === 0) i++;
  if (i >= KINDS) return sets === 0 && pair;
  if (!pair && c[i]! >= 2) {
    c[i]! -= 2;
    const ok = completeGeneral(c, sets, true);
    c[i]! += 2;
    if (ok) return true;
  }
  if (sets > 0 && c[i]! >= 3) {
    c[i]! -= 3;
    const ok = completeGeneral(c, sets - 1, pair);
    c[i]! += 3;
    if (ok) return true;
  }
  if (sets > 0 && i < HONOR0 && i % 9 <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
    c[i]!--, c[i + 1]!--, c[i + 2]!--;
    const ok = completeGeneral(c, sets - 1, pair);
    c[i]!++, c[i + 1]!++, c[i + 2]!++;
    if (ok) return true;
  }
  return false;
}

/** 一种和牌拆法里的一组：顺子按最小的那张记 */
export interface Group {
  type: 'seq' | 'pung';
  kind: number;
}

/** 一般型和牌的一种拆法（只拆手里的牌；副露由玩法另外加进去） */
export interface Decomp {
  pair: number;
  groups: Group[];
}

/** 14 张的全部一般型拆法（手里的部分）。和不了返回空数组 */
export function decompose(counts: Counts, melds: number): Decomp[] {
  const out: Decomp[] = [];
  const c = counts.slice();
  const groups: Group[] = [];
  const need = 4 - melds;
  const walk = (pair: number): void => {
    let i = 0;
    while (i < KINDS && c[i] === 0) i++;
    if (i >= KINDS) {
      if (groups.length === need && pair >= 0) out.push({ pair, groups: groups.slice() });
      return;
    }
    if (pair < 0 && c[i]! >= 2) {
      c[i]! -= 2;
      walk(i);
      c[i]! += 2;
    }
    if (c[i]! >= 3) {
      c[i]! -= 3;
      groups.push({ type: 'pung', kind: i });
      walk(pair);
      groups.pop();
      c[i]! += 3;
    }
    if (i < HONOR0 && i % 9 <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
      c[i]!--, c[i + 1]!--, c[i + 2]!--;
      groups.push({ type: 'seq', kind: i });
      walk(pair);
      groups.pop();
      c[i]!++, c[i + 1]!++, c[i + 2]!++;
    }
  };
  walk(-1);
  return out;
}

/**
 * 听哪些牌（13 张时）：加上这一种能和的牌种。allowed 给出能摸到、能和的牌种（玩法的牌集减去缺门）；
 * 手里已经有四张的那种不算（摸不到第五张）。
 */
export function waits(counts: Counts, melds: number, rules: ShapeRules, allowed: readonly number[]): number[] {
  const out: number[] = [];
  for (const k of allowed) {
    if (counts[k]! >= 4) continue;
    counts[k]!++;
    if (isComplete(counts, melds, rules)) out.push(k);
    counts[k]!--;
  }
  return out;
}

/**
 * 有效牌（13 张时）：摸到以后向听数减一的牌种，和每种还剩几张没看见（4 - 自己手里 - visible 里看得见的）。
 * visible 是这个座位能看到的每种牌已经亮出来的张数（弃牌、别人的副露、自己的副露）。
 */
export function ukeire(
  counts: Counts,
  melds: number,
  rules: ShapeRules,
  allowed: readonly number[],
  visible: readonly number[],
  dead: readonly number[] = [],
): { kinds: number[]; total: number } {
  const base = shanten(counts, melds, rules, dead);
  const kinds: number[] = [];
  let total = 0;
  for (const k of allowed) {
    const left = 4 - counts[k]! - visible[k]!;
    if (left <= 0) continue;
    counts[k]!++;
    const s = shanten(counts, melds, rules, dead);
    counts[k]!--;
    if (s < base) {
      kinds.push(k);
      total += left;
    }
  }
  return { kinds, total };
}
