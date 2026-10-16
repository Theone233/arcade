/**
 * 模拟器（DESIGN.md 5.3、5.4）：全电脑对跑，量一场多少回合、打滑和熄火多不多、每个性格平均第几名。
 *
 *   node scripts/sim.ts [场数=200] [赛道=全部] [圈数=2]
 */
import { stream } from 'arcade-kit/rng';
import { PERSONAS } from '../src/ai/personas.ts';
import { FIXED } from '../src/track/fixed.ts';
import { race } from '../test/helpers.ts';

const games = Number(process.argv[2] ?? 200);
const only = process.argv[3];
const laps = Number(process.argv[4] ?? 2);
const P = PERSONAS.length;

for (const t of FIXED) {
  if (only && only !== 'all' && t.id !== only) continue;
  const rounds: number[] = [];
  let spins = 0;
  let stalls = 0;
  let boosts = 0;
  let slips = 0;
  let heat = 0;
  const rankSum = Array(P).fill(0);
  const wins = Array(P).fill(0);
  const seen = Array(P).fill(0);
  for (let g = 0; g < games; g++) {
    // 六个性格每场换座位（也就换了发车位置）
    const rng = stream([g, 99, 1, 2, 3, 4, 5, 6], 'sim');
    const personas = PERSONAS.map((_, i) => i);
    for (let i = personas.length - 1; i > 0; i--) {
      const j = rng.below(i + 1);
      [personas[i], personas[j]] = [personas[j]!, personas[i]!];
    }
    const { s } = race(1000 + g, { track: t.id, laps, cars: 6, level: 'mix' }, personas);
    rounds.push(s.round);
    for (const c of s.cars) {
      spins += c.stats.spins;
      stalls += c.stats.stalls;
      boosts += c.stats.boosts;
      slips += c.stats.slips;
      heat += c.stats.heat;
    }
    s.finished.forEach((seat, rank) => {
      const p = personas[seat]!;
      rankSum[p] += rank + 1;
      seen[p]++;
      if (rank === 0) wins[p]++;
    });
  }
  rounds.sort((a, b) => a - b);
  const q = (f: number): number => rounds[Math.min(rounds.length - 1, Math.floor(f * rounds.length))]!;
  const per = games * 6;
  console.log(`\n${t.name}（${t.id}）${laps} 圈 × ${games} 场`);
  console.log(`  回合 p10/p50/p90：${q(0.1)} / ${q(0.5)} / ${q(0.9)}`);
  console.log(`  每车每场：打滑 ${(spins / per).toFixed(2)}，熄火 ${(stalls / per).toFixed(2)}，冲刺 ${(boosts / per).toFixed(1)}，尾流 ${(slips / per).toFixed(1)}，付热量 ${(heat / per).toFixed(1)}`);
  console.log(
    '  平均名次（胜率）：' +
      PERSONAS.map((p, i) => `${p.name} ${(rankSum[i] / seen[i]).toFixed(2)}（${Math.round((100 * wins[i]) / seen[i])}%）`).join('，'),
  );
}
