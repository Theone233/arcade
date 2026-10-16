/**
 * 调电脑（开发用）：拿一组性格参数顶替某个座位，和其余固定的性格对跑，看平均名次。
 *   node scripts/tune.ts [场数=60]
 */
import { stream } from 'arcade-kit/rng';
import { PERSONAS, type Persona } from '../src/ai/personas.ts';
import { FIXED } from '../src/track/fixed.ts';
import { race } from '../test/helpers.ts';

const games = Number(process.argv[2] ?? 60);
const base = PERSONAS[5]!;
const grid: Partial<Persona>[] = [];
for (const heat of [0.5, 0.8, 1.1, 1.4])
  for (const spin of [6, 12])
    for (const ahead of [0.5, 1.2])
      for (const slip of [-2, -0.5]) grid.push({ heat, spin, ahead, slip });

const results: { p: Partial<Persona>; rank: number }[] = [];
const t0 = Date.now();
for (const p of grid) {
  (PERSONAS as Persona[])[5] = { ...base, ...p };
  let sum = 0;
  let n = 0;
  for (const t of FIXED)
    for (let g = 0; g < games; g++) {
      const rng = stream([g, 7, 1, 2, 3, 4, 5, 6], 'tune');
      const personas = [0, 1, 2, 3, 4, 5];
      for (let i = 5; i > 0; i--) {
        const j = rng.below(i + 1);
        [personas[i], personas[j]] = [personas[j]!, personas[i]!];
      }
      const { s } = race(5000 + g, { track: t.id, laps: 2, cars: 6, level: 'mix' }, personas);
      sum += s.finished.indexOf(personas.indexOf(5)) + 1;
      n++;
    }
  results.push({ p, rank: sum / n });
  console.log(JSON.stringify(p), (sum / n).toFixed(2), `${Math.round((Date.now() - t0) / 1000)}s`);
}
results.sort((a, b) => a.rank - b.rank);
console.log('\n最好的几组：');
for (const r of results.slice(0, 6)) console.log(JSON.stringify(r.p), r.rank.toFixed(2));
