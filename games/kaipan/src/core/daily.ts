/**
 * 每日挑战（0.3.0）：按日期给出确定的种子、人设和难度。单独成模块，成就判定也要用（避免循环引用）。
 */
import { DAILY_SEGMENTS } from './content/dailySegments.ts';
import { PERSONA_IDS } from './content/personas.ts';
import { hashSeed, rngFor } from './rng.ts';
import { pickSegmentId } from './segment.ts';
import type { PersonaId, RunSetup } from './types.ts';

/** 每日挑战的难度范围（含两端）。 */
export const DAILY_LEVELS: readonly [number, number] = [2, 5];

/**
 * 每日挑战：按日期（YYYY-MM-DD）给出确定的种子、人设和难度。同一天全世界一样。
 * 人设从 5 个里挑（包括还没解锁的，每日挑战可以先试玩），难度 2..5。
 */
export function dailySetup(date: string): { date: string; seed: string; setup: RunSetup & { persona: PersonaId; difficulty: number; daily: string } } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('每日挑战的日期要是 YYYY-MM-DD');
  const rng = rngFor('daily', date);
  const persona = PERSONA_IDS[rng.int(PERSONA_IDS.length)] as PersonaId;
  const [lo, hi] = DAILY_LEVELS;
  const difficulty = lo + rng.int(hi - lo + 1);
  return { date, seed: `daily-${date}`, setup: { persona, difficulty, daily: date } };
}

/** 这一局是不是货真价实的每日挑战：种子、人设、难度都和 dailySetup(日期) 一致。 */
export function isDailyRun(date: string | null | undefined, seed: string, persona: PersonaId, difficulty: number): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = dailySetup(date);
  return d.seed === seed && d.setup.persona === persona && d.setup.difficulty === difficulty;
}

/**
 * 每日挑战规则的版本（0.5.10 排行榜）：0 = 榜单 `daily-YYYY-MM-DD`。人设难度的抽法、段池（DAILY_SEGMENTS）、计分方法大改时加一，
 * 榜单变成 `daily-YYYY-MM-DD-v<n>`，改之前和之后打的不在一个榜上比。
 */
export const DAILY_RULES = 0;

/** 这一天的每日挑战排行榜 ID（平台只收北京时间的昨天、今天、明天）。 */
export function dailyBoardId(date: string): string {
  return DAILY_RULES > 0 ? `daily-${date}-v${DAILY_RULES}` : `daily-${date}`;
}

/** 这一天的每日挑战该用哪一段真实行情：只在冻结的段池里抽，段库加了新段也不变。 */
export function dailySegmentId(date: string): string | null {
  return pickSegmentId(dailySetup(date).seed, DAILY_SEGMENTS, hashSeed);
}

/**
 * 排行榜的分数（越大越好，平台只收安全整数）：通关的按最后的账户（元，取整）排，都排在没通关的前面；
 * 没通关的按还上了几个月排。和档案里每日挑战的"最好"一个口径（DailyRecord）。
 */
export const DAILY_WIN_BASE = 100_000_000_000;

export function dailyScore(won: boolean, account: number, billsPaid: number): number {
  if (!won) return Math.max(0, Math.min(12, Math.trunc(billsPaid)));
  const yuan = Math.round(account);
  return DAILY_WIN_BASE + Math.max(0, Math.min(DAILY_WIN_BASE - 1, Number.isFinite(yuan) ? yuan : 0));
}

/** 分数还原成"通关、账户多少"或"还了几个月"（别人的分数也走这里：不认识的按没通关 0 个月）。 */
export function dailyScoreView(score: number): { won: true; account: number } | { won: false; months: number } {
  if (!Number.isSafeInteger(score) || score < 0) return { won: false, months: 0 };
  if (score >= DAILY_WIN_BASE) return { won: true, account: Math.min(score, 2 * DAILY_WIN_BASE - 1) - DAILY_WIN_BASE };
  return { won: false, months: Math.min(12, score) };
}
