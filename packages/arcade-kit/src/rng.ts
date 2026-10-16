/**
 * 联机发牌用的随机数：ChaCha20（RFC 8439），纯函数，浏览器、DO、普通 Node 都能用，不依赖 DOM、网络、运行时的随机源。
 *
 * 为什么不用 32 位种子：种子只有 2^32 种，玩家拿自己的手牌逐个试种子，几分钟就能反推出全桌的牌（0.2.0 前的房间就有这个问题）。
 * 房间开局时用 crypto.getRandomValues 拿 256 位熵（8 个 u32，Entropy），交给 RoomGame.begin 当 ChaCha20 的密钥；
 * 密钥只在服务端的牌局状态里，绝不下发。同一把密钥、同样的用途和序号永远得到同样的结果，存档、回放、联机校验照样成立。
 *
 * 只用 32 位整数运算（加法后 >>> 0、移位、异或），结果不依赖平台的数学函数，规则核心可以放心用。
 * 一把密钥按"用途 + 序号"分出互不相干的流（比如 stream(key, 'deal', 3) 是第 3 副的发牌）：
 * 用途进 nonce 的第 0 个字（FNV-1a 32 位），序号进第 1、2 个字，块计数从 0 起。用途名请用固定的短字符串，同一个游戏里不要两个用途撞同一个哈希
 * （游戏在自己的测试里断言一下）。
 */

/** 256 位熵：8 个 0–2^32-1 的整数（ChaCha20 的密钥，按 RFC 8439 的小端字）。 */
export type Entropy = readonly number[];

export const ENTROPY_WORDS = 8;

/** 是不是合格的 256 位熵：8 个 u32 整数。 */
export function isEntropy(x: unknown): x is Entropy {
  return Array.isArray(x) && x.length === ENTROPY_WORDS && x.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffffffff);
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** RFC 8439 2.1 的四分之一轮，原地改 s 的四个字。 */
export function quarterRound(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a]! + s[b]!) >>> 0;
  s[d] = rotl(s[d]! ^ s[a]!, 16);
  s[c] = (s[c]! + s[d]!) >>> 0;
  s[b] = rotl(s[b]! ^ s[c]!, 12);
  s[a] = (s[a]! + s[b]!) >>> 0;
  s[d] = rotl(s[d]! ^ s[a]!, 8);
  s[c] = (s[c]! + s[d]!) >>> 0;
  s[b] = rotl(s[b]! ^ s[c]!, 7);
}

/** RFC 8439 2.3 的块函数：密钥 8 字、块计数 1 字、nonce 3 字 → 16 个字（64 字节的密钥流，小端）。 */
export function chacha20Block(key: Entropy, counter: number, nonce: readonly number[]): Uint32Array {
  const init = new Uint32Array(16);
  init[0] = 0x61707865;
  init[1] = 0x3320646e;
  init[2] = 0x79622d32;
  init[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) init[4 + i] = key[i]!;
  init[12] = counter;
  init[13] = nonce[0]!;
  init[14] = nonce[1]!;
  init[15] = nonce[2]!;
  const s = init.slice();
  for (let i = 0; i < 10; i++) {
    quarterRound(s, 0, 4, 8, 12);
    quarterRound(s, 1, 5, 9, 13);
    quarterRound(s, 2, 6, 10, 14);
    quarterRound(s, 3, 7, 11, 15);
    quarterRound(s, 0, 5, 10, 15);
    quarterRound(s, 1, 6, 11, 12);
    quarterRound(s, 2, 7, 8, 13);
    quarterRound(s, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) s[i] = (s[i]! + init[i]!) >>> 0;
  return s;
}

/** 用途名的 32 位哈希（FNV-1a，按 UTF-16 码元）。 */
export function purposeHash(purpose: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < purpose.length; i++) {
    h ^= purpose.charCodeAt(i);
    // 乘 FNV 质数 16777619 = 2^24 + 403：拆成移位和加法，不用 Math.imul，每一步都在 2^53 以内
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h;
}

/** 一条随机流：按顺序吐 u32，用完一块（16 个字）算下一块。 */
export interface RandomStream {
  /** 下一个 0–2^32-1 的整数 */
  u32(): number;
  /** 0 到 n-1 的均匀整数（1 ≤ n ≤ 2^32），拒绝采样，没有取模偏差 */
  below(n: number): number;
}

/**
 * 从密钥分出一条流：purpose 用途（如 'deal'），index 序号（0 到 2^53-1 的整数，如第几副）。
 * 每条流最多 2^32 块（每块 16 个字），一副牌远远用不完。
 */
export function stream(key: Entropy, purpose: string, index = 0): RandomStream {
  if (!isEntropy(key)) throw new Error('rng key must be 8 u32 words');
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('rng index must be a non-negative safe integer');
  const nonce = [purposeHash(purpose), index % 0x1_0000_0000, Math.floor(index / 0x1_0000_0000)];
  let counter = 0;
  let block: Uint32Array | null = null;
  let at = 16;
  const u32 = (): number => {
    if (at >= 16) {
      if (counter > 0xffffffff) throw new Error('rng stream exhausted');
      block = chacha20Block(key, counter++, nonce);
      at = 0;
    }
    return block![at++]!;
  };
  return {
    u32,
    below: (n: number) => uniformBelow(u32, n),
  };
}

/** 0 到 n-1 的均匀整数：next 给 u32，落在"2^32 里最大的 n 的整数倍"以上的丢掉重抽，剩下的取模才没有偏差。 */
export function uniformBelow(next: () => number, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 0x1_0000_0000) throw new Error('rng below(n) needs 1 ≤ n ≤ 2^32');
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % n);
  for (;;) {
    const x = next();
    if (x < limit) return x % n;
  }
}

/** Fisher–Yates 洗牌（从后往前，每一步用 below 拒绝采样），返回新数组，不改原数组。 */
export function shuffle<T>(items: readonly T[], rng: RandomStream): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out;
}
