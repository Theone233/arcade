/**
 * 0.4 C 查询：仓位、押跌、银行（抵押借钱）、小知识。画面只从这里拿数，不自己算规则。
 * 文案一律大白话：押跌、借钱、银行打电话、收走。
 */
import { BALANCE } from './balance.ts';
import { COLLATERALS, EXT_TIPS, KNOWLEDGE, collateralById, knowledgeById, stockById } from './content/index.ts';
import { canShortNow, daysLeftInMonth, debtOf, freeUnits, holdingBase, loanOffer, sizeUnits, unitsOf, usedUnits, validate } from './engine.ts';
import { formatMoney } from './format.ts';
import type { BuySize, CollateralId, ExtLog, GameState } from './types.ts';

export const SIZE_LABEL: Record<BuySize, string> = { taste: '试一口', half: '半仓', heavy: '重仓' };
export const SIZES: readonly BuySize[] = ['taste', 'half', 'heavy'];

/** 份数的说法：1 → "1 份"，0.5 → "半份"，2.5 → "2.5 份"。 */
export function unitsWord(u: number): string {
  if (Math.abs(u - 0.5) < 1e-9) return '半份';
  return `${Math.round(u * 100) / 100} 份`;
}

export interface SizeOption {
  size: BuySize;
  label: string;
  /** 这样买会用掉几份 */
  units: number;
  /** 不能这样买的原因 */
  error: string | null;
  /** 一次买超过 1 份：价格被自己抬高，多花多少（元，约数）；没有为 0 */
  cost: number;
  /** cost > 0 时的一句说明 */
  note: string | null;
}

export interface BuyOptions {
  rec: number;
  /** 有没有仓位玩法（0.3 存档没有） */
  enabled: boolean;
  sizes: SizeOption[];
  /** 押跌：能不能押、原因；hint 为 true 表示是唱空的群友建议押跌 */
  short: { unlocked: boolean; error: string | null; hint: boolean };
}

/** 买第 rec 条推荐的选项（放进 / 换掉第 slot 格）。 */
export function buyOptions(s: Readonly<GameState>, rec: number, slot?: number): BuyOptions {
  const enabled = !!s.ext;
  const sizes = SIZES.map((size) => ({
    size,
    label: SIZE_LABEL[size],
    units: enabled ? sizeUnits(s, size, slot) : 1,
    error: validate(s, enabled ? { type: 'buy', rec, slot, size } : { type: 'buy', rec, slot }),
    cost: 0,
    note: null as string | null,
  }));
  for (const o of sizes) {
    if (!enabled || o.units <= 1) continue;
    o.cost = Math.round((s.account * (o.units / BALANCE.slots) * BALANCE.ext.impact * (o.units - 1)) / 100);
    o.note = `一次买这么多，价格会被你自己抬高一点：多花约 ${formatMoney(o.cost)}`;
  }
  const unlocked = canShortNow(s);
  return {
    rec,
    enabled,
    sizes,
    short: { unlocked, error: unlocked ? validate(s, { type: 'buy', rec, slot, short: true }) : '还没解锁押跌', hint: !!s.today.recs[rec]?.short },
  };
}

export interface PositionView {
  slot: number;
  stockId: string;
  name: string;
  units: number;
  unitsWord: string;
  /** 占账户的比例（0..1） */
  weight: number;
  short: boolean;
  /** 押跌期间连续涨停的天数 */
  squeezed: number;
  holdRet: number;
  addError: string | null;
  trimError: string | null;
  sellError: string | null;
}

export interface PositionsView {
  enabled: boolean;
  /** 总份数（= 格子数）、已经用掉、剩下的现金份数 */
  total: number;
  used: number;
  cash: number;
  slots: (PositionView | null)[];
}

