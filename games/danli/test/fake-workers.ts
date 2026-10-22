/**
 * 测试用：在 Node 里顶替 Workers 运行时（vitest.config.ts 把 'cloudflare:workers' 指到这里），让 kit 的 GameRoom 在 vitest 里跑起来，
 * 用来数每一步写几行、量每一步的 CPU、把好友房从开房到打完走一遍（test/room-do.test.ts、test/cpu.test.ts）。
 * 只复刻 kit 房间用到的那几样：DurableObject 基类、SQLite 的那四句、闹钟、休眠 WebSocket（attachment、send、close）、WebSocketPair、101 回话。
 * 写入行数照 Cloudflare 的算法：建表 2 行、写一行状态 1 行（setAlarm、deleteAll 由 kit 自己记）。
 */

export class DurableObject<Env = unknown> {
  protected ctx: FakeCtx;
  protected env: Env;
  constructor(ctx: FakeCtx, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class WorkerEntrypoint {}

/** 一条连接（房间那一头）：发出去的消息记在 sent 里 */
export class FakeSocket {
  private att: unknown = null;
  readonly sent: string[] = [];
  closed: { code: number; reason: string } | null = null;
  readyState = 1;
  serializeAttachment(v: unknown): void {
    this.att = v === null || v === undefined ? null : structuredClone(v);
  }
  deserializeAttachment(): unknown {
    return this.att;
  }
  send(text: string): void {
    if (!this.closed) this.sent.push(text);
  }
  close(code: number, reason: string): void {
    this.closed ??= { code, reason };
    this.readyState = 3;
  }
  /** 收到的最后一条（解析好的） */
  last<T = Record<string, unknown>>(): T {
    return JSON.parse(this.sent[this.sent.length - 1]!) as T;
  }
}

class Cursor {
  readonly rowsWritten: number;
  private rows: unknown[];
  constructor(rows: unknown[], written: number) {
    this.rows = rows;
    this.rowsWritten = written;
  }
  toArray(): unknown[] {
    return this.rows;
  }
}

class FakeSql {
  table = false;
  row: string | null = null;
  exec(query: string, ...args: unknown[]): Cursor {
    const q = query.trim();
    if (q.startsWith('CREATE TABLE IF NOT EXISTS')) {
      const w = this.table ? 0 : 2;
      this.table = true;
      return new Cursor([], w);
    }
    if (q.startsWith('SELECT 1 FROM sqlite_master')) return new Cursor(this.table ? [{ 1: 1 }] : [], 0);
    if (q.startsWith('SELECT v FROM')) return new Cursor(this.table && this.row !== null ? [{ v: this.row }] : [], 0);
    if (q.startsWith('INSERT INTO')) {
      this.row = String(args[0]);
      return new Cursor([], 1);
    }
    throw new Error(`fake sql 不认识：${q}`);
  }
}

export class FakeStorage {
  readonly sql = new FakeSql();
  alarm: number | null = null;
  private kv = new Map<string, unknown>();
  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async setAlarm(t: number): Promise<void> {
    this.alarm = t;
  }
  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
  async deleteAll(): Promise<void> {
    this.sql.table = false;
    this.sql.row = null;
    this.kv.clear();
  }
  async get(k: string): Promise<unknown> {
    return this.kv.get(k);
  }
  async put(k: string, v: unknown): Promise<void> {
    this.kv.set(k, v);
  }
  /** 存储里那一行的字节数 */
  get bytes(): number {
    return this.sql.row === null ? 0 : new TextEncoder().encode(this.sql.row).byteLength;
  }
}

export class FakeCtx {
  readonly storage = new FakeStorage();
  readonly sockets: FakeSocket[] = [];
  readonly id = { toString: () => 'fake' };
  acceptWebSocket(ws: FakeSocket): void {
    this.sockets.push(ws);
  }
  getWebSockets(): FakeSocket[] {
    return this.sockets.filter((s) => !s.closed);
  }
  setWebSocketAutoResponse(): void {}
  waitUntil(): void {}
}

const g = globalThis as Record<string, unknown>;
g.WebSocketPair ??= class {
  0 = new FakeSocket();
  1 = new FakeSocket();
};
g.WebSocketRequestResponsePair ??= class {};
// Node 的 Response 不收 101：换成 200，把 webSocket 挂上
if (!(g.Response as { kitFake?: boolean }).kitFake) {
  const Orig = globalThis.Response;
  class Res extends Orig {
    static kitFake = true;
    webSocket: unknown;
    constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
      super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      this.webSocket = init?.webSocket ?? null;
    }
  }
  g.Response = Res;
}
