import { describe, expect, it } from 'vitest';
import { formatMoney, formatMult, formatPct, formatPoints } from '../src/core/index.ts';

describe('formatMoney', () => {
  it('不到 1 万：精确到元并加千分位', () => {
    expect(formatMoney(0)).toBe('¥0');
    expect(formatMoney(203)).toBe('¥203');
    expect(formatMoney(-203)).toBe('-¥203');
    expect(formatMoney(9531)).toBe('¥9,531');
    expect(formatMoney(9999.4)).toBe('¥9,999');
  });

  it('1 万到 1 亿：用「万」保留 2 位小数，整数部分加千分位', () => {
    expect(formatMoney(9999.6)).toBe('¥1.00万');
    expect(formatMoney(10400)).toBe('¥1.04万');
    expect(formatMoney(849_479)).toBe('¥84.95万');
    expect(formatMoney(1e6)).toBe('¥100.00万');
    expect(formatMoney(-1234500)).toBe('-¥123.45万');
    expect(formatMoney(25_763_000)).toBe('¥2,576.30万');
    expect(formatMoney(99_999_000)).toBe('¥9,999.90万');
  });

  it('1 亿到 1 万亿：用「亿」，舍入进位时换单位', () => {
    expect(formatMoney(1e8)).toBe('¥1.00亿');
    expect(formatMoney(99_999_999)).toBe('¥1.00亿');
    expect(formatMoney(4.567e9)).toBe('¥45.67亿');
    expect(formatMoney(9.9999e11)).toBe('¥9,999.90亿');
  });

  it('1 万亿及以上：用「万亿」', () => {
    expect(formatMoney(1.2e12)).toBe('¥1.20万亿');
    expect(formatMoney(999_999_999_999.9)).toBe('¥1.00万亿');
    expect(formatMoney(3.4567e16)).toBe('¥34,567.00万亿');
    expect(formatMoney(-2e12, { sign: true })).toBe('-¥2.00万亿');
  });

  it('sign：正数带 +，舍入为 0 时不带符号', () => {
    expect(formatMoney(604, { sign: true })).toBe('+¥604');
    expect(formatMoney(-604, { sign: true })).toBe('-¥604');
    expect(formatMoney(2.5e6, { sign: true })).toBe('+¥250.00万');
    expect(formatMoney(0.4, { sign: true })).toBe('¥0');
    expect(formatMoney(-0.4)).toBe('¥0');
  });
});

describe('其他格式化', () => {
  it('formatPoints：百分点', () => {
    expect(formatPoints(1.8)).toBe('+1.8%');
    expect(formatPoints(-0.25, 2)).toBe('-0.25%');
    expect(formatPoints(0)).toBe('0.0%');
    expect(formatPoints(12345.6)).toBe('+12,346%');
    expect(formatPoints(5, 0, false)).toBe('5%');
  });

  it('formatPct / formatMult', () => {
    expect(formatPct(0.0123)).toBe('+1.2%');
    expect(formatPct(-0.003)).toBe('-0.3%');
    expect(formatPct(0.15, 0, false)).toBe('15%');
    expect(formatMult(1.5)).toBe('×1.5');
    expect(formatMult(2)).toBe('×2');
  });
});
