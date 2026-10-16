import type { Rules } from '../hooks.ts';
import type { Regime } from '../segment.ts';
import type { GoalKind } from '../types.ts';

/**
 * 0.5 月度主题（"本月看点"）：每个月一个，开局按种子、行情、难度抽好（src/core/tempo.ts 的 planTempo），一局 12 个月不重复。
 * 第 4、8 个月是中场 boss（boss: true 的池子）。主题只改规则和信息（推荐、消息、手续费、涨跌停宽窄、月供、押跌许可），不改走势。
 * goal.base 是第 1 级的目标数值，难度每高一级按 BALANCE.tempo.goalStep 加码（keep 是允许的回撤，越高越小）。
 */
export interface MonthThemeCtx {
  month: number;
  difficulty: number;
  regime: Regime | null;
  /** 这个月大盘真实累计涨跌（放大后，pp，逐日相加）；合成行情为 0 */
  mret: number;
  /** 这个月大盘最大单日跌幅（放大后，pp，≤ 0） */
  mmin: number;
  /** 开了仓位 / 押跌 / 抵押（0.4 C） */
  ext: boolean;
}

export interface MonthThemeDef {
  id: string;
  name: string;
  boss?: boolean;
  /** 开场白（一句） */
  intro: string;
  /** 本月规则 / 信息上的修改（大白话，一句；没有就写"规则照常"） */
  rule: string;
  /** 群友吐槽（说话的人不在群里时换成群主） */
  roast: { friendId: string; text: string };
  goal: { kind: GoalKind; base: number; text: string };
  /** 奖励：现金按当月月供 × BALANCE.tempo.cash（boss 用 bossCash）× cashMult；碎片；boss 另给一个道具 */
  reward?: { cashMult?: number; shards?: number; item?: boolean };
  /** 需要 0.4 C 的新机制（押跌、抵押） */
  needsExt?: boolean;
  weight(c: MonthThemeCtx): number;
  rules?(r: Rules): void;
  /** 月初一次性给钱（按当月常规月供的比例），年终奖 */
  startCash?: number;
}

const early = (c: MonthThemeCtx, w: number): number => (c.month <= 1 ? w * 0.2 : w);

