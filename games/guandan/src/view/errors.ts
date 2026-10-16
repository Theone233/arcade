/**
 * 全局错误兜底：未捕获的异常不留白屏，弹一个独立于 Phaser 的 DOM 面板：继续 / 重新载入 / 放弃存档重开。
 * 最近 20 条错误记在 localStorage（guandan.errors），方便排查。
 */
import { clearSave, rememberError } from './store.ts';

let panel: HTMLElement | null = null;

function isNoise(message: string, filename?: string): boolean {
  if (filename && !filename.startsWith(location.origin) && !filename.startsWith('blob:')) return true;
  return /ResizeObserver loop|Script error\.?$/i.test(message);
}

export function showErrorPanel(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  rememberError({ time: new Date().toISOString(), message: e.message, stack: e.stack ?? '', version: __APP_VERSION__ });
  if (panel) return;
  document.getElementById('boot')?.remove();
  const el = document.createElement('div');
  el.id = 'error-panel';
  el.innerHTML = `
    <div class="ep-card">
      <b>哎呀，出了点小问题</b>
      <span>进度已经自动保存，一般点"继续"就好。</span>
      <code></code>
      <div class="ep-row">
        <button data-act="go">继续</button>
        <button data-act="reload">重新载入</button>
        <button data-act="reset" class="ep-warn">放弃存档重开</button>
      </div>
    </div>`;
  (el.querySelector('code') as HTMLElement).textContent = e.message.slice(0, 200);
  el.addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).getAttribute('data-act');
    if (act === 'go') {
      el.remove();
      panel = null;
    } else if (act === 'reload') location.reload();
    else if (act === 'reset') {
      clearSave();
      location.reload();
    }
  });
  document.body.appendChild(el);
  panel = el;
}

/** 关掉兜底面板（问题自己好了，比如 WebGL 画面恢复了） */
export function hideErrorPanel(): void {
  panel?.remove();
  panel = null;
}

export function installErrorHandler(): void {
  const style = document.createElement('style');
  style.textContent = `
#error-panel { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center;
  background: rgba(10, 6, 4, 0.72); font: 16px/1.6 "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
#error-panel .ep-card { max-width: 420px; margin: 16px; padding: 22px 24px; border-radius: 18px; background: #fbf1dc;
  border: 5px solid #6b3b1f; box-shadow: 0 0 0 2px #e0b45a inset; color: #2b1d14; display: flex; flex-direction: column; gap: 10px; }
#error-panel b { font-size: 22px; color: #b3202a; }
#error-panel code { font-size: 12px; color: #7a6555; word-break: break-all; background: #f1e4c6; padding: 6px 8px; border-radius: 8px; }
#error-panel .ep-row { display: flex; gap: 8px; flex-wrap: wrap; }
#error-panel button { flex: 1; min-width: 96px; padding: 10px 8px; border: 0; border-radius: 12px; font: inherit; font-weight: bold;
  background: #b3202a; color: #fff3d6; cursor: pointer; }
#error-panel button.ep-warn { background: #7a6555; }`;
  document.head.appendChild(style);
  window.addEventListener('error', (ev) => {
    if (isNoise(ev.message ?? '', ev.filename)) return;
    showErrorPanel(ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => showErrorPanel(ev.reason));
}
