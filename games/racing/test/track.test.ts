/** 固定赛道的数据（DESIGN.md 3.2）：弯道线合法、和画出来的弯对得上。 */
import { describe, expect, it } from 'vitest';
import { FIXED } from '../src/track/fixed.ts';
import { getTrack } from '../src/track/index.ts';
import { geometry, SHAPES } from '../src/track/shape.ts';

const DEG = 180 / Math.PI;

describe('固定赛道', () => {
  for (const t of FIXED) {
    it(`${t.name}：数据合法`, () => {
      expect(getTrack(t.id)).toBe(t);
      expect(SHAPES[t.id]).toBeDefined();
      expect(t.corners.length).toBeGreaterThanOrEqual(3);
      let prev = 0;
      for (const c of t.corners) {
        expect(c.at).toBeGreaterThan(prev);
        expect(c.at).toBeLessThan(t.spaces);
        expect(c.limit).toBeGreaterThanOrEqual(1);
        expect(c.limit).toBeLessThanOrEqual(7);
        prev = c.at;
      }
      // 起终点线后面要留出发车格（6 辆车 3 格）和第一个弯的距离
      expect(t.corners[0]!.at).toBeGreaterThanOrEqual(5);
      expect(t.spaces - t.corners.at(-1)!.at).toBeGreaterThanOrEqual(4);
    });

    it(`${t.name}：每条弯道线后面几格真的在转弯`, () => {
      const g = geometry(t);
      expect(g.cells.length).toBe(t.spaces);
      for (const c of t.corners) {
        let turn = 0;
        for (let k = 0; k < 5; k++) turn += g.turn[(c.at + k) % t.spaces]!;
        expect(Math.abs(turn * DEG), `第 ${c.at} 格的弯`).toBeGreaterThan(45);
      }
    });

    it(`${t.name}：发车格在直道上`, () => {
      const g = geometry(t);
      for (let k = 1; k <= 3; k++) expect(Math.abs(g.turn[t.spaces - k]! * DEG)).toBeLessThan(6);
    });
  }
});
