/**
 * 第 2 步：清洗 → 选股票池 → 合成大盘 → 打年度包。
 *
 *   node tools/data/build.ts --years 1999,2000,2008      （先跑 slice.ts）
 *   node tools/data/build.ts --years 2008 --target 180   （改股票池目标数）
 *
 * 产物：
 *   public/data/years/<年>.json   年度包（格式见 docs/history/data-check.md 第 1 节）
 *   public/data/years/index.json  可用年份、来源声明、大盘口径、清洗统计、幸存者偏差说明（逐年合并更新）
 *   <缓存>/report-<年>.json、alt-<年>.json   核对报告用的明细（含真实代码），不进仓库
 *
 * 年包里的大盘（2026-10-11 协调人定）：
 *   index = C "老三十"（x_dow）：当年道指真实成分股里 WIKI 有的那些，价格加权，算法见 index-calc.ts 的 priceWeighted；
 *   ref   = NQ "科综"（x_nasdaq，可选，只做参考、不参与归因）：B 口径只取 Nasdaq 上市股票（dow.ts 的 isNasdaq）。
 * 报告里另算（不进年包）：A = 股票池、B = 全数据集，成交额加权每月调权；等权每日再平衡；买入持有等权。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync as gz } from 'node:zlib';
import { DEFAULT_CACHE, OUT_DIR, arg, pct, round } from './common.ts';
import { type CleanStats, type Series, type YearData, loadYear, periodReturn } from './clean.ts';
import { ALIASES } from './aliases.ts';
import { type PoolEntry, TARGET, WARM, metricOf, selectPool } from './pool.ts';
import { SECTORS } from './sectors.ts';
import { REAL_INDEX } from './real-index.ts';
import { type IndexLine, dollarWeightedMonthly, equalWeightDaily, maxDrawdown, priceWeighted, topWeights } from './index-calc.ts';
import { KEY_DAYS, dowMembers, isNasdaq } from './dow.ts';

const MAX_GZ = 2 * 1024 * 1024;

const cache = arg('cache', DEFAULT_CACHE);
/** 输出目录（全量生成行情段时写到仓库外，见 segments.ts --full） */
const OUT = arg('out', OUT_DIR);
const years = arg('years', '1999,2000,2008').split(',').map((s) => Number(s.trim()));
const target = Number(arg('target', String(TARGET)));


function stockArrays(s: Series, from: number, to: number) {
  const n = to - from;
  const o: (number | null)[] = [], h: (number | null)[] = [], l: (number | null)[] = [], c: (number | null)[] = [], v: (number | null)[] = [];
  const div: [number, number][] = [];
  const split: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const b = s.bars.get(from + i);
    if (b === undefined) {
      o.push(null); h.push(null); l.push(null); c.push(null); v.push(null);
      continue;
    }
    o.push(round(b.o, 4)); h.push(round(b.h, 4)); l.push(round(b.l, 4)); c.push(round(b.c, 4)); v.push(b.v);
    // 包里第一天（下标 0）之前的公司行动已经反映在价格里，不再作为事件
    if (i > 0 && b.div > 0) div.push([i, round(b.div, 6)]);
    if (i > 0 && b.split !== 1) split.push([i, b.split]);
  }
  // 在包内最后一天之前停止交易 → 退市：最后一个交易日的下一天按最后收盘价换成现金
  let delist: [number, number] | null = null;
  if (s.last < to - 1 && s.last >= from) delist = [s.last - from + 1, round((s.bars.get(s.last) as { c: number }).c, 4)];
  return { o, h, l, c, v, div, split, delist };
}

const DOW_DESC = '价格加权（价格之和 ÷ 除数），成分 = 当年道琼斯工业平均指数的真实成分名单（按调整生效日换股）里 WIKI 有价格的公司；拆股、换股、缺数据、分拆时调整除数，普通分红不调。只用 WIKI 的价格，不用道琼斯的任何指数数据';
const NQ_DESC = '成交额加权（前 20 个交易日日均成交额，每月第一个交易日调权），成分 = WIKI 数据集里当年在 Nasdaq 上市的股票（上市地按代码惯例近似判断）';

