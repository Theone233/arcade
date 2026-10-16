/**
 * 0.5 节奏检查：每局 12 个月的主题是否不重复、每个月有没有高光、平淡日比例、月度目标完成率、小奖励发了多少钱。
 *   node tools/tempo-check.ts [--bot normal] [--runs 135] [--difficulty 1] [--regime bull] [--ext]
 */
import { BALANCE } from '../src/core/balance.ts';
import type { GameState } from '../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from './bots.ts';
import { loadSegment, segmentIndex } from './segments-disk.ts';

const argOf = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
for (const kv of process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1] ?? ''] : []))) {
  const [path, v] = kv.split('=');
  const keys = (path ?? '').split('.');
  let o: Record<string, unknown> = BALANCE as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1] as string] = Number(v);
}
const bot = argOf('bot') ?? 'normal';
const runs = Number(argOf('runs') ?? 135);
const difficulty = Number(argOf('difficulty') ?? 1);
const regime = argOf('regime');
useExt(process.argv.includes('--ext'));
const segs = segmentIndex()
  .segments.map((e) => loadSegment(e.id))
  .filter((s) => !regime || s.regime === regime);
let won = 0;
let months = 0;
let noHighlight = 0;
let days = 0;
let quietClose = 0;
let quietPre = 0;
let goalsDone = 0;
let bonus = 0;
let repeats = 0;
let maxQuietRun = 0;
let bonusWon = 0;
const goalByTheme = new Map<string, [number, number]>();
for (let k = 0; k < runs; k++) {
  const seg = segs[k % segs.length];
  if (!seg) break;
  useMarket(() => seg);
  const hl = new Map<number, number>();
  let run = 0;
  const end: GameState = playRun(`tempo-${k}`, botByName(bot), { difficulty }, (st, evs) => {
    for (const e of evs) {
      if (e.type === 'highlight') hl.set(st.month, (hl.get(st.month) ?? 0) + 1);
      if (e.type === 'dayStarted' && st.today.quiet) quietPre += 1;
      if (e.type === 'dayClosed') {
        days += 1;
        if (e.report.tempo?.quiet) {
          quietClose += 1;
          run += 1;
          maxQuietRun = Math.max(maxQuietRun, run);
        } else run = 0;
      }
    }
  });
  if (end.phase === 'won') won += 1;
  const t = end.tempo;
  if (!t) continue;
  if (new Set(t.plan).size !== t.plan.length) repeats += 1;
  for (const r of t.results) {
    months += 1;
    if ((hl.get(r.month) ?? 0) === 0) noHighlight += 1;
    if (r.done) goalsDone += 1;
    const x = goalByTheme.get(r.id) ?? [0, 0];
    x[0] += r.done ? 1 : 0;
    x[1] += 1;
    goalByTheme.set(r.id, x);
  }
  bonus += t.bonus;
  if (end.phase === 'won') bonusWon += t.bonus;
}
const pct = (a: number, b: number): string => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
console.log(`${bot} L${difficulty}${regime ? ` ${regime}` : ''}：${runs} 局，通关 ${pct(won, runs)}`);
console.log(`  主题重复的局 ${repeats}；打完的月份 ${months}，没有高光的月份 ${noHighlight}（${pct(noHighlight, months)}）`);
console.log(`  收盘平淡日 ${pct(quietClose, days)}，最长连续平淡 ${maxQuietRun} 天；盘前平淡 ${pct(quietPre, days)}`);
console.log(`  月度目标完成 ${pct(goalsDone, months)}；每局小奖励 + 目标奖励平均 ${Math.round(bonus / Math.max(1, runs))} 元（通关局平均 ${Math.round(bonusWon / Math.max(1, won))}）`);
console.log(`  各主题完成率：${[...goalByTheme].map(([id, [a, b]]) => `${id} ${pct(a, b)}(${b})`).join('，')}`);
