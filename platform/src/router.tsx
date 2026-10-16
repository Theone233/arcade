/** 极简的前端路由：几张页面用不着引一个路由库。线上靠静态资源的单页回退（wrangler.jsonc 的 not_found_handling）。 */
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const snapshot = () => location.pathname + location.search;

/** 离开提醒：恢复码还没存好时设上，站内跳转、后退、关页面都先问一句。 */
let leaveGuard: string | null = null;
/** 最近一次确认过的地址：后退被拦下时退回这里。 */
let current = snapshot();

function notify(): void {
  current = snapshot();
  for (const fn of listeners) fn();
}

function onPopState(): void {
  if (leaveGuard && snapshot() !== current && !window.confirm(leaveGuard)) {
    // 地址已经变了，推回原来的页面
    history.pushState(null, '', current);
    return;
  }
  notify();
}

function subscribe(fn: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('popstate', onPopState);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) window.removeEventListener('popstate', onPopState);
  };
}

/** 当前地址（路径 + 查询串）。 */
export function useLocation(): URL {
  const s = useSyncExternalStore(subscribe, snapshot);
  return new URL(s, location.origin);
}

/**
 * 有离开提醒时先问一句，玩家点"确定"才返回 true。
 * 要先做事再跳转的按钮（比如退出登录：先调接口、清掉用户，再回首页）在动手之前调它，
 * 免得事情做完了才问，玩家点"取消"时人已经退出、卡片也没了；问过以后跳转传 confirmed，不再问第二遍。
 */
export function confirmLeave(): boolean {
  return !leaveGuard || window.confirm(leaveGuard);
}

/** 站内跳转。有离开提醒时先问，玩家点"取消"就不走；confirmed 表示已经用 confirmLeave 问过了。 */
export function navigate(to: string, replace = false, confirmed = false): void {
  if (!confirmed && !confirmLeave()) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.scrollTo(0, 0);
  notify();
}

/** message 不为 null 时，离开这一页（站内跳转、后退、刷新、关页面）都先提醒。 */
export function useLeaveGuard(message: string | null): void {
  useEffect(() => {
    if (!message) return;
    leaveGuard = message;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 老浏览器要设 returnValue 才弹；文字由浏览器决定，设什么都不显示
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      leaveGuard = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [message]);
}

/** 站内链接：点了不整页刷新。按住 Ctrl 等新开页面的照常交给浏览器。 */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
