import {
  MONTHS,
  clampDifficulty,
  emptyStats,
  isEventId,
  isFriendId,
  isItemId,
  isPersonaId,
  isStockId,
  isThemeId,
  type GameState,
  type Phase,
} from '../core/index.ts';
import { defaultStore, type KeyValueStore } from './settings.ts';
import { APP_VERSION } from './version.ts';

/**
 * 存档：完整的局面快照 + 写入时的版本号（format 5，对应 0.3.0 的状态结构 GameState.version 4）。
 *
 * 读档直接使用快照，不回放：小版本调整数值后，旧存档仍按玩家当时看到的局面继续。
 * 旧版本的存档结构不同，原样备份后提示"版本大更新，旧进度无法继续"，然后开新局：
 * - 0.4.0-alpha.1（已撤回的美股原型）的存档（format 6）备份到 kaipan.save.v0.4a（不迁移）；
 * - 0.3.0-alpha.1 的存档（format 4）备份到 kaipan.save.v0.3a（不迁移）；
 * - 0.2 的存档（format 3）备份到 kaipan.save.v0.2；
 * - 0.1 的存档（format ≤ 2，或更早只存操作序列的 kaipan.save.v1）备份到 kaipan.save.v0.1。
 * 档案（成就、图鉴、解锁）在 src/platform/profile.ts，与单局存档互不影响。
 * 存档损坏时先另存一份到 CORRUPT_KEY 再清除，便于排查。
 * 本地纪录的结构也换了：0.2 的纪录（version 1）备份到 kaipan.records.v0.2 后重置；
 * 0.4.0-alpha.1 的纪录（version 3）备份到 kaipan.records.v0.4a。
 *
 * 找回被 0.4.0-alpha.1 收起的 0.3 进度：0.4a 读到 0.3 的存档（format 5）会原样备份到 kaipan.save.v0.3、
 * 纪录（version 2）备份到 kaipan.records.v0.3。0.4a 已撤回、游戏回到 0.3 的玩法，这两份备份的结构和现在完全一样，
 * 所以在主存档位为空、或主存档位是 0.4a 存档时，把备份原样放回主存档位（通过 reviveState 校验才放）；
 * 放回后备份改名为 *.restored（不删数据，也不会在这一局结束后再被恢复第二次）。
 * 主存档位已经有一局 0.3 存档时不动备份（那是更新的进度）。
 * 设置（kaipan.settings）不受影响。M0 没有教程，不再读写教程标记。
 */
export const SAVE_FORMAT = 5;

interface SaveData {
  format: typeof SAVE_FORMAT;
  /** 写入存档的游戏版本 */
  appVersion: string;
  savedAt: string;
  state: GameState;
}

/** 读档结果的附加提示：legacy = 读到了旧版本存档（已备份，需提示玩家）；corrupt = 存档损坏已清除。 */
export type SaveNotice = 'legacy' | 'corrupt' | 'restored' | null;

interface LoadResult {
  state: GameState | null;
  notice: SaveNotice;
  /** 旧存档来自哪个版本（notice 为 legacy 时；'0.3a' 为 0.3.0-alpha.1，'0.4a' 为 0.4.0-alpha.1） */
  legacyFrom?: '0.1' | '0.2' | '0.3a' | '0.4a';
  /** 同时找回了被 0.4.0-alpha.1 备份走的 0.3 存档（state 就是它）；notice 为 restored 时也会带上 */
  restored?: '0.3';
}

/** 读到旧存档时给玩家看的提示。 */
export const LEGACY_NOTICE = '版本大更新，旧进度无法继续';

