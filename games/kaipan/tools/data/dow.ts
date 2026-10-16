/**
 * 候选 C（"老三十"式价格加权）用的道指成分股名单。只用公开史实的成分股名单和调整日期，不用道琼斯的任何指数数据。
 *
 * 来源（2026-10-11 检索）：
 *  - Wikipedia: Historical components of the Dow Jones Industrial Average
 *    https://en.wikipedia.org/wiki/Historical_components_of_the_Dow_Jones_Industrial_Average
 *  - 1999-11-01 调整：CNN Money 1999-10-26 https://money.cnn.com/1999/10/26/markets/dow_history/
 *    （加入 MSFT、INTC、SBC、HD，移出 Chevron、Goodyear、Sears、Union Carbide；SBC、HD、Sears、Union Carbide 这几只
 *    只在 Wikipedia 沿革页核对过）
 *  - 2008-02-19 调整：CNBC 2008-02-11 https://www.cnbc.com/2008/02/11/dow-adds-chevron-bofa-drops-honeywell-altria.html
 *  - 2008-09-22 调整：UPI 2008-09-19 https://www.upi.com/Business_News/2008/09/19/Kraft-replaces-AIG-on-Dow-Jones-index/62361221833414/
 *  - 1999-11-30 Exxon→Exxon Mobil、1999-12-01 AlliedSignal→Honeywell International 是同一法人改名，成分不变。
 *  - 1997-03-17 调整（Travelers、HP、J&J、Wal-Mart 入；Westinghouse、Texaco、Bethlehem Steel、Woolworth 出）：
 *    CNN Money 1997-03-12 https://money.cnn.com/1997/03/12/markets/dow/ ；Wikipedia 沿革页同日期同名单。
 *  - 2004-04-08 调整（AIG、Pfizer、Verizon 入；AT&T、Eastman Kodak、International Paper 出）：
 *    CNN Money 2004-04-01 https://money.cnn.com/2004/04/01/markets/dow/ ；Light Reading 2004-04-01 https://www.lightreading.com/cable-technology/dow-jones-replaces-three-stocks
 *  - 2009-06-08 调整（Cisco 换 GM、Travelers 换 Citigroup）：CNN Money 2009-06-01 https://money.cnn.com/2009/06/01/news/companies/dow_jones/index.htm ；
 *    NBC News https://www.nbcnews.com/news/amp/wbna31044039
 *  - 2012-09-24 调整（UnitedHealth 换 Kraft）：CNBC https://www.cnbc.com/id/49031374 ；NPR 2012-09-24 https://www.npr.org/transcripts/161669998
 *  - 2013-09-23 调整（Goldman Sachs 换 BofA、Visa 换 HP、Nike 换 Alcoa；9-10 宣布，9-20 收盘后生效）：
 *    S&P DJI 公告转载 https://mondovisione.com/media-and-resources/news/goldman-sachs-visa-and-nike-set-to-join-the-dow-jones-industrial-average-2013910/ ；
 *    NBC News https://www.nbcnews.com/businessmain/major-changes-dow-goldman-nike-alcoa-bofa-out-8c11120802
 *  - 2015-03-19 调整（Apple 换 AT&T）：S&P DJI 公告未直接核对，日期取自 Wikipedia 沿革页与 Benzinga https://benzinga.com/article/5306463 （推断，待用原公告核对）。
 *  - 2017-09-01 DuPont 并入 DowDuPont（仍是同一席位，成分不变，不记为调整）；2018-06-26 Walgreens 换 GE 在本管线 2018-03-27 终点之后，不收。
 *  - 以上所有调整的日期与名单交叉核对过 Wikipedia 沿革页（2026-10-12 检索），其中 1997、2004、2009、2012、2013 另有当年新闻稿/新闻来源。
 *  - 1996-01-01 起的名单 = 1991-05-06 调整之后、1997-03-17 调整之前的 30 家（沿革页：这段时间没有其他调整）；
 *    Travelers Group 1998-10 与 Citicorp 合并改名 Citigroup（成分不变，代码 C）。
 *    1997–2003 年的 Travelers/Citigroup、HP 等的 WIKI 价格是否覆盖当年，没有逐只核对数据，null 的是已知数据里没有的公司。
 *  - 1998 年下半年到 2007 年底之间没有其他调整（下一次是 2004-04-08，与本次三年无关；2008-02-19 是"近四年来首次调整"）。
 *
 * 每个成分写成 [当年名称, WIKI 代码或 null]。null = 数据里没有这家公司在当年的价格。
 */
