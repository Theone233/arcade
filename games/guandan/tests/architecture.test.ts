import { describe, expect, it } from 'vitest';

/** core、ai 与实盘规则（stake）的源码（以文本形式导入，不执行）。 */
const sources = import.meta.glob(['../src/core/**/*.ts', '../src/ai/**/*.ts', '../src/stake/**/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** 去掉注释，避免说明文字里的示例触发规则。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: readonly [RegExp, string][] = [
  [/from\s+['"]phaser['"]/, '不能依赖 Phaser'],
  [/from\s+['"]\.\.?\/(\.\.\/)*(view|debug|platform)\b/, '不能依赖画面层'],
  [/\b(window|document|localStorage|sessionStorage|navigator|HTMLElement)\b/, '不能使用浏览器全局对象（DOM）'],
  [/Math\.random|Date\.now|new Date\b|\bDate\(|performance\.now/, '随机数与时间必须来自种子'],
  [/Math\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/, '该数学函数在不同引擎下结果可能不同'],
  [/[\w)\]]\s*\*\*\s*[\w(]/, '幂运算在不同引擎下结果可能不同'],
  [/toLocale\w*\(/, '格式化不能依赖系统区域设置'],
  [/\bprocess\s*\.|\bimport\.meta\.env\b/, '不能读 process / 环境变量'],
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket/, '不能访问网络'],
];

describe('架构约束：core、ai、stake 保持纯逻辑与确定性', () => {
  it('能找到源码', () => {
    expect(Object.keys(sources).filter((p) => p.includes('/stake/')).length).toBeGreaterThan(0);
    expect(Object.keys(sources).filter((p) => p.includes('/core/')).length).toBeGreaterThan(4);
    expect(Object.keys(sources).filter((p) => p.includes('/ai/')).length).toBeGreaterThan(2);
  });

  for (const [path, raw] of Object.entries(sources)) {
    it(`${path.replace('../src/', '')}`, () => {
      const code = stripComments(raw);
      for (const [pattern, reason] of FORBIDDEN) {
        expect(pattern.test(code), `${reason}：${pattern}`).toBe(false);
      }
    });
  }

  it('core、ai 从 arcade-kit 只用纯函数的随机数（rng），不碰房间、Worker、浏览器连接器', () => {
    for (const [path, raw] of Object.entries(sources)) {
      for (const m of stripComments(raw).matchAll(/from\s+['"](arcade-kit[^'"]*)['"]/g)) expect(m[1], path).toBe('arcade-kit/rng');
    }
  });

  it('ai、stake 只通过 core 的公开入口取规则', () => {
    for (const [path, raw] of Object.entries(sources)) {
      if (!path.includes('/ai/') && !path.includes('/stake/')) continue;
      for (const m of stripComments(raw).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        if (spec.startsWith('../core')) expect(spec, path).toBe('../core/index.ts');
      }
    }
  });
});
