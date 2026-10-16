/**
 * 0.4 重做：局末"这段日子"小故事（真实行情局才有）。
 *
 * 不揭晓真身：不出现真实年份、日期、公司名（含化名）、代码和任何 id，只用游戏里的花名讲一个 4–8 句的小故事：
 * 开头（按市况）→ 大盘和风口概况 → 段内大事的故事版（游戏内时间，"第二个月月底"）→ 玩家自己（赚得最多、
 * 亏得最多的小人，跟没跟群友，通关还是爆掉）；另给一句结局吐槽。
 * 全部按段、种子和本局结果确定性地从 src/core/content/tales.ts 的模板里拼出来；画面在 src/view/meta/revealPanel.ts。
 */
import { BALANCE } from './balance.ts';
import { collateralById, friendById, isFriendId, personaById, stockById, stocksOf, themeById } from './content/index.ts';
import {
  BEST_LINES,
  END_LOST,
  END_WON,
  FRIEND_BAD,
  FRIEND_GOOD,
  FRIEND_NONE,
  GENERIC_BEATS,
  IDLE_LINES,
  MARKET_LINES,
  MONTH_WORDS,
  OPENINGS,
  PERSONA_SHORT,
  SEGMENT_TITLES,
  SENSITIVE_WORDS,
  VERDICTS,
  WORST_LINES,
  EXT_TALES,
} from './content/tales.ts';
import { allTrades } from './meta.ts';
import { hashSeed } from './rng.ts';
import { REGIME_LABEL, THEME_REAL, type RealMarket, type Regime } from './segment.ts';
import type { CollateralId, GameState, ThemeId, TradeLog } from './types.ts';

export interface StoryView {
  regime: Regime;
  regimeWord: string;
  /** 段的游戏化标题（不透露年代和公司） */
  title: string;
  /** 4–8 句小故事 */
  lines: string[];
  /** 一句结局吐槽 */
  verdict: string;
  /** 0.5 画面配图用：每句是哪一类（与 lines 一一对应），ref 是这句说到的股票 / 群友 id（可选） */
  marks?: StoryMark[];
}

export type StoryKind = 'open' | 'market' | 'beat' | 'ext' | 'best' | 'worst' | 'idle' | 'friend' | 'end';
export interface StoryMark {
  kind: StoryKind;
  ref?: string;
}

// ---------------------------------------------------------------- 标题

/** 一段的标题：按市况在 SEGMENT_TITLES 里第 n 个（超过列表长度时加"第 N 季"）。 */
export function segmentTitleAt(regime: Regime, n: number): string {
  const list = SEGMENT_TITLES[regime];
  const base = list[n % list.length] as string;
  const season = Math.floor(n / list.length);
  return season === 0 ? base : `${base} 第${MONTH_WORDS[season] ?? season + 1}季`;
}

/** 给一组段分配标题（tools/data/segments.ts 生成时用）：同一市况按 id 顺序依次取，互不重复。 */
export function assignTitles(segs: readonly { id: string; regime: Regime }[]): Map<string, string> {
  const out = new Map<string, string>();
  const count = new Map<Regime, number>();
  for (const s of [...segs].sort((a, b) => a.id.localeCompare(b.id))) {
    const n = count.get(s.regime) ?? 0;
    count.set(s.regime, n + 1);
    out.set(s.id, segmentTitleAt(s.regime, n));
  }
  return out;
}

const ALL_TITLES = new Set(Object.values(SEGMENT_TITLES).flat());

/** 显示用的标题：数据里的标题是游戏化标题时直接用；旧数据（"科网泡沫破裂"这类）按段 id 换一个。 */
export function displayTitle(id: string, regime: Regime, title: string): string {
  const base = title.replace(/ 第.+季$/, '');
  if (ALL_TITLES.has(base)) return title;
  const list = SEGMENT_TITLES[regime];
  return list[hashSeed(id, 'title') % list.length] as string;
}

// ---------------------------------------------------------------- 拼装

type Vars = Record<string, string>;

