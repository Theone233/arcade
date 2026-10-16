import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  hashIp,
  hashPassword,
  hashRecoveryCode,
  ipPrefix,
  MissingSecretError,
  newRecoveryCode,
  newSessionToken,
  normalizeRecoveryCode,
  safeEqual,
  sessionHashFromCookie,
  verifyPassword,
  verifyRecoveryCode,
} from '../worker/api/crypto';

describe('恢复码', () => {
  it('20 位 Crockford base32，每 5 位一组', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  });

  it('输入不分大小写、横线空格可有可无，I/L 当 1、O 当 0', () => {
    expect(normalizeRecoveryCode('abcde-fghjk mnpqr-stvwx')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normalizeRecoveryCode('IIIII LLLLL OOOOO ooooo')).toBe('11111111110000000000');
    expect(normalizeRecoveryCode('UUUUU-UUUUU-UUUUU-UUUUU')).toBeNull();
    expect(normalizeRecoveryCode('short')).toBeNull();
  });

  it('只存 HMAC，换了用户 id 就对不上', async () => {
    const code = normalizeRecoveryCode(newRecoveryCode())!;
    const stored = await hashRecoveryCode(env, 'u1', code);
    expect(stored).not.toContain(code);
    expect(await verifyRecoveryCode(env, 'u1', code, stored)).toBe(true);
    expect(await verifyRecoveryCode(env, 'u2', code, stored)).toBe(false);
  });
});

describe('密码哈希', () => {
  it('格式 pbkdf2-sha256$迭代$kid$盐$哈希，能验证，错密码不过', async () => {
    const stored = await hashPassword(env, 'Correct-Horse-9', 1000);
    expect(stored).toMatch(/^pbkdf2-sha256\$1000\$t1\$[\w-]{22}\$[\w-]{43}$/);
    expect(await verifyPassword(env, 'Correct-Horse-9', stored, 1000)).toEqual({ ok: true, rehash: false });
    expect(await verifyPassword(env, 'correct-horse-9', stored, 1000)).toEqual({ ok: false, rehash: false });
  });

  it('迭代次数变了：验证照过，并提示重哈希', async () => {
    const stored = await hashPassword(env, 'Correct-Horse-9', 1000);
    expect(await verifyPassword(env, 'Correct-Horse-9', stored, 2000)).toEqual({ ok: true, rehash: true });
  });

  it('换 pepper：旧 kid 放进 PEPPER_PW_PREV 还能验证，并提示重哈希；不认识的 kid 不过', async () => {
    const stored = await hashPassword(env, 'Correct-Horse-9', 1000);
    const rotated = { ...env, PEPPER_PW: 't2:another-test-pepper', PEPPER_PW_PREV: env.PEPPER_PW };
    expect(await verifyPassword(rotated, 'Correct-Horse-9', stored, 1000)).toEqual({ ok: true, rehash: true });
    const dropped = { ...env, PEPPER_PW: 't2:another-test-pepper', PEPPER_PW_PREV: undefined };
    expect(await verifyPassword(dropped, 'Correct-Horse-9', stored, 1000)).toEqual({ ok: false, rehash: false });
  });

  it('缺 Secret 时拒绝写哈希', async () => {
    await expect(hashPassword({ ...env, PEPPER_PW: undefined }, 'Correct-Horse-9', 1000)).rejects.toBeInstanceOf(MissingSecretError);
    await expect(hashPassword({ ...env, PEPPER_PW: 'nokid' }, 'Correct-Horse-9', 1000)).rejects.toBeInstanceOf(MissingSecretError);
  });

  it('实测：本地 workerd 不限制 PBKDF2 迭代次数（线上上限另测，见 PR 描述）', async () => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('x'), 'PBKDF2', false, ['deriveBits']);
    const salt = new Uint8Array(16);
    for (const iterations of [100_000, 100_001]) {
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
      expect(bits.byteLength).toBe(32);
    }
  });
});

describe('会话令牌', () => {
  it('cookie 是 kid.令牌，库里存 kid$HMAC，两边对得上', async () => {
    const t = await newSessionToken(env);
    expect(t.cookie).toMatch(/^t1\.[\w-]{43}$/);
    expect(t.hash.startsWith('t1$')).toBe(true);
    expect(t.hash).not.toContain(t.cookie.slice(3));
    expect(await sessionHashFromCookie(env, t.cookie)).toBe(t.hash);
  });

  it('格式不对或 kid 不认识返回 null', async () => {
    expect(await sessionHashFromCookie(env, 'garbage')).toBeNull();
    expect(await sessionHashFromCookie(env, `zz.${'a'.repeat(43)}`)).toBeNull();
  });
});

describe('IP', () => {
  it('IPv6 只取前 /64，IPv4 原样', () => {
    expect(ipPrefix('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(ipPrefix('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64');
    expect(ipPrefix('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipPrefix('203.0.113.7')).toBe('203.0.113.7');
  });

  it('同一个 /64 里的地址哈希相同，不存原文', async () => {
    const a = await hashIp(env, '2001:db8:1:2::1');
    expect(a).toBe(await hashIp(env, '2001:db8:1:2:ffff::9'));
    expect(a).not.toBe(await hashIp(env, '2001:db8:1:3::1'));
    expect(a).toMatch(/^[\w-]{22}$/);
  });
});

it('safeEqual：长度不同直接不等', () => {
  expect(safeEqual('abc', 'abc')).toBe(true);
  expect(safeEqual('abc', 'abd')).toBe(false);
  expect(safeEqual('abc', 'abcd')).toBe(false);
});
