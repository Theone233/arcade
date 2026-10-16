/**
 * 时间线里标"待核对"、且能用回放数据算出来的数字（个股某天涨跌、区间涨跌、全年涨跌等）。
 * line 是 docs/history/timeline-<年>.md 的行号（2026-10-11 版本）。大盘点位类（道指、标普、纳指）数据里没有，不在这里。
 * 算法见 check.ts：day = 当天收盘相对前一交易日收盘（含拆股，不含分红）；year = 上年最后收盘到当年最后收盘（拆股调整，不含分红）。
 */
export type Query =
  | { kind: 'day'; t: string; date: string }
  | { kind: 'range'; t: string; from: string; to: string }
  | { kind: 'year'; t: string }
  | { kind: 'maxHigh'; t: string; base: string; from: string; to: string }
  | { kind: 'minClose'; t: string; from: string; to: string }
  | { kind: 'first'; t: string }
  | { kind: 'sector'; sector: string; date: string };

export interface Item { year: number; line: number; claim: string; q: Query[]; note?: string }

export const BACKFILL: Item[] = [
  // 1999
  {
    year: 1999, line: 16, claim: 'AMZN 3 拆 1 后一周内曾涨约 48%，2 月中旬又回落超 25%',
    q: [{ kind: 'maxHigh', t: 'AMZN', base: '1999-01-04', from: '1999-01-05', to: '1999-01-12' }, { kind: 'range', t: 'AMZN', from: '1999-01-04', to: '1999-01-12' }, { kind: 'minClose', t: 'AMZN', from: '1999-02-01', to: '1999-02-26' }],
  },
  { year: 1999, line: 22, claim: '雅虎宣布收购 GeoCities（常见说法 1-28），幅度待核对', q: [{ kind: 'day', t: 'YHOO', date: '1999-01-28' }] },
  { year: 1999, line: 52, claim: '雅虎收购 broadcast.com，幅度待核对', q: [{ kind: 'day', t: 'YHOO', date: '1999-04-01' }] },
  { year: 1999, line: 66, claim: '高盛 5-04 上市，券商股走强，幅度待核对', q: [{ kind: 'first', t: 'GS' }] },
  {
    year: 1999, line: 79, claim: 'eBay 宕机：6-14 盘中 -18 15/16 至 146 15/16；另说两天内从约 $182 跌到 $135',
    q: [{ kind: 'day', t: 'EBAY', date: '1999-06-11' }, { kind: 'day', t: 'EBAY', date: '1999-06-14' }, { kind: 'day', t: 'EBAY', date: '1999-06-15' }, { kind: 'minClose', t: 'EBAY', from: '1999-06-10', to: '1999-06-16' }],
  },
  { year: 1999, line: 91, claim: '惠普 7-19 任命新 CEO，幅度待核对', q: [{ kind: 'day', t: 'HPQ', date: '1999-07-19' }, { kind: 'day', t: 'HPQ', date: '1999-07-20' }] },
  { year: 1999, line: 104, claim: '铱星 8 月违约破产，摩托罗拉承压，幅度待核对', q: [{ kind: 'day', t: 'MSI', date: '1999-08-11' }, { kind: 'day', t: 'MSI', date: '1999-08-13' }], note: 'WIKI 代码 MSI = 当年 MOT' },
  { year: 1999, line: 115, claim: '台湾地震，存储股走强，PC 股承压，幅度待核对', q: [{ kind: 'day', t: 'MU', date: '1999-09-21' }, { kind: 'day', t: 'DELL', date: '1999-09-21' }], note: '康柏不在数据里' },
  { year: 1999, line: 127, claim: '世通宣布收购 Sprint，电信股波动，幅度待核对', q: [{ kind: 'day', t: 'S', date: '1999-10-05' }], note: 'WIKI 的 S 是 Sprint（当年 FON）；世通不在数据里' },
  { year: 1999, line: 142, claim: '辉瑞敌意竞购华纳-兰伯特，幅度待核对', q: [{ kind: 'day', t: 'PFE', date: '1999-11-04' }], note: '华纳-兰伯特、美国家庭用品不在数据里' },
  { year: 1999, line: 146, claim: '金融混业法案签署，幅度待核对', q: [{ kind: 'day', t: 'C', date: '1999-11-12' }, { kind: 'sector', sector: 'bank', date: '1999-11-12' }] },
  { year: 1999, line: 155, claim: '埃克森美孚合并完成，幅度待核对', q: [{ kind: 'day', t: 'XOM', date: '1999-11-30' }] },
  { year: 1999, line: 162, claim: '亚马逊情绪顶点，幅度待核对', q: [{ kind: 'day', t: 'AMZN', date: '1999-12-27' }] },
  { year: 1999, line: 178, claim: '思科全年走势待核对', q: [{ kind: 'year', t: 'CSCO' }] },
  // 2000
  { year: 2000, line: 19, claim: 'AOL 宣布收购时代华纳，当日两股涨跌待核对', q: [{ kind: 'day', t: 'TWX', date: '2000-01-10' }], note: 'WIKI 的 TWX 在 2000 年是 AOL；旧时代华纳不在数据里' },
  { year: 2000, line: 20, claim: '微软换 CEO，反应温和（幅度待核对）', q: [{ kind: 'day', t: 'MSFT', date: '2000-01-13' }] },
  { year: 2000, line: 31, claim: '辉瑞合并华纳-兰伯特，幅度待核对', q: [{ kind: 'day', t: 'PFE', date: '2000-02-07' }] },
  {
    year: 2000, line: 32, claim: '网站遭 DDoS，幅度待核对',
    q: [{ kind: 'day', t: 'YHOO', date: '2000-02-08' }, { kind: 'day', t: 'EBAY', date: '2000-02-09' }, { kind: 'day', t: 'AMZN', date: '2000-02-09' }],
  },
  { year: 2000, line: 34, claim: 'Windows 2000 发布，幅度待核对', q: [{ kind: 'day', t: 'MSFT', date: '2000-02-17' }] },
  { year: 2000, line: 76, claim: '微软拆分令，幅度待核对', q: [{ kind: 'day', t: 'MSFT', date: '2000-06-07' }, { kind: 'day', t: 'MSFT', date: '2000-06-08' }] },
  { year: 2000, line: 98, claim: '费尔斯通轮胎召回，福特承压，幅度待核对', q: [{ kind: 'day', t: 'F', date: '2000-08-09' }, { kind: 'range', t: 'F', from: '2000-08-08', to: '2000-08-31' }], note: '普利司通不在数据里' },
  { year: 2000, line: 109, claim: 'INTC 下挫，幅度待核对', q: [{ kind: 'day', t: 'INTC', date: '2000-09-05' }] },
  { year: 2000, line: 110, claim: 'Chase 宣布收购 J.P. Morgan，幅度待核对', q: [{ kind: 'day', t: 'JPM', date: '2000-09-13' }], note: 'WIKI 的 JPM 在 2000 年是 Chase（收购方）' },
  {
    year: 2000, line: 122, claim: 'DELL 预警；年内已从约 43 跌至 28.56',
    q: [{ kind: 'range', t: 'DELL', from: '1999-12-31', to: '2000-10-04' }, { kind: 'day', t: 'DELL', date: '2000-10-05' }],
  },
  { year: 2000, line: 150, claim: 'FTC 批准 AOL-时代华纳，幅度待核对', q: [{ kind: 'day', t: 'TWX', date: '2000-12-14' }], note: 'TWX = AOL' },
  { year: 2000, line: 167, claim: 'QCOM 2000 年回落，幅度待核对', q: [{ kind: 'year', t: 'QCOM' }] },
  { year: 2000, line: 168, claim: 'ORCL 年内走势待核对', q: [{ kind: 'year', t: 'ORCL' }] },
  { year: 2000, line: 178, claim: 'EMC 年内走势待核对', q: [{ kind: 'year', t: 'EMC' }] },
  { year: 2000, line: 195, claim: 'CMGI 2000 年随板块暴跌，幅度待核对', q: [{ kind: 'year', t: 'MLNK' }], note: 'WIKI 代码 MLNK' },
  { year: 2000, line: 199, claim: 'JNPR 年内走势待核对', q: [{ kind: 'year', t: 'JNPR' }] },
  // 2008
  { year: 2008, line: 16, claim: '美银救购全国房贷，银行股短暂松口气（幅度待核对）', q: [{ kind: 'day', t: 'BAC', date: '2008-01-11' }], note: '全国房贷不在数据里' },
  { year: 2008, line: 17, claim: '花旗巨额减记，拖累大盘（幅度待核对）', q: [{ kind: 'day', t: 'C', date: '2008-01-15' }] },
  { year: 2008, line: 28, claim: '微软出价收购雅虎：YHOO 跳涨、MSFT 下跌（幅度待核对）', q: [{ kind: 'day', t: 'YHOO', date: '2008-02-01' }, { kind: 'day', t: 'MSFT', date: '2008-02-01' }] },
  { year: 2008, line: 30, claim: '雅虎拒绝报价，YHOO 回落（幅度待核对）', q: [{ kind: 'day', t: 'YHOO', date: '2008-02-11' }] },
  { year: 2008, line: 42, claim: 'JPM 收购贝尔斯登（BSC 次日暴跌约八成多，幅度待核对）', q: [{ kind: 'day', t: 'JPM', date: '2008-03-17' }], note: '贝尔斯登不在数据里，只能回填 JPM' },
  { year: 2008, line: 45, claim: '收购价提到 10 美元，BSC 反弹（幅度待核对）', q: [{ kind: 'day', t: 'JPM', date: '2008-03-24' }], note: '只能回填 JPM' },
  { year: 2008, line: 51, claim: '达美与西北航空合并，航空股受油价压制（幅度待核对）', q: [{ kind: 'day', t: 'DAL', date: '2008-04-14' }] },
  { year: 2008, line: 60, claim: '微软撤回报价，YHOO 5/5 暴跌（幅度待核对）', q: [{ kind: 'day', t: 'YHOO', date: '2008-05-05' }] },
  { year: 2008, line: 70, claim: '债券保险股下跌（幅度待核对）', q: [{ kind: 'day', t: 'MBI', date: '2008-06-05' }, { kind: 'day', t: 'BAC', date: '2008-06-05' }], note: 'Ambac 不在数据里' },
  { year: 2008, line: 72, claim: 'iPhone 3G 发布，AAPL 承压（幅度待核对）', q: [{ kind: 'day', t: 'AAPL', date: '2008-06-09' }] },
  { year: 2008, line: 82, claim: '星巴克关店、美银完成收购全国房贷：SBUX 承压（幅度待核对）', q: [{ kind: 'day', t: 'SBUX', date: '2008-07-01' }, { kind: 'day', t: 'BAC', date: '2008-07-01' }] },
  { year: 2008, line: 84, claim: 'iPhone 3G 开售，AAPL 走势待核对', q: [{ kind: 'day', t: 'AAPL', date: '2008-07-11' }] },
  { year: 2008, line: 88, claim: '限制裸卖空令后，次日起金融股大反弹（幅度待核对）', q: [{ kind: 'sector', sector: 'bank', date: '2008-07-16' }, { kind: 'day', t: 'WFC', date: '2008-07-16' }] },
  { year: 2008, line: 114, claim: '金融股轧空暴涨（幅度待核对）', q: [{ kind: 'sector', sector: 'bank', date: '2008-09-18' }, { kind: 'sector', sector: 'bank', date: '2008-09-19' }, { kind: 'day', t: 'MS', date: '2008-09-18' }] },
  { year: 2008, line: 116, claim: '高盛、大摩转银行控股，股神注资高盛：投行股稳定（幅度待核对）', q: [{ kind: 'day', t: 'GS', date: '2008-09-22' }, { kind: 'day', t: 'MS', date: '2008-09-22' }, { kind: 'day', t: 'GS', date: '2008-09-24' }, { kind: 'day', t: 'BRK_B', date: '2008-09-24' }] },
  { year: 2008, line: 127, claim: '救市法案通过；富国截胡美联银行；乔布斯健康假消息', q: [{ kind: 'day', t: 'WFC', date: '2008-10-03' }, { kind: 'day', t: 'C', date: '2008-10-03' }, { kind: 'day', t: 'AAPL', date: '2008-10-03' }] },
  { year: 2008, line: 150, claim: '保尔森放弃收购坏资产，金融股大跌（幅度待核对）', q: [{ kind: 'sector', sector: 'bank', date: '2008-11-12' }] },
  { year: 2008, line: 151, claim: '三大车企国会求援，汽车股继续下跌（幅度待核对）', q: [{ kind: 'day', t: 'F', date: '2008-11-18' }, { kind: 'day', t: 'F', date: '2008-11-19' }], note: '老通用不在数据里' },
  { year: 2008, line: 166, claim: '参议院否决汽车救助，汽车股次日跌（幅度待核对）', q: [{ kind: 'day', t: 'F', date: '2008-12-12' }] },
  { year: 2008, line: 197, claim: 'GOOG 随大盘大跌（幅度待核对）', q: [{ kind: 'year', t: 'GOOGL' }], note: 'WIKI 代码 GOOGL' },
  { year: 2008, line: 198, claim: 'AMZN 全年幅度待核对', q: [{ kind: 'year', t: 'AMZN' }] },
  { year: 2008, line: 199, claim: 'NFLX 熊市中全年约 +12%（价格口径，待核对）', q: [{ kind: 'year', t: 'NFLX' }] },
  { year: 2008, line: 200, claim: 'YHOO 后来跌到个位数（待核对）', q: [{ kind: 'minClose', t: 'YHOO', from: '2008-01-02', to: '2008-12-31' }] },
  { year: 2008, line: 211, claim: 'DLTR 熊市赢家（涨幅来源不一，待核对）', q: [{ kind: 'year', t: 'DLTR' }] },
];