function fill(t: string, v: Vars): string {
  // 英文字母（风口名"AI"）和汉字之间加个空格
  return t
    .replace(/\{([^{}]+)\}/g, (m, k: string) => v[k] ?? m)
    .replace(/([A-Za-z])(?=[\u4e00-\u9fa5])/g, '$1 ')
    .replace(/([\u4e00-\u9fa5])(?=[A-Za-z])/g, '$1 ');
}

function pick<T>(list: readonly T[], ...key: (string | number)[]): T {
  return list[hashSeed(...key) % list.length] as T;
}

const monthWord = (m: number): string => `第${MONTH_WORDS[m - 1] ?? m}个月`;

/** 交易日（0 起）→ 游戏内第几个月、月内第几天、这个月几天。 */
function gameTime(day: number): { month: number; d: number; len: number } {
  let left = day;
  for (let m = 0; m < BALANCE.monthDays.length; m++) {
    const len = BALANCE.monthDays[m] as number;
    if (left < len) return { month: m + 1, d: left, len };
    left -= len;
  }
  return { month: BALANCE.monthDays.length, d: 0, len: 1 };
}

/**
 * 真实日期在一局里大约是第几个交易日（按自然日比例折算，只用来说"第几个月"）。
 * 生成行情段时用（tools/data/segments.ts 把它写进大事的 day）；画面上只有 0.4 开发期的旧存档还会走到这里。
 */
export function dayOfDate(from: string, to: string, days: number, date: string): number {
  const t = (x: string): number => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  const span = Math.max(1, t(to) - t(from));
  const f = Math.min(1, Math.max(0, (t(date) - t(from)) / span));
  return Math.min(days - 1, Math.floor(f * days));
}

interface Beat {
  day: number;
  t?: string;
  alt?: string;
  sectors: readonly string[];
}

/** 段里的大事 → 故事情节；0.4 开发期旧存档（真实日期 + 原文）折算成第几天，不带故事句（按大环境方向写通用句）。 */
function beatsOf(real: RealMarket): Beat[] {
  const out: Beat[] = [];
  for (const e of real.events) {
    if (typeof e.day === 'number') {
      out.push({ day: Math.max(0, Math.min(real.days - 1, Math.floor(e.day))), t: e.t, alt: e.alt, sectors: e.sectors ?? [] });
    } else if (typeof e.date === 'string' && real.from && real.to) {
      if (isSensitive(e.text ?? '') || isSensitive(e.quip ?? '')) continue;
      out.push({ day: dayOfDate(real.from, real.to, real.days, e.date), sectors: e.sectors ?? sectorsOf(e.text ?? '') });
    }
  }
  return out;
}

function whenText(day: number, prevMonth: number | null, key: (string | number)[]): string {
  const g = gameTime(day);
  if (prevMonth === g.month) return pick(['没过几天', '紧接着', '又过了几天'], ...key, 'again');
  const part = g.d === 0 ? '月初' : g.d >= g.len - 1 ? '月底' : '月中';
  // 第一个月不说"到了第一个月"（刚开局，没有"到了"）
  return pick([`${monthWord(g.month)}${part}`, g.month <= 1 ? '刚开局没多久' : `到了${monthWord(g.month)}`, `${monthWord(g.month)}的某一天`, `${monthWord(g.month)}${part}`], ...key, 'when');
}

const SECTOR_THEME = new Map<string, ThemeId>();
for (const [theme, r] of Object.entries(THEME_REAL) as [ThemeId, { sectors: readonly string[] }][]) for (const sec of r.sectors) SECTOR_THEME.set(sec, theme);

/** 大事里的行业对应到本局在场的风口（按事件表里的行业顺序；大盘类没有）。 */
function themeOfEvent(e: { sectors?: readonly string[] }, inPlay: readonly ThemeId[], fallback: ThemeId | null): ThemeId | null {
  for (const sec of e.sectors ?? []) {
    const t = SECTOR_THEME.get(sec);
    if (t && inPlay.includes(t)) return t;
  }
  return fallback;
}

