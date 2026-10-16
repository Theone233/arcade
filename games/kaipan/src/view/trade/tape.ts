import { preHistory, type GameState, type Mood, type ThemeId } from '../../core/index.ts';

/**
 * 0.5.1 行情记录仪（画面层）：把 state 里公开的近几天数据按交易日编号并进内存表，同一局越玩越长。
 *
 * - 个股：state 只留最近 5 天的涨跌（stocks[id].history，最后一项是 lastDay 那天）。
 * - 风口：热度留最近 6 天（themes[id].history，最后一项是现在的热度）；开局前的预热天记为负的交易日编号。
 * - 大盘：每天的 lastDay.market.ret；真实行情局再用段数据里**已经过去**的日子（含开局前预热）补满。
 * - 群友：每天收盘揭晓的说对 / 说错。
 *
 * 只读已经发生、画面上本来就公开的数据，不碰今天以后的行情。换一局（seed 变了）就清空。
 */

interface FriendCall {
  day: number;
  theme: ThemeId;
  hit: boolean;
}

interface TapeData {
  seed: string;
  stocks: Map<string, Map<number, number>>;
  heat: Map<ThemeId, Map<number, number>>;
  market: Map<number, number>;
  mood: Map<number, Mood>;
  calls: Map<string, Map<string, FriendCall>>;
  maxDay: number;
  seeded: boolean;
}

let tape: TapeData | null = null;

function fresh(seed: string): TapeData {
  return { seed, stocks: new Map(), heat: new Map(), market: new Map(), mood: new Map(), calls: new Map(), maxDay: -1, seeded: false };
}

function mapOf<K, V>(m: Map<K, Map<number, V>>, k: K): Map<number, V> {
  let x = m.get(k);
  if (!x) {
    x = new Map();
    m.set(k, x);
  }
  return x;
}

/** 最近一个收过盘的交易日编号（还没开过盘为 -1）。 */
function lastClosedDay(s: Readonly<GameState>): number {
  return s.lastDay ? s.lastDay.day : -1;
}

/** 把当前状态里公开的近几天并进记录仪（每次渲染调用，重复调用无副作用）。 */
export function recordTape(s: Readonly<GameState>): void {
  const anchor = lastClosedDay(s);
  // 换了一局，或者同一个编号重开 / 读了更早的档（日子倒回去了）：重新记
  if (!tape || tape.seed !== s.seed || anchor < tape.maxDay) tape = fresh(s.seed);
  const t = tape;
  t.maxDay = anchor;
  // 0.5.1：新记录仪先用行情段里开局前的真实历史垫底（第 -warm..-1 个交易日），第 1 天就有走势
  if (!t.seeded) {
    t.seeded = true;
    const pre = preHistory(s);
    if (pre) {
      const at = (k: number): number => k - pre.days;
      pre.market.forEach((v, k) => t.market.set(at(k), v));
      for (const [id, row] of Object.entries(pre.stocks)) {
        const m = mapOf(t.stocks, id);
        row.forEach((v, k) => m.set(at(k), v));
      }
      for (const id of s.themeIds) {
        const row = pre.heat[id] ?? [];
        const m = mapOf(t.heat, id);
        // 最后一项是开局时（第 -1 天收盘）的热度
        row.forEach((v, k) => m.set(k - row.length, v));
      }
    }
  }
  for (const [id, st] of Object.entries(s.stocks)) {
    const h = st.history;
    if (h.length === 0 || anchor < 0) continue;
    const m = mapOf(t.stocks, id);
    h.forEach((v, i) => m.set(anchor - (h.length - 1 - i), v));
  }
  for (const id of s.themeIds) {
    const h = s.themes[id]?.history ?? [];
    const m = mapOf(t.heat, id);
    h.forEach((v, i) => m.set(anchor - (h.length - 1 - i), v));
  }
  const last = s.lastDay;
  if (last) {
    t.market.set(last.day, last.market.ret);
    t.mood.set(last.day, last.market.mood);
    for (const j of [...last.messages, ...(last.intel ?? [])]) {
      const key = `${j.day ?? last.day}:${j.index}`;
      let m = t.calls.get(j.friendId);
      if (!m) {
        m = new Map();
        t.calls.set(j.friendId, m);
      }
      m.set(key, { day: last.day, theme: j.theme, hit: j.hit });
    }
  }
}

