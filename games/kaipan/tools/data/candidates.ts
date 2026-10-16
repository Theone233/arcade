/**
 * 辅助：列出某年补股候选（按日均成交额、波动率排序），并标出 sectors.ts 里还没有行业的代码。
 * 扩展新年份时先跑它，把缺行业的候选补进 sectors.ts，再跑 build.ts。
 *
 *   node tools/data/candidates.ts --year 1999 [--top 400] [--missing]
 */
import { arg, flag } from './common.ts';
import { loadYear } from './clean.ts';
import { sectorOf } from './sectors.ts';
import { metrics } from './pool.ts';

const year = Number(arg('year', '1999'));
const top = Number(arg('top', '400'));
const data = loadYear(year);
const ms = metrics(data).filter((m) => m.days >= 20);
ms.sort((a, b) => b.dollarVol - a.dollarVol);
const rows = ms.slice(0, top);
const byVol = [...ms].filter((m) => m.dollarVol >= 5e6).sort((a, b) => b.vol - a.vol).slice(0, 80);
const seen = new Set<string>();
const show = flag('missing');
console.log(`# ${year} 候选（日均成交额前 ${top} + 成交额 ≥ 500 万美元中波动率前 80）`);
for (const m of [...rows, ...byVol]) {
  if (seen.has(m.ticker)) continue;
  seen.add(m.ticker);
  const sec = sectorOf(m.ticker, year);
  if (show && sec !== undefined) continue;
  console.log(
    [m.ticker, sec ?? '?', `$${(m.dollarVol / 1e6).toFixed(1)}M`, `vol=${(m.vol * 100).toFixed(0)}%`, `ret=${(m.ret * 100).toFixed(0)}%`, `days=${m.days}`, `px=${m.lastClose}`].join('\t'),
  );
}
