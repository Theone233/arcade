/**
 * 0.4 重做里程碑 B：真实行情段与真实走势驱动。
 */
import { readFileSync } from 'node:fs';
import { monthThemeById } from '../src/core/content/monthThemes.ts';
import { rulesFor } from '../src/core/market.ts';
import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  REGIMES,
  STAGES,
  THEME_IDS,
  checkSegment,
  crashPlan,
  createRun,
  dailySetup,
  dispatch,
  hashSeed,
  pickSegmentId,
  replay,
  storyView,
  runSummary,
  stockById,
  themeBoard,
  totalDays,
  type GameState,
  type Segment,
  type SegmentIndex,
  type Stage,
} from '../src/core/index.ts';
import { emptyProfile, recordRun, reviveProfile } from '../src/platform/profile.ts';
import { reviveState } from '../src/platform/storage.ts';
import { botByName, playRun, useMarket } from '../tools/bots.ts';

const DIR = 'public/data/segments';
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as SegmentIndex;
const load = (id: string): Segment => JSON.parse(readFileSync(`${DIR}/${index.segments.find((s) => s.id === id)?.file}`, 'utf8')) as Segment;
const segs = index.segments.map((e) => load(e.id));
/** 段 id ↔ 真实年份、日期的对照（只在数据工具里，段文件里没有） */
const manifest = JSON.parse(readFileSync('tools/data/segments-manifest.json', 'utf8')) as { id: string; key: string; from: string; to: string; year: number }[];
const meta = (id: string): { key: string; from: string; to: string; year: number } => {
  const m = manifest.find((x) => x.id === id);
  if (!m) throw new Error(`对照表里没有 ${id}`);
  return m;
};
const crash = segs.find((s) => s.regime === 'crash') as Segment;

function play(seed: string, seg: Segment | null, bot = 'normal', difficulty = 1): GameState {
  useMarket(() => seg);
  try {
    return playRun(seed, botByName(bot), { difficulty });
  } finally {
    useMarket(null);
  }
}

describe('行情段文件', () => {
  it('全量 1996–2018：100–300 段，五种市况各至少 12 段，每段都能通过校验', () => {
    expect(segs.length).toBeGreaterThanOrEqual(100);
    expect(segs.length).toBeLessThanOrEqual(300);
    for (const r of REGIMES) expect(segs.filter((s) => s.regime === r).length, r).toBeGreaterThanOrEqual(12);
    expect(new Set(segs.map((s) => meta(s.id).year)).size).toBeGreaterThanOrEqual(22);
    for (const s of segs) {
      expect(checkSegment(s, THEME_IDS)).toBeNull();
      expect(s.days).toBe(totalDays());
      expect(s.market.length).toBe(s.warm + s.days);
      expect(REGIMES).toContain(s.regime);
    }
  });

  it('相邻两段（按开局日排）一局里最多重叠三分之一的交易日', () => {
    const sorted = [...segs].sort((a, b) => meta(a.id).from.localeCompare(meta(b.id).from));
    for (let k = 1; k < sorted.length; k++) {
      const a = sorted[k - 1] as Segment;
      const b = sorted[k] as Segment;
      expect(meta(b.id).from > meta(a.id).from).toBe(true);
      if (meta(b.id).from > meta(a.id).to) continue;
      // 重叠部分的大盘逐日收益一模一样：找 b 的开局日落在 a 的第几天
      const pa = a.market.slice(a.warm);
      const pb = b.market.slice(b.warm);
      let overlap = 0;
      for (let off = 1; off < pa.length; off++) {
        const n = pa.length - off;
        if (pa.slice(off).every((x, i) => x === pb[i]) && n >= 3) {
          overlap = n;
          break;
        }
      }
      expect(overlap, `${a.id} / ${b.id}`).toBeLessThanOrEqual(Math.floor(a.days / 3));
    }
  });

  it('不存真实价格（只有基点收益），大事只取段内日期、最多 5 条', () => {
    for (const s of segs) {
      const text = JSON.stringify(s);
      expect(text).not.toMatch(/"(o|h|l|c|price|ticker)"/);
      expect(s.events.length).toBeLessThanOrEqual(5);
      for (const e of s.events) {
        expect(e.day, s.id).toBeGreaterThanOrEqual(0);
        expect(e.day, s.id).toBeLessThan(s.days);
        expect(e.date, s.id).toBeUndefined();
        expect(e.text, s.id).toBeUndefined();
      }
      // 段里的股票不带真实代码和化名（游戏里用小人的名字）
      for (const t of Object.values(s.themes))
        for (const st of t.stocks) {
          expect(st.id).toMatch(/^[a-z]+_\d$/);
          expect(st.name).toBeNull();
        }
    }
  });

  it('同一个种子总是抽到同一段，每日挑战大家一样', () => {
    const ids = index.segments.map((s) => s.id);
    const d = dailySetup('2026-10-12');
    expect(pickSegmentId(d.seed, ids, hashSeed)).toBe(pickSegmentId(dailySetup('2026-10-12').seed, ids, hashSeed));
    const picked = new Set(Array.from({ length: ids.length * 8 }, (_, i) => pickSegmentId(`s${i}`, ids, hashSeed)));
    expect(picked.size).toBeGreaterThan(ids.length * 0.95);
  });
});

