/** 对阵 1v1 / 2v2 / 3v3（DESIGN.md 2.1）：两队交替，队内按座位轮，出局的跳过；一队全部出局就输；打满回合按全队剩余血量定 */
import { describe, expect, it } from 'vitest';
import { apply, MAX_HP, MAX_ROUNDS, newGame, roundLimit, setupError, supported, teamHp } from '../src/core/rules.ts';
import type { Ev, State, Team } from '../src/core/types.ts';
import { KEY, vs } from './helpers.ts';

/** 空过一手：没风，满力 70° 朝近的那条纸边打，高高飞出画本，谁也不伤、不挖坑（只为了换人） */
function passStep(s: State): { state: State; events: Ev[] } {
  s.wind = 0;
  const r = apply(s, { t: 'fire', angle: 70, power: 100, facing: s.chars[s.actor]!.x < 1500 ? -1 : 1 });
  if (!r.ok) throw new Error(r.error);
  expect(r.events.some((e) => e.t === 'boom')).toBe(false);
  return r;
}
const pass = (s: State): State => passStep(s).state;

/** 让 id 不在场上：直接标出局（测试轮转用，不走伤害） */
function knock(s: State, id: number): void {
  s.chars[id]!.out = true;
}

describe('3v3 轮转', () => {
  it('两队交替，队内按座位 1、2、3 轮', () => {
    for (const key of [KEY, [9, 9, 9, 9, 9, 9, 9, 9]]) {
      let s = newGame(key, vs(3));
      const first = s.chars[s.actor]!.team;
      const order: number[] = [];
      for (let i = 0; i < 12; i++) {
        order.push(s.actor);
        s = pass(s);
      }
      // 先手队的 1 号先出手；蓝队座位是 0、1、2，黄队是 3、4、5
      const a = first === 0 ? [0, 1, 2] : [3, 4, 5];
      const b = first === 0 ? [3, 4, 5] : [0, 1, 2];
      expect(order).toEqual([a[0], b[0], a[1], b[1], a[2], b[2], a[0], b[0], a[1], b[1], a[2], b[2]]);
    }
  });

  it('出局的跳过：队里剩几个就在这几个里轮', () => {
    let s = newGame(KEY, vs(3));
    // 先让非当前出手的蓝 2 号出局
    const other = s.chars[s.actor]!.team === 0 ? 4 : 1;
    knock(s, other);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(s.actor);
      s = pass(s);
    }
    expect(seen).not.toContain(other);
    const team = s.chars[other]!.team;
    const mates = seen.filter((id) => s.chars[id]!.team === team);
    // 剩下的两个轮流
    for (let i = 1; i < mates.length; i++) expect(mates[i]).not.toBe(mates[i - 1]);
    // 两队还是交替
    for (let i = 1; i < seen.length; i++) expect(s.chars[seen[i]!]!.team).not.toBe(s.chars[seen[i - 1]!]!.team);
  });

  it('一队只剩一个：他每隔一回合出手一次', () => {
    let s = newGame(KEY, vs(3));
    const t: Team = s.chars[s.actor]!.team === 0 ? 1 : 0;
    const ids = s.chars.filter((c) => c.team === t).map((c) => c.id);
    knock(s, ids[0]!);
    knock(s, ids[2]!);
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(s.actor);
      s = pass(s);
    }
    expect(seen.filter((_, i) => i % 2 === 1)).toEqual([ids[1], ids[1], ids[1], ids[1]]);
  });

  it('一队全部出局就输', () => {
    const s = newGame(KEY, vs(3));
    const me = s.chars[s.actor]!;
    const foes = s.chars.filter((c) => c.team !== me.team);
    knock(s, foes[0]!.id);
    knock(s, foes[1]!.id);
    // 最后一个对手站在一块马上就要被挖空的地上：直接把他脚下挖到底（模拟），出手以后结算
    const last = foes[2]!;
    for (let y = last.y; y < 780; y += 2) for (let dx = -12; dx <= 12; dx += 2) s.terrain.cells[Math.floor(y / 4) * s.terrain.cols + Math.floor((last.x + dx) / 4)] = 0;
    expect(supported(s.terrain, last.x, last.y)).toBe(false);
    const r = passStep(s);
    expect(r.events).toContainEqual({ t: 'out', id: last.id, why: 'fall' });
    expect(r.state.phase).toBe('over');
    expect(r.state.winner).toBe(me.team);
    expect(r.state.endBy).toBe('wipe');
  });

  it(`打满 ${MAX_ROUNDS} 轮按全队剩余血量的总和定（出局的不算）`, () => {
    const s = newGame(KEY, vs(3));
    // 第 15 轮，除了当前出手的人都出过手了
    s.round = MAX_ROUNDS;
    s.acted = s.chars.filter((c) => c.id !== s.actor).map((c) => c.id);
    // 蓝队 3 个各 100 = 300；黄队 2 个满血 + 1 个出局 = 360
    for (const c of s.chars) if (c.team === 0) c.hp = 100;
    knock(s, 5);
    expect(teamHp(s, 0)).toBe(300);
    expect(teamHp(s, 1)).toBe(2 * MAX_HP);
    const r = passStep(s);
    expect(r.state.phase).toBe('over');
    expect(r.state.endBy).toBe('turns');
    expect(r.state.winner).toBe(1);
  });

  it('一轮 = 还活着的每个人各出手一次：1v1 两手、3v3 六手；打满几轮可以在开局设置里改（模拟器用）', () => {
    expect(roundLimit(vs(1))).toBe(MAX_ROUNDS);
    let s = newGame(KEY, vs(1, { maxRounds: 3 }));
    const rounds: number[] = [];
    for (let i = 0; i < 6; i++) {
      rounds.push(s.round);
      s = pass(s);
    }
    expect(rounds).toEqual([1, 1, 2, 2, 3, 3]);
    expect(s.phase).toBe('over');
    expect(s.endBy).toBe('turns');
    expect(s.turn).toBe(6);
    let t = newGame(KEY, vs(3));
    for (let i = 0; i < 6; i++) t = pass(t);
    expect(t.round).toBe(2);
    expect(t.turn).toBe(7);
  });

  it('人数不一样多：人少的那队轮得快，等人多的那队每人都出过手才算一轮；出局的不用等', () => {
    let s = newGame(KEY, vs(3));
    const first = s.chars[s.actor]!.team;
    // 后手队只剩 1 个：先手队 3 个各出一次就够一轮，中间夹着后手那 1 个出手 2 次（共 5 手：先、后、先、后、先）
    const other = s.chars.filter((c) => c.team !== first);
    knock(s, other[1]!.id);
    knock(s, other[2]!.id);
    const seen: number[] = [];
    while (s.round === 1) {
      seen.push(s.actor);
      s = pass(s);
    }
    expect(seen).toHaveLength(5);
    expect(seen.filter((id) => id === other[0]!.id)).toHaveLength(2);
    // 第 2 轮当中先手队又出局一个：只等剩下的人
    knock(s, s.chars.find((c) => c.team === first && c.id !== s.actor)!.id);
    let n = 0;
    while (s.round === 2) {
      n++;
      s = pass(s);
    }
    expect(n).toBe(4);
  });
});

