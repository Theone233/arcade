import { achievementsView, type PersonaId } from '../../core/index.ts';
import type { RecordResult } from '../../platform/profile.ts';

/** 一个弹窗：一个成就（大图）、几个成就（一屏最多 GRID_MAX 个的小图格子）、一个新人设、一级新难度。 */
export type Unlock =
  | { kind: 'achievement'; id: string; secret?: boolean }
  | { kind: 'achievements'; ids: string[] }
  | { kind: 'persona'; id: PersonaId }
  | { kind: 'difficulty'; level: number };

export const GRID_MAX = 15;

/** 本局新成就合并成弹窗：1 个单独大图，多个按 GRID_MAX 一屏的格子（第一局常常一下拿好几个，不必点十几次）。 */
export function achievementUnlocks(ids: readonly string[]): Unlock[] {
  if (ids.length === 0) return [];
  if (ids.length === 1) return [{ kind: 'achievement', id: ids[0]! }];
  const out: Unlock[] = [];
  for (let i = 0; i < ids.length; i += GRID_MAX) out.push({ kind: 'achievements', ids: ids.slice(i, i + GRID_MAX) });
  return out;
}

/** 本局带来的达成与解锁，按弹出顺序：隐藏结局（每个单独一屏）→ 成就 → 人设 → 难度。没计入档案的局没有。 */
export function unlocksOf(r: Pick<RecordResult, 'ignored' | 'newAchievements' | 'newPersonas' | 'newDifficulty'> | null): Unlock[] {
  if (!r || r.ignored) return [];
  const secret = new Set(achievementsView().filter((a) => a.hidden).map((a) => a.id));
  const out: Unlock[] = r.newAchievements.filter((id) => secret.has(id)).map((id) => ({ kind: 'achievement', id, secret: true }));
  out.push(...achievementUnlocks(r.newAchievements.filter((id) => !secret.has(id))));
  for (const id of r.newPersonas) out.push({ kind: 'persona', id });
  if (r.newDifficulty !== null) out.push({ kind: 'difficulty', level: r.newDifficulty });
  return out;
}