function packJson(data: YearData, pool: PoolEntry[], from: number, to: number, start: number, index: IndexLine, ref: IndexLine): string {
  const stocks = pool.map((p) => {
    const alias = ALIASES.find((a) => a.id === p.id);
    // 不带真实代码：化名与真实代码的对照只在 tools/data（aliases.ts、tmp_ id 的来源）
    return { id: p.id, name: alias?.name ?? null, code: alias?.code ?? null, sec: p.sector, why: p.reason, ...stockArrays(data.series.get(p.ticker) as Series, from, to) };
  });
  return JSON.stringify({
    v: 2,
    year: data.year,
    source: 'WIKI Prices（Quandl 社区整理，Nasdaq Data Link 托管），公有领域；未复权价，成交量单位为股',
    dates: data.dates.slice(from, to),
    start,
    sectors: SECTORS.filter((sec) => pool.some((p) => p.sector === sec.id)),
    stocks,
    index: {
      id: 'x_dow',
      name: '老三十',
      note: '游戏用当年道指成分股的 WIKI 价格合成的价格加权指数，不是道琼斯官方指数；缺失的成分股和与真实道指的差距见 index.json',
      method: DOW_DESC,
      base: 1000,
      o: index.o, h: index.h, l: index.l, c: index.c, members: index.members,
    },
    ref: {
      id: 'x_nasdaq',
      name: '科综',
      role: 'reference',
      note: '只做参考，不参与归因。方向和真实纳指一致，幅度约为真实纳指的 1.1–1.4 倍；不是纳斯达克官方指数',
      method: NQ_DESC,
      base: 1000,
      o: ref.o, h: ref.h, l: ref.l, c: ref.c, members: ref.members,
    },
  });
}

interface Line { price: number; total: number; maxDD: number }
const line = (x: IndexLine, last: number, base: number): Line => ({
  price: (x.c[last] as number) / 1000 - 1,
  total: (x.total[last] as number) / 1000 - 1,
  maxDD: maxDrawdown(x.c, base),
});

interface Work {
  data: YearData;
  from: number;
  to: number;
  start: number;
  pool: PoolEntry[];
  dropped: string[];
  A: IndexLine;
  B: IndexLine;
  C: IndexLine;
  NQ: IndexLine;
  nqMembers: number;
  bMembers: number;
  ew: { pool: IndexLine; broad: IndexLine; broadN: number };
}

// 1. 各年：清洗、选池、算 A/B 和对照口径
const works: Work[] = [];
for (const year of years) {
  const data = loadYear(year, cache);
  const from = Math.max(0, data.yearStart - WARM);
  const to = data.dates.length;
  const start = data.yearStart - from;
  const base = data.yearStart - 1;
  let pool = selectPool(data, target);
  const dropped: string[] = [];
  const poolSet = (): Set<string> => new Set(pool.map((p) => p.ticker));
  let A = dollarWeightedMonthly(pool.map((p) => data.series.get(p.ticker) as Series), data.dates, from, to, base);
  const C = priceWeighted(data.series, data.dates, dowMembers, from, to, base);
  // 科综候选的成分不依赖股票池以外的东西，先用"无跳变或在初选池里"的口径算一次给体积估算用，定池后再算
  let NQ = A;
  // 超过 2MB：先删补齐的，再删妖股、大盘股（从末尾删起），明星股和故事股不删
  for (;;) {
    if (gz(packJson(data, pool, from, to, start, C, NQ), { level: 9 }).length <= MAX_GZ) break;
    const victim = ['fill', 'vola', 'big'].map((r) => pool.filter((p) => p.reason === r)).find((xs) => xs.length > 0);
    if (victim === undefined) break;
    const last = victim[victim.length - 1] as PoolEntry;
    dropped.push(last.ticker);
    pool = pool.filter((p) => p !== last);
    A = dollarWeightedMonthly(pool.map((p) => data.series.get(p.ticker) as Series), data.dates, from, to, base);
  }
  const ps = poolSet();
  const bMem = [...data.series.values()].filter((s) => s.last >= from && (s.jumps.length === 0 || ps.has(s.ticker)));
  const B = dollarWeightedMonthly(bMem, data.dates, from, to, base);
  const nqMem = bMem.filter((s) => isNasdaq(s.ticker));
  NQ = dollarWeightedMonthly(nqMem, data.dates, from, to, base);
  const clean = [...data.series.values()].filter((s) => s.last >= from && s.jumps.length === 0);
  works.push({
    data, from, to, start, pool, dropped, A, B, C, NQ, nqMembers: nqMem.length, bMembers: bMem.length,
    ew: { pool: equalWeightDaily(pool.map((p) => data.series.get(p.ticker) as Series), from, to, base), broad: equalWeightDaily(clean, from, to, base), broadN: clean.length },
  });
}

