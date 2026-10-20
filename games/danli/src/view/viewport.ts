/**
 * 看得见的区域（AGENTS.md 第 4 节 iOS 那几条）：
 * - 高度不用 100vh：CSS 先写 100vh → 100dvh，再由这里按 visualViewport（没有就 innerHeight）写 --app-h；
 *   转屏、收放地址栏后重算，转屏后过一会儿再补算一次（iOS 转屏时第一次拿到的尺寸常常是旧的）；
 * - 双指放大时（visualViewport.scale 明显不是 1）不改尺寸、不重排，缩回 1 倍再说；
 * - 画布的渲染倍数封顶 2（view/scene.ts）。
 */
export interface Size {
  w: number;
  h: number;
  /** 竖屏：高比宽多 15% 以上 */
  port: boolean;
}

export function watchViewport(app: HTMLElement, onChange: (s: Size) => void): () => Size {
  let last: Size = { w: 0, h: 0, port: false };
  let timer = 0;
  const measure = (): void => {
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > 0.05) return;
    const vh = vv?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${Math.round(vh)}px`);
    const r = app.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const s: Size = { w: Math.round(r.width), h: Math.round(r.height), port: r.height > r.width * 1.15 };
    if (s.w === last.w && s.h === last.h) return;
    last = s;
    onChange(s);
  };
  const later = (): void => {
    measure();
    window.clearTimeout(timer);
    timer = window.setTimeout(measure, 350);
  };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);
  measure();
  return () => last;
}

/** 省内存设备：触屏（手机平板）。画布渲染倍数封顶 2，地形块按这个倍数烘焙 */
export function renderRatio(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}