export type Member = [string, string | null];

/** 1996-01-01 起（1997-03-17 调整之前） */
const DOW_1996: Member[] = [
  ['AlliedSignal（ALD，1999-12 起 Honeywell International）', 'HON'],
  ['Alcoa（AA）', 'ARNC'],
  ['American Express', 'AXP'],
  ['AT&T（旧）', null],
  ['Bethlehem Steel', null],
  ['Boeing', 'BA'],
  ['Caterpillar', 'CAT'],
  ['Chevron（CHV）', 'CVX'],
  ['Coca-Cola', 'KO'],
  ['DuPont', 'DD'],
  ['Eastman Kodak', null],
  ['Exxon（XON，1999-11-30 起 Exxon Mobil）', 'XOM'],
  ['General Electric', 'GE'],
  ['General Motors（旧）', null],
  ['Goodyear', 'GT'],
  ['IBM', 'IBM'],
  ['International Paper', 'IP'],
  ['J.P. Morgan & Co.', null],
  ['McDonald\'s', 'MCD'],
  ['Merck', 'MRK'],
  ['3M（Minnesota Mining）', 'MMM'],
  ['Philip Morris', 'MO'],
  ['Procter & Gamble', 'PG'],
  ['Sears', null],
  ['Texaco', null],
  ['Union Carbide', null],
  ['United Technologies', 'UTX'],
  ['Walt Disney', 'DIS'],
  ['Westinghouse Electric', null],
  ['F.W. Woolworth', null],
];

/** 1998-01-01 起（也用于 1998 年下半年的开局前历史） */
const DOW_1999: Member[] = [
  ['AlliedSignal（ALD，1999-12 起 Honeywell International）', 'HON'],
  ['Alcoa（AA）', 'ARNC'],
  ['American Express', 'AXP'],
  ['AT&T（旧）', null],
  ['Boeing', 'BA'],
  ['Caterpillar', 'CAT'],
  ['Chevron（CHV）', 'CVX'],
  ['Citigroup', 'C'],
  ['Coca-Cola', 'KO'],
  ['DuPont', 'DD'],
  ['Eastman Kodak', null],
  ['Exxon（XON，1999-11-30 起 Exxon Mobil）', 'XOM'],
  ['General Electric', 'GE'],
  ['General Motors（旧）', null],
  ['Goodyear', 'GT'],
  ['Hewlett-Packard（HWP）', 'HPQ'],
  ['IBM', 'IBM'],
  ['International Paper', 'IP'],
  ['J.P. Morgan & Co.', null],
  ['Johnson & Johnson', 'JNJ'],
  ['McDonald\'s', 'MCD'],
  ['Merck', 'MRK'],
  ['3M（Minnesota Mining）', 'MMM'],
  ['Philip Morris', 'MO'],
  ['Procter & Gamble', 'PG'],
  ['Sears', null],
  ['Union Carbide', null],
  ['United Technologies', 'UTX'],
  ['Wal-Mart', 'WMT'],
  ['Walt Disney', 'DIS'],
];

const DOW_2008: Member[] = [
  ['3M', 'MMM'],
  ['Alcoa（AA）', 'ARNC'],
  ['Altria（MO）', 'MO'],
  ['American Express', 'AXP'],
  ['AIG', 'AIG'],
  ['AT&T（原 SBC）', 'T'],
  ['Boeing', 'BA'],
  ['Caterpillar', 'CAT'],
  ['Citigroup', 'C'],
  ['Coca-Cola', 'KO'],
  ['DuPont', 'DD'],
  ['Exxon Mobil', 'XOM'],
  ['General Electric', 'GE'],
  ['General Motors（旧）', null],
  ['Hewlett-Packard', 'HPQ'],
  ['Home Depot', 'HD'],
  ['Honeywell', 'HON'],
  ['IBM', 'IBM'],
  ['Intel', 'INTC'],
  ['Johnson & Johnson', 'JNJ'],
  ['JPMorgan Chase', 'JPM'],
  ['McDonald\'s', 'MCD'],
  ['Merck', 'MRK'],
  ['Microsoft', 'MSFT'],
  ['Pfizer', 'PFE'],
  ['Procter & Gamble', 'PG'],
  ['United Technologies', 'UTX'],
  ['Verizon', 'VZ'],
  ['Wal-Mart', 'WMT'],
  ['Walt Disney', 'DIS'],
];

