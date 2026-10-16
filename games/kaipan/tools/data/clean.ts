/**
 * 读取年度切片并清洗。供 build.ts / candidates.ts / check.ts 共用。
 *
 * 清洗规则（每条都计数，进 index.json 和 docs/history/data-check.md）：
 *  - offCalendar：日期不在交易日历上（日历 = 当天有行情的代码数 ≥ 当期中位数的一半；周末和节假日的零星行由此剔除）
 *  - duplicate：同一代码同一天重复，保留第一行
 *  - badPrice：开高低收有缺失、零或负值
 *  - highLow：最高价 < 最低价
 *  - outOfRange：开盘价或收盘价落在 [最低, 最高] 之外（容差 0.5%，吸收老数据分数报价的舍入）
 *  - noVolume：成交量缺失（空或非数字）
 *  - badSplit：拆股比例 ≤ 0 或非数字（按 1 处理并计数）
 *  - spike：单日总收益超过 ±80%（涨 > 80% 或跌 > 80%）、没有拆股记录、且次日回到前一天附近（离前收 ±30% 内）→ 判为错价，剔除当天
 *  - jump：单日总收益超过 ±80% 且不是错价（含拆股记录与价格对不上的情况）→ 保留数据，标记该股"待人工复核"，默认不进股票池
 *  - 以上剔除的行变成缺口；gaps 统计上市首日到末日之间日历上缺的天数（含原始缺口和剔除造成的缺口）
 *
 *  - 分红核对（每股分红 > 前收 10% 时）：股价同步下跌（收盘 ≤ 前收 − 一半分红）→ 保留（特别分红、分拆按价值记成分红，如 MO 2008-03-31 分拆 PM）；
 *    分红 ≈ 前收 × (1 − 1/k) 且收盘 ≈ 前收 / k（误差都在 3% 内）→ 判为"拆股被记成分红"，改成拆股 k（bigDividendToSplit）；
 *    其余 → 分红记录作废（badDividend）。另有人工修正 fixes.ts（manualFix）。
 *
 * 单日总收益 r_t = 拆股比例_t × (收盘_t + 每股分红_t) / 收盘_{t-1} − 1：
 * 拆股比例 2 表示 1 股变 2 股（价格约减半），持有 1 股的人当天有 2 股；分红按拆股之后的股数计（WIKI 的口径，
 * 见 fixes.ts 里 RIG 的例子；同一天既拆股又分红的情况极少）。
 * 对应引擎 CorporateAction：除权除息日开盘前先按比例调整持股，再按调整后的持股发现金。
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_CACHE, parseRow } from './common.ts';
import { FIXES, VOLUME_SCALE } from './fixes.ts';

export interface Bar { o: number; h: number; l: number; c: number; v: number; div: number; split: number }

export interface Series {
  ticker: string;
  /** 日历下标 → bar（没有则 undefined） */
  bars: Map<number, Bar>;
  first: number;
  last: number;
  gaps: number;
  /** 剔除计数（本股） */
  dropped: number;
  jumps: JumpNote[];
  spikes: JumpNote[];
  splitNotes: string[];
}

export interface JumpNote { date: string; ret: number; prev: number; close: number; split: number; kind: string }

export interface CleanStats {
  rows: number;
  tickers: number;
  offCalendar: number;
  duplicate: number;
  badPrice: number;
  highLow: number;
  outOfRange: number;
  noVolume: number;
  zeroVolume: number;
  badSplit: number;
  manualFix: number;
  volumeScaled: number;
  duplicateSeries: number;
  bigDividendKept: number;
  bigDividendToSplit: number;
  badDividend: number;
  spike: number;
  jump: number;
  jumpTickers: number;
  splitEvents: number;
  splitMismatch: number;
  dividendEvents: number;
  gapDays: number;
  gapTickers: number;
}

export interface YearData {
  year: number;
  dates: string[];
  series: Map<string, Series>;
  stats: CleanStats;
  /** 本年（不含开局前历史）的第一个交易日下标 */
  yearStart: number;
  /** 重复序列：[保留, 删除] */
  duplicates: [string, string][];
}

const TOL = 0.005;
const JUMP = 0.8;

