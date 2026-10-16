import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('架构约束', () => {
  const pure = [...files('src/core'), ...files('src/ai'), ...files('src/room'), 'src/bot.ts'];

  it('规则核心和电脑里没有 Math.random、时间、平台相关的数学函数、DOM 和网络', () => {
    const banned = /Math\.(random|exp|log|log2|log10|pow|sqrt|sin|cos|tan|atan2|hypot|cbrt)\b|\bDate\b|performance\.|crypto\.|\bwindow\b|\bdocument\b|\bfetch\(|localStorage|setTimeout|setInterval|\*\*|from 'node:/;
    for (const f of pure) expect(read(f).match(banned)?.[0], f).toBeUndefined();
  });

  it('电脑只拿视图：src/ai 不引用完整状态，只用类型引用规则', () => {
    for (const f of files('src/ai')) {
      const src = read(f);
      expect(src, f).not.toMatch(/\bTable\b|\bSeatState\b|\.deck\b|\.seed\b/);
      for (const m of src.matchAll(/^import (.*) from '(.*)';$/gm))
        if (m[2]!.includes('core/table') || m[2]!.includes('core/view')) expect(m[1], f).toMatch(/^type /);
    }
  });

  it('规则核心不引用电脑和页面；好友房的规则不引用页面（房间和页面共用）', () => {
    for (const f of files('src/core')) expect(read(f), f).not.toMatch(/from '\.\.\/(ai|view|net|room)\//);
    for (const f of files('src/room')) expect(read(f), f).not.toMatch(/from '\.\.\/(view|net)\/|from '\.\.\/(main|solo)\.ts'/);
  });

  it('浏览器存储的键都以 texas. 开头（和平台、别的游戏同域，前缀是唯一的隔离）', () => {
    const page = files('src').filter((f) => !f.startsWith('src/core') && !f.startsWith('src/ai'));
    const keys: string[] = [];
    for (const f of page) {
      const src = read(f);
      // 直接写在 getItem / setItem / removeItem 里的字面量（拼出来的 `${key}.restored` 由下面的常量管）
      for (const m of src.matchAll(/Item\(\s*(['"`])((?!\$\{)[^'"`]*)\1/g)) keys.push(`${f}: ${m[2]}`);
      // 存成常量的键：SESSION_KEY、SETTINGS 这类，和 cloud.ts 的 KEYS
      for (const m of src.matchAll(/const [A-Z_]*(?:KEY|SETTINGS)[A-Z_]* = (['"`])([^'"`]*)\1/g)) keys.push(`${f}: ${m[2]}`);
      const block = /export const KEYS = \{([\s\S]*?)\} as const/.exec(src)?.[1];
      if (block) for (const m of block.matchAll(/(['"`])([^'"`]*)\1/g)) keys.push(`${f}: ${m[2]}`);
    }
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) expect(k).toMatch(/: texas\./);
  });
});
