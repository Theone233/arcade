/**
 * 0.3.1「看得懂」：把一天的结算拆成玩家看得懂的几项（归因、账户层效果），并给出大白话说明。
 * 只用当天已经揭晓的数，不含真实阶段；只记录，不参与任何计算。
 *
 * 说明的写法（小白试读的结论）：
 * - 一律说"这一项让这只股票涨 / 跌了百分之几"，热度点数只作为原因带一句，不拿点数和百分比比；
 * - 跟着最终方向说：和最终涨跌方向相反的项说"帮它少跌了""让它少涨了"；
 * - 角色、大哥带小弟、道具各自单列；道具前一律加"道具「」"。
 */
import { BALANCE } from './balance.ts';
import { itemById, stockById, themeById } from './content/index.ts';
import { formatMoney } from './format.ts';
import { round2, type RawPart } from './market.ts';
import type { AccountEffect, RetPart, RetPartKind, Role, StockMove, ThemeId } from './types.ts';

const ORDER: readonly RetPartKind[] = ['theme', 'role', 'market', 'momentum', 'chain', 'jump', 'news', 'blown', 'limit', 'item', 'noise'];

/** 百分比文字（绝对值，一位小数，去掉多余的 0）：2.95 → "3%"，0.7 → "0.7%"，0.04 → "不到 0.1%"。 */
function pct(v: number): string {
  const r = Math.round(Math.abs(v) * 10) / 10;
  return r === 0 ? '不到 0.1%' : `${r}%`;
}

/**
 * 这一项对这只股票的作用，跟着最终方向说。
 * more 为 true 时用"又多涨 / 又多跌"（角色、惯性、大哥、道具这类"额外"的项）。
 */
function effect(v: number, ret: number, more = false): string {
  if (v === 0) return '对它没有影响';
  if (v > 0) return ret >= 0 ? `${more ? '又多涨了' : '让它涨了'} ${pct(v)}` : `帮它少跌了 ${pct(v)}`;
  return ret <= 0 ? `${more ? '又多跌了' : '让它跌了'} ${pct(v)}` : `让它少涨了 ${pct(v)}`;
}

/** 0.8 → "八成"，0.5 → "一半"。 */
function share(beta: number): string {
  const n = Math.round(beta * 10);
  if (n === 5) return '一半';
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return `${digits[n] ?? n}成`;
}

const ROLE_NAME: Record<Role, string> = { leader: '带头大哥', follower: '小弟', bluechip: '老实股', meme: '过山车', st: '危险股' };

export interface PartContext {
  stockId: string;
  move: StockMove;
  /** 风口当天的热度变化 */
  dH: number;
  /** 今天大环境的涨跌（pp） */
  marketRet: number;
  /** 开盘前已经连续涨停的天数 */
  boardsBefore: number;
  /** 0.5 照搬真实走势：noise 不是掷出来的运气，是这只股票相对同风口的真实走势（个股自己的消息、资金） */
  track?: boolean;
}

/**
 * 照搬真实走势时，"个股自己"那一项的说法。第一个逗号前是短标签（收盘小结的小卡只显示这一段），
 * 要一眼看懂因果：盘面上认得出的事（炸板、大哥带小弟、过山车异动）优先，其次按幅度说资金或消息。
 * v 是"比同风口多涨 / 多跌"的相对值，和当天最终涨跌 ret 可能方向相反（风口大涨、它涨得少）：
 * 这时不能说"有资金在卖它"配"涨 1.2%"，要顺着结果说"有人趁涨卖出，让它少涨了"。
 */
function ownLabel(v: number, ret: number, c: PartContext): string {
  const def = stockById(c.stockId);
  const a = Math.abs(v);
  if (a < 1) return `自己小幅晃了晃，${effect(v, ret)}`;
  // 过山车异动：方向看当天实际涨跌，不看相对值
  if (c.move.wild) return `过山车脾气发作，${c.move.move > 0 ? '突然往上冲' : c.move.move < 0 ? '突然往下砸' : '上下乱晃'}，${effect(v, ret)}`;
  const same = v * ret > 0;
  if (!same) return v > 0 ? `有资金托着，${effect(v, ret)}` : `${ret > 0 ? '有人趁涨卖出' : '有人在卖'}，${effect(v, ret)}`;
  const tail = `${v > 0 ? '比同风口的多涨' : '比同风口的多跌'} ${pct(v)}`;
  if (c.move.blown && v < 0) return `昨天涨停今天没封住，资金跑了，${tail}`;
  if (c.move.follow && v > 0) return `大哥涨停，小弟跟着冲，${tail}`;
  if (c.boardsBefore > 0 && v > 0) return `连着涨停有人气，接着有人抢，${tail}`;
  if (def.role === 'st') return v > 0 ? `危险股有人赌翻身，${tail}` : `危险股没人敢接，${tail}`;
  if (a >= 6) return v > 0 ? `自家有大好消息，${tail}` : `自家出了坏消息，${tail}`;
  return v > 0 ? `有资金在买它，${tail}` : `有资金在卖它，${tail}`;
}