const indexPath = `${OUT}/index.json`;
const prevIndex = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, 'utf8')) as { years?: { year: number }[] }) : {};

// 3. 写年包和报告明细
interface YearReport {
  year: number;
  days: number;
  warm: number;
  stats: CleanStats;
  pool: (PoolEntry & { ret: number; vol: number; dollarVol: number; days: number; gaps: number })[];
  dropped: string[];
  C: Line & { minUsed: number; maxUsed: number; missing: string[] };
  NQ: Line & { members: number; top: { ticker: string; w: number }[] };
  keyDays: { idx: string; date: string; real: number; model: number | null; src: string }[];
  A: Line & { members: number; top: { ticker: string; w: number }[] };
  B: Line & { members: number; top: { ticker: string; w: number }[] };
  ewPool: Line;
  ewBroad: Line & { members: number };
  buyHold: { pool: number; broad: number; poolN: number; broadN: number };
  jumps: { ticker: string; date: string; ret: number; prev: number; close: number; kind: string; inPool: boolean }[];
  spikes: { ticker: string; date: string; ret: number; prev: number; close: number }[];
  notes: { ticker: string; note: string }[];
  duplicates: [string, string][];
  real: (typeof REAL_INDEX)[number] | undefined;
  rawBytes: number;
  gzBytes: number;
}
const reports: YearReport[] = [];
mkdirSync(OUT, { recursive: true });
for (const w of works) {
  const { data, from, to, start, pool } = w;
  const year = data.year;
  const json = packJson(data, pool, from, to, start, w.C, w.NQ);
  const gzBytes = gz(json, { level: 9 }).length;
  writeFileSync(`${OUT}/${year}.json`, json);

  const last = to - from - 1;
  const base = start - 1;
  const bh = (ss: Series[]): [number, number] => {
    const rs = ss.map((s) => periodReturn(s, data.yearStart - 1, to - 1)).filter((r): r is number => r !== null);
    return [rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length), rs.length];
  };
  const poolSeries = pool.map((p) => data.series.get(p.ticker) as Series);
  const clean = [...data.series.values()].filter((s) => s.last >= from && s.jumps.length === 0);
  const [bhPool, bhPoolN] = bh(poolSeries);
  const [bhBroad, bhBroadN] = bh(clean);
  const ps = new Set(pool.map((p) => p.ticker));
  const bMem = [...data.series.values()].filter((s) => s.last >= from && (s.jumps.length === 0 || ps.has(s.ticker)));
  const lastDay = to - 1;
  const usedYear = w.C.members.slice(base + 1);
  const seen = new Map<string, string | null>();
  for (let d = data.yearStart; d < to; d++) for (const [n, t] of dowMembers(data.dates[d] as string)) seen.set(n, t);
  const dayPct = (arr: number[], date: string): number | null => {
    const i = data.dates.indexOf(date) - from;
    return i <= 0 ? null : ((arr[i] as number) / (arr[i - 1] as number) - 1) * 100;
  };
  const keyDays = KEY_DAYS.filter((k) => k.date.startsWith(String(year))).map((k) => ({
    idx: k.idx, date: k.date, real: k.pct, model: dayPct(k.idx === 'dow' ? w.C.c : w.NQ.c, k.date), src: k.src,
  }));
  const nqMem = bMem.filter((s) => isNasdaq(s.ticker));
  const inWindow = (d: string): boolean => d >= (data.dates[from] as string);
  const rep: YearReport = {
    year,
    days: to - data.yearStart,
    warm: start,
    stats: data.stats,
    pool: pool.map((p) => {
      const m = metricOf(data, data.series.get(p.ticker) as Series);
      return { ...p, ret: m.ret, vol: m.vol, dollarVol: m.dollarVol, days: m.days, gaps: m.gaps };
    }),
    dropped: w.dropped,
    C: { ...line(w.C, last, base), minUsed: Math.min(...usedYear), maxUsed: Math.max(...usedYear), missing: [...seen.entries()].filter(([, t]) => t === null).map(([n]) => n) },
    NQ: { ...line(w.NQ, last, base), members: w.nqMembers, top: topWeights(nqMem, lastDay, 10) },
    keyDays,
    A: { ...line(w.A, last, base), members: pool.length, top: topWeights(poolSeries, lastDay, 10) },
    B: { ...line(w.B, last, base), members: w.bMembers, top: topWeights(bMem, lastDay, 10) },
    ewPool: line(w.ew.pool, last, base),
    ewBroad: { ...line(w.ew.broad, last, base), members: w.ew.broadN },
    buyHold: { pool: bhPool, broad: bhBroad, poolN: bhPoolN, broadN: bhBroadN },
    jumps: [...data.series.values()].flatMap((s) =>
      s.jumps.filter((j) => inWindow(j.date)).map((j) => ({ ticker: s.ticker, date: j.date, ret: j.ret, prev: j.prev, close: j.close, kind: j.kind, inPool: ps.has(s.ticker) })),
    ),
    spikes: [...data.series.values()].flatMap((s) =>
      s.spikes.filter((j) => inWindow(j.date)).map((j) => ({ ticker: s.ticker, date: j.date, ret: j.ret, prev: j.prev, close: j.close })),
    ),
    notes: poolSeries.flatMap((s) => s.splitNotes.map((note) => ({ ticker: s.ticker, note }))),
    duplicates: data.duplicates,
    real: REAL_INDEX.find((r) => r.year === year),
    rawBytes: json.length,
    gzBytes,
  };
  writeFileSync(`${cache}/report-${year}.json`, JSON.stringify(rep, null, 1));
  writeFileSync(`${cache}/alt-${year}.json`, JSON.stringify({ year, C: rep.C, NQ: rep.NQ, keyDays }, null, 1));
  reports.push(rep);
  const byReason = (r: string): number => pool.filter((p) => p.reason === r).length;
  console.log(
    `${year}：${pool.length} 只（明星 ${byReason('star')}、故事 ${byReason('pick')}、大盘 ${byReason('big')}、妖股 ${byReason('vola')}、补齐 ${byReason('fill')}），` +
      `${rep.days} 个交易日 + ${start} 天开局前历史；${(json.length / 1024).toFixed(0)}KB，gzip ${(gzBytes / 1024).toFixed(0)}KB；` +
      `老三十 ${pct(rep.C.price)}（回撤 ${pct(rep.C.maxDD)}，成分 ${rep.C.minUsed}–${rep.C.maxUsed}/30），科综 ${pct(rep.NQ.price)}（${rep.NQ.members} 只）；对照 B ${pct(rep.B.price)}`,
  );
  if (w.dropped.length > 0) console.log(`  超过 2MB，删掉 ${w.dropped.length} 只：${w.dropped.join(' ')}`);
}