const KEY = 'kaipan.save';
/** 0.1 早期只存种子与操作序列的旧 key */
const LEGACY_V1_KEY = 'kaipan.save.v1';
/** 0.1 旧存档的备份位置 */
const LEGACY_BACKUP_KEY = 'kaipan.save.v0.1';
/** 0.2 旧存档的备份位置 */
const LEGACY_V02_BACKUP_KEY = 'kaipan.save.v0.2';
/** 0.3.0-alpha.1 旧存档（format 4）的备份位置 */
const LEGACY_V03A_BACKUP_KEY = 'kaipan.save.v0.3a';
/** 0.4.0-alpha.1 存档（format 6）的备份位置 */
const LEGACY_V04A_BACKUP_KEY = 'kaipan.save.v0.4a';
/** 0.4.0-alpha.1 备份走的 0.3 存档（format 5）；找回后改名为 V03_RESTORED_KEY */
const V03_BACKUP_KEY = 'kaipan.save.v0.3';
const V03_RESTORED_KEY = 'kaipan.save.v0.3.restored';
/** 0.4.0-alpha.1 的存档格式 */
const V04A_FORMAT = 6;
const CORRUPT_KEY = 'kaipan.save.corrupt';
const RECORDS_KEY = 'kaipan.records';
/** 0.2 旧纪录的备份位置 */
const LEGACY_RECORDS_BACKUP_KEY = 'kaipan.records.v0.2';
/** 0.4.0-alpha.1 纪录（version 3）的备份位置 */
const LEGACY_V04A_RECORDS_BACKUP_KEY = 'kaipan.records.v0.4a';
/** 0.4.0-alpha.1 备份走的 0.3 纪录（version 2）；找回后改名为 V03_RECORDS_RESTORED_KEY */
const V03_RECORDS_BACKUP_KEY = 'kaipan.records.v0.3';
const V03_RECORDS_RESTORED_KEY = 'kaipan.records.v0.3.restored';
const PHASES: readonly Phase[] = ['premarket', 'reward', 'event', 'won', 'lost'];

let warnedQuota = false;

