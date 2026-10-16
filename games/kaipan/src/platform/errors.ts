/**
 * 全局错误兜底：未捕获的异常和 Promise 拒绝不会留下白屏或卡死的画面，
 * 而是弹出一个独立于 Phaser 的 DOM 面板，可以继续、重新载入、放弃存档开新局或复制错误信息。
 * 最近的错误记在 localStorage（最多 20 条），便于排查。
 */
import { defaultStore } from './settings.ts';
import { clearSave } from './storage.ts';
import { APP_VERSION } from './version.ts';

interface ErrorRecord {
  time: string;
  message: string;
  stack: string;
  version: string;
  url: string;
}

const LOG_KEY = 'kaipan.errors';
const LOG_MAX = 20;

let installed = false;
let panel: HTMLElement | null = null;

/** 浏览器插件、ResizeObserver 等与游戏无关的噪声不打断玩家。 */
function isNoise(message: string, filename: string | undefined): boolean {
  if (filename && !filename.startsWith(location.origin) && !filename.startsWith('blob:')) return true;
  return /ResizeObserver loop|Script error\.?$/i.test(message);
}

function toRecord(err: unknown): ErrorRecord {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  return {
    time: new Date().toISOString(),
    message: e.message,
    stack: e.stack ?? '',
    version: APP_VERSION,
    url: location.href,
  };
}

function remember(rec: ErrorRecord): void {
  const store = defaultStore();
  try {
    const list = JSON.parse(store?.getItem(LOG_KEY) ?? '[]') as ErrorRecord[];
    list.push(rec);
    store?.setItem(LOG_KEY, JSON.stringify(list.slice(-LOG_MAX)));
  } catch {
    // 记录失败不影响提示
  }
}

function details(rec: ErrorRecord): string {
  return [`《开盘》${rec.version}  ${rec.time}`, rec.url, rec.message, rec.stack].join('\n');
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非安全上下文（如内网 http）没有剪贴板 API，退回到选中文本手动复制
    return false;
  }
}

function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'font:15px/1 "Microsoft YaHei","PingFang SC",sans-serif;padding:10px 16px;border-radius:6px;cursor:pointer;' +
    (primary ? 'background:#f2b134;color:#1a1305;border:0;' : 'background:transparent;color:#dbe2ea;border:1px solid #3a4d66;');
  b.addEventListener('click', onClick);
  return b;
}

function show(rec: ErrorRecord): void {
  if (panel) return; // 同一时刻只显示一个面板，后续错误只记录
  const root = document.createElement('div');
  root.setAttribute('role', 'alertdialog');
  root.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)';
  const box = document.createElement('div');
  box.style.cssText =
    'width:min(560px,92vw);background:#111821;border:2px solid #f2b134;border-radius:12px;padding:22px 24px;color:#dbe2ea;' +
    'font:15px/1.6 "Microsoft YaHei","PingFang SC",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)';
  const title = document.createElement('div');
  title.textContent = '出了点问题';
  title.style.cssText = 'font-size:20px;font-weight:bold;color:#f2b134;margin-bottom:8px';
  const msg = document.createElement('div');
  msg.textContent = `游戏遇到了意外错误：${rec.message}。你的进度在最近一次操作后已自动保存，通常重新载入即可继续。`;
  const pre = document.createElement('textarea');
  pre.readOnly = true;
  pre.value = details(rec);
  pre.style.cssText =
    'width:100%;height:96px;margin:12px 0;background:#0a0e13;color:#a3afbf;border:1px solid #233041;border-radius:6px;font:12px/1.4 monospace;resize:none';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end';
  row.append(
    button('继续游戏', false, () => {
      root.remove();
      panel = null;
    }),
    button('复制错误信息', false, () => {
      void copy(pre.value).then((ok) => {
        if (!ok) pre.select();
      });
    }),
    button('放弃存档并开新局', false, () => {
      if (!confirm('确定放弃当前存档并开一局新的吗？')) return;
      clearSave();
      location.reload();
    }),
    button('重新载入', true, () => location.reload()),
  );
  box.append(title, msg, pre, row);
  root.append(box);
  document.body.append(root);
  panel = root;
}

/** 处理一个错误：记录并提示玩家。也可由代码在捕获到致命错误时主动调用。 */
function reportError(err: unknown): void {
  const rec = toRecord(err);
  remember(rec);
  console.error('[开盘] 未处理的错误：', err);
  show(rec);
}

/** 安装全局错误处理，应在入口最早调用；重复调用无副作用。 */
export function installErrorHandler(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    if (isNoise(e.message, e.filename)) return;
    reportError(e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    if (isNoise(message, undefined)) return;
    reportError(reason);
  });
}
