import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BRAG_LINES,
  DIFFICULTIES,
  ITEMS,
  PERSONAS,
  createRun,
  difficultiesView,
  difficultyView,
  itemView,
  makeComments,
  themeById,
  type DayReport,
  type Dir,
} from '../src/core/index.ts';
import { STAGE_LABEL } from '../src/core/labels.ts';

/** 小白试读（novice-review-031）里规则层那部分的回归检查。 */
describe('小白试读：道具、人设、难度的说明', () => {
  it('道具和人设的说明不用乘号，改说"多 / 少百分之几""只亏几成""是原来的几倍"', () => {
    for (const d of ITEMS) expect(d.desc(), d.id).not.toMatch(/×/);
    for (const d of PERSONAS) expect(d.desc(), d.id).not.toMatch(/×/);
    expect(ITEMS.find((d) => d.id === 'margin')?.desc()).toBe('每天赚的钱多 8%，亏的钱也多 8%');
    expect(ITEMS.find((d) => d.id === 'diversify')?.desc()).toBe('手里的股票分在 4 个或更多风口时，亏钱的日子只亏七成');
    expect(ITEMS.find((d) => d.id === 'genfeng')?.desc()).toMatch(/本来会多涨 2%，现在变成多涨 4%$/);
  });

  it('奖励卡和道具的分类合成一行："道具（常见）"，不再出现打法 / 工具 / 人脉', () => {
    for (const d of ITEMS) {
      const v = itemView(d.id);
      expect(v.tag).toMatch(/^道具（(常见|稀有|传奇)）$/);
    }
  });

  it('难度：desc 只说一句体感、不带数字；数字放 detail，画面数据里带着', () => {
    for (const d of DIFFICULTIES) {
      expect(d.desc, d.id).not.toMatch(/[0-9×]/);
      if (d.detail === undefined) continue;
      expect(d.detail.length, d.id).toBeGreaterThan(d.desc.length);
      expect(d.detail, d.id).not.toMatch(/×/);
    }
    for (const v of difficultiesView()) {
      const def = DIFFICULTIES.find((d) => d.level === v.level)!;
      expect(v.detail).toBe(def.detail ?? null);
      expect(v.all.at(-1)).toEqual({ level: v.level, name: def.name, desc: def.desc, detail: def.detail ?? null });
    }
    expect(difficultyView(2).detail).toMatch(/每月要还的钱多 \d+%/);
  });

  it('看板阶段叫"快正火"（0.5.3 和看板的两字签统一）；成就里不再说爆仓', () => {
    expect(STAGE_LABEL.ferment).toBe('快正火');
    for (const a of ACHIEVEMENTS) expect(a.desc, a.id).not.toMatch(/爆仓/);
    expect(ACHIEVEMENTS.find((a) => a.id === 'cat_rich')?.desc).toContain('猫把耳机线当面条吃了');
  });
});

describe('小白试读：群友说对之后的得意跟着他说的方向', () => {
  const NOT_FOR: Record<Dir, RegExp> = { up: /跌|凉|不动|躺平/, down: /起飞|涨了|不动|躺平/, flat: /起飞|涨|跌|凉/ };

  it('台词表：每个群友三个方向都有，说"不动"说对了不喊"起飞"', () => {
    for (const [id, byDir] of Object.entries(BRAG_LINES)) {
      for (const dir of ['up', 'down', 'flat'] as const) {
        expect(byDir[dir].length, `${id} ${dir}`).toBeGreaterThan(0);
        for (const line of byDir[dir]) expect(line, `${id} ${dir}`).not.toMatch(NOT_FOR[dir]);
      }
    }
  });

  it('收盘时按 claim 挑台词', () => {
    const s = createRun('brag-dir').state;
    for (const claim of ['up', 'down', 'flat'] as const) {
      for (let day = 1; day <= 30; day++) {
        const report = {
          day,
          holdings: [],
          stocks: [],
          themes: [],
          account: { before: 1e5, after: 1e5, ret: 0, effects: [] },
          messages: [{ index: 0, friendId: 'xiaoli', theme: 'ai', claim, truth: claim, hit: true }],
        } as unknown as DayReport;
        const brag = makeComments(s, report).find((c) => c.mood === 'smug');
        const lines = BRAG_LINES.xiaoli![claim].map((l) => l.replace('{theme}', themeById('ai').name));
        expect(lines, `${claim} day ${day}`).toContain(brag?.text);
      }
    }
  });
});