function get(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(store: KeyValueStore | null, key: string, value: string): boolean {
  try {
    store?.setItem(key, value);
    return true;
  } catch (err) {
    // 配额不足等：存档失败不影响本次游戏，只提醒一次
    if (!warnedQuota) console.warn('存档写入失败：', err);
    warnedQuota = true;
    return false;
  }
}

function remove(store: KeyValueStore | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // 忽略
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function int(v: unknown): v is number {
  return Number.isInteger(v);
}

/**
 * 校验并修整 0.3 的快照：结构不对返回 null；新版本已删除的道具、群友被剔除，
 * 持仓里已删除的股票变成空格，其余字段原样保留（引擎是纯函数，从快照即可继续）。
 */
export function reviveState(raw: unknown): GameState | null {
  if (!isObject(raw) || raw.version !== 4 || typeof raw.seed !== 'string') return null;
  if (typeof raw.persona !== 'string' || !isPersonaId(raw.persona)) return null;
  if (!Array.isArray(raw.pending) || !Array.isArray(raw.expiring)) return null;
  if (!PHASES.includes(raw.phase as Phase) || !finite(raw.account) || raw.account < 0) return null;
  if (!int(raw.month) || (raw.month as number) < 1 || (raw.month as number) > MONTHS) return null;
  if (!int(raw.dayIndex) || !int(raw.dayInMonth) || !int(raw.difficulty)) return null;
  if (!Array.isArray(raw.themeIds) || !isObject(raw.themes) || !isObject(raw.stocks)) return null;
  if (!Array.isArray(raw.slots) || !Array.isArray(raw.friends) || !Array.isArray(raw.items) || !Array.isArray(raw.actions)) return null;
  if (!isObject(raw.bill) || !finite(raw.bill.amount) || !isObject(raw.stats) || !Array.isArray(raw.stats.trades)) return null;
  const t = raw.today;
  if (!isObject(t) || !Array.isArray(t.messages) || !Array.isArray(t.recs) || !isObject(t.plan) || !int(t.buysLeft)) return null;
  for (const id of raw.themeIds as unknown[]) {
    if (typeof id !== 'string' || !isThemeId(id)) return null;
    const th = (raw.themes as Record<string, unknown>)[id];
    if (!isObject(th) || !finite(th.heat) || !Array.isArray(th.history) || typeof th.stage !== 'string' || !int(th.left)) return null;
  }
  for (const st of Object.values(raw.stocks as Record<string, unknown>)) {
    if (!isObject(st) || !finite(st.price) || !int(st.boards) || !Array.isArray(st.history)) return null;
  }
  for (const h of raw.slots as unknown[]) {
    if (h === null) continue;
    if (!isObject(h) || typeof h.stockId !== 'string' || !finite(h.value) || !int(h.boughtDay)) return null;
  }
  for (const f of raw.friends as unknown[]) {
    if (!isObject(f) || typeof f.id !== 'string' || !int(f.hits) || !int(f.total)) return null;
  }

  const state = structuredClone(raw) as unknown as GameState;
  state.difficulty = clampDifficulty(state.difficulty);
  // 统计字段：缺失或类型不对的补缺省值（0.3.0 新增的 monthRets、acquired 等，缺了读档后玩几步会出错）
  const stats = state.stats as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(emptyStats(state.account))) {
    const cur = stats[k];
    const ok = Array.isArray(v) ? Array.isArray(cur) : v === null ? cur === null || finite(cur) : finite(cur);
    if (!ok) stats[k] = structuredClone(v);
  }
  // 0.5.4 的炒股、账单合计不补缺省值：0.5.3 的存档从半路记起是半截数，缺了就让结算走旧说法；坏了两项一起丢
  if (!finite(stats.tradeMoney) || !finite(stats.billMoney)) {
    delete stats.tradeMoney;
    delete stats.billMoney;
  }
  // 0.3.0 存档里的上一天结算没有 0.3.1 的归因、新闻、台词：补空，画面照常显示
  const last = state.lastDay as unknown;
  if (isObject(last)) {
    if (!Array.isArray(last.news)) last.news = [];
    if (!Array.isArray(last.quips)) last.quips = [];
    if (isObject(last.account) && !Array.isArray(last.account.effects)) last.account.effects = [];
    if (Array.isArray(last.holdings)) {
      for (const h of last.holdings as unknown[]) {
        if (!isObject(h)) continue;
        if (!Array.isArray(h.parts)) h.parts = [];
        if (!isObject(h.lead)) h.lead = null;
        if (!finite(h.amount)) h.amount = 0;
      }
    }
  }
  state.pending = state.pending.filter((p) => isObject(p) && typeof p.id === 'string' && isEventId(p.id) && finite(p.amount) && int(p.month));
  state.expiring = state.expiring.filter((x) => isObject(x) && typeof x.id === 'string' && isItemId(x.id) && int(x.month));
  if (state.event && !isEventId(state.event.id)) return null;
  const dropped = state.items.filter((id) => !isItemId(id));
  if (dropped.length > 0) {
    console.warn('存档里有当前版本已移除的道具，已剔除：', dropped.join('、'));
    state.items = state.items.filter((id) => isItemId(id));
  }
  state.friends = state.friends.filter((f) => isFriendId(f.id));
  state.slots = state.slots.map((h) => (h && isStockId(h.stockId) && state.stocks[h.stockId] ? h : null));
  state.today.recs = state.today.recs.filter((r) => isStockId(r.stockId));
  state.today.messages = state.today.messages.filter((m) => isThemeId(m.theme));
  if (state.reward) {
    state.reward.cards = state.reward.cards.filter((c) => (c.kind === 'item' ? isItemId(c.id) : c.kind === 'friend' ? isFriendId(c.id) : isStockId(c.id)));
  }
  return state;
}

export function writeSave(state: GameState, store: KeyValueStore | null = defaultStore()): void {
  const data: SaveData = { format: SAVE_FORMAT, appVersion: APP_VERSION, savedAt: new Date().toISOString(), state };
  set(store, KEY, JSON.stringify(data));
}

export function clearSave(store: KeyValueStore | null = defaultStore()): void {
  remove(store, KEY);
  remove(store, LEGACY_V1_KEY);
}

function discard(store: KeyValueStore | null, key: string, raw: string, reason: string): LoadResult {
  console.warn(`存档无法读取（${reason}），已备份到 ${CORRUPT_KEY} 并清除`);
  set(store, CORRUPT_KEY, raw);
  remove(store, key);
  return { state: null, notice: 'corrupt' };
}

/** 0.1 的旧存档：原样备份（两种旧 key 都在时合并成一个 JSON），清掉，返回提示。 */
function retireV01(store: KeyValueStore | null, main: string | null, v1: string | null): LoadResult {
  const backup = main !== null && v1 !== null ? JSON.stringify({ [KEY]: main, [LEGACY_V1_KEY]: v1 }) : (main ?? v1 ?? '');
  set(store, LEGACY_BACKUP_KEY, backup);
  remove(store, KEY);
  remove(store, LEGACY_V1_KEY);
  console.info(`读到 0.1 的旧存档，已备份到 ${LEGACY_BACKUP_KEY}`);
  return { state: null, notice: 'legacy', legacyFrom: '0.1' };
}

/** 0.3.0-alpha.1 的旧存档（format 4）：原样备份到 kaipan.save.v0.3a，清掉，返回提示。 */
function retireV03a(store: KeyValueStore | null, raw: string): LoadResult {
  set(store, LEGACY_V03A_BACKUP_KEY, raw);
  remove(store, KEY);
  console.info(`读到 0.3.0-alpha.1 的旧存档，已备份到 ${LEGACY_V03A_BACKUP_KEY}`);
  return { state: null, notice: 'legacy', legacyFrom: '0.3a' };
}

/** 0.2 的旧存档（format 3）：原样备份到 kaipan.save.v0.2，清掉，返回提示。 */
function retireV02(store: KeyValueStore | null, raw: string, v1: string | null): LoadResult {
  set(store, LEGACY_V02_BACKUP_KEY, raw);
  remove(store, KEY);
  // 同时还残留 0.1 的 v1 key：也一并备份清掉
  if (v1 !== null) {
    set(store, LEGACY_BACKUP_KEY, v1);
    remove(store, LEGACY_V1_KEY);
  }
  console.info(`读到 0.2 的旧存档，已备份到 ${LEGACY_V02_BACKUP_KEY}`);
  return { state: null, notice: 'legacy', legacyFrom: '0.2' };
}

/**
 * 找回 0.4.0-alpha.1 备份走的 0.3 存档：备份通过校验时原样写回主存档位，备份改名为 *.restored，返回局面；
 * 没有备份、备份读不出或写回失败时什么都不改，返回 null（下次启动再试）。调用方保证主存档位可以被覆盖。
 */
function restoreV03(store: KeyValueStore | null): GameState | null {
  const raw = get(store, V03_BACKUP_KEY);
  if (!raw) return null;
  let state: GameState | null = null;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (isObject(data) && data.format === SAVE_FORMAT) state = reviveState(data.state);
  } catch {
    state = null;
  }
  if (!state) return null;
  if (!set(store, KEY, raw)) return null;
  set(store, V03_RESTORED_KEY, raw);
  remove(store, V03_BACKUP_KEY);
  console.info(`找回了 0.4.0-alpha.1 备份走的 0.3 存档（${V03_BACKUP_KEY}），已放回主存档位`);
  return state;
}