function series<V>(m: Map<number, V> | undefined, n: number, upTo: number): { day: number; v: V }[] {
  if (!m) return [];
  const out: { day: number; v: V }[] = [];
  for (let d = upTo - n + 1; d <= upTo; d++) {
    const v = m.get(d);
    if (v !== undefined) out.push({ day: d, v });
  }
  return out;
}

/** 序列里有几项是开局前的（第一个交易日之前）。 */
export function preCount(s: Readonly<GameState>, len: number): number {
  return Math.max(0, Math.min(len, len - (lastClosedDay(s) + 1)));
}

/** 个股最近 n 天的涨跌（pp，旧 → 新）；记录仪没有的用 state 的 5 天。 */
export function stockMoves(s: Readonly<GameState>, id: string, n = 10): number[] {
  recordTape(s);
  const got = series(tape?.stocks.get(id), n, lastClosedDay(s)).map((x) => x.v);
  return got.length > 0 ? got : [...(s.stocks[id]?.history ?? [])].slice(-n);
}

/** 风口最近 n 天的热度（旧 → 新，含开局前预热）。 */
export function themeHeat(s: Readonly<GameState>, id: ThemeId, n = 20): number[] {
  recordTape(s);
  const got = series(tape?.heat.get(id), n, lastClosedDay(s)).map((x) => x.v);
  return got.length > 0 ? got : [...(s.themes[id]?.history ?? [])];
}

/** 大盘最近 n 天的涨跌（pp，旧 → 新）。 */
export function marketMoves(s: Readonly<GameState>, n = 20): number[] {
  recordTape(s);
  return series(tape?.market, n, lastClosedDay(s)).map((x) => x.v);
}

/** 涨跌序列 → 指数点位（起点 100）。 */
export function toLevels(moves: readonly number[], base = 100): number[] {
  const out = [base];
  let v = base;
  for (const m of moves) {
    v *= 1 + m / 100;
    out.push(v);
  }
  return out;
}

/** 群友最近的说对说错（旧 → 新，最多 n 条）。 */
export function friendCalls(s: Readonly<GameState>, friendId: string, n = 12): FriendCall[] {
  recordTape(s);
  const m = tape?.calls.get(friendId);
  if (!m) return [];
  return [...m.values()].sort((a, b) => a.day - b.day).slice(-n);
}

/** 连涨 / 连跌：从最近一天往前数同方向的天数（正数连涨、负数连跌、0 为昨天平）。 */
export function streakOf(moves: readonly number[]): number {
  let n = 0;
  for (let i = moves.length - 1; i >= 0; i--) {
    const v = moves[i] ?? 0;
    if (Math.abs(v) < 0.05) break;
    if (n === 0) n = v > 0 ? 1 : -1;
    else if (v > 0 === n > 0) n += n > 0 ? 1 : -1;
    else break;
  }
  return n;
}

/** 合计涨跌（pp，按复利）。 */
export function sumMoves(moves: readonly number[]): number {
  let v = 1;
  for (const m of moves) v *= 1 + m / 100;
  return (v - 1) * 100;
}

/** 和大环境比：同样这几天，个股合计减去大盘合计（pp）；没有大盘数据时为 null。 */
export function vsMarket(s: Readonly<GameState>, id: string, n = 5): number | null {
  const mine = stockMoves(s, id, n);
  if (mine.length === 0) return null;
  const mk = marketMoves(s, mine.length);
  if (mk.length < mine.length) return null;
  return sumMoves(mine) - sumMoves(mk);
}

/** 强弱签：「强」「弱」「跟」（差距在 ±1pp 以内算跟着大环境走）。 */
export function vsWord(d: number | null): { word: string; sign: number } | null {
  if (d === null) return null;
  if (d > 1) return { word: '强于大环境', sign: 1 };
  if (d < -1) return { word: '弱于大环境', sign: -1 };
  return { word: '跟着大环境', sign: 0 };
}
