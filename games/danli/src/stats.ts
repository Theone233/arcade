/**
 * 结算页的统计（设计稿 v2-result）：每个人打出的伤害、命中几发 / 出手几发、轰出画本几人、最后怎样（剩多少血 / 掉出画本 / 血量打空）。
 * 规则核心不记这些，这里拿存档（种子 + 开局设置 + 操作）从头重放一遍，按事件累计：
 * - 伤害：这一手里对方挨的血（自己、队友挨的不算），算给出手的人；摔下来扣的血也算（是他炸塌的）；
 * - 命中：这一手扔出去几颗（连发、三岔每颗都算，纸飞机不算），其中几颗炸伤了对方；
 * - 轰出画本：这一手里对方掉出画本出局的人数。
 * 读档、跳到结果也一样能算（同一个种子加同一串操作，结果完全一样）；好友房按房间下发的开局和每一回合重放（statsFrom）。
 */
import { apply, newGame } from './core/rules.ts';
import type { Action, Ev, Setup, State, Team } from './core/types.ts';
import type { Entropy } from 'arcade-kit/rng';

export interface PlayerStats {
  id: number;
  dmg: number;
  shots: number;
  hits: number;
  kos: number;
  /** alive：没出局（hp 是剩的血）；fall：掉出画本；hp：血量打空 */
  end: 'alive' | 'fall' | 'hp';
  hp: number;
}

export interface GameStats {
  players: PlayerStats[];
  /** 掉出画本、血量打空各几人 */
  falls: number;
  busts: number;
  state: State;
}

export function computeStats(key: Entropy, setup: Setup, log: readonly Action[]): GameStats {
  return statsFrom(newGame(key, setup), log.map((a) => ({ actions: [a] })));
}

/**
 * 从某个开局按一手一手的操作重放（好友房：页面没有种子，开局和每回合的风由房间给，见 net/replay.ts）。
 * wind 给了就把下一回合的风换成它
 */
export function statsFrom(start: State, turns: readonly { actions: readonly Action[]; wind?: number }[]): GameStats {
  let s = start;
  const ps: PlayerStats[] = s.chars.map((c) => ({ id: c.id, dmg: 0, shots: 0, hits: 0, kos: 0, end: 'alive', hp: c.hp }));
  out: for (const t of turns) {
    for (const a of t.actions) {
      const r = apply(s, a);
      if (!r.ok) break out;
      const me = s.chars[s.actor]!;
      if (a.t === 'fire') tally(ps[me.id]!, me.team, s, r.events);
      for (const e of r.events) if (e.t === 'out') ps[e.id]!.end = e.why;
      s = r.state;
    }
    if (t.wind !== undefined && s.phase === 'play') s = { ...s, wind: t.wind };
  }
  for (const p of ps) p.hp = s.chars[p.id]!.hp;
  return { players: ps, falls: ps.filter((p) => p.end === 'fall').length, busts: ps.filter((p) => p.end === 'hp').length, state: s };
}

/** 一手的事件：每个 shot 事件里的每一颗，看它后面到下一颗之前有没有炸伤对方 */
function tally(p: PlayerStats, team: Team, before: State, events: readonly Ev[]): void {
  const foe = (id: number): boolean => before.chars[id]!.team !== team;
  let plane = false;
  // 一颗炸了以后的伤害算给它；三岔三颗同时飞，按 boom 的先后一颗一颗算
  let open = false;
  let hit = false;
  const close = (): void => {
    if (open && hit) p.hits++;
    open = false;
    hit = false;
  };
  for (const e of events) {
    if (e.t === 'fire') plane = e.loadout.plane;
    else if (e.t === 'shot' && !plane) p.shots += e.flights.length;
    else if (e.t === 'boom') {
      close();
      open = true;
    } else if (e.t === 'hurt' && foe(e.id)) {
      p.dmg += e.dmg;
      hit = true;
    } else if (e.t === 'out' && e.why === 'fall' && foe(e.id)) p.kos++;
  }
  close();
}
