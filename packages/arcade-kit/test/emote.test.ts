/**
 * 快捷短语（0.6.0）：入座的人发短语编号，房间按游戏的 emotes 校验、按座位限频，只广播、不写存储、不改 seq；入站照样计数。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { DownMsg, EmotedMsg } from '../src/protocol.ts';
import { emoteRateOf } from '../src/room.ts';
import { advance, type Conn, freezeClock, inspect, join, openRoom, resetMeter } from './helpers.ts';
import type { ToyView } from './worker.ts';

beforeEach(async () => {
  freezeClock();
  await resetMeter();
});

/** 开房，u1 在 0 号位、u2 坐 1 号位，u3 只是来看的（没入座）。 */
async function table(): Promise<{ code: string; a: Conn; b: Conn; watcher: Conn }> {
  const code = await openRoom('u1');
  const a = (await join(code, 'u1')).conn;
  const b = (await join(code, 'u2')).conn;
  b.send({ t: 'sit', seat: 1 });
  await b.until((m) => m.t === 'state' && m.you.seat === 1);
  const watcher = (await join(code, 'u3')).conn;
  for (const c of [a, b, watcher]) c.drain();
  return { code, a, b, watcher };
}

const emoted = (m: DownMsg<ToyView> | EmotedMsg): m is EmotedMsg => m.t === 'emote';

describe('快捷短语', () => {
  it('入座的人发：所有人（含自己、来看的）收到座位和编号；不写库、不改 seq；入站照样记数，下次写库时一起存', async () => {
    const { code, a, b, watcher } = await table();
    const before = await inspect(code);
    b.send({ t: 'emote', id: 2 });
    for (const c of [a, b, watcher]) expect(await c.until(emoted)).toEqual({ t: 'emote', seat: 1, id: 2 });
    const after = await inspect(code);
    expect(after.last).toBe(0);
    expect(after.total).toBe(before.total);
    expect(after.persist.seq).toBe(before.persist.seq);
    // 下一次写库（有人入座）时，这条短语和入座消息一起记进入站数
    a.send({ t: 'sit', seat: 2 });
    await a.until((m) => m.t === 'state' && m.you.seat === 2);
    expect((await inspect(code)).persist.inbound).toBe(before.persist.inbound + 2);
  });

  it('令牌桶（0.7.0）：一个座位连发 3 句都转发，第 4 句 emote_too_fast、不转发；别的座位不受影响；过 1 秒补一句', async () => {
    const { a, b } = await table();
    for (const id of [0, 1, 2]) {
      b.send({ t: 'emote', id });
      expect(await a.until(emoted)).toEqual({ t: 'emote', seat: 1, id });
    }
    b.send({ t: 'emote', id: 3 });
    expect(await b.until((m) => m.t === 'error')).toEqual({ t: 'error', code: 'emote_too_fast' });
    a.send({ t: 'emote', id: 4 });
    expect(await b.until((m) => emoted(m) && m.seat === 0)).toEqual({ t: 'emote', seat: 0, id: 4 });
    advance(1_000);
    b.send({ t: 'emote', id: 5 });
    expect(await a.until((m) => emoted(m) && m.seat === 1)).toEqual({ t: 'emote', seat: 1, id: 5 });
  });

  it('进房的快照带上节奏（RoomClient 按它排队）；KIT_QUOTA 里的 emoteMs / emoteBurst 覆盖默认，不合格的忽略', async () => {
    const code = await openRoom('u9');
    const { welcome } = await join(code, 'u9');
    expect(welcome.emote).toEqual({ ms: 1000, burst: 3 });
    const base = { ms: 1000, burst: 3 };
    expect(emoteRateOf(undefined, base)).toEqual(base);
    expect(emoteRateOf({ emoteMs: 500, emoteBurst: 5, dailyRooms: 9 }, base)).toEqual({ ms: 500, burst: 5 });
    expect(emoteRateOf('{"emoteMs":0}', base)).toEqual({ ms: 0, burst: 3 });
    expect(emoteRateOf({ emoteMs: -1, emoteBurst: 0 }, base)).toEqual({ ms: 1000, burst: 1 });
    expect(emoteRateOf('oops', base)).toEqual(base);
  });

  it('编号不在短语表里、不是整数：bad_emote；没入座的人发：not_seated；都不转发', async () => {
    const { a, b, watcher } = await table();
    for (const id of [-1, 6, 1.5, '2', null]) {
      b.send({ t: 'emote', id });
      expect(await b.until((m) => m.t === 'error'), String(id)).toEqual({ t: 'error', code: 'bad_emote' });
    }
    watcher.send({ t: 'emote', id: 0 });
    expect(await watcher.until((m) => m.t === 'error')).toEqual({ t: 'error', code: 'not_seated' });
    // 上面这些都没转发：a 收到的第一句短语是 b 后来发的那句
    b.send({ t: 'emote', id: 4 });
    expect(await a.until(emoted)).toEqual({ t: 'emote', seat: 1, id: 4 });
  });

  it('指定对象（0.7.0）：to 是有人的别的座位才转发、带上 to；自己、空座、越界、不是整数回 bad_target，不占令牌', async () => {
    const { a, b } = await table();
    for (const to of [1, 3, 4, -1, 0.5, '0', null]) {
      b.send({ t: 'emote', id: 2, to });
      expect(await b.until((m) => m.t === 'error'), String(to)).toEqual({ t: 'error', code: 'bad_target' });
    }
    // 上面都被拒了：马上发一句合法的照样转发
    b.send({ t: 'emote', id: 5, to: 0 });
    expect(await a.until(emoted)).toEqual({ t: 'emote', seat: 1, id: 5, to: 0 });
    expect(await b.until(emoted)).toEqual({ t: 'emote', seat: 1, id: 5, to: 0 });
  });
});
