import { friendView, stockById, type GameEvent, type GameState, type Highlight, type MonthGoalState } from '../core/index.ts';

/**
 * 0.5 节奏与反馈的文字小工具（不碰 Phaser，单测直接测）：顶栏目标的短说法、开盘翻牌的档位、
 * 屏幕中部大字的喊话、今天最精彩的事、识别出的连续涨停 / 没封住 / 过山车异动的播报、群友刷屏台词。
 */

const fmt = (v: number): string => String(Math.round(v * 10) / 10);

/** 顶栏用的目标短说法："涨停 0/1 次"、"本月 +1.2% / 3%"；frac 为进度条 0..1（keep 是剩下的余量）。 */
export function goalShort(g: Pick<MonthGoalState, 'kind' | 'progress' | 'target'>): { text: string; frac: number } {
  const p = g.progress;
  const t = g.target;
  const ratio = t > 0 ? Math.max(0, Math.min(1, p / t)) : 0;
  switch (g.kind) {
    case 'gain':
      return { text: `本月 ${p >= 0 ? '+' : ''}${fmt(p)}% / 要 ${fmt(t)}%`, frac: ratio };
    case 'keep':
      return { text: `最多亏 ${fmt(t)}%，已亏 ${fmt(Math.max(0, p))}%`, frac: t > 0 ? Math.max(0, Math.min(1, 1 - p / t)) : 0 };
    case 'beat':
      return { text: `比大环境多 ${p >= 0 ? '+' : ''}${fmt(p)} / 要 ${fmt(t)}`, frac: ratio };
    case 'limitUp':
      return { text: `抓涨停 ${fmt(p)}/${fmt(t)} 次`, frac: ratio };
    case 'shortWin':
      return { text: `押跌赚 ${fmt(p)}/${fmt(t)} 次`, frac: ratio };
    case 'streak':
      return { text: `连着赚 ${fmt(p)}/${fmt(t)} 天`, frac: ratio };
    case 'themes':
      return { text: `同时拿 ${fmt(p)}/${fmt(t)} 个风口`, frac: ratio };
    case 'quickWin':
      return { text: `当天买当天赚 ${fmt(p)}/${fmt(t)}`, frac: ratio };
    case 'bigDay':
      return { text: `单日最多 +${fmt(Math.max(0, p))}% / 要 ${fmt(t)}%`, frac: ratio };
    default:
      return { text: `${fmt(p)}/${fmt(t)}`, frac: ratio };
  }
}

export type FlipTone = 'limitUp' | 'bigUp' | 'up' | 'flat' | 'down' | 'bigDown' | 'limitDown' | 'squeezed' | 'shortWin';

/**
 * 开盘翻牌的档位：按"这一格对你是赚是亏"分（押跌的格子反过来：股票跌你赚）。
 * 押跌碰上股票跌停 = 押对了（shortWin），碰上涨停 = 被轧（squeezed）。
 */
export function flipTone(shown: number, f: { short?: boolean; limitUp: boolean; limitDown: boolean }): FlipTone {
  if (f.short) {
    if (f.limitDown) return 'shortWin';
    if (f.limitUp) return 'squeezed';
  } else {
    if (f.limitUp) return 'limitUp';
    if (f.limitDown) return 'limitDown';
  }
  if (shown >= 5) return 'bigUp';
  if (shown <= -5) return 'bigDown';
  if (shown >= 0.05) return 'up';
  if (shown <= -0.05) return 'down';
  return 'flat';
}