function label(kind: RetPartKind, v: number, ret: number, c: PartContext, itemId?: string): string {
  const def = stockById(c.stockId);
  const p = BALANCE.roles[def.role];
  switch (kind) {
    case 'theme': {
      const name = themeById(def.theme).name;
      // 照搬真实走势：这一项是整个行业相对大环境的涨跌，热度变化只作为旁证
      if (c.track) {
        // 热度和风口强弱反着走时不提热度，免得"比大环境弱（热度涨了 6）"前后打架
        const heat = c.dH * v > 0 ? `（热度${c.dH > 0 ? '涨' : '掉'}了 ${Math.abs(c.dH)}）` : '';
        return `${name}整个风口${v > 0 ? '比大环境强' : '比大环境弱'}${heat}，${effect(v, ret)}`;
      }
      let why = c.dH > 0 ? `${name}热度涨了 ${c.dH}` : c.dH < 0 ? `${name}热度掉了 ${-c.dH}` : `${name}热度没变，风口自己小幅晃了晃`;
      // 热度变化很小时，风口自己的小起伏可能让方向反过来
      if (c.dH !== 0 && v * c.dH < 0) why = `${name}热度${c.dH > 0 ? '只涨了' : '只掉了'} ${Math.abs(c.dH)}，风口自己反着晃了一下`;
      return `${why}，${effect(v, ret)}`;
    }
    case 'role':
      if (p.beta > 1) return `它是${ROLE_NAME[def.role]}，风口的涨跌在它身上更猛，${effect(v, ret, true)}`;
      return `它是${ROLE_NAME[def.role]}，只跟了风口的${share(p.beta)}，${effect(v, ret)}`;
    case 'market':
      if (c.marketRet > 0) return v * ret >= 0 || ret === 0 ? `今天大环境好，大家都沾光，${effect(v, ret)}` : `今天大环境好，${effect(v, ret)}，但没扛住`;
      if (c.marketRet < 0) return v * ret >= 0 || ret === 0 ? `今天大环境差，大家都在跌，${effect(v, ret)}` : `今天大环境差，${effect(v, ret)}`;
      return `今天大环境一般，${effect(v, ret)}`;
    case 'momentum':
      return `已经连续涨停 ${c.boardsBefore} 天，惯性${effect(v, ret, true)}`;
    case 'chain':
      return `大哥涨停，带着小弟一起涨，${effect(v, ret, true)}`;
    case 'jump':
      return `过山车突然${v > 0 ? '往上冲' : '往下砸'}，${effect(v, ret)}`;
    case 'news':
      if (c.move.st === 'delisted') return `危险股退市，几乎归零，${effect(v, ret)}`;
      if (c.move.st === 'uncap') return `危险股翻身了（公司的问题解决了），直接涨停，${effect(v, ret)}`;
      return `危险股翻身之后接着涨停，${effect(v, ret)}`;
    case 'blown':
      return `本来涨停，没封住，被砸了下来，${effect(v, ret)}`;
    case 'limit':
      return v < 0
        ? `涨停了：股票一天最多涨 ${p.limit}%，多出来的 ${pct(v)} 不算（道具的加成另算，可以超过 ${p.limit}%）`
        : `跌停了：股票一天最多跌 ${p.limit}%，少亏了 ${pct(v)}（道具的效果另算）`;
    case 'item':
      return `道具「${itemId ? itemById(itemId).name : '道具'}」${effect(v, ret, true)}`;
    case 'noise':
      if (c.track) return ownLabel(v, ret, c);
      return `运气（每天都有的小起伏）${effect(v, ret)}`;
    case 'short': {
      const m = -c.move.move;
      const why = c.move.move > 0 ? `它涨了 ${pct(c.move.move)}，你押它跌，所以亏` : c.move.move < 0 ? `它跌了 ${pct(c.move.move)}，你押它跌，所以赚` : '它没动';
      if (m === v) return why;
      const wind = c.marketRet > 0 ? '，今天大环境好，押跌逆风' : c.marketRet < 0 ? '，今天大环境差，押跌顺风' : '';
      return `${why}（押跌每天还有一点手续费${wind}）`;
    }
    case 'squeeze':
      return `它涨停了，押跌的人被轧：再多亏 ${pct(v)}`;
  }
}

