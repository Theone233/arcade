/** 出生点（DESIGN.md 第 3 节）：每张图至少 10 个站得稳的候选点；开局用 'open' 洗牌、两队交错取点，同队不扎堆、两队隔得开；同一种子一样 */
import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { buildTerrain, MAP_IDS, MAPS } from '../src/core/maps.ts';
import { groundDepth, MATE_GAP, newGame, pickSpawns, STEP, stepTarget, surfaceY } from '../src/core/rules.ts';
import { solidAt } from '../src/core/terrain.ts';
import type { Team } from '../src/core/types.ts';
import { vs } from './helpers.ts';

const TEAMS: Record<number, Team[]> = { 1: [0, 1], 2: [0, 0, 1, 1], 3: [0, 0, 0, 1, 1, 1] };

describe('候选点', () => {
  for (const id of MAP_IDS) {
    const m = MAPS[id];
    const t = buildTerrain(m);
    it(`${m.name}：至少 10 个，两两不重复`, () => {
      expect(m.spawns.length).toBeGreaterThanOrEqual(10);
      expect(new Set(m.spawns.map((p) => p.x)).size).toBe(m.spawns.length);
    });
    it(`${m.name}：每个点站得稳（脚下够厚、左右能走、附近没有通到底的洞）`, () => {
      for (const { x } of m.spawns) {
        const y = surfaceY(t, m.height, x);
        expect(y, `${x}`).toBeLessThan(m.height);
        expect(groundDepth(t, x, y, 300), `${x} 脚下的厚度`).toBeGreaterThanOrEqual(80);
        // 往左右各能走 15 步（共 120 宽）
        let walk = 0;
        for (const dir of [-1, 1] as const) {
          let c = { x, y };
          for (let k = 0; k < 15; k++) {
            const to = stepTarget(t, m.width, c, dir);
            if ('error' in to) break;
            c = { x: c.x + dir * STEP, y: to.y };
            walk += STEP;
          }
        }
        expect(walk, `${x} 能走的宽度`).toBeGreaterThanOrEqual(100);
        // 左右 80 以内每一列都有地（不在井口、悬崖边、纸边）
        for (let dx = -80; dx <= 80; dx += 4) expect(surfaceY(t, m.height, x + dx), `${x}${dx >= 0 ? '+' : ''}${dx} 是洞`).toBeLessThan(m.height);
        // 头顶没有地压着（站的是这一列最上面的地面）
        for (let yy = 0; yy < y; yy++) expect(solidAt(t, x, yy)).toBe(false);
      }
    });
  }
});

describe('开局摆人', () => {
  const m = MAPS.kitchen;

  it('同一种子出生位置一样，换种子会变', () => {
    const a = newGame([1, 2, 3, 4, 5, 6, 7, 8], vs(3));
    const b = newGame([1, 2, 3, 4, 5, 6, 7, 8], vs(3));
    expect(b.chars.map((c) => [c.x, c.y])).toEqual(a.chars.map((c) => [c.x, c.y]));
    const seen = new Set<string>();
    for (let k = 0; k < 30; k++) seen.add(newGame([k, 0, 0, 0, 0, 0, 0, 0], vs(3)).chars.map((c) => c.x).join());
    expect(seen.size).toBeGreaterThan(20);
  });

  it('每张图：y 落在那一列最上面的地面上', () => {
    for (const id of MAP_IDS) {
      const s = newGame([4, 4, 4, 4, 4, 4, 4, 4], vs(3, { map: id }));
      for (const c of s.chars) expect(c.y).toBe(surfaceY(s.terrain, MAPS[id].height, c.x));
    }
  });

  for (const id of MAP_IDS) for (const n of [1, 2, 3]) {
    it(`${MAPS[id].name} ${n}v${n}：300 个种子都满足"离对手至少 地图宽 ÷ (人数 + 1)、离队友至少 ${MATE_GAP}"`, () => {
      const m = MAPS[id];
      const teams = TEAMS[n]!;
      const gap = Math.floor(m.width / (teams.length + 1));
      const left = [0, 0];
      for (let seed = 0; seed < 300; seed++) {
        const xs = pickSpawns(m, teams, stream([seed, 1, 1, 1, 1, 1, 1, 1], 'open'));
        expect(new Set(xs).size).toBe(xs.length);
        for (let i = 0; i < xs.length; i++) {
          for (let j = i + 1; j < xs.length; j++) {
            const d = Math.abs(xs[i]! - xs[j]!);
            if (teams[i] === teams[j]) expect(d).toBeGreaterThanOrEqual(MATE_GAP);
            else expect(d).toBeGreaterThanOrEqual(gap);
          }
        }
        // 哪队在左边是随机的
        const avg = (t: Team): number => xs.filter((_, i) => teams[i] === t).reduce((a, b) => a + b, 0);
        left[avg(0) < avg(1) ? 0 : 1]!++;
      }
      expect(Math.min(left[0]!, left[1]!)).toBeGreaterThan(90);
    });
  }

  it('3v3 不总是一队一边：有一部分开局两队是穿插着站的（厨房面团岛）', () => {
    let mixed = 0;
    for (let seed = 0; seed < 300; seed++) {
      const xs = pickSpawns(m, TEAMS[3]!, stream([seed, 2, 2, 2, 2, 2, 2, 2], 'open'));
      const order = xs
        .map((x, i) => [x, TEAMS[3]![i]!] as const)
        .sort((a, b) => a[0] - b[0])
        .map((p) => p[1])
        .join('');
      if (!/^(0+1+|1+0+)$/.test(order)) mixed++;
    }
    expect(mixed).toBeGreaterThan(30);
  });
});
