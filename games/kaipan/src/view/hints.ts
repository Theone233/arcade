import { billView, chatView, holdingCards, themeBoard, type GameState } from '../core/index.ts';
import { FEEL_WORD } from './glossary.ts';
import { billStatus } from './labels.ts';

/**
 * 新手提示（F4）：开盘前猫根据公开信息说一句建议。
 * 只用公开查询（看板的热度、走势和公开状态，持仓卡，推荐，账单），不碰真实阶段和今天预先掷好的行情；
 * 建议不保证对，每句后面都承认"我也是猜的"。纯函数，可单测。
 */
interface Hint {
  text: string;
  /** 说的是哪个风口 / 哪只股票（画面可以顺手高亮） */
  theme: string | null;
  stockId: string | null;
}

const TAILS = ['我也是猜的。', '猫的话听一半就好。', '别全信我，我只是只猫。'];

/** 末尾连续同号的天数（连涨几天 / 连跌几天）。 */
export function streak(trend: readonly number[]): number {
  let n = 0;
  const last = trend[trend.length - 1] ?? 0;
  if (last === 0) return 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    const v = trend[i] ?? 0;
    if (Math.sign(v) !== Math.sign(last)) break;
    n += 1;
  }
  return n * Math.sign(last);
}

const CN_NUM = ['零', '一', '两', '三', '四', '五'];

export function newbieHint(s: Readonly<GameState>): Hint | null {
  if (s.phase !== 'premarket') return null;
  const tail = TAILS[s.dayIndex % TAILS.length] ?? TAILS[0]!;
  const board = themeBoard(s);
  const byId = new Map(board.map((c) => [c.id, c]));
  // 1. 手里的股票所在风口在降温 / 太火了：提醒可以先卖（只挑今天能卖的）
  for (const c of holdingCards(s)) {
    if (!c || !c.canSell) continue;
    const t = byId.get(c.theme);
    if (!t) continue;
    if (t.feel === 'cooling') return { text: `你的${c.name}所在的${t.name}在降温，要不要先卖了？${tail}`, theme: t.id, stockId: c.id };
    if (t.feel === 'overheated') return { text: `${t.name}已经太火了，你的${c.name}可以考虑先下车。${tail}`, theme: t.id, stockId: c.id };
  }
  const chat = chatView(s);
  const recs = chat.recs.filter((r) => !r.taken && !r.error);
  // 1.5 群里的说法和看板相反：点出来，让玩家自己挑（只用公开的说法方向和看板体感）
  for (const t of board) {
    const says = chat.messages.filter((m) => m.theme === t.id).map((m) => m.readAs ?? m.claim);
    if (says.length < 2) continue;
    const ups = says.filter((d) => d === 'up').length;
    const downs = says.filter((d) => d === 'down').length;
    const rising = t.feel === 'warming' || (t.feel === 'hot' && t.lastDelta > 0);
    if (downs >= 2 && ups === 0 && rising) return { text: `群里都说${t.name}要跌，看板上它却${FEEL_WORD[t.feel]}，信谁你自己挑。${tail}`, theme: t.id, stockId: null };
    if (ups >= 2 && downs === 0 && t.feel === 'cooling') return { text: `群里都说${t.name}要涨，看板上它却${FEEL_WORD.cooling}，信谁你自己挑。${tail}`, theme: t.id, stockId: null };
  }
  // 2. 有风口开始火（热度连涨），推荐里正好有它的股票：可以考虑上车
  const warming = board
    .filter((t) => t.feel === 'warming' || (t.feel === 'hot' && streak(t.trend) >= 2))
    .sort((a, b) => streak(b.trend) - streak(a.trend) || b.lastDelta - a.lastDelta);
  for (const t of warming) {
    const rec = recs.find((r) => r.stock.theme === t.id);
    const n = streak(t.trend);
    const run = n >= 2 ? `热度连涨${CN_NUM[Math.min(n, 5)]}天` : '热度在往上走';
    if (rec) return { text: `${t.name}${run}，${FEEL_WORD[t.feel]}，推荐里的${rec.stock.name}就是这个风口的，可以考虑上车。${tail}`, theme: t.id, stockId: rec.stock.id };
  }
  const first = warming[0];
  if (first) {
    const n = streak(first.trend);
    return { text: `${first.name}${n >= 2 ? `热度连涨${CN_NUM[Math.min(n, 5)]}天` : '热度在往上走'}，可以留意一下它的股票。${tail}`, theme: first.id, stockId: null };
  }
  // 3. 这个月的钱有点紧
  const bill = billView(s);
  const st = billStatus(bill);
  if (st.status !== 'ok') return { text: `这个月要还的钱有点紧（${st.text}），稳一点。${tail}`, theme: null, stockId: null };
  // 4. 看不出门道
  return { text: `今天看板上没什么明显的信号，跟着感觉走吧。${tail}`, theme: null, stockId: null };
}
