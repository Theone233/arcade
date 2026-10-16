/**
 * Worker 和好友房跑在本地 workerd 里（DESIGN.md 第 6 节）：真的房间 DO（kit）、kit 的计量、假的平台 /api/me。
 * 登录闸门、开房选项校验；两个真人加三台电脑跑完一整场：每一步写入 ≤ 2 行、视图里没有别人的手牌和密钥、电脑会发表情；跑完"再来一场"。
 */
import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import type { DownMsg, StateMsg, WelcomeMsg } from 'arcade-kit/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decide } from '../../src/ai/index.ts';
import type { RoomState, RoomView } from '../../src/room/rules.ts';
import type { RacingRoom } from '../../worker/room.ts';

const SITE = 'https://game.example.com';
const BASE = `${SITE}/games/racing`;
type Msg = DownMsg<RoomView>;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

let uid = 0;
const user = () => `u${uid++}`;

/**
 * 假时间放在将来（同 kit 的测试）：设在过去的闹钟会被 workerd 马上真的跑掉。
 * 每出一手把时间往后拨 1 秒，免得撞上每个连接每秒 5 条的限速（1008）
 */
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2030, 0, 15, 12, 0) }));
afterEach(() => vi.useRealTimers());
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

class Conn {
  readonly msgs: Msg[] = [];
  last: WelcomeMsg<RoomView> | StateMsg<RoomView> | null = null;
  closed: number | null = null;
  readonly ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.accept();
    ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      const m = JSON.parse(e.data) as Msg;
      this.msgs.push(m);
      if (m.t !== 'error' && (!this.last || m.seq >= this.last.seq)) this.last = m;
    });
    ws.addEventListener('close', (e) => (this.closed = e.code));
  }

  get seat(): number | null {
    return this.last?.you.seat ?? null;
  }
  get view(): RoomView | null {
    return this.last?.t === 'welcome' ? this.last.view : (this.last?.frames.at(-1)?.view ?? null);
  }
  send(m: unknown): void {
    this.ws.send(JSON.stringify(m));
  }
  act(moveId: string, action: unknown): void {
    this.send({ t: 'act', moveId, baseSeq: this.last?.seq ?? 0, action });
  }
  async until(pred: (m: Msg) => boolean, ms = 5_000): Promise<Msg> {
    const deadline = performance.now() + ms;
    for (let i = 0; ; ) {
      for (; i < this.msgs.length; i++) if (pred(this.msgs[i]!)) return this.msgs[i]!;
      if (this.closed !== null) throw new Error(`closed ${this.closed}`);
      if (performance.now() > deadline) throw new Error('timed out waiting for a message');
      await sleep(10);
    }
  }
}

function createRoom(sid: string, body?: string): Promise<Response> {
  return exports.default.fetch(`${BASE}/rooms`, { method: 'POST', headers: { origin: SITE, cookie: `__Host-sid=${sid}`, 'content-type': 'application/json' }, ...(body !== undefined ? { body } : {}) });
}

async function join(code: string, sid: string): Promise<Conn> {
  const res = await exports.default.fetch(`${BASE}/rooms/${code}/ws?cv=1`, { headers: { upgrade: 'websocket', origin: SITE, cookie: `__Host-sid=${sid}` } });
  expect(res.status).toBe(101);
  const c = new Conn(res.webSocket!);
  await c.until((m) => m.t === 'welcome');
  return c;
}

const stub = (code: string) => env.ROOM.get(env.ROOM.idFromName(code));

function inspect(code: string) {
  return runInDurableObject(stub(code), async (room: RacingRoom, state) => {
    const row = state.storage.sql.exec<{ v: string }>('SELECT v FROM kit_room WHERE k = 1').toArray()[0];
    const persist = row ? (JSON.parse(row.v) as { game: RoomState }) : null;
    return { max: room.maxStepWrites, total: room.totalWrites, persist };
  });
}

describe('登录闸门', () => {
  it('登录了给页面，没登录去登录页（带回房间号），平台不可用 503', async () => {
    const ok = await exports.default.fetch(`${BASE}/`, { headers: { cookie: '__Host-sid=g1' }, redirect: 'manual' });
    expect(ok.status).toBe(200);
    const anon = await exports.default.fetch(`${BASE}/?room=123456`, { headers: { cookie: '__Host-sid=anon' }, redirect: 'manual' });
    expect(anon.status).toBe(302);
    expect(anon.headers.get('location')).toBe(`/login?next=${encodeURIComponent('/games/racing/?room=123456')}`);
    const bad = await exports.default.fetch(`${BASE}/`, { headers: { cookie: '__Host-sid=bad' }, redirect: 'manual' });
    expect(bad.status).toBe(503);
    expect(await bad.text()).toContain('平台暂时连不上');
    const slash = await exports.default.fetch(`${SITE}/games/racing`, { redirect: 'manual' });
    expect(slash.status).toBe(301);
  });
});

