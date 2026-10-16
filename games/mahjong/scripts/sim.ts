/**
 * 模拟器（DESIGN.md 4.1）：全是电脑打 N 场，量"一场多久、输赢多大、碰不碰封顶"和各性格的强弱。
 * 用法：npm run sim [每档场数，默认 2000]。座位 0 当作"真人"算时长：他的每个决定按 3 秒，电脑按 1.2 秒，
 * 换三张、定缺各 6 秒，一局结算 8 秒。
 */
import { stream } from 'arcade-kit/rng';
import { pickPersonas, PERSONAS } from '../src/ai/personas.ts';
import { sichuanXuezhan as XZ, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { runAuto } from '../src/game/driver.ts';
import { baseOf, STAKES } from '../src/game/stakes.ts';

const N = Number(process.argv[2] ?? 2000);
const KINDS = ['ai', 'ai', 'ai', 'ai'] as const;
const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))]!;

for (const tier of STAKES.filter((x) => x.id !== 'fun')) {
  const base = baseOf(tier.share);
  const nets: number[] = [];
  const mins: number[] = [];
  const rounds: number[] = [];
  let lossCap = 0;
  let winCap = 0;
  const byPersona = new Map<number, { n: number; net: number; pao: number; wins: number; fan: number }>();
  const fanHist = new Array<number>(6).fill(0);
  for (let i = 0; i < N; i++) {
    const key = [i, tier.share, 7, 7, 7, 7, 7, 7];
    const personas = pickPersonas(stream(key, 'persona'), tier.level, 4);
    let s = XZ.begin(key, XZ.defaults, KINDS, { share: tier.share, base, personas }) as XzState;
    let human = 0;
    let other = 0;
    for (;;) {
      for (const st of runAuto(XZ, s, KINDS, 5_000)) {
        if (st.seat === 0) human++;
        else other++;
        s = st.state as XzState;
      }
      if (XZ.over(s)) break;
      s = XZ.resume(s);
    }
    const r = XZ.result(s);
    const secs = human * 3 + other * 1.2 + s.history.length * (8 + 12);
    mins.push(secs / 60);
    rounds.push(s.history.length);
    nets.push(r.seats[0]!.net / tier.share);
    if (s.chips[0]! <= 0) lossCap++;
    if (s.chips[0]! >= tier.share * 4) winCap++;
    s.personas.forEach((p, seat) => {
      const b = byPersona.get(p) ?? { n: 0, net: 0, pao: 0, wins: 0, fan: 0 };
      b.n++;
      b.net += r.seats[seat]!.net / tier.share;
      b.pao += s.stats[seat]!.pao;
      b.wins += s.stats[seat]!.wins;
      byPersona.set(p, b);
    });
    for (const h of s.history) for (const w of h.wins) fanHist[w.fan]!++;
  }
  const abs = nets.map(Math.abs);
  console.log(`\n== ${tier.id}（一份 ${tier.share}，底分 ${base}）${N} 场`);
  console.log(`时长（分钟）p10 ${pct(mins, 10).toFixed(1)} p50 ${pct(mins, 50).toFixed(1)} p90 ${pct(mins, 90).toFixed(1)}；局数 p50 ${pct(rounds, 50)}`);
  console.log(`座位 0 净输赢（份）p10 ${pct(nets, 10).toFixed(2)} p50 ${pct(nets, 50).toFixed(2)} p90 ${pct(nets, 90).toFixed(2)}；|输赢| p50 ${pct(abs, 50).toFixed(2)} p90 ${pct(abs, 90).toFixed(2)}`);
  console.log(`输光 ${((lossCap / N) * 100).toFixed(1)}%，赢满 3 份 ${((winCap / N) * 100).toFixed(1)}%`);
  const totalWins = fanHist.reduce((a, b) => a + b, 0);
  console.log(`胡牌番数分布：${fanHist.map((x, i) => `${i} 番 ${((x / totalWins) * 100).toFixed(0)}%`).join('，')}`);
  for (const [p, b] of [...byPersona.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${PERSONAS[p]!.name.padEnd(4, '　')} ${String(b.n).padStart(5)} 场  每场 ${(b.net / b.n >= 0 ? '+' : '') + (b.net / b.n).toFixed(3)} 份  胡 ${(b.wins / b.n).toFixed(2)}  点炮 ${(b.pao / b.n).toFixed(2)}`);
  }
}
