import { ACHIEVEMENTS, EVENTS, FRIENDS, ITEMS, MAX_DIFFICULTY, PERSONAS, STOCKS, achievementById, isAchievementId, type PersonaId } from '../core/index.ts';
import { bestKey, emptyProfile, type Profile } from '../platform/profile.ts';
import type { Viewed } from '../view/meta/prefs.ts';

/**
 * 调试 / 截图用的档案样本（不会在正常游戏里出现）：
 * - fresh：全新档案（第一次玩）；
 * - partial：玩过几局，图鉴点亮一半、拿了几个成就、解锁到第 3 级，图鉴里一部分条目还没看过（带「新」角标）；
 * - all：全部解锁、全部点亮、全部成就。
 * 返回档案和对应的图鉴「已看过」记录。
 */
export type ProfilePreset = 'fresh' | 'partial' | 'all';

function half<T extends { id: string }>(list: readonly T[], ratio: number): string[] {
  return list.slice(0, Math.ceil(list.length * ratio)).map((d) => d.id);
}

export function presetProfile(kind: ProfilePreset): { profile: Profile; viewed: Viewed } {
  const p = emptyProfile();
  const none: Viewed = { stocks: [], friends: [], items: [], events: [], achievements: [] };
  if (kind === 'fresh') return { profile: p, viewed: none };
  const ratio = kind === 'all' ? 1 : 0.5;
  p.seen = { stocks: half(STOCKS, ratio), friends: half(FRIENDS, ratio), items: half(ITEMS, ratio), events: half(EVENTS, ratio) };
  const achs = kind === 'all' ? ACHIEVEMENTS.map((d) => d.id) : half(ACHIEVEMENTS, 0.2);
  achs.forEach((id, i) => (p.achievements[id] = i + 1));
  const unlocked = new Set<PersonaId>(p.personas);
  if (kind === 'all') for (const d of PERSONAS) unlocked.add(d.id);
  else for (const id of achs) {
    const u = isAchievementId(id) ? achievementById(id).unlocks : undefined;
    if (u) unlocked.add(u);
  }
  p.personas = PERSONAS.filter((d) => unlocked.has(d.id)).map((d) => d.id);
  p.maxDifficulty = kind === 'all' ? MAX_DIFFICULTY : 3;
  p.runs = kind === 'all' ? 64 : 7;
  p.wins = kind === 'all' ? 31 : 2;
  p.best[bestKey('newbie', 1)] = { runs: 4, wins: 1, bestAccount: 168_000, bestMonths: 12 };
  p.best[bestKey('newbie', 2)] = { runs: 3, wins: 1, bestAccount: 121_500, bestMonths: 12 };
  if (kind === 'all') p.best[bestKey('newbie', 8)] = { runs: 6, wins: 0, bestAccount: 0, bestMonths: 7 };
  p.last = `preset-${kind}`;
  // partial：前一半点亮的已经看过，后一半带「新」
  const seenHalf = (ids: string[]): string[] => (kind === 'all' ? ids : ids.slice(0, Math.floor(ids.length / 2)));
  const viewed: Viewed = {
    stocks: seenHalf(p.seen.stocks),
    friends: seenHalf(p.seen.friends),
    items: seenHalf(p.seen.items),
    events: seenHalf(p.seen.events),
    achievements: seenHalf(Object.keys(p.achievements)),
  };
  return { profile: p, viewed };
}
