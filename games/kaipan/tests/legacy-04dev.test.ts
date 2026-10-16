/**
 * 0.4 开发期的旧存档、旧档案（防泄漏改造之前写下的）：
 * - 存档里 state.real 还带 from / to / year，大事是 { date, text }，段 id 是"年-月-市况"；
 * - 档案 segments 的键是"1997-02-bull"这类旧 id，记录里带 year / from / to。
 * 读进来要能继续玩、局末故事照常出（不露原文、年份和日期），图鉴能显示、再记一局也不出错。
 */
import { describe, expect, it } from 'vitest';
import { createRun, dispatch, runSummary, storyView, type Action, type GameState } from '../src/core/index.ts';
import { emptyProfile, recordRun, reviveProfile } from '../src/platform/profile.ts';
import { reviveState } from '../src/platform/storage.ts';
import { loadSegment } from '../tools/segments-disk.ts';

const YEAR = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/;
const DATE = /\d{4}[-/.年]\d{1,2}/;

function step(s: GameState): GameState {
  const a: Action = s.phase === 'reward' ? { type: 'skipReward' } : s.phase === 'event' ? { type: 'choose', option: 0 } : { type: 'open' };
  const r = dispatch(s, a);
  if (r.error) throw new Error(r.error);
  return r.state;
}

/** 按旧格式改写 state.real（和 0.4 开发期写下的存档一样）。 */
function asDevSave(s: GameState): GameState {
  const real = { ...(s.real as NonNullable<GameState['real']>) } as NonNullable<GameState['real']> & Record<string, unknown>;
  real.segId = '1997-02-bull';
  real.from = '1997-02-03';
  real.to = '1998-01-30';
  real.year = 1997;
  real.events = [
    { date: '1997-03-27', text: 'Fed raises rates for the first time since 1995', sectors: ['bank'] },
    { date: '1997-05-15', text: 'Amazon IPO on NASDAQ', sectors: ['internet'] },
    { date: '1997-10-27', text: 'Dow drops 554 points in mini-crash', sectors: ['market'] },
  ];
  return { ...s, real };
}

function finishedDevRun(): GameState {
  let s = createRun('legacy-04dev', null, { ext: true, segment: loadSegment('1997-02-bull') }).state;
  while (s.phase !== 'won' && s.phase !== 'lost') s = step(s);
  return asDevSave(s);
}

describe('0.4 开发期旧存档与旧档案', () => {
  it('旧格式的 state.real 读档能过校验，还能接着玩', () => {
    let s = asDevSave(createRun('legacy-04dev-mid', null, { ext: true, segment: loadSegment('1997-02-bull') }).state);
    const back = reviveState(JSON.parse(JSON.stringify(s)));
    expect(back).not.toBeNull();
    s = back as GameState;
    for (let i = 0; i < 8 && s.phase !== 'lost'; i++) s = step(s);
    expect(s.dayIndex).toBeGreaterThan(0);
  });

  it('局末故事照常出，不露原文、年份、日期和旧 id', () => {
    const s = finishedDevRun();
    const story = storyView(s);
    expect(story).not.toBeNull();
    const text = [story?.title ?? '', ...(story?.lines ?? []), story?.verdict ?? ''].join('\n');
    expect(text).not.toMatch(YEAR);
    expect(text).not.toMatch(DATE);
    expect(text).not.toMatch(/Fed|Amazon|NASDAQ|Dow|bull|undefined|NaN|\{/);
  });

  it('旧档案的旧段 id 能读、丢掉年份字段；再记一局旧存档也合并到同一条', () => {
    const raw = {
      ...emptyProfile(),
      segments: {
        '1997-02-bull': { id: '1997-02-bull', year: 1997, from: '1997-02-03', to: '1998-01-30', regime: 'bull', title: '1997 年的慢牛', runs: 2, wins: 1 },
      },
    };
    const p = reviveProfile(JSON.parse(JSON.stringify(raw)));
    expect(p).not.toBeNull();
    const rec = p?.segments['1997-02-bull'];
    expect(rec).toMatchObject({ id: '1997-02-bull', regime: 'bull', runs: 2, wins: 1 });
    expect(rec && 'year' in rec).toBe(false);
    expect(rec && 'from' in rec).toBe(false);
    const r = recordRun(p as NonNullable<typeof p>, runSummary(finishedDevRun()), '2026-10-12');
    expect(r.ignored).toBeNull();
    const after = r.profile.segments['1997-02-bull'];
    expect(after?.runs).toBe(3);
    expect(JSON.stringify(after)).not.toMatch(/"(year|from|to)"/);
    expect((after?.story ?? []).join('')).not.toMatch(YEAR);
  });
});
