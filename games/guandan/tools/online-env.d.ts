// room-sim.ts / online-dev.ts 用到的最小 Node 声明（项目没有 @types/node；只供 tsc 检查，运行时由 Node 提供）。
// 和 node-env.d.ts、art-env.d.ts 里的同名模块声明合并。
declare module 'node:os' {
  export function availableParallelism(): number;
}
declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare module 'node:net' {
  interface AddressInfo {
    port: number;
  }
  interface Server {
    listen(port: number, host: string, cb: () => void): Server;
    address(): AddressInfo | string | null;
    close(cb?: () => void): Server;
    once(event: 'error', cb: (e: Error) => void): Server;
  }
  export function createServer(): Server;
}
declare module 'node:worker_threads' {
  interface Port {
    postMessage(value: unknown): void;
  }
  export const isMainThread: boolean;
  export const parentPort: Port | null;
  export const workerData: unknown;
  export class Worker {
    constructor(url: URL | string, opts?: { workerData?: unknown });
    once(event: 'message', cb: (value: unknown) => void): this;
    once(event: 'error', cb: (e: Error) => void): this;
  }
}
declare module 'node:child_process' {
  interface Readable {
    on(event: 'data', cb: (chunk: { toString(): string }) => void): Readable;
  }
  export interface ChildProcess {
    readonly pid?: number;
    readonly exitCode: number | null;
    readonly stdout: Readable | null;
    readonly stderr: Readable | null;
    kill(signal?: string): boolean;
    once(event: 'exit', cb: (code: number | null, signal: string | null) => void): ChildProcess;
    once(event: 'error', cb: (e: Error) => void): ChildProcess;
  }
  export function spawn(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: Record<string, string | undefined>; stdio?: unknown; detached?: boolean },
  ): ChildProcess;
}
