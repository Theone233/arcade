/**
 * 地形画法（DESIGN.md 第 4 节"地形分块烘焙"）：世界切成 256×256 的块，每块烘焙成一张离屏画布；被炸时只重画相交的块。
 * 网格是方格，直接画会是锯齿：用 marching squares 把格子中心连成轮廓（斜边走对角线），整块一条路径填色、描边，块和块之间不留缝。
 * 每块的画布往外多画 1 个单位，贴的时候互相压住，缩放时也不露细缝。
 * 块是 DOM 里的画布，放在镜头那一层（scene.ts 的 world）里按世界坐标摆好；镜头平移缩放只改那一层的 CSS transform，
 * 由合成器去挪、去缩放，每帧不用再把它们贴一遍（手机降速 4 倍时，每帧贴一整屏位图要 50–60 毫秒，见 README"性能"）。
 * 层次：面团渐变（越往下越深）→ 气孔和发面的层纹 → 炸焦的坑边（材质格的焦标记）→ 朝上的地表一道烤黄的皮 → 深褐墨线。
 */
import { CELL, MAT_MASK, SCORCH, cellAt, type CellBox, type Terrain } from '../core/terrain.ts';
import { DOUGH, INK } from './palette.ts';

export const CHUNK = 256;
const PAD = 1;

interface Chunk {
  cx: number;
  cy: number;
  canvas: HTMLCanvasElement | null;
  dirty: boolean;
  empty: boolean;
}

