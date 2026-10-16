/**
 * 0.4 C：抵押物、小知识。数值在 BALANCE.ext，这里只放名字和大白话。
 * 画面上一律说"押跌""借钱""银行打电话""收走"，真实世界的叫法只出现在小知识卡的 real 一行。
 */
import { BALANCE } from '../balance.ts';
import type { CollateralId } from '../types.ts';

export interface CollateralDef {
  id: CollateralId;
  name: string;
  /** 押出去时的一句 */
  pledge: string;
  /** 被收走时的一句 */
  lost: string;
  /** 赎回来时的一句 */
  back: string;
}

export const COLLATERALS: readonly CollateralDef[] = [
  {
    id: 'bracelet',
    name: '老婆的金镯子',
    pledge: '趁老婆睡着，把金镯子揣进了口袋。',
    lost: '金镯子被银行收走了。今晚开始睡沙发。',
    back: '金镯子赎回来了，偷偷放回首饰盒，假装什么都没发生。',
  },
  {
    id: 'car',
    name: '车',
    pledge: '把车押给了银行，以后挤地铁，顺便在车厢里看行情。',
    lost: '车被拖走了。以后真的只能挤地铁了。',
    back: '车开回来了，第一件事是去洗了个车。',
  },
  {
    id: 'house',
    name: '房子',
    pledge: '把房子押给了银行。房本上的名字没变，心跳变快了。',
    lost: '房子被银行收走了，连夜搬去合租。',
    back: '房子赎回来了！房本重新压回床底下。',
  },
  {
    id: 'pension',
    name: '爸妈的养老钱',
    pledge: '爸妈把养老钱塞给你："拿去用，不着急还。"',
    lost: '爸妈的养老钱没了。电话里他们说"没事"，你更难受了。',
    back: '养老钱一分不少还给了爸妈，他们非要再塞你两个红包。',
  },
];

export const COLLATERAL_IDS: readonly CollateralId[] = COLLATERALS.map((d) => d.id);

export function collateralById(id: CollateralId): CollateralDef {
  const d = COLLATERALS.find((x) => x.id === id);
  if (!d) throw new Error(`未知抵押物：${id}`);
  return d;
}

export function isCollateralId(id: unknown): id is CollateralId {
  return typeof id === 'string' && COLLATERALS.some((d) => d.id === id);
}

/** 第 level 级难度下这件抵押物能借多少（元）、每月利息（比例）；还没开放时为 null。 */
export function collateralTerms(id: CollateralId, level: number): { amount: number; rate: number } | null {
  const c = BALANCE.ext.collateral[id];
  if (!c || level < c.level) return null;
  const k = Math.max(0, level - 1);
  return {
    amount: Math.round((c.amount * (1 + BALANCE.ext.amountStep * k)) / 1000) * 1000,
    rate: Math.round(c.rate * (1 + BALANCE.ext.rateStep * k) * 10000) / 10000,
  };
}

/** 小知识：第一次触发某个机制时点亮。text 是一句大白话，real 是真实世界里的叫法。 */
export interface KnowledgeDef {
  id: string;
  name: string;
  text: string;
  real: string;
}

export const KNOWLEDGE: readonly KnowledgeDef[] = [
  { id: 'size', name: '买多少自己定', text: '同样看好一只股票，买一口和买一大口，赚亏差好几倍。', real: '真实世界里叫"仓位"。' },
  { id: 'heavy', name: '重仓', text: '把剩下的钱全压在一只上：对了很爽，错了很疼。', real: '真实世界里叫"重仓"，全压上叫"满仓"。' },
  { id: 'add', name: '加仓', text: '已经拿着的再多买一点，越看好越加。', real: '真实世界里就叫"加仓"。' },
  { id: 'trim', name: '减一半', text: '先卖一半落袋，剩下一半接着拿，进可攻退可守。', real: '真实世界里叫"减仓"。' },
  { id: 'short', name: '押跌', text: '押它跌：它跌你赚，它涨你亏。', real: '真实世界里叫"做空"。' },
  { id: 'squeeze', name: '被轧', text: '押跌的股票偏偏涨停，押跌的人一起被挤爆。', real: '真实世界里叫"轧空"。' },
  { id: 'borrow', name: '借钱炒股', text: '借来的钱也拿去炒：赚了翻倍，亏了也翻倍。', real: '真实世界里叫"加杠杆"，拿东西押着借叫"抵押贷款"。' },
  { id: 'interest', name: '利息', text: '借的钱每个月都要付利息，不管你赚没赚。', real: '真实世界里叫"资金成本"。' },
  { id: 'call', name: '银行打电话', text: '亏到一条线，银行就打电话来提醒你小心。', real: '真实世界里这条线叫"预警线"。' },
  { id: 'seize', name: '收走抵押物', text: '再亏下去，银行直接把借的钱拿回去，东西也收走。', real: '真实世界里叫"强制平仓"，简称"强平"。' },
  { id: 'redeem', name: '赎回来', text: '把借的钱还上，押出去的东西就回来了。', real: '真实世界里叫"解押"。' },
];

export function knowledgeById(id: string): KnowledgeDef {
  const d = KNOWLEDGE.find((x) => x.id === id);
  if (!d) throw new Error(`未知小知识：${id}`);
  return d;
}

/** 第一次遇到每个新机制时的一句提示（三步之内能操作）。 */
export const EXT_TIPS: Record<string, string> = {
  size: '买的时候可以选"试一口 / 半仓 / 重仓"：重仓就是把剩下的钱全压上',
  holding: '点手里的股票：可以加仓、减一半、清仓',
  short: '你能押跌了：点推荐里的"押跌"，它跌你赚、它涨你亏，涨停时会被轧',
  bank: '银行开门了：点右上角的"银行"，可以押东西借钱，赚亏都翻倍，记得每月付利息',
  call: '银行打电话了：再亏下去东西会被收走。可以卖掉一些、或者去银行还钱',
};