/** 0.4 C：押跌那一格的归因：反过来的涨跌（含手续费）、被轧、自动卖出的道具。 */
export function shortParts(move: number, squeeze: number, items: readonly { itemId: string; value: number }[], ret: number, c: PartContext): RetPart[] {
  const out: RetPart[] = [];
  let acc = 0;
  const sq = round2(squeeze);
  for (const it of items) {
    const v = round2(it.value);
    if (v === 0) continue;
    out.push({ kind: 'item', value: v, label: '', itemId: it.itemId });
    acc += v;
  }
  if (sq !== 0) {
    out.unshift({ kind: 'squeeze', value: sq, label: '' });
    acc += sq;
  }
  out.unshift({ kind: 'short', value: round2(ret - acc), label: '' });
  void move;
  for (const p of out) p.label = label(p.kind, p.value, ret, c, p.itemId);
  return out;
}

/**
 * 一格持仓的归因：raw 是 moveStocks 给出的未取整各项（之和等于个股涨跌），items 是道具依次带来的变化，
 * ret 是这一格最终收益。各项取两位小数，零头并进"运气"，保证之和等于 ret（误差 ≤ 0.01）。
 */
export function holdingParts(raw: readonly RawPart[], items: readonly { itemId: string; value: number }[], ret: number, c: PartContext): RetPart[] {
  const sum = new Map<RetPartKind, number>();
  for (const p of raw) sum.set(p.kind, (sum.get(p.kind) ?? 0) + p.value);
  const out: RetPart[] = [];
  let acc = 0;
  for (const kind of ORDER) {
    if (kind === 'item') {
      for (const it of items) {
        const v = round2(it.value);
        if (v === 0) continue;
        out.push({ kind, value: v, label: '', itemId: it.itemId });
        acc += v;
      }
      continue;
    }
    if (kind === 'noise') continue;
    const v = round2(sum.get(kind) ?? 0);
    if (kind === 'theme') {
      out.push({ kind, value: v, label: '', theme: stockById(c.stockId).theme, dH: c.dH });
      acc += v;
      continue;
    }
    if (v === 0) continue;
    out.push({ kind, value: v, label: '' });
    acc += v;
  }
  const noise = round2(ret - acc);
  if (noise !== 0) out.push({ kind: 'noise', value: noise, label: '' });
  for (const p of out) p.label = label(p.kind, p.value, ret, c, p.itemId);
  return out;
}

/** 影响最大的一项（|value| 最大，相同时取靠前的）：画面挑"主要原因"用。 */
export function leadPart(parts: readonly RetPart[]): RetPart | null {
  let best: RetPart | null = null;
  for (const p of parts) if (!best || Math.abs(p.value) > Math.abs(best.value)) best = p;
  return best;
}

/** 借钱炒股的放大（金额定下来之后再写说明）。 */
export function leverageEffect(amount: number): AccountEffect {
  return { source: 'leverage', label: '', amount };
}

/** 账户层道具（如分散投资）。 */
export function itemEffect(itemId: string, amount: number): AccountEffect {
  return { source: itemId, label: '', amount };
}

/** 账户层效果的说明：按最终金额说"多赚了 / 多亏了 / 少亏了"。 */
export function effectLabel(e: AccountEffect): string {
  const money = formatMoney(Math.abs(e.amount));
  if (e.source === 'leverage') return e.amount >= 0 ? `借钱炒股：多赚了 ${money}（亏的时候也会多亏）` : `借钱炒股：多亏了 ${money}（赚的时候也会多赚）`;
  const name = `道具「${itemById(e.source).name}」`;
  return e.amount >= 0 ? `${name}：少亏了 ${money}` : `${name}：多亏了 ${money}`;
}

/** 风口名（给新闻、吐槽用）。 */
export function themeName(id: ThemeId): string {
  return themeById(id).name;
}
