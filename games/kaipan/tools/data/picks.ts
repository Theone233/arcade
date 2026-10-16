/**
 * 每年人工挑的"故事股"：时间线明星股之外、当年有戏的公司（事件出处见 docs/history/timeline-<年>.md，
 * 没在时间线里的标"常识"，由编剧决定用不用）。全部暂用 tmp_ 化名，以后由编剧起名。
 * 只列数据里实际存在的代码（2026-10-11 实查）。
 */
export interface Pick { ticker: string; why: string }

export const PICKS: Record<number, Pick[]> = {
  1999: [
    { ticker: 'XOM', why: '11-30 埃克森与美孚合并完成（时间线 11 月）' },
    { ticker: 'IBM', why: '老牌蓝筹，时间线多次出现' },
    { ticker: 'HD', why: '11-01 与微软、英特尔同日进道指（时间线 11 月）' },
    { ticker: 'C', why: '花旗集团合并后第一年（时间线）' },
    { ticker: 'T', why: 'WIKI 的 T 在 1999 年是 SBC（时间线里 SBC 收购 Ameritech）' },
    { ticker: 'MO', why: '烟草诉讼，旧经济股全年大跌（常识）' },
    { ticker: 'MLNK', why: 'CMGI，1999 年网络孵化器明星（2000 年时间线明星股）' },
    { ticker: 'SFE', why: 'Safeguard Scientifics，网络孵化器（常识）' },
    { ticker: 'BCOR', why: 'InfoSpace，泡沫期明星网络股（常识）' },
    { ticker: 'QLGC', why: '存储网络芯片，1999 年涨幅榜前列（常识）' },
    { ticker: 'VRSN', why: '域名与证书，泡沫期明星（常识）' },
    { ticker: 'BRCM', why: '通信芯片，泡沫期明星（常识）' },
    { ticker: 'JDSU', why: '光通信龙头，2000 年明星股的前一年' },
    { ticker: 'EMC', why: '存储龙头' },
    { ticker: 'ORCL', why: '数据库软件，年底大涨（2000 年明星股的前一年）' },
    { ticker: 'AAPL', why: '乔布斯回归后的复苏年（常识）' },
  ],
  2000: [
    { ticker: 'PG', why: '3-07 宝洁预警，单日约 -31%（常识）' },
    { ticker: 'F', why: '8 月费尔斯通轮胎召回（时间线）' },
    { ticker: 'MO', why: '旧经济轮动：科技股崩时烟草股大涨（常识）' },
    { ticker: 'C', why: '老牌大银行，对照组' },
    { ticker: 'T', why: 'WIKI 的 T 在 2000 年是 SBC（旧 AT&T 不在数据里）' },
    { ticker: 'VRSN', why: '泡沫期明星，年内暴跌（常识）' },
    { ticker: 'BRCM', why: '通信芯片明星（常识）' },
    { ticker: 'QLGC', why: '存储网络芯片明星（常识）' },
    { ticker: 'CIEN', why: '光网络设备明星（常识）' },
    { ticker: 'AMCC', why: '光通信芯片明星（常识）' },
    { ticker: 'SFE', why: 'Safeguard Scientifics，孵化器崩盘（常识）' },
    { ticker: 'BCOR', why: 'InfoSpace，3 月见顶后崩盘（常识）' },
    { ticker: 'ICGE', why: 'Internet Capital Group，孵化器崩盘（1999 年明星股）' },
    { ticker: 'NTAP', why: '存储明星（常识）' },
    { ticker: 'XOM', why: '油价上涨年的石油龙头' },
  ],
  2008: [
    { ticker: 'PNC', why: '10-24 收购国城银行（时间线）' },
    { ticker: 'AXP', why: '11 月转为银行控股公司（时间线）' },
    { ticker: 'MBI', why: '债券保险商，全年连遭降级（时间线 ABK 同类）' },
    { ticker: 'DAL', why: '与西北航空合并（时间线）' },
    { ticker: 'GNW', why: '保险股崩盘（常识）' },
    { ticker: 'HIG', why: '保险股崩盘（常识）' },
    { ticker: 'LVS', why: '赌场股全年跌九成（常识）' },
    { ticker: 'FSLR', why: '太阳能泡沫顶点后暴跌（常识）' },
    { ticker: 'CROX', why: '洞洞鞋股价崩塌（常识）' },
    { ticker: 'X', why: '钢铁股随大宗商品见顶暴跌（常识）' },
    { ticker: 'GGP', why: '商业地产，年底濒临破产（常识）' },
    { ticker: 'SLM', why: '学生贷款，2007 年底私有化收购告吹后继续下跌（常识）' },
    { ticker: 'MCO', why: '评级机构，危机的"背锅侠"（常识）' },
    { ticker: 'ETFC', why: '网上券商，2007 年底差点被次贷拖垮（1999 年明星股）' },
    { ticker: 'HOV', why: '房屋建筑商，次贷源头（常识）' },
    { ticker: 'CHK', why: '天然气，油气价格过山车（常识）' },
  ],
};
