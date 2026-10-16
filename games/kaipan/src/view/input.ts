/**
 * 主要输入方式：触屏设备上不显示键盘快捷键角标和「按空格 / 回车」之类的提示。
 *
 * 判定：`(pointer: coarse)` 命中即为触屏；否则在收到 touch 事件、且没有精细指针（鼠标、触控板）时
 * 切换为触屏，并通知订阅者重建画面。只影响提示文案，不影响键盘本身是否可用。
 */

let touch = false;
const listeners = new Set<() => void>();

function media(query: string): boolean {
  return globalThis.matchMedia?.(query).matches ?? false;
}

/** 启动时调用一次。 */
export function initInputMode(): void {
  touch = media('(pointer: coarse)');
  if (touch || typeof window === 'undefined') return;
  const onTouch = (): void => {
    window.removeEventListener('touchstart', onTouch);
    if (touch || media('(any-pointer: fine)')) return;
    touch = true;
    for (const fn of listeners) fn();
  };
  window.addEventListener('touchstart', onTouch, { passive: true });
}

/** 主要输入是否为触屏。 */
export function isTouch(): boolean {
  return touch;
}

/** 输入方式变为触屏时回调；返回取消订阅函数。 */
export function onInputModeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
