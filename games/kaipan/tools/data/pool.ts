/**
 * 股票池：指标计算和选股规则。
 *
 * WIKI 没有总股本，拿不到市值；"市值大"用当年日均成交额（收盘 × 成交量）近似，
 * 波动用当年日收益（含拆股、分红）的年化标准差。
 *
 * 选股顺序（去重，总数上限 MAX）：
 *  1. 本年时间线明星股里数据中存在的（aliases.ts 的 years 含本年）；
 *  2. 本年人工"故事股"（picks.ts）；
 *  3. 每个行业：成交额前 BIG 只（大盘股），再在成交额 ≥ MIN_DV 的股票里取波动前 VOLA 只（妖股）；
 *  4. 不够 TARGET 只，按成交额从所有有行业的合格股票里补齐。
 * 合格（第 3、4 步）：有行业标注、当年交易天数 ≥ 本年交易日的 90%（年中上市/退市的只能靠第 1、2 步进池）、
 * 没有待复核的跳变、缺口 ≤ 5 天、年末价格 ≥ 1 美元。第 1、2 步只要求当年有数据。
 */
import type { Series, YearData } from './clean.ts';
import { dayReturn } from './clean.ts';
import { ALIASES } from './aliases.ts';
import { PICKS } from './picks.ts';
import { SECTORS, sectorOf } from './sectors.ts';

export const TARGET = 200;
export const MAX = 250;
export const BIG = 6;
export const VOLA = 3;
export const MIN_DV = 10e6;
/** 年度包里开局前历史的天数（build.ts 也用） */
export const WARM = 60;

export interface Metric {
  ticker: string;
  days: number;
  dollarVol: number;
  vol: number;
  ret: number;
  lastClose: number;
  gaps: number;
  jumps: number;
}

export function metricOf(data: YearData, s: Series): Metric {
  const { yearStart, dates } = data;
  let days = 0;
  let dv = 0;
  const rets: number[] = [];
  let g = 1;
  let lastClose = 0;
  for (let d = yearStart; d < dates.length; d++) {
    const b = s.bars.get(d);
    if (b === undefined) continue;
    days++;
    dv += b.c * b.v;
    lastClose = b.c;
    const r = dayReturn(s, d);
    if (r !== null) {
      rets.push(r);
      g *= 1 + r;
    }
  }
  const m = rets.length > 0 ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1)) : 0;
  // 包里含开局前 WARM 天历史，这段里的跳变也算
  const winStart = dates[Math.max(0, yearStart - WARM)] as string;
  const jumps = s.jumps.filter((j) => j.date >= winStart).length;
  return { ticker: s.ticker, days, dollarVol: days > 0 ? dv / days : 0, vol: sd * Math.sqrt(252), ret: g - 1, lastClose, gaps: s.gaps, jumps };
}

export function metrics(data: YearData): Metric[] {
  return [...data.series.values()].map((s) => metricOf(data, s)).filter((m) => m.days > 0);
}

export type Reason = 'star' | 'pick' | 'big' | 'vola' | 'fill';
export interface PoolEntry { ticker: string; id: string; sector: string | null; reason: Reason; note: string }

export function aliasFor(ticker: string, year: number): (typeof ALIASES)[number] | undefined {
  return ALIASES.find((a) => a.data !== null && a.data === ticker && (a.dataYears === undefined || a.dataYears.includes(year)));
}

export function selectPool(data: YearData, target = TARGET): PoolEntry[] {
  const { year } = data;
  const ms = new Map(metrics(data).map((m) => [m.ticker, m]));
  const yearDays = data.dates.length - data.yearStart;
  const out: PoolEntry[] = [];
  const has = new Set<string>();
  const add = (ticker: string, reason: Reason, note: string): void => {
    if (has.has(ticker) || out.length >= MAX) return;
    has.add(ticker);
    const a = aliasFor(ticker, year);
    out.push({ ticker, id: a?.id ?? `tmp_${ticker.toLowerCase()}`, sector: sectorOf(ticker, year) ?? null, reason, note });
  };
  for (const a of ALIASES) if (a.years.includes(year) && a.data !== null && ms.has(a.data) && (a.dataYears === undefined || a.dataYears.includes(year))) add(a.data, 'star', a.real);
  for (const p of PICKS[year] ?? []) if (ms.has(p.ticker)) add(p.ticker, 'pick', p.why);

  const ok = (m: Metric): boolean =>
    sectorOf(m.ticker, year) !== undefined && m.days >= yearDays * 0.9 && m.jumps === 0 && m.gaps <= 5 && m.lastClose >= 1;
  const eligible = [...ms.values()].filter(ok);
  // 先保证每个行业的大盘股，再补妖股，避免某一类挤掉另一类
  for (const sec of SECTORS) {
    const inSec = eligible.filter((m) => sectorOf(m.ticker, year) === sec.id).sort((a, b) => b.dollarVol - a.dollarVol);
    for (const m of inSec.slice(0, BIG)) add(m.ticker, 'big', '');
  }
  for (const sec of SECTORS) {
    const inSec = eligible.filter((m) => sectorOf(m.ticker, year) === sec.id && m.dollarVol >= MIN_DV && !has.has(m.ticker)).sort((a, b) => b.vol - a.vol);
    for (const m of inSec.slice(0, VOLA)) add(m.ticker, 'vola', '');
  }
  if (out.length < target) {
    for (const m of eligible.sort((a, b) => b.dollarVol - a.dollarVol)) {
      if (out.length >= target) break;
      add(m.ticker, 'fill', '');
    }
  }
  return out;
}
