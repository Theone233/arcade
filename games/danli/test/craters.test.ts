/** 坑形（DESIGN.md 2.3.1，美术交付）：坑形是规则（整数、包围盒），画面按 boom 事件挖、重建焦痕用的坑序列和规则核心对得上 */
import { describe, expect, it } from 'vitest';
import { plan, planActions } from '../src/ai/index.ts';
import { craterReach, inCrater } from '../src/core/craters.ts';
import { buildTerrain, MAPS } from '../src/core/maps.ts';
import { apply, newGame, replay } from '../src/core/rules.ts';
import { CELL, cloneTerrain, dig, emptyTerrain, fillPolygon } from '../src/core/terrain.ts';
import type { Action, State, Step } from '../src/core/types.ts';
import { WEAPON_IDS, type WeaponId } from '../src/core/weapons.ts';
import { burnsOf, type Burn } from '../src/view/scorch.ts';
import { vs } from './helpers.ts';

const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

/** 坑形占的格子（格子中心在 4k + 2，爆心在格子中心上） */
function cells(k: WeaponId, r: number): string {
  const R = craterReach(r) + 8;
  const out: string[] = [];
  for (let dy = -R; dy <= R; dy += CELL) for (let dx = -R; dx <= R; dx += CELL) if (inCrater(k, dx, dy, r)) out.push(`${dx},${dy}`);
  return out.join(' ');
}

describe('坑形', () => {
  it('8 把武器的坑形各不一样；包子还是圆', () => {
    const all = WEAPON_IDS.map((w) => cells(w, 26));
    expect(new Set(all).size).toBe(8);
    for (const r of [6, 13, 26, 40]) {
      for (let dy = -60; dy <= 60; dy++) for (let dx = -60; dx <= 60; dx++) if (inCrater('steamer', dx, dy, r) !== dx * dx + dy * dy < r * r) throw new Error(`包子 r=${r} (${dx}, ${dy})`);
    }
  });

  it('坑形不伸出包围盒（≤ 1.3r），也不是空的', () => {
    const bad: string[] = [];
    for (const k of WEAPON_IDS) {
      for (const r of [4, 8, 13, 17, 20, 26, 32, 40, 52, 64]) {
        const reach = craterReach(r);
        if (reach > Math.ceil(r * 1.3)) bad.push(`${k} r=${r} 包围盒 ${reach}`);
        let any = false;
        for (let dy = -3 * r; dy <= 3 * r; dy++) {
          for (let dx = -3 * r; dx <= 3 * r; dx++) {
            if (!inCrater(k, dx, dy, r)) continue;
            any = true;
            if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) bad.push(`${k} r=${r} (${dx}, ${dy}) 出了包围盒`);
          }
        }
        if (!any) bad.push(`${k} r=${r} 是空的`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('只扫包围盒挖出来的，和整张图逐格判断的一样；武器的坑不标"焦"', () => {
    const base = emptyTerrain(800, 400);
    fillPolygon(base, [[0, 150], [800, 150], [800, 400], [0, 400]], 1);
    for (const k of WEAPON_IDS) {
      for (const r of [9, 15, 26, 45]) {
        const fast = cloneTerrain(base);
        dig(fast, 401, 163, r, k);
        const slow = cloneTerrain(base);
        for (let row = 0; row < slow.rows; row++) {
          for (let c = 0; c < slow.cols; c++) if (inCrater(k, c * CELL + CELL / 2 - 401, row * CELL + CELL / 2 - 163, r)) slow.cells[row * slow.cols + c] = 0;
        }
        expect(same(fast.cells, slow.cells), `${k} r=${r}`).toBe(true);
        expect(fast.cells.some((v) => v & 0x80)).toBe(false);
      }
    }
  });
});

/** 电脑打一整局（3v3，6 把武器），记下每一步的操作和结果 */
function game(weapons: readonly WeaponId[], seed: number): { s0: State; log: Action[]; steps: Step[]; end: State } {
  const setup = vs(3, { map: 'bento' });
  const s0 = newGame([seed, 3, 3, 3, 3, 3, 3, 3], { ...setup, players: setup.players.map((p, i) => ({ ...p, weapon: weapons[i]! })) });
  let s = s0;
  const log: Action[] = [];
  const steps: Step[] = [];
  while (s.phase === 'play' && log.length < 400) {
    for (const a of planActions(plan(s, {}))) {
      const r = apply(s, a);
      if (!r.ok) throw new Error(r.error);
      log.push(a);
      steps.push(r);
      s = r.state;
    }
  }
  return { s0, log, steps, end: s };
}

describe('8 把武器打一局：画面按事件挖的、读档重建焦痕用的坑序列都和规则核心对得上', () => {
  for (const [n, ws] of [WEAPON_IDS.slice(0, 6), WEAPON_IDS.slice(2, 8)].entries()) {
    it(`第 ${n + 1} 组：${ws.join('、')}`, () => {
      const g = game(ws, 11 + n);
      const burns: Burn[] = g.steps.flatMap((r) => (r.ok ? burnsOf(r.events) : []));
      expect(new Set(burns.map((b) => b.w)).size).toBeGreaterThanOrEqual(4);
      // 画面的做法（也是重建焦痕的做法）：从地图原样开始，按坑的先后挖
      const view = cloneTerrain(buildTerrain(MAPS.bento));
      for (const b of burns) dig(view, b.x, b.y, b.r, b.w);
      expect(same(view.cells, g.end.terrain.cells)).toBe(true);
      // 读档（单机按操作重放）收集到的坑和一手一手放出来的一样
      const again: Burn[] = [];
      const r = replay(g.s0.key, g.s0.setup, g.log, (evs) => again.push(...burnsOf(evs)));
      expect(r.bad).toBeNull();
      expect(again).toEqual(burns);
    });
  }
});
