// 数据管线公用：默认路径、命令行参数、CSV 行解析。
export const DEFAULT_SRC = `${process.env['HOME'] ?? ''}/data/wiki-prices/WIKI_PRICES_989367082a7cf822fd35dbe3c8f4969b.csv`;
export const DEFAULT_CACHE = `${process.env['HOME'] ?? ''}/data/wiki-prices/slices`;
export const OUT_DIR = 'public/data/years';

export function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? (process.argv[i + 1] as string) : def;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** 一行原始数据（未复权）。缺失字段为 NaN。 */
export interface RawRow {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  div: number;
  split: number;
  adjClose: number;
}

function num(s: string | undefined): number {
  if (s === undefined || s === '') return NaN;
  return Number(s);
}

/** 列：ticker,date,open,high,low,close,volume,ex-dividend,split_ratio,adj_open,adj_high,adj_low,adj_close,adj_volume */
export function parseRow(line: string): RawRow | null {
  const f = line.split(',');
  if (f.length < 13) return null;
  return {
    ticker: f[0] as string,
    date: f[1] as string,
    open: num(f[2]),
    high: num(f[3]),
    low: num(f[4]),
    close: num(f[5]),
    volume: num(f[6]),
    div: num(f[7]),
    split: num(f[8]),
    adjClose: num(f[12]),
  };
}

export function round(x: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(x * m) / m;
}

export function pct(x: number, digits = 1): string {
  const s = (x * 100).toFixed(digits);
  return `${x >= 0 ? '+' : ''}${s}%`;
}
