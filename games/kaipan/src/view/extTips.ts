import { bankView, canShortNow, chatView, extTip, holdingCards, isBusy, type GameState } from '../core/index.ts';
import { touched } from '../platform/localChange.ts';
import { defaultStore, type KeyValueStore } from '../platform/settings.ts';

/**
 * 0.4 C 新机制的第一次提示（仓位、手里的股票、押跌、银行、银行打电话）：每条只显示一次，记在 localStorage。
 * 文案来自规则层 extTip；触发条件只看公开的局面。纯逻辑，可单测。
 */
export type ExtTipId = 'call' | 'size' | 'holding' | 'short' | 'bank';

/** 同一时刻有多条可出时的先后（银行打电话最急）。 */
export const EXT_TIP_ORDER: readonly ExtTipId[] = ['call', 'size', 'holding', 'short', 'bank'];

export const EXT_TIPS_KEY = 'kaipan.extTips.v1';

export function loadSeenTips(store: KeyValueStore | null = defaultStore()): ExtTipId[] {
  try {
    const raw = store?.getItem(EXT_TIPS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is ExtTipId => EXT_TIP_ORDER.includes(x as ExtTipId)) : [];
  } catch {
    return [];
  }
}

export function markTipSeen(id: ExtTipId, store: KeyValueStore | null = defaultStore()): void {
  const seen = loadSeenTips(store);
  if (seen.includes(id)) return;
  try {
    store?.setItem(EXT_TIPS_KEY, JSON.stringify([...seen, id]));
  } catch {
    // 存储不可用：本次运行内照常
  }
  touched('tutorial');
}

/** 云端来的（不可信）列表 → 认识的提示 id。 */
export function reviveTips(raw: unknown): ExtTipId[] {
  return Array.isArray(raw) ? EXT_TIP_ORDER.filter((id) => raw.includes(id)) : [];
}

/** 这条提示现在该不该出（不管看没看过）。 */
export function tipApplies(s: Readonly<GameState>, id: ExtTipId): boolean {
  if (!s.ext || s.phase !== 'premarket') return false;
  switch (id) {
    case 'call':
      return s.ext.called;
    case 'size':
      return !isBusy(s) && chatView(s).recs.some((r) => !r.taken && !r.error);
    case 'holding':
      return !isBusy(s) && holdingCards(s).some((c) => c && c.canSell);
    case 'short':
      return canShortNow(s);
    case 'bank':
      return bankView(s).open;
  }
}

/** 下一条该说的提示（没看过、而且现在用得上）；没有为 null。 */
export function nextExtTip(s: Readonly<GameState>, seen: readonly ExtTipId[]): { id: ExtTipId; text: string } | null {
  for (const id of EXT_TIP_ORDER) {
    if (seen.includes(id) || !tipApplies(s, id)) continue;
    const text = extTip(id);
    if (text) return { id, text };
  }
  return null;
}
