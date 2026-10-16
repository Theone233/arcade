// 美术生成脚本用到的最小 Node 声明（项目未安装 @types/node，见 tools/node-env.d.ts）。
declare module 'node:fs' {
  export function readFileSync(path: string, enc: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string, opts?: { recursive?: boolean }): string[];
}

// 以下供 tools/art/bake.ts（图集烘焙）使用：二进制读写、单文件删除、zlib 压缩、CPU 数与 base64 解码。
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function unlinkSync(path: string): void;
  export function renameSync(from: string, to: string): void;
}
declare module 'node:zlib' {
  export function deflateSync(data: Uint8Array, opts?: { level?: number; memLevel?: number; strategy?: number }): Uint8Array;
}
declare module 'node:os' {
  export function availableParallelism(): number;
}
declare module 'node:buffer' {
  export const Buffer: {
    from(data: string, enc: 'base64'): Uint8Array;
    from(data: Uint8Array): Uint8Array & { toString(enc: 'base64'): string };
  };
}
declare module 'node:crypto' {
  export function createHash(alg: 'sha256'): { update(data: Uint8Array): { digest(enc: 'hex'): string } };
}