/** 0.4.0-alpha.1 的存档（format 6）：原样备份到 kaipan.save.v0.4a，清掉；有被它备份走的 0.3 存档就一并找回。 */
function retireV04a(store: KeyValueStore | null, raw: string, v1: string | null): LoadResult {
  set(store, LEGACY_V04A_BACKUP_KEY, raw);
  remove(store, KEY);
  if (v1 !== null) {
    set(store, LEGACY_BACKUP_KEY, v1);
    remove(store, LEGACY_V1_KEY);
  }
  console.info(`读到 0.4.0-alpha.1 的存档，已备份到 ${LEGACY_V04A_BACKUP_KEY}`);
  const state = restoreV03(store);
  return state ? { state, notice: 'legacy', legacyFrom: '0.4a', restored: '0.3' } : { state: null, notice: 'legacy', legacyFrom: '0.4a' };
}

/**
 * 读取存档（启动时调用一次）：
 * - 没有存档：{ state: null, notice: null }
 * - 0.3.0-alpha.1 旧存档：备份到 kaipan.save.v0.3a 后清除，{ state: null, notice: 'legacy', legacyFrom: '0.3a' }
 * - 0.2 旧存档：备份到 kaipan.save.v0.2 后清除，{ state: null, notice: 'legacy', legacyFrom: '0.2' }
 * - 0.1 旧存档：备份到 kaipan.save.v0.1 后清除，{ state: null, notice: 'legacy', legacyFrom: '0.1' }
 *   读到旧存档时画面提示 LEGACY_NOTICE 后开新局
 * - 0.4.0-alpha.1 存档：备份到 kaipan.save.v0.4a 后清除，{ notice: 'legacy', legacyFrom: '0.4a' }；
 *   同时找回了 0.3 存档时 state 是找回的局面、restored 为 '0.3'
 * - 没有存档但有 0.4.0-alpha.1 备份走的 0.3 存档：找回，{ state, notice: 'restored', restored: '0.3' }
 * - 存档损坏：备份到 kaipan.save.corrupt 后清除，{ state: null, notice: 'corrupt' }
 */
