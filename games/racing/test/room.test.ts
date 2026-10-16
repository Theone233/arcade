/** 好友房的规则（src/room/rules.ts）：开局、谁该出手、超时、换人、跑完等"再来一场"、快照大小。 */
import { snapshotBytes } from 'arcade-kit/game';
import { describe, expect, it } from 'vitest';
import { racingRoom as R, REMATCH_MS, TURN_MS, type RoomAction, type RoomState } from '../src/room/rules.ts';
import { keyOf } from './helpers.ts';

const OPTS = { track: 'hillcity', laps: 1, cars: 4, level: 'mix' as const };

function start(seats = ['human', 'ai', 'human', 'ai'] as const): RoomState {
  return R.begin!(keyOf(5), 1, { opts: OPTS, seats: [...seats, 'empty', 'empty'] });
}

function act(s: RoomState, seat: number, a: RoomAction): RoomState {
  const r = R.apply(s, seat, a);
  if ('error' in r) throw new Error(r.error);
  return r;
}

/** 让电脑（和真人）都按电脑的选法出，直到 done */
function run(s: RoomState, done: (s: RoomState) => boolean): RoomState {
  for (let i = 0; i < 5_000 && !done(s); i++) {
    const who = R.actors!(s);
    const seats = Array.isArray(who) ? who : who.seats;
    if (seats.length === 0) break;
    s = act(s, seats[0]!, R.ai(s, seats[0]!));
  }
  return s;
}

describe('好友房规则', () => {
  it('选项校验、座位数跟着车数', () => {
    expect(R.options!({ track: 'harbor', laps: 2, cars: 3, level: 'hard' })).not.toBeNull();
    expect(R.options!({ track: 'harbor', laps: 2, cars: 9, level: 'hard' })).toBeNull();
    expect(R.seatCount!(R.options!({ track: 'harbor', laps: 2, cars: 3, level: 'hard' })!)).toBe(3);
  });

  it('开局：真人座位没有性格，电脑座位各有一个', () => {
    const s = start();
    expect(s.g.kinds).toEqual(['human', 'ai', 'human', 'ai']);
    expect(s.g.personas[0]).toBe(-1);
    expect(s.g.personas[1]).toBeGreaterThanOrEqual(0);
    expect(s.g.cars.length).toBe(4);
  });

  it('交计划是一组人，亮牌后一次一辆车', () => {
    const s = start();
    const who = R.actors!(s) as { seats: number[]; group: string };
    expect(who.seats.sort()).toEqual([0, 1, 2, 3]);
    expect(who.group).toBe('plan-1');
    expect(R.turnMs!(s)).toBe(TURN_MS.plan);
  });

  it('超时：交计划由电脑替他选，问题按"不"', () => {
    let s = start();
    expect((R.timeout!(s, 0) as { a: { t: string } }).a.t).toBe('plan');
    s = run(s, (x) => x.g.phase === 'act');
    if (s.g.phase === 'act' && s.g.ask) {
      const t = R.timeout!(s, s.g.order[s.g.at]!) as { a: { t: string; yes?: boolean; cards?: number[] } };
      expect(t.a.t).toBe(s.g.ask);
      if (s.g.ask === 'discard') expect(t.a.cards).toEqual([]);
      else expect(t.a.yes).toBe(false);
    }
  });

  it('跑完停 3 分钟等"再来一场"，有人开了新房间就算打完', () => {
    let s = start();
    s = run(s, (x) => x.g.phase === 'over');
    expect(s.g.phase).toBe('over');
    expect(R.over(s)).toBe(false);
    expect(R.pause!(s)).toBe(REMATCH_MS);
    expect(R.apply(s, 1, { t: 'next', code: '123456' })).toEqual({ error: 'not_seated' });
    const n = act(s, 0, { t: 'next', code: '123456' });
    expect(R.over(n)).toBe(true);
    expect(R.view(n, 2).next).toEqual({ code: '123456', by: 0 });
    expect(R.over(R.resume!(s))).toBe(true);
    expect(R.parse({ t: 'next', code: '12345' })).toBeNull();
  });

  it('离座交给电脑：规则那边改成电脑', () => {
    const s = start();
    expect(R.seated!(s, 0, 'ai').g.kinds[0]).toBe('ai');
  });

  it('快照不超过 8 KB', () => {
    let s = R.begin!(keyOf(6), 1, { opts: { ...OPTS, cars: 6, laps: 3 }, seats: Array(6).fill('human') });
    let max = snapshotBytes(R, s);
    s = run(s, (x) => x.g.round > 8);
    max = Math.max(max, snapshotBytes(R, s));
    expect(max).toBeLessThan(8_000);
  });
});
