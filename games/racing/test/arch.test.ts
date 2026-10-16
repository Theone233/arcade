/**
 * 架构约束（AGENTS.md 第 4 节、DESIGN.md 第 11 节）：规则核心、赛道数据、电脑是纯函数、确定性；
 * 规则核心不碰赛道的画法；电脑只看视图（不认识状态类型）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const PURE = [...files('src/core'), ...files('src/track').filter((f) => !f.endsWith('shape.ts')), ...files('src/ai'), ...files('src/room'), ...files('src/game')];
const BANNED = [/Math\.random/, /Date\.now/, /new Date/, /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|sqrt|cbrt|hypot)\b/, /performance\.now/, /\bdocument\b/, /\bwindow\b/, /\bfetch\(/];

describe('纯函数', () => {
  for (const f of PURE) {
    it(f, () => {
      const src = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const re of BANNED) expect(src, `${f} 用了 ${re}`).not.toMatch(re);
    });
  }
});

describe('分层', () => {
  it('规则核心、赛道数据、电脑不 import 画法和画面', () => {
    for (const f of PURE) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).not.toMatch(/from '.*shape(\.ts)?'/);
      expect(src, f).not.toMatch(/from '.*\/view\//);
    }
  });

  it('规则核心和电脑开车不碰交流：读不到任何短语、表情（DESIGN.md 6.2 的公平底线）', () => {
    for (const f of [...files('src/core'), ...files('src/ai')]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).not.toMatch(/from '.*\/game\/(banter|emotes)(\.ts)?'/);
      expect(src, f).not.toMatch(/from '.*comms(\.ts)?'/);
    }
  });

  it('电脑只看视图：不用状态类型', () => {
    for (const f of files('src/ai')) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).not.toMatch(/\bState\b/);
    }
  });
});