/** 关键词猜大事的行业（存档里的大事只有日期、原文和点评，没有行业；表里的 {股} 要用）。 */
const SECTOR_HINT: [RegExp, string][] = [
  [/芯片|内存/, 'semis'],
  [/电脑|网卡/, 'hardware'],
  [/网络|通信|电讯|光通/, 'netequip'],
  [/软件|服务器/, 'software'],
  [/网|门户|拍卖|黑客|书城|拨号|传媒/, 'internet'],
  [/银行|储蓄/, 'bank'],
  [/投行|券商|证券/, 'broker'],
  [/保险|房贷|骗局/, 'finance'],
  [/原油|油价/, 'energy'],
  [/车企|汽车/, 'auto'],
  [/垃圾/, 'industrial'],
  [/电话/, 'telecom'],
];

export function sectorsOf(text: string): string[] {
  return SECTOR_HINT.filter(([re]) => re.test(text)).map(([, s]) => s);
}

/** 风口在这一局里的超额收益合计（大的为"热风口"）。 */
function themeHeat(real: RealMarket, id: ThemeId): number {
  const t = real.themes[id];
  if (!t) return 0;
  let sum = 0;
  for (let i = real.warm; i < t.ex.length; i++) sum += t.ex[i] ?? 0;
  return sum;
}

function pctWord(x: number): string {
  return `${Math.round(Math.abs(x) * 100)}%`;
}

function moveText(ret: number): string {
  return Math.abs(ret) < 0.02 ? '基本原地踏步' : ret > 0 ? `涨了 ${pctWord(ret)}` : `跌了 ${pctWord(ret)}`;
}

/** 这条风口里拿来当"{股}"的小人：本局买过的优先，否则龙头。 */
function stockFor(theme: ThemeId, traded: ReadonlySet<string>, key: (string | number)[]): string {
  const list = stocksOf(theme);
  const mine = list.filter((d) => traded.has(d.id));
  if (mine.length > 0) return pick(mine, ...key, 'mine').name;
  return (list.find((d) => d.role === 'leader') ?? pick(list, ...key, 'any')).name;
}

function isSensitive(text: string): boolean {
  return SENSITIVE_WORDS.some((w) => text.includes(w));
}

/** 0.4 C：玩家自己的仓位、押跌、抵押经历（最多两句）。 */
function extTales(s: Readonly<GameState>, trades: readonly TradeLog[], base: Vars, key: (...p: (string | number)[]) => (string | number)[]): string[] {
  const log = s.ext?.log;
  if (!log) return [];
  const out: string[] = [];
  const say = (kind: keyof typeof EXT_TALES, v: Vars): void => {
    if (out.length < 2) out.push(fill(pick(EXT_TALES[kind], ...key('ext', kind)), { ...base, ...v }));
  };
  const thing = (id: CollateralId): Vars => ({ 物: collateralById(id).name });
  const seized = log.seized[0];
  if (seized) say('seized', thing(seized));
  const redeemed = log.redeemed[0];
  if (redeemed) say('redeemed', thing(redeemed));
  const kept = log.borrowed.find((id) => !log.seized.includes(id) && !log.redeemed.includes(id));
  if (kept && s.phase === 'won') say('kept', thing(kept));
  const shorts = trades.filter((t) => t.short).sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret) || a.stockId.localeCompare(b.stockId));
  const sh = shorts[0];
  if (log.squeezes > 0 && sh && sh.ret < 0) say('squeezed', { 股: stockById(sh.stockId).name });
  else if (sh && Math.abs(sh.ret) >= 1) say(sh.ret > 0 ? 'shortWin' : 'shortLoss', { 股: stockById(sh.stockId).name, 多: `${Math.round(Math.abs(sh.ret))}%` });
  const heavy = trades.filter((t) => !t.short && (t.units ?? 1) >= 3).sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret) || a.stockId.localeCompare(b.stockId))[0];
  if (heavy && Math.abs(heavy.ret) >= 1) say(heavy.ret > 0 ? 'heavyWin' : 'heavyLoss', { 股: stockById(heavy.stockId).name, 多: `${Math.round(Math.abs(heavy.ret))}%` });
  return out;
}

