/**
 * 称号的名字（0.10.3，docs/platform-backend.md 5.10）：钱包里只记称号 id，名字放在各游戏自己的 /games/<id>/titles.json，
 * 同域公开读（src/gamefile.ts）。读不到或格式不对就当没有，显示"神秘称号"，不报错。
 */
import { loadGameFile } from './gamefile.ts';

export interface TitleInfo {
  name: string;
  desc?: string;
}
export type TitleCatalog = Record<string, TitleInfo>;

export async function loadTitles(game: string): Promise<TitleCatalog> {
  const raw = (await loadGameFile(game, 'titles.json')) ?? {};
  const out: TitleCatalog = {};
  for (const [id, v] of Object.entries(raw)) {
    const t = v as { name?: unknown; desc?: unknown } | null;
    if (!t || typeof t.name !== 'string' || !t.name) continue;
    out[id] = { name: t.name.slice(0, 20), ...(typeof t.desc === 'string' ? { desc: t.desc.slice(0, 80) } : {}) };
  }
  return out;
}
