import { describe, expect, it } from 'vitest';
import { cosDeg, isqrt, sinDeg } from '../src/core/fixed.ts';

describe('整数角度表', () => {
  it('每 1° 都和真正的 sin、cos 差不到 1（×1024）', () => {
    for (let a = -360; a <= 720; a++) {
      expect(Math.abs(sinDeg(a) - Math.sin((a * Math.PI) / 180) * 1024)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.abs(cosDeg(a) - Math.cos((a * Math.PI) / 180) * 1024)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('关键角度', () => {
    expect([sinDeg(0), sinDeg(30), sinDeg(90), sinDeg(180), sinDeg(270)]).toEqual([0, 512, 1024, 0, -1024]);
    expect([cosDeg(0), cosDeg(60), cosDeg(90), cosDeg(180)]).toEqual([1024, 512, 0, -1024]);
  });

  it('都是整数', () => {
    for (let a = 0; a < 360; a++) expect(Number.isInteger(sinDeg(a))).toBe(true);
  });
});

describe('整数开方', () => {
  it('向下取整', () => {
    for (let n = 0; n < 5000; n++) expect(isqrt(n)).toBe(Math.floor(Math.sqrt(n)));
    for (const n of [1e9, 2 ** 40 + 12345, 2 ** 52 - 1]) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
  });
});