function sliceText(year: number, cache: string): string {
  return readFileSync(`${cache}/slice-${year}.csv`, 'utf8');
}

export function loadYear(year: number, cache = DEFAULT_CACHE): YearData {
  const text = sliceText(year, cache);
  const lines = text.split('\n');
  const stats: CleanStats = {
    rows: 0, tickers: 0, offCalendar: 0, duplicate: 0, badPrice: 0, highLow: 0, outOfRange: 0, noVolume: 0, zeroVolume: 0,
    badSplit: 0, manualFix: 0, volumeScaled: 0, duplicateSeries: 0, bigDividendKept: 0, bigDividendToSplit: 0, badDividend: 0, spike: 0, jump: 0, jumpTickers: 0, splitEvents: 0, splitMismatch: 0, dividendEvents: 0,
    gapDays: 0, gapTickers: 0,
  };

  // 1. 交易日历
  const dayCount = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.length === 0) continue;
    const c1 = line.indexOf(',');
    const d = line.slice(c1 + 1, c1 + 11);
    dayCount.set(d, (dayCount.get(d) ?? 0) + 1);
  }
  const counts = [...dayCount.values()].sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] ?? 0;
  const dates = [...dayCount.entries()].filter(([, n]) => n >= median / 2).map(([d]) => d).sort();
  const dayIndex = new Map<string, number>(dates.map((d, i) => [d, i]));
  const yearStart = dates.findIndex((d) => d >= `${year}-01-01`);

  const fixByKey = new Map(FIXES.map((f) => [`${f.ticker},${f.date}`, f]));
  // 2. 逐行解析、逐行检查
  const raw = new Map<string, Map<number, Bar>>();
  const dropped = new Map<string, number>();
  const splitBad = new Map<string, string[]>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.length === 0) continue;
    const r = parseRow(line);
    if (r === null) continue;
    stats.rows++;
    let m = raw.get(r.ticker);
    if (m === undefined) {
      m = new Map();
      raw.set(r.ticker, m);
    }
    const drop = (): void => {
      dropped.set(r.ticker, (dropped.get(r.ticker) ?? 0) + 1);
    };
    const di = dayIndex.get(r.date);
    if (di === undefined) {
      stats.offCalendar++;
      drop();
      continue;
    }
    if (m.has(di)) {
      stats.duplicate++;
      continue;
    }
    const { open: o, high: h, low: l, close: c } = r;
    if (![o, h, l, c].every((x) => Number.isFinite(x) && x > 0)) {
      stats.badPrice++;
      drop();
      continue;
    }
    if (h < l) {
      stats.highLow++;
      drop();
      continue;
    }
    if (o > h * (1 + TOL) || o < l * (1 - TOL) || c > h * (1 + TOL) || c < l * (1 - TOL)) {
      stats.outOfRange++;
      drop();
      continue;
    }
    if (!Number.isFinite(r.volume) || r.volume < 0) {
      stats.noVolume++;
      drop();
      continue;
    }
    const vs = VOLUME_SCALE[r.ticker];
    if (vs !== undefined) {
      r.volume = r.volume * vs.scale;
      stats.volumeScaled++;
    }
    if (r.volume === 0) stats.zeroVolume++;
    let split = r.split;
    if (!Number.isFinite(split) || split <= 0) {
      stats.badSplit++;
      split = 1;
      const a = splitBad.get(r.ticker) ?? [];
      a.push(`${r.date} 拆股比例无效（${r.split}），按 1 处理`);
      splitBad.set(r.ticker, a);
    }
    let div = Number.isFinite(r.div) && r.div > 0 ? r.div : 0;
    const fix = fixByKey.get(`${r.ticker},${r.date}`);
    if (fix !== undefined) {
      stats.manualFix++;
      if (fix.split !== undefined) split = fix.split;
      if (fix.div !== undefined) div = fix.div;
      const a = splitBad.get(r.ticker) ?? [];
      a.push(`${r.date} 人工修正：${fix.why}`);
      splitBad.set(r.ticker, a);
    }
    // 容差内的越界：把高低价扩到包住开收，避免下游出现 high < close
    m.set(di, { o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: Math.round(r.volume), div, split });
  }

  // 3. 逐股检查收益跳变、拆股一致性、缺口
  const series = new Map<string, Series>();
  for (const [ticker, m] of raw) {
    const idx = [...m.keys()].sort((a, b) => a - b);
    const s: Series = {
      ticker, bars: m, first: idx[0] ?? 0, last: idx[idx.length - 1] ?? 0, gaps: 0,
      dropped: dropped.get(ticker) ?? 0, jumps: [], spikes: [], splitNotes: splitBad.get(ticker) ?? [],
    };
    // 大额分红核对
    {
      const keys = [...m.keys()].sort((a, b) => a - b);
      for (let k = 1; k < keys.length; k++) {
        const prev = m.get(keys[k - 1] as number) as Bar;
        const cur = m.get(keys[k] as number) as Bar;
        if (cur.div <= 0 || cur.div / prev.c <= 0.1) continue;
        const date = dates[keys[k] as number] as string;
        const q = cur.div / prev.c;
        const drop = (cur.c * cur.split) / prev.c;
        let asSplit = 0;
        if (cur.split === 1)
          for (const kk of [2, 3, 4, 5]) if (Math.abs(q - (1 - 1 / kk)) < 0.03 && Math.abs(drop * kk - 1) < 0.03) asSplit = kk;
        if (asSplit > 0) {
          stats.bigDividendToSplit++;
          s.splitNotes.push(`${date} 分红 ${cur.div} ≈ 前收 × (1 − 1/${asSplit}) 且价格同比例下跌，改成拆股 ${asSplit}`);
          cur.split = asSplit;
          cur.div = 0;
        } else if (drop <= 1 - q / 2) {
          stats.bigDividendKept++;
          s.splitNotes.push(`${date} 大额分红 ${cur.div}（前收 ${prev.c} 的 ${(q * 100).toFixed(0)}%），股价同步下跌，保留（特别分红或分拆）`);
        } else {
          stats.badDividend++;
          s.splitNotes.push(`${date} 分红 ${cur.div}（前收 ${prev.c} 的 ${(q * 100).toFixed(0)}%）但股价没跌，作废`);
          cur.div = 0;
        }
      }
    }
    // 错价：先剔除，再重算
    for (let pass = 0; pass < 2; pass++) {
      const keys = [...m.keys()].sort((a, b) => a - b);
      for (let k = 1; k < keys.length; k++) {
        const prev = m.get(keys[k - 1] as number) as Bar;
        const cur = m.get(keys[k] as number) as Bar;
        const ret = (cur.c + cur.div) * cur.split / prev.c - 1;
        if (ret > JUMP || ret < -JUMP) {
          const next = k + 1 < keys.length ? (m.get(keys[k + 1] as number) as Bar) : null;
          const back = next === null ? NaN : (next.c * next.split * cur.split) / prev.c;
          if (cur.split === 1 && next !== null && next.split === 1 && back > 0.7 && back < 1.3) {
            s.spikes.push({ date: dates[keys[k] as number] as string, ret, prev: prev.c, close: cur.c, split: cur.split, kind: '错价（次日回到原位）' });
            stats.spike++;
            m.delete(keys[k] as number);
            s.dropped++;
            break; // 重新扫描
          }
        }
      }
    }
    const keys = [...m.keys()].sort((a, b) => a - b);
    s.first = keys[0] ?? 0;
    s.last = keys[keys.length - 1] ?? 0;
    for (let k = 1; k < keys.length; k++) {
      const prev = m.get(keys[k - 1] as number) as Bar;
      const cur = m.get(keys[k] as number) as Bar;
      const date = dates[keys[k] as number] as string;
      if (cur.split !== 1) {
        stats.splitEvents++;
        // 期望：前收 / 今开 ≈ 拆股比例（允许 ±35% 的当日行情）
        const implied = prev.c / cur.o;
        const q = implied / cur.split;
        if (q < 0.65 || q > 1.5) {
          stats.splitMismatch++;
          s.splitNotes.push(`${date} 拆股 ${cur.split}，但前收/今开 = ${implied.toFixed(3)}`);
        }
      }
      if (cur.div > 0) stats.dividendEvents++;
      const ret = (cur.c + cur.div) * cur.split / prev.c - 1;
      if (ret > JUMP || ret < -JUMP) {
        const implied = prev.c / cur.c;
        let kind = ret > 0 ? '单日暴涨（无拆股记录）' : '单日暴跌（无拆股记录）';
        if (cur.split !== 1) kind = '拆股记录与价格对不上';
        else
          for (const r of [2, 3, 4, 5, 10, 0.5, 1 / 3, 0.25, 0.2, 0.1]) {
            if (Math.abs(implied / r - 1) < 0.06) {
              kind = r > 1 ? `疑似漏记拆股（价格变成前收的 1/${r}）` : `价格整倍上涨 ${Math.round(1 / r)} 倍（疑似漏记合股，也可能是真实行情）`;
              break;
            }
          }
        s.jumps.push({ date, ret, prev: prev.c, close: cur.c, split: cur.split, kind });
        stats.jump++;
      }
      const gap = (keys[k] as number) - (keys[k - 1] as number) - 1;
      if (gap > 0) s.gaps += gap;
    }
    if (s.jumps.length > 0) stats.jumpTickers++;
    if (s.gaps > 0) {
      stats.gapTickers++;
      stats.gapDays += s.gaps;
    }
    if (keys.length > 0) series.set(ticker, s);
  }
  // 4. 重复序列：两个代码在切片里每天的收盘和成交量完全相同（WIKI 把改名前后的代码各存了一份，如 TYC/JCI、WAG/WBA）。
  //    保留全量数据里更早结束的那个（通常是当年真正在用的旧代码），另一个整个删掉。
  const duplicates: [string, string][] = [];
  {
    let lastOf: Record<string, [string, string, number]> = {};
    try {
      lastOf = (JSON.parse(readFileSync(`${cache}/tickers.json`, 'utf8')) as { tickers: Record<string, [string, string, number]> }).tickers;
    } catch {
      lastOf = {};
    }
    const bySig = new Map<string, string[]>();
    for (const s of series.values()) {
      if (s.bars.size < 20) continue;
      const keys = [...s.bars.keys()].sort((a, b) => a - b);
      const sig = keys.map((k) => `${k}:${(s.bars.get(k) as Bar).c}:${(s.bars.get(k) as Bar).v}`).join(';');
      const g = bySig.get(sig) ?? [];
      g.push(s.ticker);
      bySig.set(sig, g);
    }
    for (const g of bySig.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => (lastOf[a]?.[1] ?? '9999').localeCompare(lastOf[b]?.[1] ?? '9999') || a.localeCompare(b));
      const keep = g[0] as string;
      for (const t of g.slice(1)) {
        series.delete(t);
        duplicates.push([keep, t]);
        stats.duplicateSeries++;
      }
    }
  }
  stats.tickers = series.size;
  return { year, dates, series, stats, yearStart, duplicates };
}

/** 单日总收益（相对上一个有数据的交易日）。没有前一天数据时为 null。 */
export function dayReturn(s: Series, day: number, field: 'o' | 'h' | 'l' | 'c' = 'c', withDiv = true): number | null {
  const cur = s.bars.get(day);
  const prev = s.bars.get(day - 1);
  if (cur === undefined || prev === undefined) return null;
  return ((cur[field] + (withDiv ? cur.div : 0)) * cur.split) / prev.c - 1;
}

/** 区间总收益：从 from 日收盘到 to 日收盘，含拆股和分红（分红按当日收盘价再投资）。缺口日跨过（按前后两个有数据日的比值）。 */
export function periodReturn(s: Series, from: number, to: number, withDiv = true): number | null {
  if (!s.bars.has(from) || !s.bars.has(to)) return null;
  let g = 1;
  let prevC = (s.bars.get(from) as Bar).c;
  for (let d = from + 1; d <= to; d++) {
    const b = s.bars.get(d);
    if (b === undefined) continue;
    g *= ((b.c + (withDiv ? b.div : 0)) * b.split) / prevC;
    prevC = b.c;
  }
  return g - 1;
}
