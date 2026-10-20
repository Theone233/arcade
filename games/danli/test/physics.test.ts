import { describe, expect, it } from 'vitest';
import { FP } from '../src/core/fixed.ts';
import { BODY_CY, launch, MUZZLE, simulate } from '../src/core/physics.ts';
import { previewShot } from '../src/core/rules.ts';
import { emptyTerrain } from '../src/core/terrain.ts';
import { flat } from './helpers.ts';

describe('出膛', () => {
  it('角度和朝向决定方向：45° 横竖速度一样大，朝左 vx 为负', () => {
    const r = launch({ x: 1000, y: 500 }, 45, 50, 1);
    expect(r.vx).toBe(-r.vy);
    expect(r.vx).toBeGreaterThan(0);
    const l = launch({ x: 1000, y: 500 }, 45, 50, -1);
    expect(l.vx).toBe(-r.vx);
    expect(l.vy).toBe(r.vy);
    expect(Math.abs(r.x - 1000 * FP)).toBeLessThanOrEqual(MUZZLE * FP);
    expect(r.y).toBeLessThan((500 - BODY_CY) * FP);
  });

  it('全是整数（定点）', () => {
    for (const a of [20, 33, 70]) for (const p of [1, 57, 100]) for (const v of Object.values(launch({ x: 777, y: 345 }, a, p, -1))) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('飞行', () => {
  it('没有风时左右对称', () => {
    const s = flat([1500, 2900]);
    const right = previewShot(s, 45, 60, 1);
    const left = previewShot(s, 45, 60, -1);
    expect(right.end).not.toBeNull();
    expect(right.end!.x - 1500).toBe(1500 - left.end!.x - 1);
    expect(right.end!.y).toBe(left.end!.y);
  });

  it('顺风飞得远，逆风飞得近', () => {
    const calm = previewShot(flat([500, 2900], { wind: 0 }), 45, 60, 1).end!.x;
    const tail = previewShot(flat([500, 2900], { wind: 5 }), 45, 60, 1).end!.x;
    const head = previewShot(flat([500, 2900], { wind: -5 }), 45, 60, 1).end!.x;
    expect(tail).toBeGreaterThan(calm + 50);
    expect(head).toBeLessThan(calm - 50);
  });

  it('力度越大飞得越远', () => {
    const s = flat([300, 2900]);
    let last = 0;
    for (const p of [30, 45, 60, 75]) {
      const x = previewShot(s, 45, p, 1).end!.x;
      expect(x).toBeGreaterThan(last);
      last = x;
    }
  });

  it('飞出左右边就没了（不爆炸）；上边不封顶，飞出去还会落回来', () => {
    const s = flat([2950, 100]);
    expect(previewShot(s, 30, 100, 1).end).toBeNull();
    const high = simulate(s.terrain, s.chars, 3000, 780, 0, launch({ x: 1500, y: 500 }, 88, 100, 1), true);
    const ys = high.path.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(high.end).not.toBeNull();
  });

  it('掉到底边以下就没了', () => {
    const s = flat([1000, 2000]);
    const r = simulate(emptyTerrain(3000, 780), s.chars.slice(0, 0), 3000, 780, 0, launch({ x: 1000, y: 300 }, 45, 20, 1));
    expect(r.end).toBeNull();
  });

  it('碰到人就停，记下打中的是谁', () => {
    const s = flat([1000, 1200]);
    // 找一发能打中对面的
    let hit = null;
    for (let p = 10; p <= 60 && hit === null; p++) hit = previewShot(s, 45, p, 1).hit;
    expect(hit).toBe(1);
  });

  it('快的炮弹也穿不过薄地（每帧切成小段查）', () => {
    const s = flat([1000, 2900]);
    s.terrain = emptyTerrain(3000, 780);
    // 一堵 4 单位厚的墙
    for (let r = 0; r < s.terrain.rows; r++) s.terrain.cells[r * s.terrain.cols + 300] = 1;
    s.chars[0]!.y = 700;
    const shot = previewShot(s, 20, 100, 1);
    expect(shot.end).not.toBeNull();
    expect(shot.end!.x).toBeGreaterThanOrEqual(1200);
    expect(shot.end!.x).toBeLessThan(1204);
  });
});
