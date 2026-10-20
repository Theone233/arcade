/**
 * 模拟器：电脑对电脑打 N 局（种子 0..N-1），看一局打几回合、命中率、怎么结束的（血量掉光 / 掉出画本 / 打满回合）、各道具的使用率、电脑想一手要多久。
 * 加 ab：每种道具再打 N 局"全会的电脑"对"禁了这种道具的电脑"（单双局换边），看用和不用的胜率差（平局算半局）；
 * ab 最后还比一组"全会"对"什么道具都不用"。ab:none 只比这一组，ab:fork,lid 只比这几种。
 * 改了数值或电脑跑一遍，结果写进 README 的"数值"一节。
 * 用法：npm run sim [局数，默认 100] [ab | ab:none | ab:道具,道具]
 */
import { plan, planActions, type ItemKey, type PlanOpts } from '../src/ai/index.ts';
import { apply, newGame } from '../src/core/rules.ts';
import type { Setup, State, Team } from '../src/core/types.ts';

const n = Number(process.argv[2] ?? 100);
const ALL: ItemKey[] = ['double', 'triple', 'fork', 'boost', 'lid', 'plane'];
/** ab 比全部；ab:none 只比"全会"对"什么道具都不用"；ab:fork,lid 只比这几种 */
const abArg = process.argv[3] ?? '';
const groups: { name: string; ban: ItemKey[] }[] = !abArg.startsWith('ab')
  ? []
  : (abArg === 'ab' ? [...ALL, 'none'] : abArg.slice(3).split(',')).map((k) => (k === 'none' ? { name: '所有道具', ban: ALL } : { name: k, ban: [k as ItemKey] }));
const setup: Setup = {
  map: 'kitchen',
  players: [
    { name: '柴柴', team: 0, look: 'shiba', weapon: 'steamer', ai: true },
    { name: '橘子', team: 1, look: 'cat', weapon: 'steamer', ai: true },
  ],
};

interface Tally {
  games: number;
  turns: number;
  shots: number;
  hits: number;
  ends: { hp: number; fall: number; turns: number; draw: number };
  use: Record<string, number>;
  ms: number[];
  wins: [number, number];
  draws: number;
}

function play(seed: number, opts: [PlanOpts, PlanOpts], t: Tally): Team | null {
  let s: State = newGame([seed, 7, 7, 7, 7, 7, 7, 7], setup);
  let fell = false;
  while (s.phase === 'play') {
    const me = s.actor;
    const t0 = performance.now();
    const p = plan(s, opts[s.chars[me]!.team]);
    t.ms.push(performance.now() - t0);
    const l = p.loadout;
    const tag = l.plane ? ['plane'] : [...(l.mode !== 'single' ? [l.mode] : []), ...(l.boost ? [`boost${l.boost}`] : []), ...(l.lid ? ['lid'] : [])];
    for (const k of tag) t.use[k] = (t.use[k] ?? 0) + 1;
    t.use.turns = (t.use.turns ?? 0) + 1;
    for (const a of planActions(p)) {
      const r = apply(s, a);
      if (!r.ok) throw new Error(`第 ${seed} 局电脑出了不合法的一步：${r.error} ${JSON.stringify(a)}`);
      s = r.state;
      if (a.t === 'fire' && !a.plane) {
        t.shots++;
        if (r.events.some((e) => e.t === 'hurt' && e.id !== me)) t.hits++;
      }
      if (r.events.some((e) => e.t === 'out' && e.why === 'fall')) fell = true;
    }
  }
  t.games++;
  t.turns += s.turn;
  if (s.winner === null) t.ends.draw++;
  else if (s.endBy === 'turns') t.ends.turns++;
  else if (fell) t.ends.fall++;
  else t.ends.hp++;
  if (s.winner === null) t.draws++;
  else t.wins[s.winner]++;
  return s.winner;
}

const blank = (): Tally => ({ games: 0, turns: 0, shots: 0, hits: 0, ends: { hp: 0, fall: 0, turns: 0, draw: 0 }, use: {}, ms: [], wins: [0, 0], draws: 0 });
const pct = (a: number, b: number): string => `${b ? ((100 * a) / b).toFixed(0) : 0}%`;

const base = blank();
for (let g = 0; g < n; g++) play(g, [{}, {}], base);
base.ms.sort((a, b) => a - b);
const turns = base.use.turns ?? 1;
console.log(`${n} 局：平均 ${(base.turns / n).toFixed(1)} 回合；命中率 ${pct(base.hits, base.shots)}；先后手：蓝队赢 ${base.wins[0]}、黄队赢 ${base.wins[1]}、平 ${base.draws}`);
console.log(`怎么结束：掉出画本 ${base.ends.fall}（${pct(base.ends.fall, n)}），血量掉光 ${base.ends.hp}，打满回合 ${base.ends.turns}，平局 ${base.ends.draw}`);
console.log(
  `道具使用率（每回合）：${['double', 'triple', 'fork', 'boost10', 'boost20', 'boost50', 'lid', 'plane']
    .map((k) => `${({ double: '连发+1', triple: '连发+2', fork: '三岔', boost10: '加力10%', boost20: '加力20%', boost50: '加力50%', lid: '锅盖', plane: '纸飞机' } as Record<string, string>)[k]} ${pct(base.use[k] ?? 0, turns)}`)
    .join('，')}`,
);
console.log(`电脑想一手：中位 ${base.ms[Math.floor(base.ms.length / 2)]!.toFixed(0)} ms，最慢 ${base.ms[base.ms.length - 1]!.toFixed(0)} ms（Node，不降速）`);

for (const { name, ban } of groups) {
  const t = blank();
  let full = 0;
  for (let g = 0; g < n; g++) {
    const fullTeam: Team = g % 2 === 0 ? 0 : 1;
    const opts: [PlanOpts, PlanOpts] = fullTeam === 0 ? [{}, { ban: new Set(ban) }] : [{ ban: new Set(ban) }, {}];
    const w = play(g, opts, t);
    full += w === null ? 0.5 : w === fullTeam ? 1 : 0;
  }
  console.log(`会用 ${name} 的电脑对不会用的：胜率 ${pct(full, n)}（${n} 局，平均 ${(t.turns / n).toFixed(1)} 回合）`);
}
