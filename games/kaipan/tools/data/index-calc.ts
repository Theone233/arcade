/**
 * 合成大盘的计算。
 *
 * 游戏用的口径（2026-10-11 定）：**成交额加权、每月调权**。
 *  - 调权日：包内第一个交易日，以及之后每个月的第一个交易日。
 *  - 权重：调权日前 20 个交易日（不含调权日当天）的日均成交额（收盘 × 成交量）。只用过去的数据，不看未来。
 *    这 20 天里至少要有 10 天有数据，且调权日前一天有成交（成交量 > 0）才能入选。
 *  - 月内不调权：每只股票的持仓价值随自己的涨跌漂移（买入持有），停牌日价值不变，退市后价值冻结到下次调权。
 *  - 价格指数（不含分红）给游戏和对照真实指数用；另算含分红的总收益指数只进报告。
 *  - 开、高、低：持仓价值加权的成员股开盘/最高/最低相对前收的涨跌（高低价是近似，保证 低 ≤ 开、收 ≤ 高）。
 *  - 以开局前最后一个交易日收盘 = 1000 为基准。
 *
 * 另有等权每日再平衡（旧口径），只用于报告对照。
 */
import type { Series } from './clean.ts';

export interface IndexLine {
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  /** 含分红的总收益指数收盘 */
  total: number[];
  members: number[];
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

function finish(raw: { o: number; h: number; l: number; c: number; t: number; k: number }[], baseIdx: number): IndexLine {
  const b = raw[baseIdx] as { c: number; t: number };
  const sc = 1000 / b.c;
  const st = 1000 / b.t;
  const out: IndexLine = { o: [], h: [], l: [], c: [], total: [], members: [] };
  for (const r of raw) {
    out.o.push(r2(r.o * sc));
    out.h.push(r2(Math.max(r.h, r.o, r.c) * sc));
    out.l.push(r2(Math.min(r.l, r.o, r.c) * sc));
    out.c.push(r2(r.c * sc));
    out.total.push(r2(r.t * st));
    out.members.push(r.k);
  }
  return out;
}

/** 成交额加权、每月调权。dates 是整个切片的日历，[from, to) 是包的窗口，base 是基准日（开局前一天）的日历下标。 */
export function dollarWeightedMonthly(members: Series[], dates: string[], from: number, to: number, base: number): IndexLine {
  let L = 1;
  let T = 1;
  const raw = [{ o: 1, h: 1, l: 1, c: 1, t: 1, k: 0 }];
  let held: { s: Series; v: number; vt: number; last: number }[] = [];
  for (let d = from + 1; d < to; d++) {
    const month = (dates[d] as string).slice(0, 7);
    if (d === from + 1 || month !== (dates[d - 1] as string).slice(0, 7)) {
      const cand: { s: Series; w: number; last: number }[] = [];
      for (const s of members) {
        const pb = s.bars.get(d - 1);
        if (pb === undefined || pb.v <= 0) continue;
        let sum = 0;
        let n = 0;
        for (let j = Math.max(0, d - 20); j < d; j++) {
          const b = s.bars.get(j);
          if (b !== undefined) {
            sum += b.c * b.v;
            n++;
          }
        }
        if (n >= 10 && sum > 0) cand.push({ s, w: sum / n, last: pb.c });
      }
      const total = cand.reduce((a, c) => a + c.w, 0);
      held = cand.map((c) => ({ s: c.s, v: c.w / total, vt: c.w / total, last: c.last }));
    }
    let sv = 0, so = 0, sh = 0, sl = 0, sc = 0, svt = 0, sct = 0;
    let k = 0;
    for (const x of held) {
      sv += x.v;
      svt += x.vt;
      const b = x.s.bars.get(d);
      if (b === undefined) {
        so += x.v; sh += x.v; sl += x.v; sc += x.v; sct += x.vt;
        continue;
      }
      k++;
      const f = b.split / x.last;
      so += x.v * b.o * f;
      sh += x.v * b.h * f;
      sl += x.v * b.l * f;
      sc += x.v * b.c * f;
      const gt = (b.c + b.div) * f;
      sct += x.vt * gt;
      x.v *= b.c * f;
      x.vt *= gt;
      x.last = b.c;
    }
    const prev = L;
    if (sv > 0) {
      L = prev * (sc / sv);
      T = T * (sct / svt);
    }
    raw.push({ o: sv > 0 ? prev * (so / sv) : prev, h: sv > 0 ? prev * (sh / sv) : prev, l: sv > 0 ? prev * (sl / sv) : prev, c: L, t: T, k });
  }
  return finish(raw, base - from);
}

/** 等权、每日再平衡（旧口径，只作对照）。 */
export function equalWeightDaily(members: Series[], from: number, to: number, base: number): IndexLine {
  let L = 1;
  let T = 1;
  const raw = [{ o: 1, h: 1, l: 1, c: 1, t: 1, k: 0 }];
  for (let d = from + 1; d < to; d++) {
    let so = 0, sh = 0, sl = 0, sc = 0, st = 0, k = 0;
    for (const s of members) {
      const b = s.bars.get(d);
      const pb = s.bars.get(d - 1);
      if (b === undefined || pb === undefined) continue;
      const f = b.split / pb.c;
      so += b.o * f; sh += b.h * f; sl += b.l * f; sc += b.c * f; st += (b.c + b.div) * f;
      k++;
    }
    const prev = L;
    if (k > 0) {
      L = prev * (sc / k);
      T = T * (st / k);
    }
    raw.push({ o: k > 0 ? prev * (so / k) : prev, h: k > 0 ? prev * (sh / k) : prev, l: k > 0 ? prev * (sl / k) : prev, c: L, t: T, k });
  }
  return finish(raw, base - from);
}

export function maxDrawdown(c: number[], from: number): number {
  let peak = -Infinity;
  let dd = 0;
  for (let i = from; i < c.length; i++) {
    const x = c[i] as number;
    peak = Math.max(peak, x);
    dd = Math.min(dd, x / peak - 1);
  }
  return dd;
}

/** 权重最大的前 n 只（最后一次调权时），报告用，看集中度。 */
export function topWeights(members: Series[], d: number, n: number): { ticker: string; w: number }[] {
  const cand: { ticker: string; w: number }[] = [];
  for (const s of members) {
    let sum = 0;
    let k = 0;
    for (let j = Math.max(0, d - 20); j < d; j++) {
      const b = s.bars.get(j);
      if (b !== undefined) {
        sum += b.c * b.v;
        k++;
      }
    }
    const pb = s.bars.get(d - 1);
    if (k >= 10 && pb !== undefined && pb.v > 0) cand.push({ ticker: s.ticker, w: sum / k });
  }
  const tot = cand.reduce((a, c) => a + c.w, 0);
  return cand.sort((a, b) => b.w - a.w).slice(0, n).map((c) => ({ ticker: c.ticker, w: c.w / tot }));
}

/**
 * "老三十"式价格加权（游戏主大盘 x_dow）：当年道指真实成分股里 WIKI 有的那些，价格之和 ÷ 除数。
 *  - 第 t 天的成分 S_t = 当天生效的名单（dow.ts，换股在生效日开盘前完成）里 t 和 t−1 两天都有数据的股票；
 *  - 收盘_t = 收盘_{t−1} × Σ_{S_t} (价_t + 分拆价值_t) × 拆股比例_t ÷ Σ_{S_t} 收盘_{t−1}；开、高、低同理用成分股的开、高、低。
 *    等价于每次拆股、换股、缺数据时重算除数让指数不跳；分拆（数据里按价值记成的大额分红，> 前收 5%）也调除数，
 *    普通现金分红不调（价格指数）。缺失的成分股直接剔除（相当于剔除后重算除数）。
 *  - 以开局前一天收盘 = 1000 为基准。
 */
export function priceWeighted(
  series: Map<string, Series>,
  dates: string[],
  membersOn: (date: string) => [string, string | null][],
  from: number,
  to: number,
  base: number,
): IndexLine {
  let L = 1;
  const raw = [{ o: 1, h: 1, l: 1, c: 1, t: 1, k: 0 }];
  for (let d = from + 1; d < to; d++) {
    let no = 0, nh = 0, nl = 0, nc = 0, den = 0, k = 0;
    for (const [, t] of membersOn(dates[d] as string)) {
      if (t === null) continue;
      const s = series.get(t);
      const b = s?.bars.get(d);
      const pb = s?.bars.get(d - 1);
      if (b === undefined || pb === undefined) continue;
      const spin = b.div / pb.c > 0.05 ? b.div : 0;
      no += (b.o + spin) * b.split;
      nh += (b.h + spin) * b.split;
      nl += (b.l + spin) * b.split;
      nc += (b.c + spin) * b.split;
      den += pb.c;
      k++;
    }
    const prev = L;
    if (den > 0) L = prev * (nc / den);
    raw.push({ o: den > 0 ? prev * (no / den) : prev, h: den > 0 ? prev * (nh / den) : prev, l: den > 0 ? prev * (nl / den) : prev, c: L, t: L, k });
  }
  return finish(raw, base - from);
}
