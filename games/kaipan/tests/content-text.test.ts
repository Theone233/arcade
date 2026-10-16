import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BILL_NAMES,
  BLAME_LINES,
  BRAG_LINES,
  CALENDAR,
  CHEER_LINES,
  DIFFICULTIES,
  EVENTS,
  FRIENDS,
  ITEMS,
  MESSAGE_LINES,
  MOCK_LINES,
  PERSONAS,
  REC_LINES,
  STOCKS,
  SURPRISE_BILLS,
  THEMES,
  TURN_LINES,
  codex,
  createRun,
  eventById,
  eventView,
  rngFor,
} from '../src/core/index.ts';

/** core 源码（文本）：事件结果、触发说明等运行时才拼出来的文案也在这里。 */
const coreSources = import.meta.glob('../src/core/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const PICTO = /\p{Extended_Pictographic}/u;

/** 收集一个值里的所有字符串（递归）。 */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

describe('文案不含 emoji（没有彩色 emoji 字体的环境会显示成方框）', () => {
  it('core 源码里没有 Extended_Pictographic 字符', () => {
    for (const [path, src] of Object.entries(coreSources)) {
      const m = src.match(new RegExp(PICTO.source, 'gu'));
      expect(m, path).toBeNull();
    }
  });

  it('内容表、台词、图鉴、人设、难度、成就、事件文案都没有 emoji', () => {
    const all = strings([
      THEMES,
      STOCKS,
      FRIENDS,
      MESSAGE_LINES,
      TURN_LINES,
      REC_LINES,
      BRAG_LINES,
      BLAME_LINES,
      CHEER_LINES,
      MOCK_LINES,
      BILL_NAMES,
      SURPRISE_BILLS,
      CALENDAR.map((c) => [c.name, c.desc]),
      ITEMS.map((d) => [d.name, d.desc(), d.flavor]),
      PERSONAS.map((d) => [d.name, d.title, d.desc(), d.flavor]),
      DIFFICULTIES.map((d) => [d.name, d.desc, d.detail ?? '']),
      ACHIEVEMENTS.map((d) => [d.name, d.desc]),
      codex(),
    ]);
    // 事件：摆一个能出现的局面，取正文和两个选项
    const s = createRun('emoji', { account: 1e6, themes: ['ai', 'newenergy', 'consumer', 'finance', 'lowalt', 'pig'] }).state;
    s.month = 1;
    for (const d of EVENTS) {
      const data = eventById(d.id).prepare({ state: s, rng: rngFor('emoji', d.id), month: 1 });
      if (!data) continue;
      const st = { ...s, phase: 'event' as const, event: { ...data, id: d.id, month: 1 } };
      const v = eventView(st);
      all.push(d.name, v?.text ?? '', ...(v?.options ?? []));
    }
    expect(all.length).toBeGreaterThan(500);
    const bad = all.filter((t) => PICTO.test(t));
    expect(bad).toEqual([]);
  });
});
