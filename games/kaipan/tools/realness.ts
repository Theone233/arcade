/**
 * 0.5 验收：游戏里的个股 / 大盘逐日涨跌与背后真实股票 / 真实大盘的相似度（另报剔除涨跌停截断日后的统计）。
 *   node tools/realness.ts [--amp 1.5] [--bot normal]
 */
import { BALANCE } from '../src/core/balance.ts';
import { botByName, playRun, useMarket } from './bots.ts';
import { loadSegment, segmentIndex } from './segments-disk.ts';

const argOf = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
if (argOf('amp')) BALANCE.track.amp = Number(argOf('amp'));
const botName = argOf('bot') ?? 'normal';

function corr(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 5) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i] as number;
    mb += b[i] as number;
  }
  ma /= n;
  mb /= n;
  let c = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    c += x * y;
    va += x * x;
    vb += y * y;
  }
  return c / Math.sqrt(va * vb);
}
const med = (a: number[]): number => {
  const b = a.filter(Number.isFinite).sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)] ?? NaN;
};
const mean = (a: number[]): number => {
  const b = a.filter(Number.isFinite);
  return b.reduce((x, y) => x + y, 0) / Math.max(1, b.length);
};

const all: number[] = [];
const unclipped: number[] = [];
const mkt: number[] = [];
let days = 0;
let clipped = 0;
for (const e of segmentIndex().segments) {
  const seg = loadSegment(e.id);
  useMarket(() => seg);
  const g: Record<string, number[]> = {};
  const r: Record<string, number[]> = {};
  const gu: Record<string, number[]> = {};
  const ru: Record<string, number[]> = {};
  const gm: number[] = [];
  const rm: number[] = [];
  playRun(`realness-${e.id}`, botByName(botName), null, (st, evs) => {
    for (const ev of evs) {
      if (ev.type !== 'dayClosed' || !st.real) continue;
      const rep = ev.report;
      const i = Math.min(st.real.warm + rep.day, st.real.market.length - 1);
      for (const m of rep.stocks) {
        const rr = st.real.stocks[m.id]?.r[i];
        if (rr === undefined) continue;
        (g[m.id] ??= []).push(m.move);
        (r[m.id] ??= []).push(rr / 100);
        days += 1;
        if (m.limitUp || m.limitDown) clipped += 1;
        else {
          (gu[m.id] ??= []).push(m.move);
          (ru[m.id] ??= []).push(rr / 100);
        }
      }
      gm.push(rep.market.ret);
      rm.push((st.real.market[i] ?? 0) / 100);
    }
  });
  for (const id of Object.keys(g)) {
    if ((g[id]?.length ?? 0) < 20) continue;
    all.push(corr(g[id] as number[], r[id] as number[]));
    if ((gu[id]?.length ?? 0) >= 20) unclipped.push(corr(gu[id] as number[], ru[id] as number[]));
  }
  if (gm.length > 20) mkt.push(corr(gm, rm));
}
console.log(`放大系数 ${BALANCE.track.amp}，机器人 ${botName}，${segmentIndex().segments.length} 段`);
console.log(`个股逐日相关（全部天）中位 ${med(all).toFixed(3)} 均值 ${mean(all).toFixed(3)}，样本 ${all.length} 只`);
console.log(`个股逐日相关（剔除涨跌停截断日）中位 ${med(unclipped).toFixed(3)} 均值 ${mean(unclipped).toFixed(3)}；截断日占 ${((clipped / Math.max(1, days)) * 100).toFixed(1)}%`);
console.log(`大盘逐日相关 中位 ${med(mkt).toFixed(3)} 均值 ${mean(mkt).toFixed(3)}`);
