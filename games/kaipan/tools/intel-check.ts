/**
 * 0.5 情报准确率实测：每个群友的消息说中率（按真实未来揭晓），推荐股票接下来 days 天的平均真实涨跌（放大后）。
 *   node tools/intel-check.ts [--difficulty 1] [--runs 135]
 */
import { createRun, dispatch, forwardRet, type GameState } from '../src/core/index.ts';
import { loadSegment, segmentIndex } from './segments-disk.ts';

const argOf = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const difficulty = Number(argOf('difficulty') ?? 1);
const runs = Number(argOf('runs') ?? 135);
const ids = segmentIndex().segments.map((e) => e.id);
const msg = new Map<string, [number, number]>();
const rec = new Map<string, [number, number, number]>();
for (let k = 0; k < runs; k++) {
  const seg = loadSegment(ids[k % ids.length] as string);
  let s: GameState = createRun(`intel-${k}`, { account: 1e9, difficulty }, { segment: seg, ext: true }).state;
  const noteRecs = (st: GameState): void => {
    if (!st.real || st.phase !== 'premarket') return;
    for (const r of st.today.recs) {
      const x = rec.get(r.friendId) ?? [0, 0, 0];
      const f = forwardRet(st.real, 'stock', r.stockId, st.today.day, r.days ?? 1) * (r.short ? -1 : 1);
      x[0] += f;
      x[1] += 1;
      x[2] += f > 0 ? 1 : 0;
      rec.set(r.friendId, x);
    }
  };
  noteRecs(s);
  for (let i = 0; i < 400 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    const a = s.phase === 'premarket' ? { type: 'open' as const } : s.phase === 'reward' ? { type: 'skipReward' as const } : { type: 'choose' as const, option: 1 };
    const r = dispatch(s, a, { inPlace: true });
    s = r.state;
    for (const e of r.events) {
      if (e.type !== 'messageJudged' && e.type !== 'intelJudged') continue;
      const x = msg.get(e.friendId) ?? [0, 0];
      x[0] += e.hit ? 1 : 0;
      x[1] += 1;
      msg.set(e.friendId, x);
    }
    noteRecs(s);
  }
}
console.log(`第 ${difficulty} 级，${runs} 局（三选一方向，瞎猜 33%）`);
for (const id of [...new Set([...msg.keys(), ...rec.keys()])]) {
  const m = msg.get(id) ?? [0, 0];
  const r = rec.get(id) ?? [0, 0, 0];
  console.log(`  ${id.padEnd(9)} 消息说中 ${((m[0] / Math.max(1, m[1])) * 100).toFixed(0)}%（${m[1]} 条）  推荐接下来平均 ${(r[0] / Math.max(1, r[1])).toFixed(2)}pp、赚钱 ${((r[2] / Math.max(1, r[1])) * 100).toFixed(0)}%（${r[1]} 只）`);
}
