/**
 * 远景和纸边（DESIGN.md 第 3、4 节）：整张图是一页画本，下面越往下越虚；左、右、下三边是撕开的纸边，纸边外是书桌（画外）。
 * 远景（厨房墙、窗、挂着的锅勺、往下淡成雾）开局整张烘焙成一张低分辨率的图，放在镜头那一层里，镜头动时只挪这一张；
 * 纸边是玩法边界，要清楚：每帧按矢量描（几百个点，很便宜）。
 */
import { INK, WALL } from './palette.ts';

/** 烘焙的范围（世界坐标）：比画本大一圈，镜头拉远、拖到边上也有东西 */
const BX0 = -700;
const BY0 = -900;
const BW = 4400;
const BH = 2100;
const BAKE = 0.4;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Backdrop {
  private canvas: HTMLCanvasElement;
  /** 纸边的折线（左边从上到下、底边从左到右、右边从下到上） */
  readonly edge: Path2D;

  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const r = lcg(13);
    const jag = (n: number): number => (r() - 0.5) * n;
    const pts: [number, number][] = [];
    for (let y = BY0; y <= height; y += 16) pts.push([jag(9), y]);
    for (let x = 0; x <= width; x += 16) pts.push([x, height + jag(9)]);
    for (let y = height; y >= BY0; y -= 16) pts.push([width + jag(9), y]);
    this.edge = new Path2D();
    this.edge.moveTo(pts[0]![0], pts[0]![1]);
    for (const p of pts) this.edge.lineTo(p[0], p[1]);
    this.canvas = this.bake(pts);
  }

  private bake(pts: [number, number][]): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.ceil(BW * BAKE);
    c.height = Math.ceil(BH * BAKE);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(BAKE, 0, 0, BAKE, -BX0 * BAKE, -BY0 * BAKE);
    const W = this.width;
    const H = this.height;
    // 墙
    ctx.fillStyle = WALL.base;
    ctx.fillRect(BX0, BY0, BW, BH);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = WALL.wash;
    const r = lcg(7);
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(r() * W, BY0 + r() * (H - BY0), 200 + r() * 300, 80 + r() * 120, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 墙上的瓷砖缝
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = BX0; x < BX0 + BW; x += 160) {
      ctx.moveTo(x, BY0);
      ctx.lineTo(x, 560);
    }
    for (let y = -900; y < 560; y += 160) {
      ctx.moveTo(BX0, y);
      ctx.lineTo(BX0 + BW, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 窗
    ctx.fillStyle = WALL.window;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect(1180, 24, 574, 306, 14);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1467, 24);
    ctx.lineTo(1467, 330);
    ctx.stroke();
    // 窗外两朵云
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#f4efe2';
    for (const [x, y] of [[1270, 100], [1590, 70]] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, 40, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 26, y - 10, 26, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 挂着的汤勺和平底锅
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    for (const [x, k] of [[300, 0], [1000, 1], [1950, 0], [2600, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(x - 60, 60);
      ctx.lineTo(x + 60, 60);
      ctx.moveTo(x, 60);
      if (k) {
        ctx.lineTo(x, 120);
        ctx.moveTo(x + 24, 140);
        ctx.ellipse(x, 140, 24, 20, 0, 0, Math.PI * 2);
      } else {
        ctx.lineTo(x, 130);
        ctx.ellipse(x, 156, 12, 26, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 往下淡成一片冷灰的雾，越往下越虚
    const g = ctx.createLinearGradient(0, 430, 0, H);
    g.addColorStop(0, 'rgba(214,202,182,0)');
    g.addColorStop(0.45, 'rgba(201,198,207,0.55)');
    g.addColorStop(1, 'rgba(159,163,184,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(BX0, 430, BW, H - 430 + 200);
    const f = lcg(31);
    ctx.fillStyle = WALL.fog;
    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = 0.35 + f() * 0.3;
      ctx.beginPath();
      ctx.ellipse(f() * W, 640 + f() * 120, 120 + f() * 220, 14 + f() * 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 纸边外是书桌：深色 + 木纹
    ctx.save();
    const page = new Path2D();
    page.moveTo(pts[0]![0], pts[0]![1]);
    for (const p of pts) page.lineTo(p[0], p[1]);
    page.closePath();
    const outside = new Path2D();
    outside.rect(BX0, BY0, BW, BH);
    outside.addPath(page);
    ctx.fillStyle = WALL.desk;
    ctx.fill(outside, 'evenodd');
    ctx.clip(outside, 'evenodd');
    ctx.strokeStyle = WALL.deskLine;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let y = H + 30; y < BY0 + BH; y += 22) {
      ctx.moveTo(BX0, y);
      for (let x = BX0; x < BX0 + BW; x += 600) ctx.quadraticCurveTo(x + 300, y + (f() - 0.5) * 14, x + 600, y);
    }
    for (let x = -40; x > BX0; x -= 22) {
      ctx.moveTo(x, BY0);
      ctx.lineTo(x, BY0 + BH);
      ctx.moveTo(W - x, BY0);
      ctx.lineTo(W - x, BY0 + BH);
    }
    ctx.stroke();
    ctx.restore();
    return c;
  }

  /** 放进镜头那一层（world，按世界坐标摆）：镜头动时由合成器去挪、去缩放 */
  mount(layer: HTMLElement): void {
    const st = this.canvas.style;
    st.position = 'absolute';
    st.left = `${BX0}px`;
    st.top = `${BY0}px`;
    st.width = `${BW}px`;
    st.height = `${BH}px`;
    layer.prepend(this.canvas);
  }

  /** 纸边：一道亮的毛边 + 墨线 + 纸往桌上投一点影；lw 是屏幕上 1 像素对应的世界单位 */
  drawEdge(ctx: CanvasRenderingContext2D, lw: number): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.translate(3 * lw, 4 * lw);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 8 * lw;
    ctx.stroke(this.edge);
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fbf5e6';
    ctx.lineWidth = 6 * lw;
    ctx.stroke(this.edge);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 * lw;
    ctx.stroke(this.edge);
  }
}