/** 局末小故事；不是真实行情局（合成行情）时为 null。 */
export function storyView(s: Readonly<GameState>): StoryView | null {
  const real = s.real;
  if (!real) return null;
  const key = (...p: (string | number)[]): (string | number)[] => [s.seed, real.segId, 'story', ...p];
  const won = s.phase === 'won';
  const trades = allTrades(s);
  const traded = new Set(trades.map((t) => t.stockId));

  // 热风口、冷风口
  const heat = s.themeIds.map((id) => ({ id, h: themeHeat(real, id) })).sort((a, b) => b.h - a.h);
  const hot = heat[0]?.id ?? (s.themeIds[0] as ThemeId);
  const cold = heat[heat.length - 1]?.id ?? hot;
  const hotStock = (stocksOf(hot).find((d) => d.role === 'leader') ?? stocksOf(hot)[0])?.name ?? themeById(hot).name;

  const me = PERSONA_SHORT[s.persona] ?? '阿韭';
  const base: Vars = {
    主角: personaById(s.persona).name,
    我: me,
    热风口: themeById(hot).name,
    冷风口: themeById(cold).name,
    热股: hotStock,
    涨跌: moveText(real.stats.ret),
    收割机: friendById('qunzhu').name,
  };

  const lines: string[] = [];
  lines.push(fill(pick(OPENINGS[real.regime], ...key('open')), base));
  const market = fill(pick(MARKET_LINES[real.regime], ...key('market')), base);

  // 大事 → 故事情节（最多 3 条，按时间顺序）
  const beats: string[] = [];
  let prevMonth: number | null = null;
  // 只讲玩家撑到的那段时间里的事（提前爆掉的，后面的事就没看到）
  const reached = won ? real.days : Math.max(0, s.dayIndex);
  const events = beatsOf(real).filter((e) => e.day <= reached);
  // 超过 3 条时按种子去掉几条（保持时间顺序），换种子读起来不一样
  const chosen = [...events];
  while (chosen.length > 3) chosen.splice(hashSeed(...key('drop', chosen.length)) % chosen.length, 1);
  chosen.forEach((e, i) => {
    const day = e.day;
    const theme = themeOfEvent(e, s.themeIds, null);
    let tpl: string | undefined;
    let th: ThemeId | null = theme;
    if (e.t !== undefined || e.alt !== undefined) {
      const needs = e.t !== undefined && /\{(股|风口)\}/.test(e.t);
      tpl = needs && theme === null ? e.alt : e.t;
    } else {
      // 表里没有：只按大盘那几天的方向写一句（不用原文）
      let sum = 0;
      for (let k = -1; k <= 1; k++) sum += real.market[real.warm + day + k] ?? 0;
      tpl = pick(GENERIC_BEATS[sum >= 0 ? 'up' : 'down'], ...key('generic', i));
      th = theme ?? hot;
    }
    if (!tpl) return;
    const g = gameTime(day);
    const v: Vars = { ...base, when: whenText(day, prevMonth, key('beat', i)) };
    if (th) {
      v['风口'] = themeById(th).name;
      v['股'] = stockFor(th, traded, key('beat', i));
    }
    prevMonth = g.month;
    beats.push(fill(tpl, v));
  });

  // 玩家自己
  // 按单笔算（同一只多次买卖时取最好、最差的那一笔），亏损不会超过 100%
  const ranked = trades.map((t) => [t.stockId, t.ret] as [string, number]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const best = ranked[0] && ranked[0][1] > 0 ? ranked[0] : null;
  // 最亏的一笔换一只和最赚的不同的小人说
  const worst = [...ranked].reverse().find((t) => t[1] < 0 && t[0] !== best?.[0]) ?? null;
  const mine: string[] = [];
  const mineMarks: StoryMark[] = [];
  const pv: Vars = { ...base };
  if (best) {
    pv['赢股'] = stockById(best[0]).name;
    pv['赢多'] = `${Math.round(best[1])}%`;
  }
  if (worst) {
    pv['亏股'] = stockById(worst[0]).name;
    pv['亏多'] = `${Math.round(-worst[1])}%`;
  }
  // 0.4 C：仓位、押跌、抵押的经历（最多两件，放在最前面）
  const ext = extTales(s, trades, pv, key);
  // 经历里已经讲过的那只（重仓、押跌），不再用最赚 / 最亏那句把同一只、同一个数字再说一遍
  const told = (name: string | undefined): boolean => !!name && ext.some((l) => l.includes(name));
  // 赢了先说最赚的，输了先说最亏的；两句都有时按种子决定要不要都说
  const bestLine = best && !told(pv['赢股']) ? fill(pick(BEST_LINES, ...key('best')), pv) : null;
  const worstLine = worst && !told(pv['亏股']) ? fill(pick(WORST_LINES, ...key('worst')), pv) : null;
  const bm: StoryMark = { kind: 'best', ref: best?.[0] };
  const wm: StoryMark = { kind: 'worst', ref: worst?.[0] };
  const order: [string | null, StoryMark][] = won ? [[bestLine, bm], [worstLine, wm]] : [[worstLine, wm], [bestLine, bm]];
  if (!best && !worst) {
    mine.push(fill(pick(IDLE_LINES, ...key('idle')), pv));
    mineMarks.push({ kind: 'idle' });
  } else {
    for (const [l, m] of order) {
      if (l === null) continue;
      mine.push(l);
      mineMarks.push(m);
    }
  }
  mine.unshift(...ext);
  mineMarks.unshift(...ext.map((): StoryMark => ({ kind: 'ext' })));

  // 跟群友
  const follow = new Map<string, { n: number; ret: number }>();
  for (const t of trades) {
    if (!t.recBy || !isFriendId(t.recBy)) continue;
    const f = follow.get(t.recBy) ?? { n: 0, ret: 0 };
    f.n += 1;
    f.ret += t.ret;
    follow.set(t.recBy, f);
  }
  const top = [...follow.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
  let friendLine: string;
  const friendMark: StoryMark = top ? { kind: 'friend', ref: top[0] } : { kind: 'friend', ref: 'qunzhu' };
  if (top) {
    const fv: Vars = { ...pv, 群友: friendById(top[0]).name, 次: String(top[1].n) };
    friendLine = fill(pick(top[1].ret >= 0 ? FRIEND_GOOD : FRIEND_BAD, ...key('friend')), fv);
  } else friendLine = fill(pick(FRIEND_NONE, ...key('friend')), pv);

  const endLine = fill(pick(won ? END_WON : END_LOST, ...key('end')), { ...pv, 月: monthWord(Math.min(Math.max(1, s.month), 12)) });

  // 拼起来：最多 8 句（先省掉大盘概况，再省掉跟群友那句，再省掉第二句个股）
  const rest = [...beats];
  const tail = [...mine];
  const tailMarks = [...mineMarks];
  let withMarket = true;
  let withFriend = true;
  const count = (): number => 1 + (withMarket ? 1 : 0) + rest.length + tail.length + (withFriend ? 1 : 0) + 1;
  if (count() > 8) withMarket = false;
  if (count() > 8) withFriend = false;
  while (count() > 8 && tail.length > 1) {
    tail.pop();
    tailMarks.pop();
  }
  while (count() > 8 && rest.length > 1) rest.pop();
  const marks: StoryMark[] = [{ kind: 'open' }];
  if (withMarket) {
    lines.push(market);
    marks.push({ kind: 'market' });
  }
  lines.push(...rest, ...tail);
  marks.push(...rest.map((): StoryMark => ({ kind: 'beat' })), ...tailMarks);
  if (withFriend) {
    lines.push(friendLine);
    marks.push(friendMark);
  }
  lines.push(endLine);
  marks.push({ kind: 'end', ref: won ? 'won' : 'lost' });

  return {
    regime: real.regime,
    regimeWord: REGIME_LABEL[real.regime],
    title: displayTitle(real.segId, real.regime, real.title),
    lines,
    verdict: pick(VERDICTS[real.regime][won ? 'won' : 'lost'], ...key('verdict')),
    marks,
  };
}