/** 世界坐标的随机数（只给装饰用，同一处每次画得一样） */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class TerrainArt {
  readonly cols: number;
  readonly rows: number;
  private chunks: Chunk[] = [];
  private nx: number;
  private ny: number;

  private terrain: Terrain;
  private scale: number;
  private layer: HTMLElement;

  constructor(terrain: Terrain, scale: number, layer: HTMLElement) {
    this.terrain = terrain;
    this.scale = scale;
    this.layer = layer;
    this.cols = terrain.cols;
    this.rows = terrain.rows;
    this.nx = Math.ceil((terrain.cols * CELL) / CHUNK);
    this.ny = Math.ceil((terrain.rows * CELL) / CHUNK);
    for (let cy = 0; cy < this.ny; cy++) for (let cx = 0; cx < this.nx; cx++) this.chunks.push({ cx, cy, canvas: null, dirty: true, empty: false });
  }

  /** 换一份地形（开新局、读档）：全部重画 */
  setTerrain(t: Terrain): void {
    this.terrain = t;
    for (const c of this.chunks) c.dirty = true;
  }

  get grid(): Terrain {
    return this.terrain;
  }

  /** 这些格子改过了：和它相交的块（含描边外扩的一圈）标脏 */
  touch(box: CellBox): void {
    const m = 3 * CELL;
    const x0 = box.c0 * CELL - m;
    const x1 = (box.c1 + 1) * CELL + m;
    const y0 = box.r0 * CELL - m;
    const y1 = (box.r1 + 1) * CELL + m;
    for (const c of this.chunks) {
      const bx = c.cx * CHUNK;
      const by = c.cy * CHUNK;
      if (bx < x1 && bx + CHUNK > x0 && by < y1 && by + CHUNK > y0) c.dirty = true;
    }
  }

  /** 把脏了的块重画一遍（开局全部，之后只有炸过的）；回重画了几块 */
  flush(): number {
    let baked = 0;
    for (const c of this.chunks) {
      if (!c.dirty) continue;
      this.bake(c);
      baked++;
    }
    return baked;
  }

  /** 拆掉所有块的画布 */
  destroy(): void {
    for (const c of this.chunks) c.canvas?.remove();
  }

  private solid(c: number, r: number): number {
    return cellAt(this.terrain, c, r) & MAT_MASK ? 1 : 0;
  }

  private bake(ch: Chunk): void {
    ch.dirty = false;
    const x0 = ch.cx * CHUNK - PAD;
    const y0 = ch.cy * CHUNK - PAD;
    const size = CHUNK + 2 * PAD;
    // 这一块要看的方格（含外扩：描边和表皮会伸到块外）
    const c0 = Math.floor(x0 / CELL) - 4;
    const c1 = Math.ceil((x0 + size) / CELL) + 3;
    const r0 = Math.floor(y0 / CELL) - 4;
    const r1 = Math.ceil((y0 + size) / CELL) + 3;
    let any = false;
    for (let r = r0; r <= r1 && !any; r++) for (let c = c0; c <= c1; c++) if (this.solid(c, r)) { any = true; break; }
    ch.empty = !any;
    if (!any) {
      ch.canvas?.remove();
      ch.canvas = null;
      return;
    }
    const px = Math.ceil(size * this.scale);
    if (!ch.canvas) {
      ch.canvas = document.createElement('canvas');
      ch.canvas.width = px;
      ch.canvas.height = px;
      const st = ch.canvas.style;
      st.position = 'absolute';
      st.left = `${x0}px`;
      st.top = `${y0}px`;
      st.width = `${size}px`;
      st.height = `${size}px`;
      this.layer.appendChild(ch.canvas);
    }
    const ctx = ch.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.setTransform(this.scale, 0, 0, this.scale, -x0 * this.scale, -y0 * this.scale);

    const fill = new Path2D();
    const edge = new Path2D();
    const crust = new Path2D();
    const H = CELL / 2;
    for (let r = r0; r < r1; r++) {
      let run = -1;
      for (let c = c0; c <= c1; c++) {
        const tl = c < c1 ? this.solid(c, r) : 0;
        const tr = c < c1 ? this.solid(c + 1, r) : 0;
        const br = c < c1 ? this.solid(c + 1, r + 1) : 0;
        const bl = c < c1 ? this.solid(c, r + 1) : 0;
        const k = tl * 8 + tr * 4 + br * 2 + bl;
        // 整格连成一条横的长方形，路径短一些
        if (k === 15) {
          if (run < 0) run = c;
          continue;
        }
        if (run >= 0) {
          fill.rect(run * CELL + H, r * CELL + H, (c - run) * CELL, CELL);
          run = -1;
        }
        if (k === 0 || c >= c1) continue;
        const x = c * CELL + H;
        const y = r * CELL + H;
        const T: [number, number] = [x + H, y];
        const R: [number, number] = [x + CELL, y + H];
        const B: [number, number] = [x + H, y + CELL];
        const L: [number, number] = [x, y + H];
        const TL: [number, number] = [x, y];
        const TR: [number, number] = [x + CELL, y];
        const BR: [number, number] = [x + CELL, y + CELL];
        const BL: [number, number] = [x, y + CELL];
        const polys: [number, number][][] = [];
        const segs: [[number, number], [number, number]][] = [];
        switch (k) {
          case 1: polys.push([L, B, BL]); segs.push([L, B]); break;
          case 2: polys.push([B, R, BR]); segs.push([B, R]); break;
          case 3: polys.push([L, R, BR, BL]); segs.push([L, R]); break;
          case 4: polys.push([T, TR, R]); segs.push([T, R]); break;
          case 5: polys.push([L, B, BL], [T, TR, R]); segs.push([L, B], [T, R]); break;
          case 6: polys.push([T, TR, BR, B]); segs.push([T, B]); break;
          case 7: polys.push([L, T, TR, BR, BL]); segs.push([L, T]); break;
          case 8: polys.push([TL, T, L]); segs.push([T, L]); break;
          case 9: polys.push([TL, T, B, BL]); segs.push([T, B]); break;
          case 10: polys.push([TL, T, L], [B, R, BR]); segs.push([T, L], [B, R]); break;
          case 11: polys.push([TL, T, R, BR, BL]); segs.push([T, R]); break;
          case 12: polys.push([TL, TR, R, L]); segs.push([L, R]); break;
          case 13: polys.push([TL, TR, R, B, BL]); segs.push([R, B]); break;
          case 14: polys.push([TL, TR, BR, B, L]); segs.push([B, L]); break;
        }
        for (const p of polys) {
          fill.moveTo(p[0]![0], p[0]![1]);
          for (let i = 1; i < p.length; i++) fill.lineTo(p[i]![0], p[i]![1]);
          fill.closePath();
        }
        for (const [a, b] of segs) {
          edge.moveTo(a[0], a[1]);
          edge.lineTo(b[0], b[1]);
          // 上面是空、下面是地的一段是"地表"：画烤黄的表皮
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          const up = this.solid(Math.floor(mx / CELL), Math.floor((my - 3) / CELL));
          const down = this.solid(Math.floor(mx / CELL), Math.floor((my + 3) / CELL));
          if (!up && down) {
            crust.moveTo(a[0], a[1]);
            crust.lineTo(b[0], b[1]);
          }
        }
      }
    }

    ctx.save();
    ctx.clip(fill);
    const g = ctx.createLinearGradient(0, 180, 0, 700);
    g.addColorStop(0, DOUGH.grad[0]);
    g.addColorStop(0.55, DOUGH.grad[1]);
    g.addColorStop(0.84, DOUGH.grad[2]);
    g.addColorStop(1, DOUGH.grad[3]);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, size, size);
    this.texture(ctx, x0, y0, size);
    // 炸焦的坑边
    ctx.fillStyle = DOUGH.rim;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (cellAt(this.terrain, c, r) & SCORCH) {
          ctx.moveTo(c * CELL + H + 3.4, r * CELL + H);
          ctx.arc(c * CELL + H, r * CELL + H, 3.4, 0, Math.PI * 2);
        }
      }
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = DOUGH.crust;
    ctx.lineWidth = 12;
    ctx.stroke(crust);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(edge);
  }

  /** 气孔和发面的层纹：按世界坐标取随机，块和块接得上 */
  private texture(ctx: CanvasRenderingContext2D, x0: number, y0: number, size: number): void {
    const T = 40;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    for (let ty = Math.floor(y0 / T) - 1; ty <= Math.floor((y0 + size) / T) + 1; ty++) {
      for (let tx = Math.floor(x0 / T) - 1; tx <= Math.floor((x0 + size) / T) + 1; tx++) {
        const h = hash(tx, ty);
        if (h > 0.62) continue;
        const x = tx * T + hash(tx + 7, ty) * T;
        const y = ty * T + hash(tx, ty + 7) * T;
        const rx = 2 + hash(tx + 3, ty + 5) * 4;
        ctx.moveTo(x + rx, y);
        ctx.ellipse(x, y, rx, rx * 0.6, 0, 0, Math.PI * 2);
      }
    }
    ctx.stroke();
    // 层纹：越往下越密、越深
    const P = 240;
    for (let k = 0; k < 6; k++) {
      const y = 420 + k * 42 + k * k * 2;
      if (y < y0 - 10 || y > y0 + size + 10) continue;
      ctx.globalAlpha = 0.08 + k * 0.025;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let x = Math.floor(x0 / P) * P;
      ctx.moveTo(x, y);
      for (; x < x0 + size; x += 120) {
        ctx.quadraticCurveTo(x + 60, y + (Math.round(x / 120) % 2 ? 8 : -8), x + 120, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
