/**
 * 确定性随机数。
 *
 * 只用 32 位整数运算（Math.imul、移位）和加减乘除，保证浏览器各内核与 Node 下结果一致。
 * core 内禁止 Math.random、Date，以及 Math.exp/log/pow/sin 这类各引擎实现可能不同的函数
 * （tests/architecture.test.ts 检查）。按用途分流：发牌、首出、电脑决策各自一条流，改一处不扰动其他。
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
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
}

/** sfc32 生成器。 */
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

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: 空列表');
    return items[this.int(items.length)] as T;
  }

  /** 原地 Fisher–Yates 洗牌，返回同一个数组。 */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = items[i] as T;
      items[i] = items[j] as T;
      items[j] = t;
    }
    return items;
  }
}

export function createRng(seed: number): Rng {
  return new Sfc32(seed);
}

/** 按用途分流的随机数，例如 rngFor(seed, 'deal', 3)。 */
export function rngFor(...parts: readonly (string | number)[]): Rng {
  return createRng(hashSeed(...parts));
}
