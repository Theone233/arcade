/**
 * 地图缩略图（准备房间的地图卡片、地图条、首页"接着上一局"）：照美术的 paintThumb（v2/pages/common.mjs）——
 * 远景按小比例画，地形一格一个像素（表面用地表皮色、里面用材质色、边上描深褐）再缩到卡片大小，出生点画成小白点。
 * 每张图按尺寸画一次，存起来，用的时候复制一份。
 */
import { buildTerrain, MAPS, type MapDef, type MapId } from '../core/maps.ts';
import { surfaceY } from '../core/rules.ts';
import { MAT_MASK, type Terrain } from '../core/terrain.ts';
import { paintBackdrop } from './backdrops.ts';
import { MAP_ART, MATERIALS, type Material } from './mapArt.ts';
import { INK } from './palette.ts';
import { renderRatio } from './viewport.ts';

const terrains = new Map<MapId, Terrain>();
const cache = new Map<string, HTMLCanvasElement>();

function terrainOf(m: MapDef): Terrain {
  let t = terrains.get(m.id);
  if (!t) terrains.set(m.id, (t = buildTerrain(m)));
  return t;
}

const rgb = (hx: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16)) as [number, number, number];

function paint(c: HTMLCanvasElement, m: MapDef, pins: boolean): void {
  const ctx = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  const k = w / m.width;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(0, (h / k - m.height) / 2);
  paintBackdrop(ctx, MAP_ART[m.id].theme, m.width, m.height, { x0: 0, y0: -200, w: m.width, h: m.height + 400 });
  ctx.restore();
  const t = terrainOf(m);
  const g = document.createElement('canvas');
  g.width = t.cols;
  g.height = t.rows;
  const gx = g.getContext('2d')!;
  const img = gx.createImageData(t.cols, t.rows);
  const byCode = new Map<number, Material>();
  for (const mm of Object.values(MATERIALS)) byCode.set(mm.code, mm);
  const at = (r: number, col: number): number => (r < 0 || col < 0 || r >= t.rows || col >= t.cols ? 0 : t.cells[r * t.cols + col]! & MAT_MASK);
  for (let r = 0; r < t.rows; r++) {
    for (let col = 0; col < t.cols; col++) {
      const v = at(r, col);
      if (!v) continue;
      const mm = byCode.get(v) ?? MATERIALS.dough;
      const edge = !at(r - 1, col) || !at(r + 1, col) || !at(r, col - 1) || !at(r, col + 1);
      const top = !at(r - 1, col) || !at(r - 2, col);
      const [R, G, B] = edge ? [70, 41, 26] : rgb(top ? (mm.crust ?? mm.grad[0]) : mm.grad[1]);
      const i = (r * t.cols + col) * 4;
      img.data[i] = R;
      img.data[i + 1] = G;
      img.data[i + 2] = B;
      img.data[i + 3] = 255;
    }
  }
  gx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const sy = (h - m.height * k) / 2;
  ctx.drawImage(g, 0, sy, t.cols * 4 * k, t.rows * 4 * k);
  if (pins) {
    for (const { x } of m.spawns) {
      const y = surfaceY(t, m.height, x);
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x * k, sy + (y - 6) * k, Math.max(1.6, 2.2 * (w / 200)), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** 一张缩略图（CSS 像素 w×h）；pins 画出生点 */
export function mapThumb(id: MapId, w: number, h: number, pins = true): HTMLCanvasElement {
  const dpr = renderRatio();
  const key = `${id}:${w}x${h}:${dpr}:${pins ? 1 : 0}`;
  let src = cache.get(key);
  if (!src) {
    src = document.createElement('canvas');
    src.width = Math.round(w * dpr);
    src.height = Math.round(h * dpr);
    paint(src, MAPS[id], pins);
    cache.set(key, src);
  }
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.className = 'dl-thumb';
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}
