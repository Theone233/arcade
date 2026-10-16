// art-preview.ts / cover.ts 用到的最小 Node 声明（项目没有 @types/node；只供 tsc 检查，运行时由 Node 22 提供）。
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
}
