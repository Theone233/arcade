/**
 * 0.6.0 实盘模式的量测（docs/design-live.md 第 3 节）：某一档、某个机器人打 runs 局实盘，结回倍数的分布。
 * 真实行情，段按局号均匀覆盖（第 i 局用第 i % 段数 段），仓位 / 押跌 / 抵押都开（正式游戏都开）。
 * `npm run sim -- --live` 和 tests/live-sim.test.ts 共用。
 */
import { liveSetup, runSummary, type LiveTier, type PersonaId } from '../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from './bots.ts';
import { loadSegment, segmentIndex } from './segments-disk.ts';

export interface LiveStats {
  tier: LiveTier;
  bot: string;
  runs: number;
  /** 平均结回（份，1 = 不赚不亏） */
  mean: number;
  /** 标准误 */
  se: number;
  sd: number;
  /** 赚了的局（结回 > 1 份）占比 */
  up: number;
  /** 结回 0 的局（破产或赔光）占比 */
  zero: number;
  /** 结回在 0–2 份之间（输赢 ±1 份以内）的局占比 */
  within: number;
  /** 碰到 3 倍封顶的局占比 */
  capped: number;
  p10: number;
  p50: number;
  p90: number;
}

/** 段按局号均匀覆盖；同一前缀、同一局号在各档、各机器人之间用同一段，比较高低时误差更小 */
function useLiveMarket(prefix: string): void {
  const segs = segmentIndex().segments;
  const cache = new Map<string, ReturnType<typeof loadSegment>>();
  useMarket((seed) => {
    const i = Number(seed.slice(prefix.length + 1));
    const id = (segs[(Number.isInteger(i) ? i : 0) % segs.length] as { id: string }).id;
    if (!cache.has(id)) cache.set(id, loadSegment(id));
    return cache.get(id) ?? null;
  });
  useExt(true);
}

export function liveStats(tier: LiveTier, bot: string, runs: number, prefix = 'live', persona: PersonaId = 'newbie'): LiveStats {
  useLiveMarket(prefix);
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const end = playRun(`${prefix}-${i}`, botByName(bot), liveSetup(tier, persona));
    if (end.phase !== 'won' && end.phase !== 'lost') throw new Error(`${bot} 在 ${prefix}-${i} 没打完`);
    ms.push((runSummary(end).live?.bp ?? 0) / 10_000);
  }
  ms.sort((a, b) => a - b);
  const mean = ms.reduce((a, b) => a + b, 0) / runs;
  const sd = Math.sqrt(ms.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, runs - 1));
  const share = (f: (m: number) => boolean): number => ms.filter(f).length / runs;
  const q = (p: number): number => ms[Math.min(runs - 1, Math.floor(p * runs))] ?? 0;
  return {
    tier,
    bot,
    runs,
    mean,
    se: sd / Math.sqrt(runs),
    sd,
    up: share((m) => m > 1),
    zero: share((m) => m === 0),
    within: share((m) => m <= 2),
    capped: share((m) => m >= 3),
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
  };
}
