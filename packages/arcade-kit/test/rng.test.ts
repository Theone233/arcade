/**
 * ChaCha20（RFC 8439）用 RFC 的测试向量锁住；分流、拒绝采样、洗牌各有固定结果（换平台、换写法结果不能变，存档和回放靠它）。
 * 写这些时另外拿 OpenSSL 的 chacha20 对拍过 2000 组随机密钥、计数、nonce，全部一致。
 */
import { describe, expect, it } from 'vitest';
import rngSrc from '../src/rng.ts?raw';
import { chacha20Block, isEntropy, purposeHash, quarterRound, shuffle, stream, uniformBelow } from '../src/rng.ts';

/** RFC 里的字节串（十六进制，可以带空格）→ 小端 u32 字。 */
function words(hex: string): number[] {
  const b = hex.replace(/\s+/g, '');
  const out: number[] = [];
  for (let i = 0; i < b.length; i += 8) {
    const x = b.slice(i, i + 8);
    out.push(parseInt(x.slice(6, 8) + x.slice(4, 6) + x.slice(2, 4) + x.slice(0, 2), 16));
  }
  return out;
}

describe('ChaCha20（RFC 8439 测试向量）', () => {
  it('2.1.1 四分之一轮', () => {
    const s = Uint32Array.of(0x11111111, 0x01020304, 0x9b8d6f43, 0x01234567);
    quarterRound(s, 0, 1, 2, 3);
    expect([...s]).toEqual([0xea2a92f4, 0xcb1cf8ce, 0x4581472e, 0x5881c4bb]);
  });

  it('2.3.2 块函数', () => {
    const key = words('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    const nonce = words('000000090000004a00000000');
    expect([...chacha20Block(key, 1, nonce)]).toEqual(
      words(`10 f1 e7 e4 d1 3b 59 15 50 0f dd 1f a3 20 71 c4 c7 d1 f4 c7 33 c0 68 03 04 22 aa 9a c3 d4 6c 4e
             d2 82 64 46 07 9f aa 09 14 c2 d7 05 d9 8b 02 a2 b5 12 9c d1 de 16 4e b9 cb d0 83 e8 a2 50 3c 4e`),
    );
  });

  it('A.1 测试向量 1、2（全零密钥和 nonce，块计数 0、1）', () => {
    const zero = Array(8).fill(0);
    expect([...chacha20Block(zero, 0, [0, 0, 0])]).toEqual(
      words(`76 b8 e0 ad a0 f1 3d 90 40 5d 6a e5 53 86 bd 28 bd d2 19 b8 a0 8d ed 1a a8 36 ef cc 8b 77 0d c7
             da 41 59 7c 51 57 48 8d 77 24 e0 3f b8 d8 4a 37 6a 43 b8 f4 15 18 a1 1c c3 87 b6 69 b2 ee 65 86`),
    );
    expect([...chacha20Block(zero, 1, [0, 0, 0])]).toEqual(
      words(`9f 07 e7 be 55 51 38 7a 98 ba 97 7c 73 2d 08 0d cb 0f 29 a0 48 e3 65 69 12 c6 53 3e 32 ee 7a ed
             29 b7 21 76 9c e6 4e 43 d5 71 33 b0 74 d8 39 d5 31 ed 1f 28 51 0a fb 45 ac e1 0a 1f 4b 79 4d 6f`),
    );
  });
});

describe('分流和洗牌', () => {
  const key = [1, 2, 3, 4, 5, 6, 7, 8];

  it('用途名哈希是 FNV-1a 32 位', () => {
    expect(purposeHash('')).toBe(0x811c9dc5);
    expect(purposeHash('a')).toBe(0xe40c292c);
    expect(purposeHash('foobar')).toBe(0xbf9cf968);
  });

  it('同密钥、同用途、同序号结果一样；换任何一个都不一样；结果固定', () => {
    const take = (k: number[], p: string, i: number) => {
      const s = stream(k, p, i);
      return [s.u32(), s.u32(), s.u32()];
    };
    expect(take(key, 'deal', 7)).toEqual([0x55204416, 0x3b94cdc0, 0x2a311155]);
    expect(take(key, 'deal', 7)).toEqual(take(key, 'deal', 7));
    expect(take(key, 'deal', 8)).not.toEqual(take(key, 'deal', 7));
    expect(take(key, 'tribute', 7)).not.toEqual(take(key, 'deal', 7));
    expect(take([...key.slice(0, 7), 9], 'deal', 7)).not.toEqual(take(key, 'deal', 7));
    // 序号超过 2^32 也分得开（进 nonce 的第 2 个字）
    expect(take(key, 'deal', 2 ** 32)).not.toEqual(take(key, 'deal', 0));
  });

  it('一块 16 个字用完接着算下一块（块计数加一）', () => {
    const s = stream(key, 'x', 0);
    const got = Array.from({ length: 20 }, () => s.u32());
    const nonce = [purposeHash('x'), 0, 0];
    expect(got).toEqual([...chacha20Block(key, 0, nonce), ...chacha20Block(key, 1, nonce).slice(0, 4)]);
  });

  it('拒绝采样：落在最大整数倍以上的丢掉重抽', () => {
    const seq = [0xffffffff, 5];
    // 2^32 = 3 × 1431655765 + 1，所以 0xffffffff 要丢掉
    expect(uniformBelow(() => seq.shift()!, 3)).toBe(2);
    expect(uniformBelow(() => 0xfffffffe, 3)).toBe(0xfffffffe % 3);
    expect(uniformBelow(() => 0xffffffff, 2 ** 32)).toBe(0xffffffff);
    expect(() => uniformBelow(() => 0, 0)).toThrow();
  });

  it('below 均匀（粗查）', () => {
    const s = stream(key, 'uniform', 0);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[s.below(6)]!++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(400);
  });

  it('Fisher–Yates：是原数组的一个排列、不改原数组、结果固定', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = shuffle(items, stream(key, 'deal', 0));
    expect(out).toEqual([6, 5, 2, 3, 1, 7, 8, 4, 0, 9]);
    expect(items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(shuffle(items, stream(key, 'deal', 0))).toEqual(out);
  });

  it('密钥必须是 8 个 u32', () => {
    expect(isEntropy(key)).toBe(true);
    expect(isEntropy([1, 2, 3])).toBe(false);
    expect(isEntropy([...key.slice(0, 7), 2 ** 32])).toBe(false);
    expect(isEntropy([...key.slice(0, 7), -1])).toBe(false);
    expect(() => stream([1, 2, 3], 'deal')).toThrow();
    expect(() => stream(key, 'deal', -1)).toThrow();
  });

  it('纯函数：不碰运行时的随机源、时间、平台相关的数学函数，不用 Math.imul', () => {
    const src = rngSrc.replace(/^\s*(\*|\/\/|\/\*\*).*$/gm, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.(random|imul|exp|log|pow|sin|cos|tan|sqrt)|Date|crypto|performance/);
  });
});