describe('开局设置', () => {
  it('1v1、2v2、3v3 都合法；人数不一样也行（每队 1–3）', () => {
    for (const n of [1, 2, 3]) expect(setupError(vs(n))).toBeNull();
    const two = vs(2);
    expect(setupError({ ...two, players: two.players.slice(0, 3) })).toBeNull();
  });

  it('不合法的设置', () => {
    const ok = vs(1);
    expect(setupError(null)).toBe('setup');
    expect(setupError({ ...ok, map: 'moon' })).toBe('map');
    expect(setupError({ ...ok, players: [ok.players[0]!] })).toBe('size');
    const four = [...vs(3).players, { name: 'x', team: 0 as const, look: 'cat' as const, weapon: 'steamer' as const, ai: true }];
    expect(setupError({ ...ok, players: four })).toBe('size');
    expect(setupError({ ...ok, players: [{ ...ok.players[0]!, weapon: 'sword' }, ok.players[1]!] })).toBe('weapon');
    expect(setupError({ ...ok, players: [{ ...ok.players[0]!, look: 'dragon' }, ok.players[1]!] })).toBe('look');
    expect(setupError({ ...ok, players: [{ ...ok.players[0]!, team: 2 }, ok.players[1]!] })).toBe('team');
    expect(setupError({ ...ok, players: [{ ...ok.players[0]!, name: '' }, ok.players[1]!] })).toBe('name');
    expect(setupError({ ...ok, maxRounds: 0 })).toBe('rounds');
    expect(() => newGame(KEY, { ...ok, map: 'moon' as never })).toThrow();
  });

  it('3v3 开局：6 个人都站在地面上，满血，朝着最近的对手', () => {
    const s = newGame(KEY, vs(3));
    expect(new Set(s.chars.map((c) => c.x)).size).toBe(6);
    for (const c of s.chars) {
      expect(supported(s.terrain, c.x, c.y)).toBe(true);
      expect(c.hp).toBe(MAX_HP);
      const near = s.chars.filter((o) => o.team !== c.team).sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0]!;
      expect(c.facing).toBe(near.x < c.x ? -1 : 1);
    }
  });
});
