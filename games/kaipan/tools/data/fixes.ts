/**
 * 人工修正的公司行动（WIKI 原值明显有误，且能从数据本身看出来）。清洗时在逐行检查之前套用，并计入 manualFix。
 * 只修三年包涉及的，每条写清依据；其余可疑分红由 clean.ts 的通用规则处理。
 */
export interface Fix { ticker: string; date: string; split?: number; div?: number; why: string }

export const FIXES: Fix[] = [
  {
    ticker: 'RIG', date: '2007-11-27', split: 0.6996,
    why: 'Transocean 与 GlobalSantaFe 合并时的资本重组：每股换 0.6996 股新股 + 33.03 美元现金。WIKI 只记了分红 47.2127（= 33.03 / 0.6996，按新股计），漏了 0.6996 的合股，价格却没有下跌，按原值算持有人当天凭空多 36%。',
  },
  {
    ticker: 'F', date: '2000-08-03', split: 1.555, div: 3.3248,
    why: 'Ford 价值提升计划（VEP）：每股旧股换 1 股新股，另选 20 美元现金 / 0.748 股新股 / 5.17 美元现金 + 0.555 股新股（Ford 2000-08-07 公告，SEC 8-K）。WIKI 记的是拆股 1.571 + 每股 5.4（来源不明，和三个选项都对不上）。按"组合"选项改为拆股 1.555、每股（新股）分红 5.17 / 1.555 = 3.3248。来源：https://www.sec.gov/Archives/edgar/data/0000037996/000003799600000086/0002.txt',
  },
  { ticker: 'STSA', date: '2007-09-26', div: 0.09, why: 'Sterling Financial 的季度分红，WIKI 记成 9，股价当天没有相应下跌，推断单位错了 100 倍，按 ÷100 处理（金额未逐条核对公司公告）' },
  { ticker: 'STSA', date: '2007-12-27', div: 0.095, why: '同上，WIKI 记成 9.5，按 ÷100' },
  { ticker: 'STSA', date: '2008-03-27', div: 0.1, why: '同上，WIKI 记成 10，按 ÷100' },
  { ticker: 'STSA', date: '2008-06-26', div: 0.1, why: '同上，WIKI 记成 10，按 ÷100' },
  { ticker: 'STSA', date: '2008-09-26', div: 0.1, why: '同上，WIKI 记成 10，按 ÷100' },
];

/** 整个代码的成交量换算（WIKI 原值的量级明显不对；只影响大盘权重和成交量显示）。 */
export const VOLUME_SCALE: Record<string, { scale: number; why: string }> = {
  BRK_A: {
    scale: 0.01,
    why: 'Berkshire A 股的成交量比实际大约高 100 倍（2008-12 每天 7–11 万股 × 约 10 万美元 = 每天 70 亿美元以上，超过埃克森美孚；同期 B 股只有 2–4 万股），推断单位错误，按 ÷100 处理（未逐日核对交易所数据）',
  },
};