describe('真实行情驱动', () => {
  it('开局把段 id 和用到的数据存进存档；不给段就是 0.3 合成行情', () => {
    const s = createRun('real-1', null, { segment: crash }).state;
    expect(s.real?.segId).toBe(crash.id);
    for (const id of Object.keys(s.stocks)) expect(s.real?.stocks[id]).toBeDefined();
    expect(createRun('real-1').state.real ?? null).toBeNull();
  });

  it('确定性：同一段 + 种子 + 操作，回放逐位相同；读档后继续也一样', () => {
    const s = play('det-1', crash);
    expect(replay(s.seed, s.actions, s.setup, { segment: crash })).toEqual(s);
    const revived = reviveState(JSON.parse(JSON.stringify(s)));
    expect(revived?.real?.segId).toBe(crash.id);
  });

  it('个股涨跌套 0.3 的涨跌停；风口阶段只按生命周期的顺序走', () => {
    const next: Record<Stage, Stage[]> = {
      cold: ['cold', 'sprout'],
      sprout: ['sprout', 'ferment', 'cold'],
      ferment: ['ferment', 'rally', 'ebb'],
      rally: ['rally', 'climax'],
      climax: ['climax', 'ebb'],
      ebb: ['ebb', 'cold'],
    };
    for (const seg of segs.slice(0, 8)) {
      let s = createRun(`stage-${seg.id}`, { account: 1e12 }, { segment: seg }).state;
      const last = new Map<string, Stage>(s.themeIds.map((id) => [id, s.themes[id]?.stage as Stage]));
      while (s.phase !== 'won' && s.phase !== 'lost') {
        const a = s.phase === 'premarket' ? { type: 'open' as const } : s.phase === 'reward' ? { type: 'skipReward' as const } : { type: 'choose' as const, option: 1 };
        s = dispatch(s, a, { inPlace: true, events: false }).state;
        if (a.type !== 'open' || !s.lastDay) continue;
        // 0.5：月度主题可以放宽涨跌停（rules.limitMult）
        const mult = rulesFor([], 1, 'newbie', true, s.tempo?.cur ? monthThemeById(s.tempo.cur.id).rules : undefined).limitMult;
        for (const m of s.lastDay.stocks) expect(Math.abs(m.move)).toBeLessThanOrEqual(BALANCE.roles[stockById(m.id).role].limit * mult + 1e-9 + (m.st === 'delisted' ? 100 : 0));
        for (const t of s.lastDay.themes) {
          expect(next[last.get(t.id) as Stage]).toContain(t.stage);
          expect(STAGES).toContain(t.stage);
          last.set(t.id, t.stage);
        }
      }
    }
  });

  it('第 6 级股灾对齐段内真实大跌日', () => {
    const seg = segs.find((x) => meta(x.id).key.startsWith('2008-09')) ?? crash;
    const s = createRun('crash-1', { difficulty: 6 }, { segment: seg }).state;
    const plan = crashPlan(s.seed, 6, s.real ?? null);
    expect(plan).not.toBeNull();
    let first = 0;
    for (let m = 1; m < (plan?.month ?? 1); m++) first += BALANCE.monthDays[m - 1] ?? 0;
    const r = seg.market[seg.warm + first + (plan?.dayInMonth ?? 0)] ?? 0;
    expect(r).toBeLessThanOrEqual(BALANCE.real.crashReal);
  });

  it('玩的时候不出现年份和真实公司名', () => {
    const s = createRun('leak-1', null, { segment: crash }).state;
    const text = JSON.stringify(themeBoard(s)) + JSON.stringify(s.today.messages) + JSON.stringify(s.today.recs);
    expect(text).not.toMatch(/(19|20)\d\d 年/);
    for (const st of Object.values(s.real?.stocks ?? {})) if (st.name) expect(text).not.toContain(st.name);
  });
});

describe('局末揭晓与图鉴', () => {
  it('局末小故事：游戏化标题、4–8 句、结局吐槽，不揭晓年份和真身', () => {
    const s = play('reveal-1', crash);
    const v = storyView(s);
    expect(v?.title).toBe(crash.title);
    expect(v?.lines.length).toBeGreaterThanOrEqual(4);
    expect(v?.lines.length).toBeLessThanOrEqual(8);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(/(19|20)\d\d/);
    for (const st of Object.values(s.real?.stocks ?? {})) if (st.name) expect(text).not.toContain(st.name);
    expect(v?.verdict.length).toBeGreaterThan(5);
    expect(storyView(createRun('x').state)).toBeNull();
  });

  it('档案记下见过的行情段（读档往返不丢）', () => {
    const s = play('reveal-2', crash);
    const r = recordRun(emptyProfile(), runSummary(s), '2026-10-12');
    expect(r.newSegment).toBe(true);
    expect(r.profile.segments[crash.id]?.runs).toBe(1);
    const back = reviveProfile(JSON.parse(JSON.stringify(r.profile)))?.segments[crash.id];
    expect(back?.regime).toBe(crash.regime);
    expect(back?.story).toEqual(storyView(s)?.lines);
    expect(back?.verdict).toBe(storyView(s)?.verdict);
  });
});