export interface Change { date: string; out: string[]; in: Member[] }

export const DOW_CHANGES: Change[] = [
  {
    date: '1997-03-17',
    out: ['Bethlehem Steel', 'Texaco', 'Westinghouse Electric', 'F.W. Woolworth'],
    in: [['Citigroup（原 Travelers Group，1998-10 改名）', 'C'], ['Hewlett-Packard（HWP）', 'HPQ'], ['Johnson & Johnson', 'JNJ'], ['Wal-Mart', 'WMT']],
  },
  {
    date: '1999-11-01',
    out: ['Chevron（CHV）', 'Goodyear', 'Sears', 'Union Carbide'],
    in: [['Microsoft', 'MSFT'], ['Intel', 'INTC'], ['SBC Communications', 'T'], ['Home Depot', 'HD']],
  },
  {
    date: '2004-04-08',
    out: ['AT&T（旧）', 'Eastman Kodak', 'International Paper'],
    in: [['AIG', 'AIG'], ['Pfizer', 'PFE'], ['Verizon', 'VZ']],
  },
  { date: '2008-02-19', out: ['Altria（MO）', 'Honeywell'], in: [['Bank of America', 'BAC'], ['Chevron', 'CVX']] },
  { date: '2008-09-22', out: ['AIG'], in: [['Kraft Foods（KFT）', 'MDLZ']] },
  { date: '2009-06-08', out: ['General Motors（旧）', 'Citigroup'], in: [['Cisco Systems', 'CSCO'], ['Travelers Companies', 'TRV']] },
  { date: '2012-09-24', out: ['Kraft Foods（KFT）'], in: [['UnitedHealth Group', 'UNH']] },
  {
    date: '2013-09-23',
    out: ['Alcoa（AA）', 'Bank of America', 'Hewlett-Packard'],
    in: [['Goldman Sachs', 'GS'], ['Nike', 'NKE'], ['Visa', 'V']],
  },
  { date: '2015-03-19', out: ['AT&T（原 SBC）'], in: [['Apple', 'AAPL']] },
];

/** 某天（含）生效的成分股名单 */
export function dowMembers(date: string): Member[] {
  let base: Member[];
  let from: string;
  if (date >= '2007-01-01') {
    base = DOW_2008;
    from = '2007-01-01';
  } else if (date >= '1998-01-01') {
    base = DOW_1999;
    from = '1998-01-01';
  } else {
    base = DOW_1996;
    from = '1996-01-01';
  }
  let cur = [...base];
  for (const ch of DOW_CHANGES) {
    if (ch.date <= from || ch.date > date) continue;
    cur = cur.filter((m) => !ch.out.includes(m[0])).concat(ch.in);
  }
  return cur;
}

/**
 * "科综"候选的上市地判断。WIKI 没有交易所字段，用当年的代码惯例：Nasdaq 代码 4–5 个字母，纽交所、美交所 1–3 个字母。
 * WIKI 用的是公司最新代码，改名、转板的公司会判错；下面是已知的大公司例外（按 1999–2008 年的实际上市地）。
 * 这是近似，没有逐家核对上市地。
 */
export const EXCHANGE_OVERRIDE: Record<string, 'nasdaq' | 'nyse'> = {
  ARNC: 'nyse', // Alcoa，当年代码 AA
  MDLZ: 'nyse', // Kraft，当年代码 KFT
  ANTM: 'nyse', // WellPoint，WLP
  TGNA: 'nyse', // Gannett，GCI
  MHFI: 'nyse', // McGraw-Hill，MHP
  EA: 'nasdaq', // Electronic Arts，当年代码 ERTS
  ELX: 'nasdaq', // Emulex，当年代码 EMLX
};

export function isNasdaq(ticker: string): boolean {
  const o = EXCHANGE_OVERRIDE[ticker];
  if (o !== undefined) return o === 'nasdaq';
  return /^[A-Z]{4,5}$/.test(ticker);
}

/** 时间线里能推出的真实指数年内最大回撤（下限），只用于对照。 */
export const REAL_DD: Record<number, { dow?: string; nasdaq?: string }> = {
  1999: { dow: '时间线没有给出年内高点，无法推算' },
  2000: { dow: '−16.4%（1-14 高点 11,722.98 → 3-7 全年最低收盘 9,796）', nasdaq: '至少 −52%（3-10 高点 5,048.62 → 12 月中跌破 2,400）' },
  2008: { dow: '至少 −41.9%（5-19 前后仍在 13,000 上方 → 11-20 全年最低 7,552.29）' },
};

