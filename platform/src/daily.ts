/**
 * 每日挑战榜的分数怎么显示（0.10.18，docs/platform-backend.md 15.12）：各游戏的分数编码不一样（比如把"通关"编进高位），
 * 平台不去知道，由游戏自己的 /games/<id>/daily.json 给：
 *   {"note"?: "一句玩法说明", "score": [{"from"?: 100000000000, "text": "通关 · {n} 元"}, {"text": "撑了 {n} 个月"}]}
 * score 从上往下取第一条能用的：没写 from 的总能用，写了的要分数 ≥ from；{n} 是分数减去 from（没写就是分数）按千分位写。
 * 读不到、格式不对、没有一条能用：分数直接按千分位写，不显示说明。
 */
import { num } from './format.ts';
import { loadGameFile } from './gamefile.ts';

interface Rule {
  from: number | null;
  text: string;
}

export interface DailyFormat {
  note: string | null;
  score: (s: number) => string;
}

export async function loadDailyFormat(game: string): Promise<DailyFormat> {
  const raw = await loadGameFile(game, 'daily.json');
  const rules: Rule[] = [];
  for (const r of Array.isArray(raw?.score) ? (raw.score as unknown[]) : []) {
    const { from, text } = (r ?? {}) as { from?: unknown; text?: unknown };
    if (typeof text !== 'string' || !text.includes('{n}') || (from !== undefined && !Number.isFinite(from))) continue;
    rules.push({ from: typeof from === 'number' ? from : null, text: text.slice(0, 30) });
  }
  return {
    note: typeof raw?.note === 'string' && raw.note ? raw.note.slice(0, 80) : null,
    score: (s) => {
      const r = rules.find((x) => x.from === null || s >= x.from);
      return r ? r.text.replace('{n}', num(s - (r.from ?? 0))) : num(s);
    },
  };
}
