/**
 * 架构约束（AGENTS.md 第 4 节）：规则核心、地图数据、电脑是纯函数、确定性——
 * 不用 Math.random、Date、三角函数和开方这类结果依赖平台的数学函数，不碰 DOM、网络；规则核心和电脑不 import 画面。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { purposeHash } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const PURE = [...files('src/core'), ...files('src/ai')];
const BANNED = [
  /Math\.random/,
  /Date\.now/,
  /new Date/,
  /\bDate\(/,
  /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|sqrt|cbrt|hypot)\b/,
  /\*\*/,
  /performance\.now/,
  /\bdocument\b/,
  /\bwindow\b/,
  /\bfetch\(/,
  /localStorage/,
];

describe('纯函数', () => {
  it('有文件可查', () => expect(PURE.length).toBeGreaterThan(5));
  for (const f of PURE) {
    it(f, () => {
      const src = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const re of BANNED) expect(src, `${f} 用了 ${re}`).not.toMatch(re);
    });
  }
});

describe('分层', () => {
  it('规则核心和电脑不 import 画面和页面', () => {
    for (const f of PURE) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).not.toMatch(/from '.*\/view\//);
      expect(src, f).not.toMatch(/from '.*\/(main|solo)(\.ts)?'/);
    }
  });

  it('规则核心不 import 电脑', () => {
    for (const f of files('src/core')) expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/from '.*\/ai\//);
  });
});

describe('随机分流', () => {
  it('用途名的哈希互不相撞', () => {
    const names = ['open', 'wind', 'ai'];
    expect(new Set(names.map(purposeHash)).size).toBe(names.length);
  });

  it('规则和电脑只用这几个用途', () => {
    for (const f of PURE) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(/stream\([^,]+,\s*'([^']+)'/g)) expect(['open', 'wind', 'ai'], f).toContain(m[1]);
    }
  });
});

describe('存储', () => {
  it('浏览器存储的键都带 danli. 前缀', () => {
    for (const f of [...files('src'), ...files('scripts')]) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*'([^']+)'/g)) expect(m[1], f).toMatch(/^danli\./);
      for (const m of src.matchAll(/_KEY = '([^']+)'/g)) expect(m[1], f).toMatch(/^danli\./);
    }
  });
});