/** 时间线里的真实指数关键日（日涨跌，百分比），只用于对照。 */
export const KEY_DAYS: { idx: 'dow' | 'nasdaq'; date: string; pct: number; src: string }[] = [
  { idx: 'dow', date: '1999-01-13', pct: -1.32, src: 'T99 L18：−125.12 点收 9,349.56' },
  { idx: 'dow', date: '1999-01-14', pct: -2.45, src: 'T99 L19' },
  { idx: 'dow', date: '1999-03-29', pct: 1.88, src: 'T99 L44：+184.54 点收 10,006.78' },
  { idx: 'dow', date: '1999-05-03', pct: 2.09, src: 'T99 L64：+225.65 点收 11,014.69' },
  { idx: 'dow', date: '1999-09-23', pct: -1.95, src: 'T99 L116：−205.48 点收 10,318.59' },
  { idx: 'dow', date: '1999-10-15', pct: -2.6, src: 'T99 L129' },
  { idx: 'dow', date: '2000-01-04', pct: -3.2, src: 'T00 L16' },
  { idx: 'dow', date: '2000-03-16', pct: 4.9, src: 'T00 L45' },
  { idx: 'dow', date: '2000-04-14', pct: -5.66, src: 'T00 L60' },
  { idx: 'dow', date: '2000-11-08', pct: -0.4, src: 'T00 L138' },
  { idx: 'dow', date: '2008-01-22', pct: -1.06, src: 'T08 L20' },
  { idx: 'dow', date: '2008-09-15', pct: -4.42, src: 'T08 L111' },
  { idx: 'dow', date: '2008-09-17', pct: -4.06, src: 'T08 L113' },
  { idx: 'dow', date: '2008-09-29', pct: -6.98, src: 'T08 L119' },
  { idx: 'dow', date: '2008-09-30', pct: 4.68, src: 'T08 L120：+485.21 点收 10,850.66' },
  { idx: 'dow', date: '2008-10-09', pct: -7.3, src: 'T08 L132' },
  { idx: 'dow', date: '2008-10-10', pct: -1.5, src: 'T08 L133' },
  { idx: 'dow', date: '2008-10-13', pct: 11.1, src: 'T08 L134' },
  { idx: 'dow', date: '2008-10-15', pct: -7.87, src: 'T08 L136' },
  { idx: 'dow', date: '2008-10-24', pct: -3.6, src: 'T08 L139' },
  { idx: 'dow', date: '2008-10-28', pct: 10.9, src: 'T08 L141' },
  { idx: 'dow', date: '2008-11-20', pct: -5.56, src: 'T08 L152' },
  { idx: 'dow', date: '2008-12-01', pct: -7.7, src: 'T08 L162' },
  { idx: 'nasdaq', date: '1999-04-19', pct: -5.6, src: 'T99 L56' },
  { idx: 'nasdaq', date: '2000-01-04', pct: -5.6, src: 'T00 L16' },
  { idx: 'nasdaq', date: '2000-03-13', pct: -2.6, src: 'T00 L43' },
  { idx: 'nasdaq', date: '2000-03-16', pct: 2.9, src: 'T00 L45' },
  { idx: 'nasdaq', date: '2000-04-03', pct: -7.6, src: 'T00 L54' },
  { idx: 'nasdaq', date: '2000-04-14', pct: -9.7, src: 'T00 L60' },
  { idx: 'nasdaq', date: '2000-05-23', pct: -6.0, src: 'T00 L68（约）' },
  { idx: 'nasdaq', date: '2000-05-30', pct: 7.94, src: 'T00 L70' },
  { idx: 'nasdaq', date: '2000-10-19', pct: 7.8, src: 'T00 L128' },
  { idx: 'nasdaq', date: '2000-10-25', pct: -4.5, src: 'T00 L130' },
  { idx: 'nasdaq', date: '2000-11-08', pct: -5.4, src: 'T00 L138' },
  { idx: 'nasdaq', date: '2000-11-20', pct: -5.0, src: 'T00 L140' },
  { idx: 'nasdaq', date: '2000-12-05', pct: 10.5, src: 'T00 L147' },
  { idx: 'nasdaq', date: '2008-09-29', pct: -9.1, src: 'T08 L119' },
];
