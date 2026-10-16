/**
 * 生成翻牌前胜率表 src/ai/preflop-table.ts（DESIGN.md 3.4）。用法：npm run gen:preflop
 * 固定种子（arcade-kit/rng），结果可复现。
 */
import { writeFileSync } from 'node:fs';
import { stream } from 'arcade-kit/rng';
import { equity } from '../src/ai/equity.ts';
import { classCards, PREFLOP_OPP } from '../src/ai/preflop.ts';

const ITERS = 30_000;
const SEED = [1, 2, 3, 4, 5, 6, 7, 8];
const out: number[] = [];
for (let k = 0; k < 169; k++) {
  const [a, b] = classCards(k);
  // 序号 k × 8 + opp：opp 1–5 和扩表前一样（那几格的数一位不变），8 个对手落在余数 0 上，也不重
  for (let opp = 1; opp <= PREFLOP_OPP; opp++) out.push(equity([a, b], [], opp, ITERS, stream(SEED, 'preflop', k * 8 + opp)));
}
const rows: string[] = [];
for (let i = 0; i < out.length; i += 13 * PREFLOP_OPP) rows.push('  ' + out.slice(i, i + 13 * PREFLOP_OPP).join(', ') + ',');
writeFileSync(
  new URL('../src/ai/preflop-table.ts', import.meta.url),
  `/** 由 scripts/gen-preflop.ts 生成，不要手改。169 类 × 1–${PREFLOP_OPP} 个对手的胜率千分数（类别见 preflop.ts 的 handClass） */\n` +
    `// prettier-ignore\nexport const PREFLOP: readonly number[] = [\n${rows.join('\n')}\n];\n`,
);
console.log(`preflop table: ${out.length} entries, ${ITERS} iters each`);
