/**
 * 本地要同步的数据（档案、教程标记）写入后喊一声，云同步（cloud.ts）据此标记"待上传"。
 * 单独一个小模块：profile.ts、tutorial.ts 不必知道云同步的存在，也不会互相循环引用。
 */
export type SyncSlot = 'profile' | 'tutorial';

const listeners = new Set<(slot: SyncSlot) => void>();

export function touched(slot: SyncSlot): void {
  for (const fn of listeners) fn(slot);
}

export function onTouched(fn: (slot: SyncSlot) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
