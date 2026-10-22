/**
 * 测试用：在 Node 里开一个真的 kit 房间（worker/room.ts 的 DanliRoom，跑在 fake-workers.ts 顶替的运行时上），
 * 像浏览器一样进房、发消息，像运行时一样到点叫醒闹钟、把房间驱逐掉再建。
 * 时间是假的（Date.now 换成 clock.now，kit 的房间只用它）：闹钟、超时、掉线宽限一下就到；不依赖 vitest，scripts/cpu.ts 用普通 Node 也能跑。
 */
import type { RoomInfo } from 'arcade-kit/protocol';
import type { NetAction, RoomView } from '../src/net/rules.ts';
import { FakeCtx, FakeSocket } from './fake-workers.ts';

interface RoomLike {
  kitCreate(code: string, host: { userId: string; name: string }): Promise<{ r: string }>;
  fetch(req: Request): Promise<Response>;
  webSocketMessage(ws: unknown, msg: string): Promise<void>;
  webSocketClose(ws: unknown, code: number): Promise<void>;
  alarm(): Promise<void>;
  lastStepWrites: number;
  maxStepWrites: number;
  totalWrites: number;
}
type RoomClass = new (ctx: FakeCtx, env: unknown) => RoomLike;

/** 假时钟：install 以后 Date.now() 回 clock.now，restore 换回真的 */
export const clock = {
  now: 1_800_000_000_000,
  real: Date.now,
  install(): void {
    Date.now = () => clock.now;
  },
  restore(): void {
    Date.now = clock.real;
  },
  advance(ms: number): void {
    clock.now += ms;
  },
};

/** worker/room.ts 用了 Workers 的类型，页面的 tsconfig 不认识：按路径动态引（vitest 照常解析、走 fake-workers） */
export async function roomClass(): Promise<RoomClass> {
  const path = '../worker/room.ts';
  return ((await import(/* @vite-ignore */ path)) as { DanliRoom: RoomClass }).DanliRoom;
}

export interface Down {
  t: string;
  seq?: number;
  code?: string;
  room?: RoomInfo;
  view?: RoomView;
  frames?: { view: RoomView; delay: number }[];
  you?: { seat: number | null };
  now?: number;
}

/** 一个"浏览器"：房间那一头的连接，和它看到的最新 seq、视图 */
export class Peer {
  readonly ws: FakeSocket;
  readonly user: string;
  private read = 0;
  seq = -1;
  view: RoomView | null = null;
  room: RoomInfo | null = null;
  seat: number | null = null;
  errors: string[] = [];
  private moves = 0;
  constructor(ws: FakeSocket, user: string) {
    this.ws = ws;
    this.user = user;
  }
  /** 把房间发来的新消息读一遍 */
  pump(): Down[] {
    const out: Down[] = [];
    for (; this.read < this.ws.sent.length; this.read++) {
      const m = JSON.parse(this.ws.sent[this.read]!) as Down;
      out.push(m);
      if (m.t === 'error') this.errors.push(m.code!);
      if (m.seq !== undefined && m.seq >= this.seq) this.seq = m.seq;
      if (m.room) this.room = m.room;
      if (m.you) this.seat = m.you.seat;
      if (m.t === 'welcome') this.view = m.view ?? null;
      if (m.t === 'state' && m.frames?.length) this.view = m.frames[m.frames.length - 1]!.view;
    }
    return out;
  }
  nextMoveId(): string {
    return `${this.user}-${this.moves++}`;
  }
}

export class Harness {
  readonly ctx = new FakeCtx();
  readonly code = '123456';
  room: RoomLike;
  private Cls: RoomClass;
  /** 每一步写了几行（开房那一步另算，和 kit 一样） */
  readonly steps: number[] = [];

  constructor(Cls: RoomClass) {
    this.Cls = Cls;
    this.room = new Cls(this.ctx, {});
  }

  private note(): void {
    this.steps.push(this.room.lastStepWrites);
  }

  async create(host: string): Promise<void> {
    const r = await this.room.kitCreate(this.code, { userId: host, name: host });
    if (r.r !== 'created') throw new Error(`开房失败：${r.r}`);
  }

  async join(user: string, name = user): Promise<Peer> {
    const before = this.ctx.sockets.length;
    await this.room.fetch(
      new Request(`https://arcade-kit.internal/ws?cv=0&code=${this.code}`, {
        headers: { upgrade: 'websocket', 'x-kit-user': encodeURIComponent(JSON.stringify({ userId: user, name })) },
      }),
    );
    this.note();
    const p = new Peer(this.ctx.sockets[before]!, user);
    p.pump();
    return p;
  }

  async send(p: Peer, msg: Record<string, unknown>): Promise<Down[]> {
    // 真人点得没那么快：kit 每人每秒 5 条（令牌桶），假时钟不走的话几下就被当成刷屏断开
    clock.advance(250);
    if (p.ws.closed) throw new Error(`${p.user} 的连接已经断了：${JSON.stringify(p.ws.closed)}`);
    await this.room.webSocketMessage(p.ws, JSON.stringify(msg));
    this.note();
    return p.pump();
  }

  async act(p: Peer, action: NetAction | Record<string, unknown>): Promise<Down[]> {
    return this.send(p, { t: 'act', moveId: p.nextMoveId(), baseSeq: p.seq, action });
  }

  /** 到闹钟的时间，叫醒房间 */
  async alarm(): Promise<void> {
    const at = this.ctx.storage.alarm;
    if (at === null) throw new Error('房间没设闹钟');
    clock.now = Math.max(clock.now, at);
    this.ctx.storage.alarm = null;
    await this.room.alarm();
    this.note();
  }

  async drop(p: Peer): Promise<void> {
    p.ws.close(1006, 'gone');
    await this.room.webSocketClose(p.ws, 1006);
    this.note();
  }

  /** 驱逐：内存里的东西全丢掉，下一个入口从存储重建 */
  evict(): void {
    this.room = new this.Cls(this.ctx, {});
  }

  get maxWrites(): number {
    return Math.max(0, ...this.steps);
  }
}