export const MONTH_THEMES: readonly MonthThemeDef[] = [
  {
    id: 'meme_month',
    name: '过山车月',
    intro: '这个月过山车股特别活跃，群里天天有人喊"上车"。',
    rule: '群友推荐里过山车股多三倍',
    roast: { friendId: 'xiaoli', text: '过山车坐不坐？我安全带都系好了！' },
    goal: { kind: 'limitUp', base: 1, text: '抓到 {n} 次涨停（持仓当天涨停）' },
    reward: { shards: 1 },
    weight: (c) => (c.regime === 'bubble' ? 2 : 1),
    rules(r) {
      r.recRoleBoost.meme = (r.recRoleBoost.meme ?? 1) * 3;
    },
  },
  {
    id: 'qunzhu_month',
    name: '收割机带单月',
    intro: '韭菜收割机开了"VIP 带单群"，这个月天天推票。',
    rule: '韭菜收割机说话和推荐的次数翻三倍；信不信由你',
    roast: { friendId: 'laowang', text: '收割机又开始带单了，各位悠着点。' },
    goal: { kind: 'gain', base: 3, text: '本月账户涨 {n}%' },
    weight: (c) => early(c, 1),
    rules(r) {
      r.friendWeight.qunzhu = (r.friendWeight.qunzhu ?? 1) * 3;
    },
  },
  {
    id: 'payday',
    name: '年终奖到账',
    intro: '公司发了一笔奖金，本金多了，可房东也听说了。',
    rule: '月初多一笔奖金（每月要还的钱的一半），但这个月要还的钱多 20%',
    roast: { friendId: 'zhangjie', text: '奖金到手先别全梭哈，孩子还要报班呢。' },
    goal: { kind: 'gain', base: 4, text: '本月账户涨 {n}%' },
    startCash: 0.5,
    weight: () => 1,
    rules(r) {
      r.billMult *= 1.2;
    },
  },
  {
    id: 'bank_month',
    name: '银行搞活动',
    intro: '银行客户经理打来电话："这个月抵押贷款利息打五折！"',
    rule: '本月借款利息减半',
    roast: { friendId: 'laowang', text: '利息再低也是要还的，别被客户经理忽悠了。' },
    goal: { kind: 'gain', base: 3, text: '本月账户涨 {n}%' },
    needsExt: true,
    weight: (c) => (c.month >= 2 ? 1 : 0),
    rules(r) {
      r.interestMult *= 0.5;
    },
  },
  {
    id: 'bear_month',
    name: '空头来袭',
    intro: '空军老周在群里贴出一张"末日走势图"，说这个月要跌。',
    rule: '本月白送押跌许可（可以押股票跌）',
    roast: { friendId: 'kongjun', text: '我早说了要跌，这次你们总该信了吧？' },
    goal: { kind: 'shortWin', base: 2, text: '押跌赚钱 {n} 次（押跌那格当天赚）' },
    needsExt: true,
    weight: (c) => early(c, c.mret < -1 ? 3 : c.mret < 1 ? 1 : 0.3),
    rules(r) {
      r.canShort = true;
    },
  },
  {
    id: 'exam_month',
    name: '考试月',
    intro: '孩子期末考试，你答应陪读，没空盯过山车股了。',
    rule: '本月只能买老实股（推荐里也只有老实股）',
    roast: { friendId: 'zhangjie', text: '老实股好，跟我们家孩子一样，不惹事。' },
    goal: { kind: 'keep', base: 4, text: '本月账户最多回撤 {n}%（任何一天收盘都不低于月初的线）' },
    weight: (c) => (c.month <= 2 ? 0 : 0.8),
    rules(r) {
      r.onlyRoles = ['bluechip'];
    },
  },
  {
    id: 'inlaw_month',
    name: '丈母娘查岗',
    intro: '丈母娘要来家里住一个月，还要看你的账户。',
    rule: '规则照常，但亏多了要挨骂',
    roast: { friendId: 'zhangjie', text: '我妈也查过我的账，最后我把 App 藏到计算器里了。' },
    goal: { kind: 'keep', base: 5, text: '本月账户最多回撤 {n}%（任何一天收盘都不低于月初的线）' },
    weight: (c) => early(c, 1),
  },
  {
    id: 'rumor_month',
    name: '消息满天飞',
    intro: '群里突然热闹起来，每天的小道消息多了一倍。',
    rule: '每天多 2 条群聊消息',
    roast: { friendId: 'laozhao', text: '消息多不是好事，懂的都懂。' },
    goal: { kind: 'quickWin', base: 2, text: '当天买、当天收盘就赚 {n} 次' },
    weight: () => 1,
    rules(r) {
      r.extraMessages += 2;
    },
  },
  {
    id: 'insider_month',
    name: '提前看一天',
    intro: '你表哥在券商实习，说每天能"提前透露一点"。',
    rule: '每天多一条重磅情报（很准，但不是百分百）',
    roast: { friendId: 'laozhao', text: '表哥靠谱吗？上次他说的我亏了一个月。' },
    goal: { kind: 'gain', base: 5, text: '本月账户涨 {n}%' },
    weight: () => 1,
    rules(r) {
      r.headlines += 1;
    },
  },
  {
    id: 'fee_month',
    name: '券商送福利',
    intro: '券商搞周年庆：手续费全免，每天还多送一次买入。',
    rule: '本月买入不收手续费，每天能多买一只',
    roast: { friendId: 'xiaoli', text: '免费的手续费，不交易就是亏！' },
    goal: { kind: 'themes', base: 3, text: '某天收盘同时拿着 {n} 个不同风口的股票' },
    weight: () => 1,
    rules(r) {
      r.buyFee = 0;
      r.buysPerDay += 1;
    },
  },
  {
    id: 'wide_month',
    name: '涨跌停放宽',
    intro: '交易所试点新规则：这个月涨跌停放宽一倍。',
    rule: '本月所有股票涨跌停宽一倍（赚得多，亏得也多）',
    roast: { friendId: 'laowang', text: '涨停宽了，跌停也宽了，别光看一头。' },
    goal: { kind: 'bigDay', base: 12, text: '持仓有一天涨 {n}% 以上' },
    weight: (c) => early(c, c.regime === 'crash' ? 0.5 : 1),
    rules(r) {
      r.limitMult *= 2;
    },
  },
  {
    id: 'streak_month',
    name: '连胜挑战',
    intro: '群里搞"连胜打卡"，连续赚钱的人有红包。',
    rule: '本月连击小奖励翻倍',
    roast: { friendId: 'dav', text: '打卡第一天，我先来：今天必涨！' },
    goal: { kind: 'streak', base: 3, text: '连续 {n} 天收盘赚钱' },
    weight: (c) => (c.mret > 0 ? 1.5 : 0.8),
    rules(r) {
      r.comboMult *= 2;
    },
  },
  {
    id: 'spread_month',
    name: '鸡蛋别放一个篮子',
    intro: '理财课老师布置作业：分散投资。',
    rule: '每天多一条推荐',
    roast: { friendId: 'laowang', text: '分散是对的，但别分散到全是垃圾股。' },
    goal: { kind: 'themes', base: 3, text: '某天收盘同时拿着 {n} 个不同风口的股票' },
    weight: () => 1,
    rules(r) {
      r.extraRecs += 1;
    },
  },
  {
    id: 'fomo_month',
    name: '散户狂欢',
    intro: '楼下大爷都在聊股票，营业部门口排起了长队。',
    rule: '每天多两条推荐',
    roast: { friendId: 'xiaoli', text: '全民炒股！这次真的不一样！' },
    goal: { kind: 'gain', base: 5, text: '本月账户涨 {n}%' },
    weight: (c) => (c.mret > 1 ? 2 : 0.7),
    rules(r) {
      r.extraRecs += 2;
    },
  },
  {
    id: 'beat_month',
    name: '逆风翻盘',
    intro: '大环境不太好，能跑赢大环境就是本事。',
    rule: '规则照常',
    roast: { friendId: 'laozhao', text: '大家都跌你不跌，就是赚。' },
    goal: { kind: 'beat', base: 2, text: '本月收益比大环境多 {n} 个百分点' },
    weight: (c) => early(c, c.mret < 0 ? 2.5 : 0.5),
  },
  // ---------------------------------------------------------------- 中场 boss（第 4、8 个月）
  {
    id: 'crash_boss',
    name: '股灾来袭',
    boss: true,
    intro: '中场 boss：传闻这个月要出大事，群里人心惶惶。',
    rule: '本月白送押跌许可；重磅情报每天一条',
    roast: { friendId: 'qunzhu', text: '跌是机会！我的 VIP 群现在加入打八折！' },
    goal: { kind: 'keep', base: 6, text: '撑住：本月账户最多回撤 {n}%' },
    reward: { item: true, shards: 1 },
    weight: (c) => (c.mmin <= -3 || c.mret <= -4 ? 20 : c.mret < 0 ? 1 : 0.2),
    rules(r) {
      r.canShort = true;
      r.headlines += 1;
    },
  },
  {
    id: 'review_boss',
    name: '年中考核',
    boss: true,
    intro: '中场 boss：老婆要看这半年的成绩单。',
    rule: '规则照常，但目标更高',
    roast: { friendId: 'zhangjie', text: '我家那位也要看，我已经准备好了说辞。' },
    goal: { kind: 'gain', base: 6, text: '本月账户涨 {n}%' },
    reward: { item: true },
    weight: (c) => (c.mret >= 0 ? 1.5 : 0.7),
  },
  {
    id: 'banker_boss',
    name: '庄家对决',
    boss: true,
    intro: '中场 boss：有庄家盯上了过山车股，跟对了就有肉。',
    rule: '推荐里过山车股多两倍；涨跌停放宽一半',
    roast: { friendId: 'laozhao', text: '庄家吃肉，散户喝汤，别被埋了就行。' },
    goal: { kind: 'limitUp', base: 2, text: '抓到 {n} 次涨停' },
    reward: { item: true },
    weight: () => 1,
    rules(r) {
      r.recRoleBoost.meme = (r.recRoleBoost.meme ?? 1) * 2;
      r.limitMult *= 1.5;
    },
  },
  {
    id: 'beat_boss',
    name: '基金经理挑战',
    boss: true,
    intro: '中场 boss：隔壁基金经理放话"散户跑不赢我"。',
    rule: '规则照常',
    roast: { friendId: 'dav', text: '基金经理也是人，我直播间天天跑赢他们。' },
    goal: { kind: 'beat', base: 4, text: '本月收益比大环境多 {n} 个百分点' },
    reward: { item: true },
    weight: () => 1,
  },
];