// 4. index.json：逐年合并
const keep = (prevIndex.years ?? []).filter((y) => !years.includes(y.year));
const gap = (x: number, r: number): string => `${x - r >= 0 ? '+' : ''}${((x - r) * 100).toFixed(1)} 个百分点`;
const yearEntries = [
  ...keep,
  ...reports.map((r) => ({
    year: r.year,
    file: `${r.year}.json`,
    stocks: r.pool.length,
    days: r.days,
    warmDays: r.warm,
    bytes: r.rawBytes,
    gzipBytes: r.gzBytes,
    cleaning: r.stats,
    index: {
      id: 'x_dow',
      priceReturn: round(r.C.price, 4),
      maxDrawdown: round(r.C.maxDD, 4),
      membersUsed: r.C.minUsed === r.C.maxUsed ? `${r.C.minUsed}/30` : `${r.C.minUsed}–${r.C.maxUsed}/30`,
      missingMembers: r.C.missing,
      missingHandling: '数据里没有的成分股直接剔除，相当于剔除后重算除数，其余成分仍按价格加权',
    },
    ref: { id: 'x_nasdaq', priceReturn: round(r.NQ.price, 4), maxDrawdown: round(r.NQ.maxDD, 4), members: r.NQ.members },
    real: r.real === undefined ? null : { dow: r.real.dow, sp500: r.real.sp500, nasdaq: r.real.nasdaq, source: r.real.source, caveat: r.real.caveat ?? null },
    gapToReal:
      r.real === undefined
        ? null
        : `老三十全年 ${pct(r.C.price)}，真实道指 ${pct(r.real.dow)}，差 ${gap(r.C.price, r.real.dow)}；科综全年 ${pct(r.NQ.price)}，真实纳指 ${pct(r.real.nasdaq)}，差 ${gap(r.NQ.price, r.real.nasdaq)}。`,
    survivorship:
      r.real === undefined
        ? null
        : `幸存者偏差对照（不进年包）：WIKI 全数据集成交额加权 ${pct(r.B.price)}、等权 ${pct(r.ewBroad.price)}（${r.ewBroad.members} 只），真实标普 500 ${pct(r.real.sp500)}${r.real.caveat ? '（待核对）' : ''}。`,
  })),
].sort((a, b) => a.year - b.year);
const index = {
  v: 2,
  updated: new Date().toISOString().slice(0, 10),
  years: yearEntries,
  index: {
    id: 'x_dow',
    name: '老三十',
    method: DOW_DESC,
    disclaimer: '不是道琼斯官方指数。这是游戏用当年道指的真实成分名单、取 WIKI Prices 里的价格自己合成的价格加权指数，不使用道琼斯的任何指数数据。成分股缺失和与真实道指的差距逐年列在 years[].index 与 years[].gapToReal。',
    missingHandling: '数据里没有的成分股（已破产、被收购或被别的公司占用代码的，如旧 AT&T、柯达、旧通用、J.P. Morgan & Co.、西尔斯、联合碳化物）直接剔除，相当于剔除后重算除数；1999 年用到 24–26 只、2000 年 26 只、2008 年 29 只。',
    sources: [
      'https://en.wikipedia.org/wiki/Historical_components_of_the_Dow_Jones_Industrial_Average',
      'https://money.cnn.com/1999/10/26/markets/dow_history/',
      'https://www.cnbc.com/2008/02/11/dow-adds-chevron-bofa-drops-honeywell-altria.html',
      'https://www.upi.com/Business_News/2008/09/19/Kraft-replaces-AIG-on-Dow-Jones-index/62361221833414/',
    ],
    base: '开局前最后一个交易日收盘 = 1000',
  },
  ref: {
    id: 'x_nasdaq',
    name: '科综',
    role: '只做参考，不参与归因',
    method: NQ_DESC,
    disclaimer: '不是纳斯达克官方指数。方向和真实纳指一致，幅度约为真实纳指的 1.1–1.4 倍（成交额加权让高换手的龙头股权重偏高；上市地按代码惯例近似判断）。',
    base: '开局前最后一个交易日收盘 = 1000',
  },
  source: {
    name: 'WIKI Prices',
    publisher: 'Quandl 社区整理，Nasdaq Data Link 托管',
    license: 'Public domain',
    statement: '"curated by the Quandl community and released into the public domain"',
    url: 'https://data.nasdaq.com/databases/WIKIP',
    snapshot: '2026-10-11 导出（数据快照 2026-02-03，内容截至 2018-03-27）',
    notes: '社区维护的数据，可能有错误；本游戏做了清洗（见 cleaning）。公司名称、代码在游戏里换成化名；价格是当年的真实未复权价格。',
  },
  method: {
    prices: '未复权开高低收（当年真实价格）。拆股、分红在除权除息日开盘前生效：先按拆股比例调整持股，再按调整后的股数发每股现金分红（WIKI 的口径）。',
    returns: '单日总收益 = 拆股比例 × (收盘 + 每股分红) / 前收 − 1。',
    cleaning:
      '剔除：非交易日行、重复行、零或负价、最高 < 最低、开收越出高低价 0.5% 以上、成交量缺失、单日 ±80% 且次日回到原位的错价；单日 ±80% 但不是错价的股票标"待复核"，不按行业规则进股票池（时间线明星股、故事股除外，人工复核）。大额分红核对、人工修正见核对报告。剔除的行成为缺口（停牌）。',
  },
  survivorship:
    'WIKI Prices 主要收录 2018 年前后仍在交易的美股，已破产或已退市的公司（如雷曼、贝尔斯登、安然、世通、朗讯、北电、房利美）大多不在数据里。所以数据里的股票都是"活下来的"，合成大盘会比当年真实的大盘好看，熊市年尤其明显。这些公司的事件只作为新闻出现，不能交易。',
};
writeFileSync(indexPath, JSON.stringify(index, null, 1));
console.log(`写入 ${indexPath}`);
