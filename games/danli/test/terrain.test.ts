import { describe, expect, it } from 'vitest';
import { buildTerrain, KITCHEN } from '../src/core/maps.ts';
import { carve, CELL, emptyTerrain, MAT_MASK, SCORCH, solidAt } from '../src/core/terrain.ts';
import { slab } from './helpers.ts';

describe('地形网格', () => {
  it('长方形填进去，边界按格子中心算', () => {
    const t = slab(100, 200, 500, 600);
    expect(solidAt(t, 101, 501)).toBe(true);
    expect(solidAt(t, 199, 599)).toBe(true);
    expect(solidAt(t, 99, 550)).toBe(false);
    expect(solidAt(t, 150, 499)).toBe(false);
    expect(solidAt(t, 200, 550)).toBe(false);
  });

  it('网格外一律没地（上边不封顶）', () => {
    const t = slab(0, 3000, 0, 780);
    expect(solidAt(t, -1, 100)).toBe(false);
    expect(solidAt(t, 3000, 100)).toBe(false);
    expect(solidAt(t, 100, -1)).toBe(false);
    expect(solidAt(t, 100, 780)).toBe(false);
  });

  it('爆炸挖一个圆：圆里的格子没了，外面一圈标成焦边，回改过的范围', () => {
    const t = slab(0, 3000, 400, 700);
    const box = carve(t, 1000, 400, 30);
    for (let dy = -28; dy <= 28; dy += 4) {
      for (let dx = -28; dx <= 28; dx += 4) {
        if (dx * dx + dy * dy < 26 * 26) expect(solidAt(t, 1000 + dx, 400 + dy)).toBe(false);
      }
    }
    expect(solidAt(t, 1000, 435)).toBe(true);
    const c = Math.floor(1000 / CELL);
    const r = Math.floor(432 / CELL);
    expect(t.cells[r * t.cols + c]! & SCORCH).toBe(SCORCH);
    expect(t.cells[r * t.cols + c]! & MAT_MASK).toBe(1);
    expect(box.c0 * CELL).toBeLessThanOrEqual(1000 - 30);
    expect((box.c1 + 1) * CELL).toBeGreaterThanOrEqual(1000 + 30);
  });

  it('悬空的地断开以后原地不动（不塌落）', () => {
    const t = slab(0, 3000, 400, 700);
    // 把一块从两边挖断
    for (let y = 400; y < 700; y += 20) {
      carve(t, 1000, y, 24);
      carve(t, 1200, y, 24);
    }
    expect(solidAt(t, 1100, 450)).toBe(true);
    expect(solidAt(t, 1100, 690)).toBe(true);
  });

  it('同样的输入光栅化出一样的地形', () => {
    const a = buildTerrain(KITCHEN);
    const b = buildTerrain(KITCHEN);
    expect(Buffer.from(a.cells).equals(Buffer.from(b.cells))).toBe(true);
    expect(a.cols).toBe(750);
    expect(a.rows).toBe(195);
  });

  it('厨房面团岛：井打穿到底，地形悬空（最底下一行没地）', () => {
    const t = buildTerrain(KITCHEN);
    for (let y = 380; y < 780; y += 8) expect(solidAt(t, 1256, y)).toBe(false);
    expect(solidAt(t, 1000, 500)).toBe(true);
    for (let x = 0; x < 3000; x += 4) expect(solidAt(t, x, 778)).toBe(false);
  });

  it('空网格', () => {
    const t = emptyTerrain(10, 10);
    expect(t.cols).toBe(3);
    expect(solidAt(t, 1, 1)).toBe(false);
  });
});
