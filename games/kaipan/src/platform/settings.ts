/**
 * 玩家设置：保存在 localStorage，带版本号；读到损坏、缺字段或越界的值时逐项回退默认值。
 * 运行时通过 getSettings / updateSettings / onSettingsChange 使用。
 */

/** 动画速度倍率；0 表示关闭动画。 */
export type AnimSpeed = 0 | 1 | 2 | 4;
/** 涨跌配色：cn 红涨绿跌（A 股习惯），intl 绿涨红跌。 */
export type ColorScheme = 'cn' | 'intl';

export interface Settings {
  version: 1;
  /** 音量均为 0..1 */
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  animSpeed: AnimSpeed;
  colorScheme: ColorScheme;
  /** 减少震屏、闪光等动态效果 */
  reduceMotion: boolean;
}

/** localStorage 的最小接口，测试时可传入内存实现。 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'kaipan.settings';
const ANIM_SPEEDS: readonly AnimSpeed[] = [0, 1, 2, 4];
const COLOR_SCHEMES: readonly ColorScheme[] = ['cn', 'intl'];

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  version: 1,
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  muted: false,
  animSpeed: 1,
  colorScheme: 'cn',
  reduceMotion: false,
};

export function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 隐私模式或禁用存储
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** 把任意输入整理成合法设置：缺字段、类型不对或越界的字段回退默认值，音量夹到 0..1。 */
export function sanitizeSettings(raw: unknown, base: Settings = { ...DEFAULT_SETTINGS }): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const volume = (v: unknown, d: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  const pick = <T>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  return {
    version: 1,
    masterVolume: volume(r.masterVolume, base.masterVolume),
    sfxVolume: volume(r.sfxVolume, base.sfxVolume),
    musicVolume: volume(r.musicVolume, base.musicVolume),
    muted: bool(r.muted, base.muted),
    animSpeed: pick(r.animSpeed, ANIM_SPEEDS, base.animSpeed),
    colorScheme: pick(r.colorScheme, COLOR_SCHEMES, base.colorScheme),
    reduceMotion: bool(r.reduceMotion, base.reduceMotion),
  };
}

/** 读取设置；首次使用时「减少动态效果」跟随系统偏好。 */
export function loadSettings(store: KeyValueStore | null = defaultStore()): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, reduceMotion: prefersReducedMotion() };
  let raw: string | null = null;
  try {
    raw = store?.getItem(KEY) ?? null;
  } catch {
    return base;
  }
  if (!raw) return base;
  try {
    return sanitizeSettings(JSON.parse(raw), base);
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // 配额不足等：设置仍在本次运行中生效
  }
}

let current: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  current ??= loadSettings();
  return current;
}

/** 修改部分设置：整理、保存并通知订阅者，返回新设置。 */
export function updateSettings(patch: Partial<Omit<Settings, 'version'>>): Settings {
  const next = sanitizeSettings({ ...getSettings(), ...patch });
  current = next;
  saveSettings(next);
  for (const fn of listeners) fn(next);
  return next;
}

/** 订阅设置变化，返回取消订阅函数。 */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
