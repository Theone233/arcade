/**
 * 页面（选桌页、准备房间、结算）的舞台：照美术的设计稿按设计尺寸摆（横屏 844×390、竖屏 390×844），整块等比缩放到屏幕里、居中；
 * 背后一张铺满整屏的画布画背景（远景、地面、小动物），坐标也按设计尺寸（屏幕比设计稿宽、高的部分往两边多画一点）。
 * 屏幕尺寸变了就整页重画一遍（页面的内容都从设置和状态来，重画很便宜）。
 */
import { el } from './dom.ts';
import { renderRatio, type Size } from './viewport.ts';

export interface StageView {
  /** 设计稿的宽高 */
  W: number;
  H: number;
  port: boolean;
  /** 摆内容的那一层（设计尺寸，CSS 像素） */
  layer: HTMLElement;
  /** 背景画布的 2D 上下文，已经设好"设计坐标 → 屏幕"的变换 */
  bg: CanvasRenderingContext2D;
  /** 设计坐标里屏幕的范围（比 0..W、0..H 大的部分是两边多出来的） */
  view: { x0: number; y0: number; x1: number; y1: number };
}

export class Stage {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private layer: HTMLElement;
  private last = '';

  private draw: (v: StageView) => void;

  /** cls 是页面根节点的类名（CSS 都挂在它下面）；draw 每次重画时调 */
  constructor(host: HTMLElement, cls: string, draw: (v: StageView) => void) {
    this.draw = draw;
    this.root = el('div', `dl-page ${cls}`, host);
    this.canvas = el('canvas', 'dl-page-bg', this.root);
    this.layer = el('div', 'dl-stage', this.root);
  }

  resize(s: Size, force = false): void {
    const key = `${s.w}x${s.h}`;
    if (!force && key === this.last) return;
    this.last = key;
    const port = s.port;
    const W = port ? 390 : 844;
    const H = port ? 844 : 390;
    const k = Math.min(s.w / W, s.h / H);
    const ox = (s.w - W * k) / 2;
    const oy = (s.h - H * k) / 2;
    const st = this.layer.style;
    st.width = `${W}px`;
    st.height = `${H}px`;
    st.transform = `translate(${ox}px, ${oy}px) scale(${k})`;
    this.layer.dataset.orient = port ? 'port' : 'land';
    this.layer.replaceChildren();
    const dpr = renderRatio();
    this.canvas.width = Math.round(s.w * dpr);
    this.canvas.height = Math.round(s.h * dpr);
    this.canvas.style.width = `${s.w}px`;
    this.canvas.style.height = `${s.h}px`;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    this.draw({ W, H, port, layer: this.layer, bg: ctx, view: { x0: -ox / k, y0: -oy / k, x1: (s.w - ox) / k, y1: (s.h - oy) / k } });
  }

  /** 内容变了（比如房间里换了人）：按现在的尺寸重画 */
  redraw(): void {
    const [w, h] = this.last.split('x').map(Number);
    if (w && h) this.resize({ w, h, port: h > w * 1.15 }, true);
  }

  destroy(): void {
    this.root.remove();
  }
}