export function loadSave(store: KeyValueStore | null = defaultStore()): LoadResult {
  const raw = get(store, KEY);
  const v1 = get(store, LEGACY_V1_KEY);
  if (!raw) {
    if (v1) return retireV01(store, null, v1);
    const state = restoreV03(store);
    return state ? { state, notice: 'restored', restored: '0.3' } : { state: null, notice: null };
  }
  let data: Partial<SaveData> & { format?: unknown };
  try {
    data = JSON.parse(raw) as Partial<SaveData>;
  } catch (err) {
    return discard(store, KEY, raw, `解析失败：${String(err)}`);
  }
  if (!isObject(data)) return discard(store, KEY, raw, '不是对象');
  const format: unknown = data.format;
  if (typeof format === 'number' && format <= 2) return retireV01(store, raw, v1);
  if (format === 3) return retireV02(store, raw, v1);
  if (format === 4) return retireV03a(store, raw);
  if (format === V04A_FORMAT) return retireV04a(store, raw, v1);
  if (format !== SAVE_FORMAT) return discard(store, KEY, raw, `未知存档格式 ${String(format)}`);
  const state = reviveState(data.state);
  if (!state) return discard(store, KEY, raw, '局面结构不对');
  if (v1) remove(store, LEGACY_V1_KEY);
  if (data.appVersion !== APP_VERSION) console.info(`存档来自 ${String(data.appVersion)}，当前 ${APP_VERSION}，按存档局面继续`);
  return { state, notice: null };
}

/** 只要局面（兼容旧调用）；旧存档、损坏存档都返回 null。 */
export function restoreSave(store: KeyValueStore | null = defaultStore()): GameState | null {
  return loadSave(store).state;
}

/** 是否有可以继续的 0.3 存档（不修改存储）。 */
export function hasSave(store: KeyValueStore | null = defaultStore()): boolean {
  const raw = get(store, KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    return data.format === SAVE_FORMAT && reviveState(data.state) !== null;
  } catch {
    return false;
  }
}

