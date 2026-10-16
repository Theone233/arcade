/**
 * 真实指数全年涨跌（价格指数，不含分红），只用于核对报告和依据页的对比，不进行情数据。
 * 数字抄自 docs/history/timeline-<年>.md 第 1 节"年度概览"（各自注明来源）；2000 年标普 500 时间线标为"待核对"。
 */
export interface RealIndex { year: number; dow: number; sp500: number; nasdaq: number; source: string; caveat?: string }

export const REAL_INDEX: RealIndex[] = [
  { year: 1999, dow: 0.252, sp500: 0.195, nasdaq: 0.856, source: 'timeline-1999.md 年度概览（CNN Money 1999-12-31）' },
  { year: 2000, dow: -0.062, sp500: -0.101, nasdaq: -0.393, source: 'timeline-2000.md 年度概览（Nasdaq 年终公告、Deseret News 2000-12-29）', caveat: '标普 500 −10.1% 时间线标"待核对"' },
  { year: 2008, dow: -0.338, sp500: -0.385, nasdaq: -0.405, source: 'timeline-2008.md 年度概览（CNN 2008-12-31）' },
];
