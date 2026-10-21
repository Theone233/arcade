/**
 * 地形画法（DESIGN.md 第 4 节"地形分块烘焙"）：世界切成 256×256 的块，每块烘焙成一张离屏画布；被炸时只重画相交的块。
 * 网格是方格，直接画会是锯齿：用 marching squares 把格子中心连成轮廓（斜边走对角线），整块一条路径填色、描边，块和块之间不留缝。
 * 每块的画布往外多画 1 个单位，贴的时候互相压住，缩放时也不露细缝。
 * 块是 DOM 里的画布，放在镜头那一层（scene.ts 的 world）里按世界坐标摆好；镜头平移缩放只改那一层的 CSS transform，
 * 由合成器去挪、去缩放，每帧不用再把它们贴一遍（手机降速 4 倍时，每帧贴一整屏位图要 50–60 毫秒，见 README"性能"）。
 * 每块怎么画在 terrainPaint.ts（美术交付）：按格子的材质码分材质填色、画纹理、焦边、地表皮、材质间细线和外轮廓墨线。
 */
import { CELL, MAT_MASK, cellAt, type CellBox, type Terrain } from '../core/terrain.ts';
import { MATERIALS } from './mapArt.ts';
import { paintTerrainRect } from './terrainPaint.ts';

export const CHUNK = 256;
const PAD = 1;

interface Chunk {
  cx: number;
  cy: number;
  canvas: HTMLCanvasElement | null;
  dirty: boolean;
  empty: boolean;
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

    // 多材质的画法（美术的 terrainPaint.ts）：各材质填色和纹理 → 焦边 → 地表皮 → 材质间细线 → 外轮廓墨线
    paintTerrainRect(ctx, this.terrain, x0, y0, size, size, MATERIALS);
  }
}
