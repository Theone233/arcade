/** 桌游地图板（DESIGN.md 第 8 节）：每次画出来一样，弯道盾牌不压赛道、不挤在一起，全图时只画大件。 */
import { describe, expect, it } from 'vitest';
import { FIXED } from '../src/track/fixed.ts';
import { geometry } from '../src/track/shape.ts';
import { LOD, mapArt } from '../src/view/mapart.ts';

describe('地图板', () => {
  for (const t of FIXED) {
    const art = mapArt(t);
    const geo = geometry(t);
    const pts = geo.strip(0, t.spaces, 0, 6);
    const near = (x: number, y: number): number => Math.min(...pts.map((p) => Math.hypot(p.x - x, p.y - y))) - geo.width / 2;

    it(`${t.name}：同一条赛道每次画出来一样`, () => {
      const a = art.draw({ detail: true, rot: false });
      expect(a.length).toBeGreaterThan(10_000);
      expect(art.draw({ detail: true, rot: false })).toBe(a);
      expect(a).not.toMatch(/NaN|Infinity|undefined/);
    });

    it(`${t.name}：每个弯一块盾牌，不压赛道，彼此隔开`, () => {
      expect(art.shields.map((s) => s.at)).toEqual(t.corners.map((c) => c.at));
      for (const s of art.shields) {
        // 盾牌连飘带那一块（宽约 80、从上 20 到下 44）不压着路面
        for (const [dx, dy] of [
          [0, -20],
          [-38, 34],
          [38, 34],
          [0, 44],
        ] as const)
          expect(near(s.x + dx, s.y + dy)).toBeGreaterThan(0);
        // 盾牌在板子里面
        expect(s.x).toBeGreaterThan(art.board.x);
        expect(s.x).toBeLessThan(art.board.x + art.board.w);
        expect(s.y).toBeGreaterThan(art.board.y);
        expect(s.y).toBeLessThan(art.board.y + art.board.h);
      }
      for (let i = 0; i < art.shields.length; i++)
        for (let j = i + 1; j < art.shields.length; j++) {
          const a = art.shields[i]!;
          const b = art.shields[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60);
        }
    });

    it(`${t.name}：全图时只有盾牌，放大了才有格号、制动牌、弯名`, () => {
      const far = art.labels({ k: LOD / 2, rot: false, next: -1 });
      const close = art.labels({ k: 1, rot: false, next: t.corners[0]!.at });
      expect((far.match(/class="shield"/g) ?? []).length).toBe(t.corners.length);
      expect(far).not.toContain('T1');
      expect(close).toContain('T1');
      // 制动牌每个弯 3 块，格号每 5 格一个
      expect((close.match(/<rect x="-6.5"/g) ?? []).length).toBe(t.corners.length * 3);
      expect((close.match(/<circle r="9"/g) ?? []).length).toBe(Math.ceil(t.spaces / 5));
    });
  }
});
