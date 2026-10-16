import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, mergeLimits } from '../worker/api/config';

describe('vars.LIMITS 深合并', () => {
  it('嵌套组只写一项，同组其他阈值保留默认值', () => {
    const l = mergeLimits(DEFAULT_LIMITS, { readonly: { calls: 5 }, budget: { save: 100 } });
    expect(l.readonly).toEqual({ ...DEFAULT_LIMITS.readonly, calls: 5 });
    expect(l.budget).toEqual({ ...DEFAULT_LIMITS.budget, save: 100 });
    expect(l.off).toEqual(DEFAULT_LIMITS.off);
  });

  it('不是有限正数的值回退默认值', () => {
    const l = mergeLimits(DEFAULT_LIMITS, {
      regAllDay: 'x',
      loginAllHour: -1,
      recoverAllHour: 0,
      failFree: Number.POSITIVE_INFINITY,
      budget: { reg: null, auth: '5' },
      off: 7,
      pbkdf2Iterations: 50_000,
    });
    expect(l.regAllDay).toBe(DEFAULT_LIMITS.regAllDay);
    expect(l.loginAllHour).toBe(DEFAULT_LIMITS.loginAllHour);
    expect(l.recoverAllHour).toBe(DEFAULT_LIMITS.recoverAllHour);
    expect(l.failFree).toBe(DEFAULT_LIMITS.failFree);
    expect(l.budget).toEqual(DEFAULT_LIMITS.budget);
    expect(l.off).toEqual(DEFAULT_LIMITS.off);
    expect(l.pbkdf2Iterations).toBe(50_000);
  });

  it('次数、行数、毫秒、迭代数必须是整数；比例可以是小数；acctOverflow 可以是 0', () => {
    const l = mergeLimits(DEFAULT_LIMITS, {
      pbkdf2Iterations: 50_000.5,
      failFree: 5.5,
      budget: { save: 1.5, reg: 0, auth: 2e20 },
      meterEagerRatio: 0.9,
      acctOverflow: 0,
    });
    // 迭代数写成小数会进哈希串，verifyPassword 就验不回来了
    expect(l.pbkdf2Iterations).toBe(DEFAULT_LIMITS.pbkdf2Iterations);
    expect(l.failFree).toBe(DEFAULT_LIMITS.failFree);
    expect(l.budget).toEqual(DEFAULT_LIMITS.budget);
    expect(l.meterEagerRatio).toBe(0.9);
    expect(l.acctOverflow).toBe(0);
    expect(mergeLimits(DEFAULT_LIMITS, { meterFlushCalls: 0 }).meterFlushCalls).toBe(DEFAULT_LIMITS.meterFlushCalls);
  });

  it('没写或写的不是对象：原样返回默认值', () => {
    expect(mergeLimits(DEFAULT_LIMITS, undefined)).toBe(DEFAULT_LIMITS);
    expect(mergeLimits(DEFAULT_LIMITS, 'oops')).toBe(DEFAULT_LIMITS);
  });
});
