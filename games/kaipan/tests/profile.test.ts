import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  EVENTS,
  FRIENDS,
  ITEMS,
  PERSONA_IDS,
  STOCKS,
  codex,
  createRun,
  dailySetup,
  dispatch,
  runId,
  runSummary,
  type GameState,
  type RunSetup,
  type RunSummary,
} from '../src/core/index.ts';
import {
  PROFILE_CORRUPT_KEY,
  PROFILE_KEY,
  bestKey,
  emptyProfile,
  isDifficultyUnlocked,
  isPersonaUnlocked,
  loadProfile,
  recordRun,
  reviveProfile,
  saveProfile,
  type Profile,
} from '../src/platform/profile.ts';
import { loadSave, writeSave } from '../src/platform/storage.ts';
import type { KeyValueStore } from '../src/platform/settings.ts';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const TODAY = '2026-10-10';

/** 记一局（今天固定为 TODAY）。 */
function rec(p: Readonly<Profile>, sum: Readonly<RunSummary>, today = TODAY) {
  return recordRun(p, sum, today);
}

/** 人设和难度全部解锁的档案。 */
function unlocked(): Profile {
  return { ...emptyProfile(), personas: [...PERSONA_IDS], maxDifficulty: 8 };
}

function summary(phase: 'won' | 'lost', setup: RunSetup | null = null, mutate: (s: GameState) => void = () => {}, seed = 'prof'): RunSummary {
  const s = createRun(seed, setup).state;
  s.phase = phase;
  if (phase === 'won') s.stats.billsPaid = 12;
  mutate(s);
  return runSummary(s);
}

describe('每日挑战', () => {
  it('同一天给出同样的种子、人设和难度；格式不对报错', () => {
    const a = dailySetup('2026-10-10');
    expect(dailySetup('2026-10-10')).toEqual(a);
    expect(a.seed).toBe('daily-2026-10-10');
    expect(a.setup.daily).toBe('2026-10-10');
    expect(PERSONA_IDS).toContain(a.setup.persona);
    expect(a.setup.difficulty).toBeGreaterThanOrEqual(2);
    expect(a.setup.difficulty).toBeLessThanOrEqual(5);
    expect(() => dailySetup('10/10/2026')).toThrow();
    // 一个月里人设和难度会变
    const days = Array.from({ length: 30 }, (_, i) => dailySetup(`2026-11-${String(i + 1).padStart(2, '0')}`).setup);
    expect(new Set(days.map((d) => d.persona)).size).toBeGreaterThan(2);
    expect(new Set(days.map((d) => d.difficulty)).size).toBeGreaterThan(2);
    const run = createRun(a.seed, a.setup).state;
    expect(run.persona).toBe(a.setup.persona);
    expect(run.difficulty).toBe(a.setup.difficulty);
  });
});

describe('图鉴', () => {
  it('股票 40、群友 8、道具 24、事件 15、成就 30，条目带名字和说明', () => {
    const c = codex();
    expect(c.stocks.map((e) => e.id)).toEqual(STOCKS.map((d) => d.id));
    expect([c.stocks.length, c.friends.length, c.items.length, c.events.length, c.achievements.length]).toEqual([40, 9, 28, 19, 45]);
    for (const list of Object.values(c)) for (const e of list) expect(e.name.length * e.desc.length, e.id).toBeGreaterThan(0);
  });
});