export function positionsView(s: Readonly<GameState>): PositionsView {
  const base = holdingBase(s);
  return {
    enabled: !!s.ext,
    total: s.slots.length,
    used: usedUnits(s),
    cash: freeUnits(s),
    slots: s.slots.map((h, slot) => {
      if (!h) return null;
      const u = unitsOf(h);
      return {
        slot,
        stockId: h.stockId,
        name: stockById(h.stockId).name,
        units: u,
        unitsWord: unitsWord(u),
        weight: u / base,
        short: !!h.short,
        squeezed: h.squeezed ?? 0,
        holdRet: Math.round((h.value - 1) * 10000) / 100,
        addError: s.ext ? validate(s, { type: 'add', slot }) : '这一局没有这个玩法',
        trimError: s.ext ? validate(s, { type: 'trim', slot }) : '这一局没有这个玩法',
        sellError: validate(s, { type: 'sell', slot }),
      };
    }),
  };
}

export interface LoanView {
  id: CollateralId;
  name: string;
  amount: number;
  /** 每月利息（比例）和金额（元） */
  rate: number;
  interest: number;
  month: number;
  repayError: string | null;
}

export interface OfferView {
  id: CollateralId;
  name: string;
  amount: number;
  rate: number;
  interest: number;
  /** 不能押的原因（已押、被收走、家底太薄、还没到月份） */
  error: string | null;
  /** 这件东西被收走了 */
  lost: boolean;
}

export interface BankView {
  enabled: boolean;
  /** 银行开门了没有（第几个月起） */
  open: boolean;
  openMonth: number;
  account: number;
  debt: number;
  /** 自己的钱 = 账户 − 欠款 */
  net: number;
  /** 账户低于这个数银行打电话，低于 seizeAt 收走东西（没欠钱为 null） */
  callAt: number | null;
  seizeAt: number | null;
  called: boolean;
  /** 每月要付的利息合计（元） */
  monthlyInterest: number;
  loans: LoanView[];
  offers: OfferView[];
  /** 一句话规则 */
  rule: string;
  /** 0.5.4：今天收盘要付账单，付完会跌破银行的线（没有风险为 null） */
  risk: BankRisk | null;
}

/**
 * 月底那天（今天收盘付账单）的银行风险：按现在的账户算，付完账单和利息后会不会跌破打电话 / 收东西的线。
 * 试玩反馈：持仓涨了 10%，月底一付账单车就没了，事先看不出来——所以在盘前就讲清楚。只用现在的账户估，今天的涨跌另算。
 */
export interface BankRisk {
  kind: 'seize' | 'call';
  bill: number;
  interest: number;
  /** 按现在的账户，付完之后剩多少 */
  after: number;
  /** 跌破就出事的那条线 */
  line: number;
  debt: number;
  /** 先被收走的那件（借得最多的） */
  first: string;
  /** 离安全还差多少（账户要多出这么多才不出事） */
  short: number;
}

export function bankRisk(s: Readonly<GameState>): BankRisk | null {
  const x = s.ext;
  if (!x || x.loans.length === 0 || s.phase !== 'premarket' || daysLeftInMonth(s) > 1) return null;
  const E = BALANCE.ext;
  const debt = debtOf(s);
  let interest = 0;
  for (const l of x.loans) interest += l.amount * l.rate;
  interest = Math.round(interest * 100) / 100;
  // 和月底结算同一个顺序：先付利息，再付账单；钱不够付账单、手里有信用卡时信用卡垫上，账户不扣
  const a0 = s.account - interest;
  const bill = a0 < s.bill.amount && s.items.includes('credit') ? 0 : s.bill.amount;
  const after = Math.round((a0 - bill) * 100) / 100;
  const seize = debt * E.seizeLine;
  const call = debt * E.callLine;
  if (after >= call) return null;
  const kind = after < seize ? 'seize' : 'call';
  const line = Math.round(kind === 'seize' ? seize : call);
  const top = [...x.loans].sort((a, b) => b.amount - a.amount)[0];
  return { kind, bill, interest, after, line, debt, first: top ? collateralById(top.id).name : '', short: Math.max(0, Math.round(line - after)) };
}

