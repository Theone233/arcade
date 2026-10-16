/**
 * 0.5.9 画布按实际看得见的区域铺：iOS Safari 的 100vh（和 100%）是工具栏收起时的高度，比带着地址栏、标签栏时看得见的高，
 * 横屏时画面最上面一截被地址栏压住（交易页右上角的按钮、左边群聊的顶）。
 * CSS 先给 100vh、再给 100dvh（iOS 15.4+），这里用 visualViewport（没有就 innerHeight）的高度写进 --app-h 兜底，
 * 尺寸一变就重写、滚回顶部，再让 Phaser 重新量一次父容器。四边的刘海留白在 index.html 的 CSS 里（env(safe-area-inset-*)）。
 * 只在省内存的设备（手机平板）上启用，别的浏览器走 CSS 的 100dvh。
 * 双指放大时 visualViewport 的宽高按放大后的变小：这时不跟着改（画布不缩、不抖），缩回 1 倍再说。
 */

/** 看得见的区域（CSS 像素） */
function visibleSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? window.innerWidth), h: Math.round(vv?.height ?? window.innerHeight) };
}

/** 双指放大着（visualViewport.scale 明显不是 1） */
export function zoomed(scale: number | undefined): boolean {
  return scale !== undefined && Math.abs(scale - 1) > 0.02;
}

/** 写 --app-h，尺寸变化时重写并通知（onFit 里让 Phaser 重新量父容器）。返回取消监听的函数。 */
export function fitViewport(onFit: () => void): () => void {
  const root = document.documentElement;
  let last = '';
  const apply = (): void => {
    if (zoomed(window.visualViewport?.scale)) return;
    const v = visibleSize();
    const size = `${v.w}x${v.h}`;
    // 页面被系统推上去了一截（转屏、收放工具栏）：拉回顶部
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    if (size === last) return;
    last = size;
    root.style.setProperty('--app-h', `${v.h}px`);
    onFit();
  };
  // 转屏后 iOS 要过一会儿才给出最终尺寸：当下一次、稍后再补一次
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = (): void => {
    apply();
    if (timer) clearTimeout(timer);
    timer = setTimeout(apply, 300);
  };
  apply();
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);
  return () => {
    window.removeEventListener('resize', later);
    window.removeEventListener('orientationchange', later);
    window.visualViewport?.removeEventListener('resize', later);
    if (timer) clearTimeout(timer);
  };
}

const TIP_KEY = 'kaipan.homeTip.off';
const TIP_ID = 'home-tip';

/** iOS 上的 Safari（不是已经从主屏幕打开的、也不是微信等 App 里的浏览器，它们加不了主屏幕） */
export function isIosSafari(ua: string, standalone: boolean, touchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (!ios || standalone) return false;
  return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient/.test(ua);
}

/**
 * 「添加到主屏幕玩更大」：只在 iOS Safari 的开始菜单上显示，点 × 关掉后不再出现（记在 kaipan.homeTip.off）。
 * 从主屏幕打开是全屏（index.html 里的 apple-mobile-web-app-capable），没有地址栏挡着。
 */
export function showHomeTip(): void {
  if (typeof document === 'undefined' || document.getElementById(TIP_ID)) return;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (!isIosSafari(nav.userAgent, nav.standalone === true, nav.maxTouchPoints ?? 0)) return;
  try {
    if (localStorage.getItem(TIP_KEY) === '1') return;
  } catch {
    // 存储不可用：照常显示
  }
  const el = document.createElement('div');
  el.id = TIP_ID;
  el.style.cssText =
    'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 10px);transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:10px;' +
    'padding:8px 8px 8px 16px;border-radius:999px;background:rgba(40,32,24,.88);color:#fff8ec;white-space:nowrap;' +
    'font:600 14px/1.4 system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);';
  const text = document.createElement('span');
  text.textContent = '添加到主屏幕玩更大：点分享 → 「添加到主屏幕」';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '不再提示');
  close.style.cssText = 'width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff8ec;font:700 20px/1 system-ui;cursor:pointer;';
  close.addEventListener('click', () => {
    try {
      localStorage.setItem(TIP_KEY, '1');
    } catch {
      // 存不上：这次关掉就算了
    }
    el.remove();
  });
  el.append(text, close);
  document.body.appendChild(el);
}

export function hideHomeTip(): void {
  document.getElementById(TIP_ID)?.remove();
}