describe('开房', () => {
  it('选项不合格回 400', async () => {
    expect((await createRoom(user(), JSON.stringify({ opts: { track: 'nope', laps: 1, cars: 4, level: 'mix' } }))).status).toBe(400);
    expect((await createRoom(user(), 'not json')).status).toBe(400);
    expect((await createRoom(user())).status).toBe(400);
  });

  it('两个真人、三台电脑跑完一场：每步写入 ≤ 2、看不到别人的手牌、电脑会发表情，跑完能"再来一场"', async () => {
    const a = user();
    const b = user();
    const res = await createRoom(a, JSON.stringify({ opts: { track: 'harbor', laps: 2, cars: 5, level: 'mix' } }));
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    const ca = await join(code, a);
    const cb = await join(code, b);
    advance(1_000);
    cb.send({ t: 'sit', seat: 2 });
    await cb.until((m) => m.t === 'state' && m.you.seat === 2);
    advance(1_000);
    ca.send({ t: 'start' });
    await ca.until((m) => m.t === 'state' && m.room.status === 'playing');
    const conns = [ca, cb];
    let moves = 0;
    let idle = 0;
    for (;;) {
      const top = conns.reduce((x, y) => ((x.last?.seq ?? -1) >= (y.last?.seq ?? -1) ? x : y));
      const v = top.view!;
      if (v.g.phase === 'over') break;
      // 交计划时两个人都可能要出；之后一次一个
      const who = conns.filter((c) => {
        const g = c.view?.g;
        if (!g || c.last!.seq !== top.last!.seq || c.seat === null) return false;
        if (g.phase === 'plan') return g.cars[c.seat]!.rank === null && !g.me!.plan;
        return g.cur === c.seat;
      });
      if (who.length === 0) {
        if (++idle > 500) throw new Error(`stuck at round ${v.g.round} ${v.g.phase}`);
        await sleep(10);
        continue;
      }
      idle = 0;
      for (const c of who) {
        const g = c.view!.g;
        // 视图里只有自己的手牌，没有密钥
        expect(g.me!.seat).toBe(c.seat);
        expect(JSON.stringify(g)).not.toContain('"key"');
        const id = `m${moves++}`;
        advance(1_000);
        c.act(id, { t: 'play', a: decide(g, c.seat!) });
        const ack = await c.until((m) => (m.t === 'state' && m.ack === id) || (m.t === 'error' && m.moveId === id));
        if (ack.t === 'error' && ack.code !== 'stale') throw new Error(`move rejected: ${ack.code}`);
      }
    }
    const { max, persist } = await inspect(code);
    expect(max).toBeLessThanOrEqual(2);
    expect(persist!.game.g.finished.length).toBe(5);
    // 电脑会互动（房间的 onStep + botEmote）：只有电脑座位（1、3、4）发，带 bot 标记，不写存储（上面的 ≤ 2 行照样成立）。
    // 房间的熵是真随机的，电脑的性格、说不说都跟着变：1 圈 2 台电脑时约 5% 的场次一句不说（测试偶发失败），
    // 所以跑 2 圈、3 台电脑，能说话的事多出好几倍；说什么、按什么规矩说由 test/banter.test.ts 用固定种子测
    const bots = ca.msgs.filter((m) => (m as { t: string }).t === 'emote') as unknown as { seat: number; id: number; bot?: boolean }[];
    expect(bots.length).toBeGreaterThan(0);
    for (const b of bots) {
      expect(b.bot).toBe(true);
      expect([1, 3, 4]).toContain(b.seat);
    }
    // 跑完：房间停着等"再来一场"
    await ca.until((m) => m.t === 'state' && !!m.room.pause);
    const id = 'next';
    advance(1_000);
    ca.act(id, { t: 'next', code: '654321' });
    await ca.until((m) => m.t === 'state' && m.ack === id);
    await cb.until((m) => m.t === 'state' && m.frames.at(-1)?.view?.next?.code === '654321');
  });
});
