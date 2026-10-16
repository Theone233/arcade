/**
 * 确定性随机数。
 *
 * 只用 32 位整数运算（Math.imul、移位）和加减乘除，保证浏览器各内核与 Node 下结果一致。
 * core 内禁止使用 Math.random、Date.now，以及 Math.exp/log/pow/sin/cos 这类各引擎实现
 * 可能不同的函数（tests/architecture.test.ts 会检查）。
 */

/** 把种子与若干分量混合成 32 位无符号整数（FNV-1a + murmur3 fmix32）。 */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? `#${part}|` : `${part}|`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** [0, 1) 均匀分布 */
  next(): number;
  /** [0, n) 均匀整数 */
  int(n: number): number;
  /** 近似标准正态：12 个均匀数之和减 6，尾部截断在 ±6 */
  normal(): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
}

/** sfc32 生成器（类实现：比闭包快数倍，模拟器大量调用）。 */
class Sfc32 implements Rng {
  private a = 0x9e3779b9 | 0;
  private b = 0x243f6a88 | 0;
  private c = 0xb7e15162 | 0;
  private d: number;

  constructor(seed: number) {
    this.d = seed | 0;
    for (let i = 0; i < 12; i++) this.next();
  }

  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  normal(): number {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += this.next();
    return sum - 6;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: 空列表');
    return items[this.int(items.length)] as T;
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    if (items.length === 0 || total <= 0) throw new Error('weighted: 没有可选项');
    let u = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      u -= weights[i] ?? 0;
      if (u < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }
}

export function createRng(seed: number): Rng {
  return new Sfc32(seed);
}

/** 按用途分流的随机数：同一局里行情、情报、商店各自独立，改一处不会扰动其他。 */
export function rngFor(...parts: readonly (string | number)[]): Rng {
  return createRng(hashSeed(...parts));
}
