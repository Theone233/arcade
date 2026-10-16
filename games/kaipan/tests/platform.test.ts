import { describe, expect, it } from 'vitest';
import { createRun, dispatch, type Action, type GameState } from '../src/core/index.ts';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings, type KeyValueStore } from '../src/platform/settings.ts';
import {
  LEGACY_NOTICE,
  clearSave,
  hasLegacySave,
  hasSave,
  loadRecords,
  loadSave,
  recordRun,
  restoreSave,
  reviveState,
  writeSave,
} from '../src/platform/storage.ts';
import { APP_VERSION } from '../src/platform/version.ts';

/** 内存版 localStorage。 */
class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function playedState(): GameState {
  let s = createRun('platform-test').state;
  const actions: Action[] = [{ type: 'buy', rec: 0 }, { type: 'open' }, { type: 'open' }];
  for (const a of actions) {
    const r = dispatch(s, a);
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

/** 0.2 的存档（format 3）大致长这样。 */
const V02_SAVE = JSON.stringify({ format: 3, appVersion: '0.2.0', savedAt: 'x', state: { version: 2, seed: 'old', fund: 1e6, exam: { index: 3 } } });

describe('设置', () => {
  it('没有存储或内容损坏时用默认值', () => {
    expect(loadSettings(null)).toEqual({ ...DEFAULT_SETTINGS, reduceMotion: false });
    const store = new MemoryStore();
    store.setItem('kaipan.settings', '{坏掉的 json');
    expect(loadSettings(store).masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it('保存后能原样读回；写入失败不抛错', () => {
    const store = new MemoryStore();
    const s = sanitizeSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.2, animSpeed: 2, colorScheme: 'intl' });
    saveSettings(s, store);
    expect(loadSettings(store)).toEqual(s);
    store.failWrites = true;
    expect(() => saveSettings(s, store)).not.toThrow();
  });
});

describe('存档（format 5）', () => {
  it('写入后原样读回，带格式 5 与版本号', () => {
    const store = new MemoryStore();
    const s = playedState();
    writeSave(s, store);
    expect(JSON.parse(store.getItem('kaipan.save') ?? '{}')).toMatchObject({ format: 5, appVersion: APP_VERSION });
    expect(hasSave(store)).toBe(true);
    expect(hasLegacySave(store)).toBe(false);
    expect(loadSave(store)).toEqual({ state: s, notice: null });
    expect(restoreSave(store)).toEqual(s);
    clearSave(store);
    expect(hasSave(store)).toBe(false);
    expect(loadSave(store)).toEqual({ state: null, notice: null });
  });

  it('读档直接用快照，读回的局面能继续玩', () => {
    const store = new MemoryStore();
    const edited = { ...playedState(), account: 12345.67 };
    writeSave(edited, store);
    const back = restoreSave(store);
    expect(back?.account).toBe(12345.67);
    const r = dispatch(back as GameState, { type: 'open' });
    expect(r.error).toBeNull();
  });

  it('0.2 的存档（format 3）：原样备份到 kaipan.save.v0.2，提示后开新局', () => {
    const store = new MemoryStore();
    store.setItem('kaipan.save', V02_SAVE);
    expect(hasSave(store)).toBe(false);
    expect(hasLegacySave(store)).toBe(true);
    expect(loadSave(store)).toEqual({ state: null, notice: 'legacy', legacyFrom: '0.2' });
    expect(store.getItem('kaipan.save.v0.2')).toBe(V02_SAVE);
    expect(store.getItem('kaipan.save')).toBeNull();
    expect(hasLegacySave(store)).toBe(false);
    expect(loadSave(store)).toEqual({ state: null, notice: null });
    expect(LEGACY_NOTICE).toBe('版本大更新，旧进度无法继续');
  });

  it('0.3.0-alpha.1 的存档（format 4）：原样备份到 kaipan.save.v0.3a，提示后开新局（不迁移）', () => {
    const store = new MemoryStore();
    const alpha = JSON.stringify({ format: 4, appVersion: '0.3.0-alpha.1', savedAt: 'x', state: { version: 3, seed: 'alpha' } });
    store.setItem('kaipan.save', alpha);
    expect(hasSave(store)).toBe(false);
    expect(hasLegacySave(store)).toBe(true);
    expect(loadSave(store)).toEqual({ state: null, notice: 'legacy', legacyFrom: '0.3a' });
    expect(store.getItem('kaipan.save.v0.3a')).toBe(alpha);
    expect(store.getItem('kaipan.save')).toBeNull();
    expect(hasLegacySave(store)).toBe(false);
  });

  it('人设、难度、延后结算都在快照里，读回后照常继续', () => {
    const store = new MemoryStore();
    const s = createRun('platform-persona', { persona: 'mom', difficulty: 6 }).state;
    s.pending.push({ id: 'classmate_loan', month: 3, amount: 5000 });
    s.expiring.push({ id: 'mood_meter', month: 2 });
    writeSave(s, store);
    const back = restoreSave(store);
    expect(back?.persona).toBe('mom');
    expect(back?.difficulty).toBe(6);
    expect(back?.pending).toEqual([{ id: 'classmate_loan', month: 3, amount: 5000 }]);
    expect(back?.expiring).toEqual([{ id: 'mood_meter', month: 2 }]);
    expect(reviveState({ ...JSON.parse(JSON.stringify(s)), persona: 'nobody' })).toBeNull();
  });

  it('0.1 的存档（format ≤ 2 或 v1 旧 key）仍备份到 kaipan.save.v0.1', () => {
    for (const format of [1, 2]) {
      const store = new MemoryStore();
      const old = JSON.stringify({ format, appVersion: '0.1.1', savedAt: 'x', state: { version: 1, seed: 'old' } });
      store.setItem('kaipan.save', old);
      expect(hasLegacySave(store)).toBe(true);
      expect(loadSave(store)).toEqual({ state: null, notice: 'legacy', legacyFrom: '0.1' });
      expect(store.getItem('kaipan.save.v0.1')).toBe(old);
      expect(store.getItem('kaipan.save')).toBeNull();
    }
    const store = new MemoryStore();
    const v1 = JSON.stringify({ v: 1, seed: 'x', setup: null, actions: [] });
    store.setItem('kaipan.save.v1', v1);
    expect(loadSave(store)).toMatchObject({ notice: 'legacy', legacyFrom: '0.1' });
    expect(store.getItem('kaipan.save.v0.1')).toBe(v1);
    expect(store.getItem('kaipan.save.v1')).toBeNull();
  });

  it('设置不受旧存档迁移影响', () => {
    const store = new MemoryStore();
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, musicVolume: 0.3 });
    saveSettings(settings, store);
    store.setItem('kaipan.save', V02_SAVE);
    loadSave(store);
    expect(loadSettings(store)).toEqual(settings);
  });

  it('损坏的存档先备份再清除', () => {
    const store = new MemoryStore();
    store.setItem('kaipan.save', '{"format":5,"state":{"oops":true}}');
    expect(hasSave(store)).toBe(false);
    expect(loadSave(store)).toEqual({ state: null, notice: 'corrupt' });
    expect(store.getItem('kaipan.save')).toBeNull();
    expect(store.getItem('kaipan.save.corrupt')).toContain('oops');
    store.setItem('kaipan.save', '{坏掉的 json');
    expect(loadSave(store).notice).toBe('corrupt');
    store.setItem('kaipan.save', JSON.stringify({ format: 99, state: {} }));
    expect(loadSave(store).notice).toBe('corrupt');
  });

  it('新版本删除了的道具、群友、股票被剔除，其余保留', () => {
    const s = structuredClone(playedState());
    s.items.push('removed_item');
    s.friends.push({ id: 'removed_friend', hits: 0, total: 0, topics: [] });
    s.slots[1] = { ...(s.slots[0] as NonNullable<GameState['slots'][number]>), stockId: 'removed_stock' };
    const revived = reviveState(JSON.parse(JSON.stringify(s)));
    expect(revived?.items).toEqual(s.items.filter((id) => id !== 'removed_item'));
    expect(revived?.friends.map((f) => f.id)).not.toContain('removed_friend');
    expect(revived?.slots[1]).toBeNull();
    expect(revived?.slots[0]).toEqual(s.slots[0]);
    expect(revived?.account).toBe(s.account);
  });

  it('结构不对的快照被拒绝', () => {
    expect(reviveState(null)).toBeNull();
    expect(reviveState({ version: 2 })).toBeNull();
    const s = playedState() as unknown as Record<string, unknown>;
    expect(reviveState(s)).not.toBeNull();
    expect(reviveState({ ...s, account: Number.NaN })).toBeNull();
    expect(reviveState({ ...s, phase: 'trading' })).toBeNull();
    expect(reviveState({ ...s, month: 13 })).toBeNull();
    expect(reviveState({ ...s, themeIds: ['nope'] })).toBeNull();
  });

  it('统计字段缺失或类型不对时补缺省值，读档后能接着玩到月底', () => {
    const raw = JSON.parse(JSON.stringify(playedState())) as GameState;
    const stats = raw.stats as unknown as Record<string, unknown>;
    for (const k of ['monthRets', 'acquired', 'seenItems', 'itemsTaken', 'picked', 'events', 'surprisesPaid', 'seenFriends', 'maxThemes']) delete stats[k];
    stats.limitDownDays = 'x';
    const revived = reviveState(raw);
    expect(revived).not.toBeNull();
    let st = revived as GameState;
    expect(st.stats.monthRets).toEqual([]);
    expect(st.stats.acquired).toEqual([]);
    expect(st.stats.limitDownDays).toBe(0);
    expect(st.stats.trades.length).toBe(playedState().stats.trades.length);
    // 一直开盘直到下个月（月底结算会用到 monthRets 等）
    const month = st.month;
    for (let i = 0; i < 40 && st.month === month && st.phase !== 'won' && st.phase !== 'lost'; i++) {
      const a: Action = st.phase === 'premarket' ? { type: 'open' } : st.phase === 'reward' ? { type: 'skipReward' } : { type: 'choose', option: 1 };
      const r = dispatch(st, a);
      expect(r.error).toBeNull();
      st = r.state;
    }
    expect(st.month === month + 1 || st.phase === 'lost').toBe(true);
  });

  it('0.3.0 存档里的上一天结算（没有归因、新闻、台词）读进来补空', () => {
    const raw = JSON.parse(JSON.stringify(playedState())) as GameState;
    expect(raw.lastDay).not.toBeNull();
    const last = raw.lastDay as unknown as Record<string, unknown> & { account: Record<string, unknown>; holdings: Record<string, unknown>[] };
    delete last.news;
    delete last.quips;
    delete last.account.effects;
    for (const h of last.holdings) {
      delete h.parts;
      delete h.amount;
    }
    const revived = reviveState(raw);
    expect(revived?.lastDay?.news).toEqual([]);
    expect(revived?.lastDay?.quips).toEqual([]);
    expect(revived?.lastDay?.account.effects).toEqual([]);
    for (const h of revived?.lastDay?.holdings ?? []) {
      expect(h.parts).toEqual([]);
      expect(h.amount).toBe(0);
    }
  });

  it('写入失败（配额不足）不抛错', () => {
    const store = new MemoryStore();
    store.failWrites = true;
    expect(() => writeSave(playedState(), store)).not.toThrow();
  });
});

describe('本地纪录', () => {
  it('0.2 的纪录（version 1）备份到 kaipan.records.v0.2 后重置', () => {
    const store = new MemoryStore();
    const old = JSON.stringify({ version: 1, bestQuarter: 3, bestFund: 2e6, wins: 1, runs: 5, last: 'x' });
    store.setItem('kaipan.records', old);
    expect(loadRecords(store)).toMatchObject({ version: 2, bestMonths: -1, wins: 0, runs: 0 });
    expect(store.getItem('kaipan.records.v0.2')).toBe(old);
    expect(store.getItem('kaipan.records')).toBeNull();
  });

  it('一局结束时记最多还清的月数、通关账户、最高账户、通关次数，同一局不重复记', () => {
    const store = new MemoryStore();
    const base = createRun('rec').state;
    const lost: GameState = { ...base, phase: 'lost', stats: { ...base.stats, billsPaid: 4, peakAccount: 150_000 } };
    const first = recordRun(lost, store);
    expect(first.records).toMatchObject({ bestMonths: 4, peakAccount: 150_000, runs: 1, wins: 0 });
    expect(first.refreshed).toEqual(['bestMonths', 'peakAccount']);
    expect(recordRun(lost, store).records.runs).toBe(1);
    const won: GameState = { ...createRun('rec2').state, phase: 'won', account: 88_000, stats: { ...base.stats, billsPaid: 12, peakAccount: 120_000 } };
    const w = recordRun(won, store);
    expect(w.records).toMatchObject({ bestMonths: 12, bestAccount: 88_000, wins: 1, runs: 2 });
    expect(w.refreshed).toEqual(['bestMonths', 'bestAccount', 'wins']);
    // 没结束的局不记
    expect(recordRun(createRun('rec3').state, store).records.runs).toBe(2);
  });
});

describe('0.4 重做：0.4.0-alpha.1 存档的处理与 0.3 进度找回', () => {
  // 美股原型的代码已删（找回用 tag kaipan-us-prototype），这里照它当年在本机留下的样子造数据：
  // 启动时把 0.3 的存档原样挪到 kaipan.save.v0.3；自己的存档是 format 6
  function open04a(store: MemoryStore): void {
    const raw = store.getItem('kaipan.save');
    if (raw === null) return;
    store.setItem('kaipan.save.v0.3', raw);
    store.removeItem('kaipan.save');
  }
  function write04a(store: MemoryStore): void {
    store.setItem('kaipan.save', JSON.stringify({ format: 6, appVersion: '0.4.0-alpha.1', savedAt: '2026-10-12T00:00:00.000Z', state: { day: 1 } }));
  }

  it('0.3.1 玩家 → 打开过 0.4a（0.3 存档被备份）→ 玩过 0.4a → 回到现在：0.4a 存档备份、0.3 那一局原样找回', () => {
    const store = new MemoryStore();
    const mine = playedState();
    writeSave(mine, store); // 0.3.1 写的存档
    // 0.4a 启动：把 0.3 存档备份到 kaipan.save.v0.3，然后玩了一局写下 format 6
    open04a(store);
    expect(store.getItem('kaipan.save.v0.3')).not.toBeNull();
    write04a(store);
    const v04 = store.getItem('kaipan.save') as string;
    expect(JSON.parse(v04).format).toBe(6);
    expect(hasLegacySave(store)).toBe(true);

    const r = loadSave(store);
    expect(r).toMatchObject({ notice: 'legacy', legacyFrom: '0.4a', restored: '0.3' });
    expect(r.state).toEqual(mine);
    expect(store.getItem('kaipan.save.v0.4a')).toBe(v04);
    expect(store.getItem('kaipan.save.v0.3')).toBeNull();
    expect(store.getItem('kaipan.save.v0.3.restored')).not.toBeNull();
    expect(hasSave(store)).toBe(true);
    // 再启动：正常继续，不再提示
    expect(loadSave(store)).toEqual({ state: mine, notice: null });
    // 这一局结束清档后，不会把找回过的旧局再恢复一次
    clearSave(store);
    expect(loadSave(store)).toEqual({ state: null, notice: null });
  });

  it('打开过 0.4a 但没在 0.4a 开局（主存档位为空）：直接找回 0.3 那一局并提示', () => {
    const store = new MemoryStore();
    const mine = playedState();
    writeSave(mine, store);
    open04a(store);
    expect(store.getItem('kaipan.save')).toBeNull();
    const r = loadSave(store);
    expect(r).toEqual({ state: mine, notice: 'restored', restored: '0.3' });
  });

  it('只有 0.4a 存档、没有 0.3 备份：备份到 kaipan.save.v0.4a，提示后开新局', () => {
    const store = new MemoryStore();
    write04a(store);
    const v04 = store.getItem('kaipan.save');
    expect(loadSave(store)).toEqual({ state: null, notice: 'legacy', legacyFrom: '0.4a' });
    expect(store.getItem('kaipan.save.v0.4a')).toBe(v04);
    expect(store.getItem('kaipan.save')).toBeNull();
  });

  it('0.3 备份读不出来时不动它，只处理 0.4a 存档', () => {
    const store = new MemoryStore();
    store.setItem('kaipan.save.v0.3', '{坏的');
    write04a(store);
    expect(loadSave(store)).toEqual({ state: null, notice: 'legacy', legacyFrom: '0.4a' });
    expect(store.getItem('kaipan.save.v0.3')).toBe('{坏的');
    expect(loadSave(store)).toEqual({ state: null, notice: null });
  });

  it('主存档位已有一局 0.3 存档时不覆盖（那是更新的进度），备份留着', () => {
    const store = new MemoryStore();
    writeSave(playedState(), store);
    const older = store.getItem('kaipan.save') as string;
    const now = createRun('newer').state;
    writeSave(now, store);
    store.setItem('kaipan.save.v0.3', older);
    expect(loadSave(store)).toEqual({ state: now, notice: null });
    expect(store.getItem('kaipan.save.v0.3')).toBe(older);
  });

  it('纪录：0.4a 的纪录（version 3）备份到 kaipan.records.v0.4a，找回被备份走的 0.3 纪录', () => {
    const store = new MemoryStore();
    const v03 = JSON.stringify({ version: 2, bestMonths: 7, bestAccount: 0, peakAccount: 123_000, wins: 0, runs: 3, last: 'x|1' });
    const v04 = JSON.stringify({ version: 3, runs: 1 });
    store.setItem('kaipan.records.v0.3', v03);
    store.setItem('kaipan.records', v04);
    expect(loadRecords(store)).toMatchObject({ bestMonths: 7, peakAccount: 123_000, runs: 3 });
    expect(store.getItem('kaipan.records.v0.4a')).toBe(v04);
    expect(store.getItem('kaipan.records')).toBe(v03);
    expect(store.getItem('kaipan.records.v0.3')).toBeNull();
    expect(store.getItem('kaipan.records.v0.2')).toBeNull();
    // 0.4a 读过纪录但没记过（主纪录被它清空）：同样找回
    const s2 = new MemoryStore();
    s2.setItem('kaipan.records.v0.3', v03);
    expect(loadRecords(s2).runs).toBe(3);
  });
});
