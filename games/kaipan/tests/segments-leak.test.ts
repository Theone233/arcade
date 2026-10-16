/**
 * 0.4.0 防泄漏：玩家在浏览器网络面板里能看到 public/data/segments 下的文件名和内容，
 * 这里不得出现真实年份、日期（YYYY-MM、YYYY-MM-DD）、大事原文和年份类字段。
 * 段 id 和真实年份的对照只在 tools/data/segments-manifest.json。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_IDS, checkSegment, createRun, storyView, type Segment, type SegmentIndex } from '../src/core/index.ts';

const DIR = 'public/data/segments';
const files = readdirSync(DIR);
const YEAR = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/;
const DATE = /\d{4}[-/.年]\d{1,2}/;
/** 运行时用不到、又会透露年代的字段 */
const BANNED_KEYS = new Set(['year', 'years', 'from', 'to', 'date', 'dates', 'updated', 'text', 'quip', 'key', 'code', 'ticker']);

/** 走一遍 JSON：键名、字符串值，以及不在逐日收益数组里的单个数字。 */
function scan(x: unknown, path: string, out: string[]): void {
  if (Array.isArray(x)) {
    // 逐日收益（基点）数组里的数字可能碰巧落在 1950–2049，不算
    if (x.every((v) => typeof v === 'number')) return;
    x.forEach((v, i) => scan(v, `${path}[${i}]`, out));
    return;
  }
  if (typeof x === 'string') {
    if (YEAR.test(x) || DATE.test(x)) out.push(`${path}: ${x.slice(0, 60)}`);
    return;
  }
  if (typeof x === 'number') {
    if (Number.isInteger(x) && x >= 1950 && x <= 2049) out.push(`${path}: ${x}`);
    return;
  }
  if (typeof x === 'object' && x !== null) {
    for (const [k, v] of Object.entries(x)) {
      if (BANNED_KEYS.has(k)) out.push(`${path}.${k}（不该有的字段）`);
      if (YEAR.test(k) || DATE.test(k)) out.push(`${path} 的键 ${k}`);
      scan(v, `${path}.${k}`, out);
    }
  }
}

describe('行情段不泄漏年份', () => {
  it('文件名是不透明 id，不含年份和日期', () => {
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) {
      if (f === 'index.json') continue;
      expect(f).toMatch(/^seg_[0-9a-f]{10}\.json$/);
      expect(f).not.toMatch(YEAR);
    }
  });

  it('目录和段文件的内容里没有年份、日期、原文类字段', () => {
    const bad: string[] = [];
    for (const f of files) {
      const raw = readFileSync(`${DIR}/${f}`, 'utf8');
      // 原文里的 YYYY-MM、YYYY-MM-DD（不管在哪个字段）
      if (/\d{4}-\d{2}/.test(raw)) bad.push(`${f}：出现 YYYY-MM`);
      scan(JSON.parse(raw), f, bad);
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('目录只有 id 和文件名，段 id 和文件名一致，段文件都能通过校验', () => {
    const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as SegmentIndex;
    for (const e of index.segments) {
      expect(Object.keys(e).sort()).toEqual(['file', 'id']);
      expect(e.file).toBe(`${e.id}.json`);
      const seg = JSON.parse(readFileSync(`${DIR}/${e.file}`, 'utf8')) as Segment;
      expect(seg.id).toBe(e.id);
      expect(checkSegment(seg, THEME_IDS)).toBeNull();
    }
    expect(new Set(index.segments.map((e) => e.id)).size).toBe(index.segments.length);
  });

  it('对照表（只在 tools/data）覆盖所有段', () => {
    const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as SegmentIndex;
    const manifest = JSON.parse(readFileSync('tools/data/segments-manifest.json', 'utf8')) as { id: string; key: string }[];
    expect(manifest.map((m) => m.id)).toEqual(index.segments.map((e) => e.id));
  });

  it('画面包里不放按真实日期排的大事表', () => {
    const tales = readFileSync('src/core/content/tales.ts', 'utf8');
    expect(tales).not.toMatch(/'\d{4}-\d{2}-\d{2}'/);
  });
});

describe('0.4 开发期旧存档的真实行情（带真实日期和原文）', () => {
  it('照样能讲局末故事，不报错、不露日期', () => {
    const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as SegmentIndex;
    const seg = JSON.parse(readFileSync(`${DIR}/${index.segments[0]?.file}`, 'utf8')) as Segment;
    const s = createRun('legacy-real', null, { segment: seg }).state;
    const real = s.real;
    if (!real) throw new Error('没有真实行情');
    // 模拟旧存档：起止日期、年份、date/text 格式的大事（含一条带敏感词的，应被过滤）
    Object.assign(real, { segId: '1996-01-bull', from: '1996-01-02', to: '1996-03-22', year: 1996 });
    real.events = [
      { date: '1996-02-08', text: '新规矩下来了，电话和电视可以互相抢生意', quip: '' },
      { date: '1996-03-01', text: '某地地震', quip: '' },
    ];
    s.phase = 'won';
    s.dayIndex = real.days;
    const v = storyView(s);
    expect(v?.lines.length).toBeGreaterThanOrEqual(4);
    const text = (v?.lines ?? []).join('');
    expect(text).not.toMatch(/(19|20)\d\d|地震/);
  });
});