/** 是否有待处理的旧版本存档（0.1、0.2、0.3.0-alpha.1 或 0.4.0-alpha.1；不修改存储；loadSave 会处理并给出提示）。 */
export function hasLegacySave(store: KeyValueStore | null = defaultStore()): boolean {
  if (get(store, LEGACY_V1_KEY)) return true;
  const raw = get(store, KEY);
  if (!raw) return false;
  try {
    const f = (JSON.parse(raw) as { format?: unknown }).format;
    return typeof f === 'number' && (f < SAVE_FORMAT || f === V04A_FORMAT);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 本地纪录

interface Records {
  version: 2;
  /** 最多还清了几个月的月供（通关为 12）；从没玩过为 -1 */
  bestMonths: number;
  /** 通关时的最高账户余额（元）；没通关过为 0 */
  bestAccount: number;
  /** 历史最高账户（元，含没通关的局） */
  peakAccount: number;
  wins: number;
  runs: number;
  /** 最近记过的一局（种子 + 操作数），防止同一局重复记 */
  last: string;
}

function recordsVersion(raw: string): unknown {
  try {
    const r: unknown = JSON.parse(raw);
    return isObject(r) ? r.version : undefined;
  } catch {
    return undefined;
  }
}

type RecordField = 'bestMonths' | 'bestAccount' | 'peakAccount' | 'wins';

const EMPTY_RECORDS: Records = { version: 2, bestMonths: -1, bestAccount: 0, peakAccount: 0, wins: 0, runs: 0, last: '' };

/**
 * 读纪录。0.2 的纪录（version 1，按季度和基金规模记）结构不同：原样备份到 kaipan.records.v0.2 后重置。
 * 0.4.0-alpha.1 的纪录（version 3）备份到 kaipan.records.v0.4a；它备份走的 0.3 纪录（kaipan.records.v0.3）
 * 在纪录为空时找回（备份改名为 *.restored）。
 */
export function loadRecords(store: KeyValueStore | null = defaultStore()): Records {
  let raw = get(store, RECORDS_KEY);
  if (raw && recordsVersion(raw) === 3) {
    set(store, LEGACY_V04A_RECORDS_BACKUP_KEY, raw);
    remove(store, RECORDS_KEY);
    console.info(`读到 0.4.0-alpha.1 的纪录，已备份到 ${LEGACY_V04A_RECORDS_BACKUP_KEY}`);
    raw = null;
  }
  if (!raw) {
    const old = get(store, V03_RECORDS_BACKUP_KEY);
    if (!old || recordsVersion(old) !== 2 || !set(store, RECORDS_KEY, old)) return { ...EMPTY_RECORDS };
    set(store, V03_RECORDS_RESTORED_KEY, old);
    remove(store, V03_RECORDS_BACKUP_KEY);
    console.info(`找回了 0.4.0-alpha.1 备份走的 0.3 纪录（${V03_RECORDS_BACKUP_KEY}）`);
    raw = old;
  }
  try {
    const r = JSON.parse(raw) as Partial<Records> & { version?: unknown };
    if (r.version !== 2) {
      set(store, LEGACY_RECORDS_BACKUP_KEY, raw);
      remove(store, RECORDS_KEY);
      console.info(`读到旧版本的纪录，已备份到 ${LEGACY_RECORDS_BACKUP_KEY} 并重置`);
      return { ...EMPTY_RECORDS };
    }
    const n = (v: unknown, d: number): number => (finite(v) ? v : d);
    return {
      version: 2,
      bestMonths: n(r.bestMonths, -1),
      bestAccount: n(r.bestAccount, 0),
      peakAccount: n(r.peakAccount, 0),
      wins: n(r.wins, 0),
      runs: n(r.runs, 0),
      last: typeof r.last === 'string' ? r.last : '',
    };
  } catch {
    return { ...EMPTY_RECORDS };
  }
}

/**
 * 一局结束（won / lost）时记纪录，返回新纪录和本局刷新了哪几项（结束页标出来）。
 * 同一局重复调用不会重复计数。局面未结束时不记。
 */
export function recordRun(state: GameState, store: KeyValueStore | null = defaultStore()): { records: Records; refreshed: RecordField[] } {
  const rec = loadRecords(store);
  if (state.phase !== 'won' && state.phase !== 'lost') return { records: rec, refreshed: [] };
  const id = `${state.seed}|${state.actions.length}`;
  if (rec.last === id) return { records: rec, refreshed: [] };
  const refreshed: RecordField[] = [];
  const months = state.stats.billsPaid;
  if (months > rec.bestMonths) {
    rec.bestMonths = months;
    refreshed.push('bestMonths');
  }
  if (state.phase === 'won' && state.account > rec.bestAccount) {
    rec.bestAccount = state.account;
    refreshed.push('bestAccount');
  }
  if (state.stats.peakAccount > rec.peakAccount) {
    rec.peakAccount = state.stats.peakAccount;
    refreshed.push('peakAccount');
  }
  if (state.phase === 'won') {
    rec.wins += 1;
    refreshed.push('wins');
  }
  rec.runs += 1;
  rec.last = id;
  set(store, RECORDS_KEY, JSON.stringify(rec));
  return { records: rec, refreshed };
}
