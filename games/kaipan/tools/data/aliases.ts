/**
 * 化名表（抄自 docs/story-0.4.md 第 1 节）与 WIKI 数据代码的对应，经 2026-10-11 对数据实查。
 *
 * - real：当年真实代码；data：WIKI 里对应同一家公司的代码（null = 数据里没有）；
 * - years：哪几年的时间线明星股清单里有它（这些年份必进股票池）；
 * - dataYears：data 代码只在这些年份对应这家公司（例如 TWX 在 1999–2000 年的价格其实是 AOL 的）；不填 = 全部年份；
 * - note：实查结论，进 docs/history/data-check.md。
 */
export interface Alias {
  id: string;
  name: string;
  code: string;
  real: string;
  data: string | null;
  years: number[];
  dataYears?: number[];
  note: string;
}

const Y99 = [1999];
const Y00 = [2000];
const Y08 = [2008];

export const ALIASES: Alias[] = [
  // 1.1 1999
  { id: 's_qcom', name: '糕通芯片', code: 'QKOM', real: 'QCOM', data: 'QCOM', years: [1999, 2000], note: '' },
  { id: 's_amzn', name: '雨林书城', code: 'AMZZ', real: 'AMZN', data: 'AMZN', years: [1999, 2000, 2008], note: '' },
  { id: 's_yhoo', name: '呀呼门户', code: 'YAHU', real: 'YHOO', data: 'YHOO', years: [1999, 2000, 2008], note: 'WIKI 沿用 YHOO，数据到 2017-06-16（之后改名 Altaba 的部分不在数据里）' },
  { id: 's_aol', name: '拨号在线', code: 'DIAL', real: 'AOL', data: 'TWX', years: [1999, 2000], dataYears: [1999, 2000], note: 'WIKI 的 TWX 从 1992-03-19（AOL 上市日）开始，1999–2000 年的价格就是 AOL；数据里的 AOL 代码是 2009 年分拆的新公司' },
  { id: 's_msft', name: '微硬软件', code: 'MSFX', real: 'MSFT', data: 'MSFT', years: [1999, 2000, 2008], note: '' },
  { id: 's_intc', name: '因特儿芯片', code: 'ITCX', real: 'INTC', data: 'INTC', years: [1999, 2000], note: '' },
  { id: 's_csco', name: '思铲网络', code: 'CSCX', real: 'CSCO', data: 'CSCO', years: [1999, 2000], note: '' },
  { id: 's_ebay', name: '易拍网', code: 'EBAI', real: 'EBAY', data: 'EBAY', years: [1999, 2000], note: '' },
  { id: 's_pcln', name: '价线旅行', code: 'PRCL', real: 'PCLN', data: 'PCLN', years: [1999, 2000], note: 'WIKI 用 PCLN 到 2018-02-26，之后是 BKNG；数据从 1999-03-31 开始，缺上市首日 1999-03-30' },
  { id: 's_gs', name: '高胜投行', code: 'GSS', real: 'GS', data: 'GS', years: [1999, 2008], note: '' },
  { id: 's_rht', name: '礼帽软件', code: 'RDHT', real: 'RHT', data: 'RHT', years: Y99, note: '' },
  { id: 's_lnux', name: '企鹅服务器', code: 'VALX', real: 'LNUX', data: null, years: Y99, note: '数据里没有（LNUX/GKNT 都不在）' },
  { id: 's_etys', name: '网上玩具屋', code: 'ETOY', real: 'ETYS', data: null, years: [1999, 2000], note: '数据里没有' },
  { id: 's_mktw', name: '盯盘网', code: 'MKTV', real: 'MKTW', data: null, years: Y99, note: '数据里没有' },
  { id: 's_tscm', name: '大街点评', code: 'TSTR', real: 'TSCM', data: null, years: Y99, note: '数据里没有（TSCM、TST 都不在）' },
  { id: 's_ups', name: '大包裹快运', code: 'UPX', real: 'UPS', data: 'UPS', years: Y99, note: '' },
  { id: 's_jnpr', name: '杜松网络', code: 'JNPX', real: 'JNPR', data: 'JNPR', years: [1999, 2000], note: '' },
  { id: 's_akam', name: '聪明加速', code: 'AKMI', real: 'AKAM', data: 'AKAM', years: Y99, note: '' },
  { id: 's_scmr', name: '梧桐光网', code: 'SYCM', real: 'SCMR', data: null, years: Y99, note: '数据里没有' },
  { id: 's_fdry', name: '铸造厂网络', code: 'FNDY', real: 'FDRY', data: null, years: Y99, note: '数据里没有' },
  { id: 's_fmkt', name: '自由市场 B2B', code: 'FMKX', real: 'FMKT', data: null, years: Y99, note: '数据里没有' },
  { id: 's_wbvn', name: '网上菜车', code: 'WBVX', real: 'WBVN', data: null, years: [1999, 2000], note: '数据里没有' },
  { id: 's_icge', name: '网络孵蛋集团', code: 'ICGX', real: 'ICGE', data: 'ICGE', years: Y99, note: '故事稿标"缺"，实际在：ICGE 1999-08-05 至 2014-09-02' },
  { id: 's_wwfe', name: '摔角大联盟', code: 'WRSL', real: 'WWFE', data: 'WWE', years: Y99, note: 'WIKI 代码 WWE（1999-10-19 上市起）' },
  { id: 's_mso', name: '女王家政', code: 'HOMQ', real: 'MSO', data: 'MSO', years: Y99, note: '故事稿标"缺"，实际在：MSO 1999-10-19 至 2015-12-04' },
  { id: 's_cpq', name: '康宝电脑', code: 'CPQX', real: 'CPQ', data: null, years: Y99, note: '数据里没有' },
  { id: 's_hwp', name: '汇普打印', code: 'HWPX', real: 'HWP', data: 'HPQ', years: Y99, note: 'WIKI 代码 HPQ（历史从 1962 年起，1999 年价格即 HWP）' },
  { id: 's_a', name: '安捷测量', code: 'AGLT', real: 'A', data: 'A', years: Y99, note: '' },
  { id: 's_lu', name: '亮讯通信', code: 'LUX', real: 'LU', data: null, years: [1999, 2000], note: '数据里没有' },
  { id: 's_wcom', name: '世界通电信', code: 'WCMX', real: 'WCOM', data: null, years: Y99, note: '数据里没有' },
  { id: 's_xrx', name: '稀乐复印', code: 'XRXX', real: 'XRX', data: 'XRX', years: Y99, note: '' },
  { id: 's_wmi', name: '垃圾管家', code: 'WSTM', real: 'WMI', data: 'WM', years: Y99, note: 'WIKI 代码 WM（废物管理公司 1998 年合并后的历史，1999 年价格即 WMI）；数据里的 WM 不是华盛顿互惠银行' },
  { id: 's_rad', name: '正好药房', code: 'RTAD', real: 'RAD', data: 'RAD', years: Y99, note: '' },
  { id: 's_ko', name: '快乐水', code: 'KOLA', real: 'KO', data: 'KO', years: Y99, note: '' },
  { id: 's_pfe', name: '辉煌制药', code: 'PFZ', real: 'PFE', data: 'PFE', years: [1999, 2000], note: '' },
  { id: 's_mot', name: '摩拖罗拉', code: 'MOTX', real: 'MOT', data: 'MSI', years: Y99, note: 'WIKI 代码 MSI（摩托罗拉的完整历史，1999 年价格即 MOT）' },
  { id: 's_etfc', name: '易交易', code: 'ETRD', real: 'ETFC', data: 'ETFC', years: Y99, note: '1999 年真实代码是 EGRP，WIKI 统一用 ETFC' },
  { id: 's_sch', name: '加薪理财', code: 'SCHX', real: 'SCH', data: 'SCHW', years: Y99, note: 'WIKI 代码 SCHW' },
  { id: 's_mu', name: '微米存储', code: 'MCRN', real: 'MU', data: 'MU', years: Y99, note: '' },
  { id: 's_iridium', name: '铱星电话', code: '—', real: 'IRIDF', data: null, years: Y99, note: '数据里没有（本来就只作新闻用）' },
  // 1.2 2000
  { id: 's_aapl', name: '果子电脑', code: 'APLX', real: 'AAPL', data: 'AAPL', years: [2000, 2008], note: '' },
  { id: 's_orcl', name: '神谕数据库', code: 'ORCX', real: 'ORCL', data: 'ORCL', years: Y00, note: '' },
  { id: 's_twx', name: '时代兄弟传媒', code: 'TWRX', real: 'TWX', data: null, years: Y00, note: '缺：WIKI 的 TWX 在 1999–2000 年是 AOL 的价格，旧时代华纳本身不在数据里' },
  { id: 's_nt', name: '北极电讯', code: 'NRTL', real: 'NT', data: null, years: Y00, note: '数据里没有' },
  { id: 's_jdsu', name: '光通一相', code: 'JDSX', real: 'JDSU', data: 'JDSU', years: Y00, note: '故事稿标"缺"，实际在：JDSU 1993-11-17 至 2015-08-03' },
  { id: 's_sunw', name: '日头服务器', code: 'SUNX', real: 'SUNW', data: null, years: Y00, note: '数据里没有（SUNW、JAVA 都不在）' },
  { id: 's_emc', name: '易存储', code: 'EMCX', real: 'EMC', data: 'EMC', years: Y00, note: '故事稿标"缺"，实际在：EMC 1988-12-16 至 2016-09-06' },
  { id: 's_mstr', name: '小策略软件', code: 'MSTX', real: 'MSTR', data: 'MSTR', years: Y00, note: '' },
  { id: 's_ipet', name: '宠物点康', code: 'PETZ', real: 'IPET', data: null, years: Y00, note: '数据里没有' },
  { id: 's_palm', name: '掌心电脑', code: 'PALX', real: 'PALM', data: null, years: Y00, note: '数据里没有' },
  { id: 's_coms', name: '三通网络', code: 'TCMX', real: 'COMS', data: null, years: Y00, note: '数据里没有' },
  { id: 's_tmta', name: '变形芯', code: 'TMTX', real: 'TMTA', data: null, years: Y00, note: '数据里没有' },
  { id: 's_ene', name: '恩龙能源', code: 'ENRX', real: 'ENE', data: null, years: Y00, note: '数据里没有' },
  { id: 's_elx', name: '仿真网卡', code: 'EMUX', real: 'ELX', data: 'ELX', years: Y00, note: '故事稿标"缺"，实际在：ELX 至 2015-05-05（2000 年真实代码是 Nasdaq 的 EMLX）' },
  { id: 's_sina', name: '欣浪网', code: 'SINX', real: 'SINA', data: null, years: Y00, note: '故事稿标"在"，实际缺（WIKI 基本不含外国公司 ADR/外国发行人）' },
  { id: 's_ntes', name: '网逸', code: 'NTEZ', real: 'NTES', data: null, years: Y00, note: '故事稿标"在"，实际缺' },
  { id: 's_sohu', name: '搜虎', code: 'SOHX', real: 'SOHU', data: null, years: Y00, note: '故事稿标"在"，实际缺' },
  { id: 's_ptr', name: '大油田（中国）', code: 'PTRX', real: 'PTR', data: null, years: Y00, note: '故事稿标"在"，实际缺' },
  { id: 's_chu', name: '联联通信', code: 'CHUX', real: 'CHU', data: null, years: Y00, note: '故事稿标"在"，实际缺' },
  { id: 's_krem', name: '酥脆甜甜圈', code: 'KRMX', real: 'KREM', data: 'KKD', years: Y00, note: '故事稿标"缺"，实际在：WIKI 代码 KKD，2000-04-05 上市起' },
  { id: 's_cmgi', name: '网投孵化', code: 'CMGX', real: 'CMGI', data: 'MLNK', years: Y00, note: '故事稿标"缺"，实际在：WIKI 代码 MLNK（ModusLink，CMGI 改名后），历史从 1994 年起' },
  { id: 's_dell', name: '代尔直销', code: 'DELX', real: 'DELL', data: 'DELL', years: Y00, note: '故事稿标"缺"，实际在：DELL 1988-08-17 至 2015-03-04（2013 年私有化之后的行与本次年份无关，未核）' },
  { id: 's_gtw', name: '牛纹电脑', code: 'GTWX', real: 'GTW', data: null, years: Y00, note: '数据里没有' },
  { id: 's_cra', name: '赛基因', code: 'CLRA', real: 'CRA', data: null, years: Y00, note: '数据里没有' },
  { id: 's_jpm', name: '摩登大通银行', code: 'JPMX', real: 'JPM', data: 'JPM', years: [2000, 2008], note: '1999–2000 年 WIKI 的 JPM 是大通曼哈顿（CMB）的价格（2000-12-31 合并后才改名）；J.P. Morgan & Co. 本身不在数据里' },
  { id: 's_t', name: '老电话公司', code: 'ATTX', real: 'T', data: null, years: Y00, note: '缺：WIKI 的 T 在 2005 年前是 SBC 的价格，旧 AT&T 不在数据里' },
  // 1.3 2008
  { id: 's_bsc', name: '熊斯登投行', code: 'BRST', real: 'BSC', data: null, years: Y08, note: '数据里没有' },
  { id: 's_leh', name: '雷满兄弟', code: 'LEHX', real: 'LEH', data: null, years: Y08, note: '数据里没有' },
  { id: 's_mer', name: '牛林证券', code: 'MERX', real: 'MER', data: null, years: Y08, note: '数据里没有' },
  { id: 's_aig', name: '爱保集团', code: 'AIGX', real: 'AIG', data: 'AIG', years: Y08, note: '' },
  { id: 's_fnm', name: '房地大妈', code: 'FNMX', real: 'FNM', data: null, years: Y08, note: '数据里没有' },
  { id: 's_fre', name: '房地大叔', code: 'FREX', real: 'FRE', data: null, years: Y08, note: '数据里没有' },
  { id: 's_wm', name: '华互银行', code: 'WMUX', real: 'WM', data: null, years: Y08, note: '数据里没有；数据里的 WM 是废物管理公司' },
  { id: 's_wb', name: '瓦乔银行', code: 'WCHV', real: 'WB', data: null, years: Y08, note: '数据里没有' },
  { id: 's_cfc', name: '全国房贷', code: 'CFCX', real: 'CFC', data: null, years: Y08, note: '数据里没有' },
  { id: 's_imb', name: '印第储蓄', code: 'IMBX', real: 'IMB', data: null, years: Y08, note: '数据里没有' },
  { id: 's_c', name: '花期银行', code: 'CX', real: 'C', data: 'C', years: Y08, note: '' },
  { id: 's_bac', name: '美利坚银行', code: 'BACX', real: 'BAC', data: 'BAC', years: Y08, note: '' },
  { id: 's_wfc', name: '井水银行', code: 'WFCX', real: 'WFC', data: 'WFC', years: Y08, note: '' },
  { id: 's_ms', name: '摩登史丹利', code: 'MSXX', real: 'MS', data: 'MS', years: Y08, note: '' },
  { id: 's_abk', name: '安巴克债保', code: 'ABKX', real: 'ABK', data: null, years: Y08, note: '数据里没有（AMBC 是 2013 年重组后的新股）' },
  { id: 's_ncc', name: '国城银行', code: 'NCCX', real: 'NCC', data: null, years: Y08, note: '数据里没有' },
  { id: 's_gm', name: '通通汽车', code: 'GMX', real: 'GM', data: null, years: Y08, note: '缺：WIKI 的 GM 从 2010-11-18 开始，是新通用' },
  { id: 's_f', name: '福德汽车', code: 'FRDX', real: 'F', data: 'F', years: Y08, note: '' },
  { id: 's_goog', name: '谷哥搜索', code: 'GOGX', real: 'GOOG', data: 'GOOGL', years: Y08, note: 'WIKI 代码 GOOGL（A 股，2004-08-19 起；2008 年真实代码是 GOOG）；WIKI 的 GOOG 是 2014 年才有的 C 股' },
  { id: 's_nflx', name: '网片邮寄', code: 'NFLZ', real: 'NFLX', data: 'NFLX', years: Y08, note: '' },
  { id: 's_ge', name: '万用电气', code: 'GEX', real: 'GE', data: 'GE', years: Y08, note: '' },
  { id: 's_brk', name: '奥马哈控股', code: 'BRKX', real: 'BRK', data: 'BRK_B', years: Y08, note: 'WIKI 有 BRK_A 和 BRK_B，游戏用 B 股（2008 年约 3,000–4,700 美元/股；A 股超过 10 万美元/股）' },
  { id: 's_xom', name: '老油库', code: 'XOMX', real: 'XOM', data: 'XOM', years: Y08, note: '' },
  { id: 's_v', name: '微刷卡', code: 'VSX', real: 'V', data: 'V', years: Y08, note: 'WIKI 从 2008-03-19 上市日开始' },
  { id: 's_sbux', name: '星爸爸咖啡', code: 'SBUZ', real: 'SBUX', data: 'SBUX', years: Y08, note: '' },
  { id: 's_bud', name: '白威啤酒', code: 'BUDX', real: 'BUD', data: null, years: Y08, note: '数据里没有' },
  { id: 's_wwy', name: '口香糖老铺', code: 'WRGY', real: 'WWY', data: null, years: Y08, note: '数据里没有' },
  { id: 's_cc', name: '电器城', code: 'CCX', real: 'CC', data: null, years: Y08, note: '数据里没有' },
  { id: 's_fdo', name: '一家一元店', code: 'FDOX', real: 'FDO', data: 'FDO', years: Y08, note: '故事稿标"缺"，实际在：FDO 至 2015-07-06' },
  { id: 's_dltr', name: '一元树', code: 'DLTX', real: 'DLTR', data: 'DLTR', years: Y08, note: '' },
  { id: 's_wmt', name: '天天低价超市', code: 'WMTX', real: 'WMT', data: 'WMT', years: Y08, note: '' },
];
