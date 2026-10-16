import { describe, expect, test } from 'vitest';
import { snapshotBytes } from 'arcade-kit/game';
import { sichuanXuezhan as XZ, view, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { wallLeft } from '../src/core/table/index.ts';
import { runAuto } from '../src/game/driver.ts';
import type { SeatKind } from '../src/core/variants/types.ts';

const ALL_AI: SeatKind[] = ['ai', 'ai', 'ai', 'ai'];
const SETUP = { share: 2_000, base: 40, personas: [0, 1, 2, 4] };

/** 全是电脑打完一场；每一步检查：牌一张不多一张不少、筹码总数不变 */
export function playMatch(key: number[], opts = XZ.defaults, check?: (s: XzState) => void): XzState {
  let s = XZ.begin(key, opts, ALL_AI, SETUP) as XzState;
  for (let guard = 0; guard < 100; guard++) {
    for (const step of runAuto(XZ, s, ALL_AI, 2_000)) {
      check?.(step.state as XzState);
      s = step.state as XzState;
    }
    if (XZ.over(s)) return s;
    expect(XZ.pause(s)).not.toBeNull();
    s = XZ.resume(s);
  }
  throw new Error('match did not finish');
}

function tilesConserved(s: XzState): void {
  if (s.phase === 'over' || s.phase === 'end') return;
  let n = wallLeft(s.wall);
  for (const p of s.players) {
    n += p.hand.length + p.melds.reduce((a, m) => a + m.tiles.length, 0) + p.river.filter((r) => !r.taken).length;
    // 胡了的人手里含胡的那张；点炮的那张在弃牌里记成 taken，所以不重复算
  }
  // 一炮多响：同一张算进了几个胡家的手里，多出来的减掉
  const extra = s.players.filter((p) => p.won && p.won.from !== null).length;
  const groups = new Map<string, number>();
  for (const p of s.players) if (p.won && p.won.from !== null) groups.set(`${p.won.from}-${p.won.tile}`, (groups.get(`${p.won.from}-${p.won.tile}`) ?? 0) + 1);
  const dup = [...groups.values()].reduce((a, x) => a + x - 1, 0);
  expect(n - dup, `phase ${s.phase} extra ${extra}`).toBe(108);
}

describe('一整场（全是电脑）', () => {
  test('打得完，筹码总数不变，牌不多不少', () => {
    for (let i = 0; i < 20; i++) {
      const s = playMatch([i, 7, 7, 7, 7, 7, 7, 7], XZ.defaults, (x) => {
        expect(x.chips.reduce((a, b) => a + b, 0)).toBe(8_000);
        expect(x.chips.every((c) => c >= 0)).toBe(true);
        tilesConserved(x);
      });
      expect(s.phase).toBe('over');
      expect(s.history.length).toBeGreaterThan(0);
    }
  });

  test('同一把密钥、同一串操作，结果完全一样', () => {
    const a = playMatch([9, 9, 9, 9, 1, 2, 3, 4]);
    const b = playMatch([9, 9, 9, 9, 1, 2, 3, 4]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = playMatch([9, 9, 9, 9, 1, 2, 3, 5]);
    expect(JSON.stringify(c.history)).not.toBe(JSON.stringify(a.history));
  });

  test('各种选项都能打完', () => {
    for (const o of [
      { rounds: 4, cap: 3, swap: false, zimo: 'fan', transfer: false },
      { rounds: 16, cap: 5, swap: true, zimo: 'di', transfer: true },
    ] as const) {
      const s = playMatch([3, 1, 4, 1, 5, 9, 2, 6], o);
      expect(s.phase).toBe('over');
    }
  });

  test('视图里没有别人的手牌、牌墙和密钥；快照不超过 8 KB', () => {
    let max = 0;
    playMatch([2, 7, 1, 8, 2, 8, 1, 8], XZ.defaults, (s) => {
      for (let seat = 0; seat < 4; seat++) {
        const v = view(s, seat);
        const text = JSON.stringify(v);
        expect(text).not.toContain('"key"');
        expect(text).not.toContain('"wall":{');
        v.seats.forEach((x, i) => {
          if (i !== seat && s.phase !== 'end' && s.phase !== 'over' && !s.players[i]!.won) expect(x.hand).toBeNull();
        });
        if (s.claim) expect(text).not.toContain('"opts":[[');
      }
      if (s.phase === 'claim' || s.phase === 'turn') max = Math.max(max, snapshotBytes(XZ as never, s));
    });
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(8_192);
  });
});