/** 屏幕中部大字：高光、连击的一句喊话（短）+ 下面一行说明（规则层的原句）。 */
export function shoutOf(h: Pick<Highlight, 'kind' | 'text'>, streak = 0): { title: string; sub: string; good: boolean } | null {
  const sub = h.text;
  switch (h.kind) {
    case 'limitUp':
      return sub.includes('被轧') ? { title: '被轧了！', sub, good: false } : { title: '抓到涨停！', sub, good: true };
    case 'boards':
      return { title: '连续涨停！', sub, good: true };
    case 'shortWin':
      return { title: '押对了！', sub, good: true };
    case 'bigWin':
      return { title: '大赚一笔！', sub, good: true };
    case 'combo':
      return { title: streak >= 3 ? `${cnNum(streak)}连红！` : '小奖励！', sub, good: true };
    case 'goal':
      return { title: '本月目标达成！', sub, good: true };
    case 'limitDown':
      return { title: '跌停了…', sub, good: false };
    case 'bigLoss':
      return { title: '大跌…', sub, good: false };
    case 'blown':
      return { title: '没封住！', sub, good: false };
    case 'wild':
      return { title: '过山车发疯了！', sub, good: !sub.includes('-') };
    case 'crash':
      return { title: '股灾来了！', sub: '所有风口一起降温', good: false };
    case 'headline':
      return null;
    default:
      return null;
  }
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 3 → 三；11 以上直接写数字。 */
export function cnNum(n: number): string {
  return n >= 0 && n <= 10 ? (CN[n] ?? String(n)) : String(n);
}

/** 高光的激动程度（收盘小结第一句挑最高的；屏幕大字最多放两条）。 */
export const HIGHLIGHT_RANK: Record<Highlight['kind'], number> = {
  goal: 10,
  boards: 9,
  limitUp: 8,
  shortWin: 8,
  crash: 7,
  wild: 6,
  bigWin: 6,
  combo: 5,
  limitDown: 5,
  blown: 5,
  bigLoss: 4,
  headline: 1,
};

/** 今天最精彩的一件事（没有高光时为 null）。 */
export function bestHighlight<T extends Pick<Highlight, 'kind' | 'text'>>(list: readonly T[]): T | null {
  let best: T | null = null;
  for (const h of list) if (h.text && (!best || HIGHLIGHT_RANK[h.kind] > HIGHLIGHT_RANK[best.kind])) best = h;
  return best;
}

/** 识别出的连续涨停 / 没封住 / 过山车异动：播报一句。 */
export function spottedText(e: Pick<Extract<GameEvent, { type: 'spotted' }>, 'kind' | 'stockId' | 'move' | 'boards' | 'held'>): string {
  const name = stockById(e.stockId).name;
  const mine = e.held ? '（你手里的）' : '';
  const pct = `${e.move > 0 ? '+' : ''}${fmt(e.move)}%`;
  if (e.kind === 'boards') return `${name}${mine}连续 ${e.boards} 天涨停`;
  if (e.kind === 'blown') return `${name}${mine}昨天涨停，今天没封住：${pct}`;
  return `过山车${name}${mine}${e.move >= 0 ? '突然暴涨' : '突然暴跌'} ${pct}`;
}

/** 涨停、押对时群友刷屏的台词（按天和格子挑，同一局重看一样）。 */
const SPAM_UP = ['涨停了！今晚加鸡腿', '大佬带带我', '这票我也看过，可惜没买', '封得死死的！', '截图发朋友圈了', '羡慕到睡不着'];
const SPAM_SHORT = ['押跌也能赚？学到了', '它一跌你就笑，太坏了', '跌得好！（小声）', '高手在民间'];
const SPAM_BIG = ['今天这波漂亮', '账户起飞了吧', '请客请客'];

export function spamLines(s: Readonly<GameState>, kind: 'up' | 'short' | 'big', seed: number, n = 2): { name: string; text: string }[] {
  const pool = kind === 'up' ? SPAM_UP : kind === 'short' ? SPAM_SHORT : SPAM_BIG;
  const friends = s.friends.map((f) => f.id);
  const out: { name: string; text: string }[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const k = (seed * 7 + i * 3 + s.dayIndex) % pool.length;
    const fid = friends.length > 0 ? friends[(seed + i * 5 + s.dayIndex) % friends.length]! : null;
    const name = fid ? friendView(s, fid).name : '群友';
    out.push({ name, text: pool[(k + i) % pool.length]! });
  }
  return out;
}

