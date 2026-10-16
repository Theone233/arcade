import { describe, expect, it } from 'vitest';

/** core 层源码（以文本形式导入，不执行）。 */
const coreSources = import.meta.glob('../src/core/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** 去掉注释，避免说明文字里的示例触发规则。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: readonly [RegExp, string][] = [
  [/from\s+['"]phaser['"]/, '不能依赖 Phaser'],
  [/from\s+['"]\.\.?\/(\.\.\/)*(view|debug|platform)\b/, '不能依赖 view/debug/platform'],
  [/\b(window|document|localStorage|navigator)\b/, '不能使用浏览器全局对象'],
  [/Math\.random|Date\.now|new Date\b|performance\.now/, '随机数与时间必须来自种子'],
  [/Math\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/, '该数学函数在不同引擎下结果可能不同'],
  [/[\w)\]]\s*\*\*\s*[\w(]/, '幂运算在不同引擎下结果可能不同'],
  [/toLocale\w*\(/, '格式化不能依赖系统区域设置'],
  [/\bprocess\s*\.|\bimport\.meta\.env\b/, '不能读 process / 环境变量（浏览器里没有；模拟需要的开关放在 tools/ 里注入）'],
];

describe('架构约束', () => {
  it('能找到 core 源码', () => {
    expect(Object.keys(coreSources).length).toBeGreaterThan(5);
  });

  for (const [path, raw] of Object.entries(coreSources)) {
    it(`${path.replace('../src/', '')} 保持纯逻辑与确定性`, () => {
      const code = stripComments(raw);
      for (const [pattern, reason] of FORBIDDEN) {
        expect(pattern.test(code), `${reason}：${pattern}`).toBe(false);
      }
    });
  }
});