const byId = new Map(MONTH_THEMES.map((d) => [d.id, d]));
export const isMonthThemeId = (id: string): boolean => byId.has(id);
export const monthThemeById = (id: string): MonthThemeDef => byId.get(id) as MonthThemeDef;

/**
 * 0.5 看点卡的短版：rule 是规则的一个短标签（≤8 字），line 是一句 ≤12 字的台词。
 * 长句（intro、rule、roast）留在看点卡的悬停详情里。
 */
export const MONTH_THEME_SHORT: Readonly<Record<string, { rule: string; line: string }>> = {
  meme_month: { rule: '过山车股×3', line: '安全带都系好了！' },
  qunzhu_month: { rule: '收割机推票×3', line: '各位悠着点' },
  payday: { rule: '发奖金，账单涨', line: '奖金别全梭哈' },
  bank_month: { rule: '借钱利息减半', line: '利息再低也要还' },
  bear_month: { rule: '可以押跌', line: '这次总该信了吧？' },
  exam_month: { rule: '只能买老实股', line: '老实股不惹事' },
  inlaw_month: { rule: '规则照常', line: '账户藏好了吗？' },
  rumor_month: { rule: '消息多2条', line: '懂的都懂' },
  insider_month: { rule: '每天一条情报', line: '表哥靠谱吗？' },
  fee_month: { rule: '免费多买1只', line: '不交易就是亏！' },
  wide_month: { rule: '涨跌停宽一倍', line: '别光看一头' },
  streak_month: { rule: '连击奖励×2', line: '今天必涨！' },
  spread_month: { rule: '推荐多1条', line: '别分散到垃圾股' },
  fomo_month: { rule: '推荐多2条', line: '这次真的不一样！' },
  beat_month: { rule: '规则照常', line: '大家跌你不跌' },
  crash_boss: { rule: '可押跌，有情报', line: '跌是机会！' },
  review_boss: { rule: '目标更高', line: '说辞准备好了' },
  banker_boss: { rule: '过山车股×2', line: '别被埋了就行' },
  beat_boss: { rule: '规则照常', line: '我天天跑赢他们' },
};
