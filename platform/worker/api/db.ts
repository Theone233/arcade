/** D1 的薄包装：每次调用都把 meta 记进计量（按类别），并累计这个请求写了、读了几行（测试用来断言 7.2 的写入行数和读榜的读取上限）。 */
import { type Category, CATEGORIES, meter } from './meter';

export interface RequestStats {
  rowsWritten: number;
  rowsRead: number;
  byCategory: Record<Category, number>;
}

export function newStats(): RequestStats {
  return { rowsWritten: 0, rowsRead: 0, byCategory: Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<Category, number> };
}

export class Db {
  constructor(
    readonly raw: D1Database,
    readonly stats: RequestStats,
    private cat: Category,
  ) {}

  /** 同一个请求里，顺带的写入（如 last_seen_at）记到别的类别。 */
  as(cat: Category): Db {
    return new Db(this.raw, this.stats, cat);
  }

  stmt(sql: string, ...binds: unknown[]): D1PreparedStatement {
    return this.raw.prepare(sql).bind(...binds);
  }

  async all<T>(s: D1PreparedStatement): Promise<T[]> {
    const r = await s.all<T>();
    this.track(r.meta);
    return r.results;
  }

  async first<T>(s: D1PreparedStatement): Promise<T | null> {
    return (await this.all<T>(s))[0] ?? null;
  }

  async run(s: D1PreparedStatement): Promise<D1Meta> {
    const r = await s.run();
    this.track(r.meta);
    return r.meta;
  }

  async batch<T = Record<string, unknown>>(stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const rs = await this.raw.batch<T>(stmts);
    for (const r of rs) this.track(r.meta);
    return rs;
  }

  private track(meta: D1Meta | undefined): void {
    if (!meta) return;
    meter.addD1(this.cat, meta);
    const n = meta.rows_written ?? 0;
    this.stats.rowsWritten += n;
    this.stats.rowsRead += meta.rows_read ?? 0;
    this.stats.byCategory[this.cat] += n;
  }
}