export function bankView(s: Readonly<GameState>): BankView {
  const x = s.ext;
  const E = BALANCE.ext;
  const debt = debtOf(s);
  const loans: LoanView[] = (x?.loans ?? []).map((l) => ({
    id: l.id,
    name: collateralById(l.id).name,
    amount: l.amount,
    rate: l.rate,
    interest: Math.round(l.amount * l.rate * 100) / 100,
    month: l.month,
    repayError: validate(s, { type: 'repay', id: l.id }),
  }));
  const offers: OfferView[] = [];
  for (const d of COLLATERALS) {
    const o = loanOffer(s, d.id);
    if (!o) continue;
    offers.push({ id: d.id, name: d.name, amount: o.amount, rate: o.rate, interest: Math.round(o.amount * o.rate * 100) / 100, error: validate(s, { type: 'borrow', id: d.id }), lost: !!x?.log.seized.includes(d.id) });
  }
  let monthlyInterest = 0;
  for (const l of loans) monthlyInterest += l.interest;
  return {
    enabled: !!x,
    open: !!x && s.month >= E.bankMonth,
    openMonth: E.bankMonth,
    account: s.account,
    debt,
    net: Math.round((s.account - debt) * 100) / 100,
    callAt: debt > 0 ? Math.round(debt * E.callLine) : null,
    seizeAt: debt > 0 ? Math.round(debt * E.seizeLine) : null,
    called: !!x?.called,
    monthlyInterest: Math.round(monthlyInterest * 100) / 100,
    loans,
    offers,
    rule: `把东西押给银行，借来的钱加进账户一起炒：赚亏都放大。每月底另付利息；账户跌到欠款的 ${E.callLine} 倍银行打电话，跌到 ${E.seizeLine} 倍就收走东西、拿回借款`,
    risk: bankRisk(s),
  };
}

export interface KnowledgeCard {
  id: string;
  name: string;
  text: string;
  real: string;
  /** 点亮了没有 */
  lit: boolean;
}

/** 图鉴"小知识"页：learned 是档案里点亮过的 id（再加上本局的）。 */
export function knowledgeView(learned: readonly string[]): KnowledgeCard[] {
  const set = new Set(learned);
  return KNOWLEDGE.map((d) => ({ ...d, lit: set.has(d.id) }));
}

export function knowledgeCard(id: string): KnowledgeCard {
  return { ...knowledgeById(id), lit: true };
}

/** 新机制第一次出现时的提示（画面按 id 只显示一次）。 */
export function extTip(id: keyof typeof EXT_TIPS | string): string | null {
  return EXT_TIPS[id] ?? null;
}

/** 结束页"这一局"的几句经历（没有新机制的局为空）。 */
export function extRecap(s: Readonly<GameState>): string[] {
  const log: ExtLog | undefined = s.ext?.log;
  if (!log) return [];
  const out: string[] = [];
  if (log.heavy > 0) out.push(`重仓了 ${log.heavy} 次${log.maxStock ? `，压得最重的是${stockById(log.maxStock).name}` : ''}`);
  if (log.shorts > 0) out.push(`押跌 ${log.shorts} 次，${log.shortPnl >= 0 ? '赚了' : '亏了'} ${formatMoney(Math.abs(log.shortPnl))}${log.squeezes > 0 ? `，被轧 ${log.squeezes} 回` : ''}`);
  for (const id of log.borrowed) {
    const name = collateralById(id).name;
    if (log.seized.includes(id)) out.push(`押了${name}，被银行收走了`);
    else if (log.redeemed.includes(id)) out.push(`押了${name}，又赎了回来`);
    else out.push(s.phase === 'won' ? `押了${name}，一年到头才还上` : `押了${name}，到最后也没赎回来`);
  }
  if (log.interest > 0) out.push(`一共付了 ${formatMoney(log.interest)} 利息`);
  return out;
}