describe('档案（profile）', () => {
  it('空档案：开局 3 个人设、第 1 级难度', () => {
    const p = emptyProfile();
    expect(p.personas).toEqual(['newbie', 'retiree', 'mom']);
    expect(isPersonaUnlocked(p, 'coder')).toBe(false);
    expect(isDifficultyUnlocked(p, 1)).toBe(true);
    expect(isDifficultyUnlocked(p, 2)).toBe(false);
  });

  it('记一局：图鉴点亮、成就、最好成绩；纯函数，不改传入的档案', () => {
    const p0 = emptyProfile();
    const sum = summary('lost', null, (s) => {
      s.stats.limitUpDays = 2;
      s.stats.billsPaid = 4;
      s.stats.buys = 1;
    });
    const r = rec(p0, sum);
    expect(p0.runs).toBe(0);
    expect(r.ignored).toBeNull();
    expect(r.profile.runs).toBe(1);
    expect(r.newAchievements).toEqual(['first_limitup', 'bust']);
    expect(r.profile.achievements).toEqual({ first_limitup: 1, bust: 1 });
    expect(r.newSeen.stocks.length).toBeGreaterThan(20);
    expect(r.profile.seen.friends).toEqual(FRIENDS.filter((f) => f.founding).map((f) => f.id));
    expect(r.profile.best[bestKey('newbie', 1)]).toEqual({ runs: 1, wins: 0, bestAccount: 0, bestMonths: 4 });
    expect(r.newBest).toBe(true);
    // 同一局重复记：不变
    const again = rec(r.profile, sum);
    expect(again.ignored).toBe('duplicate');
    expect(again.profile).toEqual(r.profile);
  });

  it('通关第 N 级解锁第 N+1 级（最高 8）；每日挑战不解锁难度', () => {
    let p = emptyProfile();
    const r1 = rec(p, summary('won', { difficulty: 1 }));
    expect(r1.newDifficulty).toBe(2);
    p = r1.profile;
    expect(isDifficultyUnlocked(p, 2)).toBe(true);
    const r2 = rec(p, summary('won', { difficulty: 1 }, () => {}, 'prof-2'));
    expect(r2.newDifficulty).toBeNull();
    const r8 = rec({ ...p, maxDifficulty: 8 }, summary('won', { difficulty: 8 }, () => {}, 'prof-8'));
    expect(r8.newDifficulty).toBeNull();
    expect(r8.profile.maxDifficulty).toBe(8);
    expect(r8.newAchievements).toContain('stock_god');
    const d = dailySetup('2026-10-10');
    const rd = rec(emptyProfile(), summary('won', d.setup, () => {}, d.seed));
    expect(rd.newDifficulty).toBeNull();
    expect(rd.newAchievements).toContain('daily_checkin');
    expect(rd.profile.daily['2026-10-10']).toMatchObject({ persona: d.setup.persona, difficulty: d.setup.difficulty, attempts: 1, won: true });
    expect(rd.newDaily).toBe(true);
  });

  it('每日挑战要货真价实：种子、人设、难度和 dailySetup(日期) 不一致的，按普通局记', () => {
    const d = dailySetup('2026-10-10');
    const other = d.setup.persona === 'newbie' ? 'mom' : 'newbie';
    const cases: [string, RunSetup, string][] = [
      ['种子不对', d.setup, 'daily-2026-10-11'],
      ['人设不对', { ...d.setup, persona: other }, d.seed],
      ['难度不对', { ...d.setup, difficulty: d.setup.difficulty === 2 ? 3 : 2 }, d.seed],
    ];
    for (const [why, setup, seed] of cases) {
      const sum = summary('won', setup, () => {}, seed);
      expect(sum.daily, why).toBe('2026-10-10');
      const r = rec(unlocked(), sum);
      expect(r.ignored, why).toBeNull();
      expect(r.profile.daily, why).toEqual({});
      expect(r.newDaily, why).toBe(false);
      expect(r.profile.best[bestKey(sum.persona, sum.difficulty)]?.wins, why).toBe(1);
      expect(r.newAchievements, why).not.toContain('daily_checkin');
    }
    // 一致的才记进每日挑战
    const ok = rec(emptyProfile(), summary('lost', d.setup, () => {}, d.seed));
    expect(ok.profile.daily['2026-10-10']?.attempts).toBe(1);
    expect(ok.profile.best).toEqual({});
    expect(ok.newAchievements).toContain('daily_checkin');
  });

  it('成就解锁人设：数据驱动 → 程序员小码，涨停敢死队 → 游资大佬', () => {
    const r = rec(
      emptyProfile(),
      summary('won', null, (s) => {
        s.items.push('mood_meter');
        s.stats.limitUpDays = 21;
      }),
    );
    expect(r.newAchievements).toEqual(expect.arrayContaining(['data_driven', 'limitup_crew']));
    expect(r.newPersonas).toEqual(['coder', 'youzi']);
    expect(r.profile.personas).toEqual(['newbie', 'retiree', 'mom', 'coder', 'youzi']);
    // 已有的成就不再算新的
    const again = rec(r.profile, summary('won', null, (s) => s.items.push('mood_meter'), 'prof-again'));
    expect(again.newAchievements).not.toContain('data_driven');
    expect(again.newPersonas).toEqual([]);
  });

  it('没解锁的人设、难度不计入（真正的每日挑战除外）；每日挑战的日期不能晚于今天', () => {
    const p = emptyProfile();
    for (const setup of [{ persona: 'coder' as const }, { persona: 'youzi' as const }, { difficulty: 2 }]) {
      const r = rec(p, summary('won', setup, (s) => (s.stats.limitUpDays = 21)));
      expect(r.ignored, JSON.stringify(setup)).toBe('locked');
      expect(r.profile, JSON.stringify(setup)).toEqual(p);
      expect(r.newAchievements).toEqual([]);
      expect(r.newDifficulty).toBeNull();
    }
    // 解锁之后照常记
    expect(rec(unlocked(), summary('won', { persona: 'coder', difficulty: 2 })).ignored).toBeNull();
    // 对不上 dailySetup 的"每日挑战"按普通局处理，同样要解锁
    const d = dailySetup(TODAY);
    const fake = summary('won', { ...d.setup, difficulty: d.setup.difficulty === 2 ? 3 : 2 }, () => {}, d.seed);
    expect(rec(p, fake).ignored).toBe('locked');
    // 真正的每日挑战：人设、难度可以还没解锁
    const genuine = rec(p, summary('lost', d.setup, () => {}, d.seed));
    expect(genuine.ignored).toBeNull();
    expect(genuine.profile.daily[TODAY]?.attempts).toBe(1);
    // 日期晚于今天：不计；当天可以
    const tomorrow = dailySetup('2026-10-11');
    const future = rec(unlocked(), summary('won', tomorrow.setup, () => {}, tomorrow.seed));
    expect(future.ignored).toBe('future');
    expect(future.profile).toEqual(unlocked());
    expect(rec(unlocked(), summary('won', tomorrow.setup, () => {}, tomorrow.seed), '2026-10-11').ignored).toBeNull();
    expect(() => rec(p, summary('lost'), '10/10/2026')).toThrow();
  });

  it('runId 含全部操作的哈希：同种子、同步数、不同操作的两局不算重复', () => {
    const s0 = createRun('rid').state;
    expect(s0.today.recs.length).toBeGreaterThan(1);
    const a = dispatch(dispatch(s0, { type: 'buy', rec: 0 }).state, { type: 'open' }).state;
    const b = dispatch(dispatch(s0, { type: 'buy', rec: 1 }).state, { type: 'open' }).state;
    expect(a.actions.length).toBe(b.actions.length);
    expect(runId(a)).not.toBe(runId(b));
    expect(runId(a)).toBe(runId(dispatch(dispatch(s0, { type: 'buy', rec: 0 }).state, { type: 'open' }).state));
    a.phase = 'lost';
    b.phase = 'lost';
    const r = rec(emptyProfile(), runSummary(a));
    expect(rec(r.profile, runSummary(b)).ignored).toBeNull();
    expect(rec(r.profile, runSummary(a)).ignored).toBe('duplicate');
  });

  it('调试开局、没结束的局不计入', () => {
    expect(rec(emptyProfile(), summary('won', { items: ['ipo'] })).ignored).toBe('debug');
    expect(rec(emptyProfile(), runSummary(createRun('mid').state)).ignored).toBe('unfinished');
  });

  it('存取：有版本号；坏档案原样备份到 kaipan.profile.corrupt 后重建；和单局存档互不影响', () => {
    const store = new MemoryStore();
    expect(loadProfile(store)).toEqual({ profile: emptyProfile(), notice: null });
    const p = rec(emptyProfile(), summary('lost')).profile;
    expect(saveProfile(p, store)).toBe(true);
    expect(JSON.parse(store.getItem(PROFILE_KEY) ?? '{}').version).toBe(1);
    expect(loadProfile(store).profile).toEqual(p);
    // 单局存档照常
    const run = createRun('prof-save').state;
    writeSave(run, store);
    store.setItem(PROFILE_KEY, '{坏了');
    const bad = loadProfile(store);
    expect(bad.notice).toBe('corrupt');
    expect(bad.profile).toEqual(emptyProfile());
    expect(store.getItem(PROFILE_CORRUPT_KEY)).toBe('{坏了');
    expect(loadSave(store).state).toEqual(run);
    // 不认识的版本也当坏档案
    store.setItem(PROFILE_KEY, JSON.stringify({ version: 99 }));
    expect(loadProfile(store).notice).toBe('corrupt');
  });

  it('修整：剔除不认识的条目，缺字段补默认，成就带来的人设补齐', () => {
    const raw = {
      version: 1,
      runs: 3,
      seen: { stocks: ['ai_leader', 'gone_stock'], items: ['ipo', 'gone_item'], events: [EVENTS[0]?.id], friends: ['xiaoli'] },
      achievements: { limitup_crew: 2, gone: 1 },
      personas: ['newbie', 'nobody'],
      maxDifficulty: 42,
      best: { 'mom:3': { runs: 2, wins: 1, bestAccount: 5, bestMonths: 12 }, 'x:1': {} },
      daily: { '2026-10-10': { persona: 'mom', difficulty: 3, attempts: 1, won: false, bestAccount: 0, bestMonths: 2 }, bad: {} },
    };
    const p = reviveProfile(raw);
    expect(p?.seen.stocks).toEqual(['ai_leader']);
    expect(p?.seen.items).toEqual(['ipo']);
    expect(p?.achievements).toEqual({ limitup_crew: 2 });
    expect(p?.personas).toEqual(['newbie', 'retiree', 'mom', 'youzi']);
    expect(p?.maxDifficulty).toBe(8);
    expect(Object.keys(p?.best ?? {})).toEqual(['mom:3']);
    expect(Object.keys(p?.daily ?? {})).toEqual(['2026-10-10']);
    expect(p?.wins).toBe(0);
    expect(reviveProfile({ version: 2 })).toBeNull();
    expect(ACHIEVEMENTS.length + ITEMS.length).toBe(73);
  });
});
