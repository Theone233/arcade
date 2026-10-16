/**
 * 写实的赛道和车（DESIGN.md 第 8 节、ASSETS.md）：只给画面层用。
 * - 地面、沥青、砂石、水面、混凝土是 public/art/ 里的平铺纹理（scripts/art.ts 生成），用 SVG pattern 铺；
 * - 赛道：白色边线、沥青路面、颜色略深的行车线；红白路肩只铺在弯里（内侧弯心和外侧出弯）；弯外侧是砂石缓冲区，再外面一圈轮胎墙；
 *   起终点是黑白格线，发车格画白色的发车框；主直道外侧有看台；
 * - 场景：湖（沙岸 + 水面）、山城（楼顶、空调机、停车场）、海港（码头、集装箱、船），加树；摆放按赛道 id 的哈希算，每次一样，避开赛道；
 * - 车：俯视的方程式赛车，车身按座位配色，带高光、座舱、头盔、前后翼、轮胎，车下有影子。
 * 阴影都是半透明的偏移形状，不用模糊滤镜：镜头跟车时整张图会重画，手机上滤镜太贵。
 */
import type { Geometry, Pt } from '../track/shape.ts';
import type { Track } from '../track/types.ts';
import { CAR_COLORS } from './text.ts';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

const line = (pts: readonly Pt[]): string => `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}`;

/** 按种子算 0–1 的数（画面摆放用，每次一样） */
function rand(seed: number): () => number {
  let h = seed >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 0x1_0000_0000;
  };
}

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * 赛道上的样式写在 SVG 自己的 <style> 里，不放页面的 CSS：烘焙位图时（board.ts 的 bake）SVG 当成独立图片画，拿不到页面的 CSS
 */
const TRACK_CSS = `.track .cell-line {
  stroke: #fff;
  stroke-opacity: 0.13;
  stroke-width: 1;
}
.track .kerb,
.track .kerb-red {
  fill: none;
  stroke-width: 6;
  stroke-linejoin: round;
}
.track .kerb {
  stroke: #f2f2f2;
}
.track .kerb-red {
  stroke: #d0312d;
  stroke-dasharray: 7 7;
}
.track .grid-box {
  fill: none;
  stroke: #f2f2f2;
  stroke-width: 1.6;
  opacity: 0.9;
}
.track .corner-line {
  stroke: #ff4d42;
  stroke-width: 3;
  stroke-dasharray: 5 3;
}
.tyres,
.tyres-hi {
  fill: none;
  stroke-linecap: round;
}
.tyres {
  stroke: #1a1a1a;
  stroke-width: 6;
  stroke-dasharray: 0 6;
}
.tyres-hi {
  stroke: #5a5a5a;
  stroke-width: 2;
  stroke-dasharray: 0 6;
}
.limit-sign {
  fill: #fff;
  stroke: #d0312d;
  stroke-width: 4;
}
.limit-text {
  font-size: 17px;
  font-weight: 800;
  text-anchor: middle;
  fill: #1b1b1b;
}`;

/** 纹理 pattern、车身渐变、赛道的样式 */
export function drawDefs(svg: SVGSVGElement): void {
  const d = svgEl('defs', {}, svg);
  svgEl('style', {}, d).textContent = TRACK_CSS;
  const tile = (id: string, file: string, size: number): void => {
    const p = svgEl('pattern', { id, patternUnits: 'userSpaceOnUse', width: size, height: size }, d);
    svgEl('image', { href: `art/${file}.webp`, width: size, height: size, preserveAspectRatio: 'none' }, p);
  };
  tile('rc-grass', 'grass', 320);
  tile('rc-asphalt', 'asphalt', 96);
  tile('rc-gravel', 'gravel', 80);
  tile('rc-water', 'water', 260);
  tile('rc-concrete', 'concrete', 120);
  CAR_COLORS.forEach((c, i) => {
    const g = svgEl('linearGradient', { id: `rc-body${i}`, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    svgEl('stop', { offset: 0, 'stop-color': c.dark }, g);
    svgEl('stop', { offset: 0.3, 'stop-color': c.body }, g);
    svgEl('stop', { offset: 0.5, 'stop-color': '#ffffff', 'stop-opacity': 0.55 }, g);
    svgEl('stop', { offset: 0.56, 'stop-color': c.body }, g);
    svgEl('stop', { offset: 1, 'stop-color': c.dark }, g);
  });
  const tree = svgEl('radialGradient', { id: 'rc-tree', cx: 0.38, cy: 0.35, r: 0.7 }, d);
  svgEl('stop', { offset: 0, 'stop-color': '#6fae4f' }, tree);
  svgEl('stop', { offset: 0.55, 'stop-color': '#2f6b2a' }, tree);
  svgEl('stop', { offset: 1, 'stop-color': '#173d17' }, tree);
  const shade = svgEl('radialGradient', { id: 'rc-shade' }, d);
  svgEl('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.45 }, shade);
  svgEl('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 }, shade);
  const roof = svgEl('linearGradient', { id: 'rc-roof', x1: 0, y1: 0, x2: 1, y2: 1 }, d);
  svgEl('stop', { offset: 0, 'stop-color': '#b9bec2' }, roof);
  svgEl('stop', { offset: 1, 'stop-color': '#7d8388' }, roof);
}

/** 一个弯铺路肩、砂石区的范围：从弯道线前一格起，到连着转弯的最后一格 */
function bendRange(track: Track, geo: Geometry, at: number): { from: number; to: number; side: number } {
  const N = track.spaces;
  let turn = 0;
  let end = at;
  for (let k = 0; k < 12; k++) {
    const t = geo.turn[(at + k) % N]!;
    if (k > 1 && Math.abs(t) < 0.04) break;
    turn += t;
    end = at + k;
  }
  // 往右转（turn > 0，屏幕坐标里顺时针）时外侧在左边（offset 为正）
  return { from: at - 1, to: end + 1, side: turn > 0 ? 1 : -1 };
}

/** 画地面、场景、赛道。返回赛道的采样点（场景摆放时避开赛道用） */
export function drawWorld(world: SVGGElement, track: Track, geo: Geometry): void {
  const W = geo.width;
  const N = track.spaces;
  const ground = svgEl('g', { class: 'ground' }, world);
  // 海港是混凝土码头，别的是草地
  svgEl('rect', { x: -600, y: -600, width: 2200, height: 1820, fill: geo.scene === 'harbor' ? 'url(#rc-concrete)' : 'url(#rc-grass)' }, ground);
  const samples = geo.strip(0, N, 0, 12);
  const clear = (x: number, y: number, r: number): boolean => samples.every((p) => Math.hypot(p.x - x, p.y - y) > W / 2 + 34 + r);
  const cx = geo.cells.reduce((a, c) => a + c.c.x, 0) / N;
  const cy = geo.cells.reduce((a, c) => a + c.c.y, 0) / N;
  const r = rand(hashOf(track.id));
  const below = svgEl('g', {}, world);
  const tr = svgEl('g', { class: 'track' }, world);
  const props = svgEl('g', { class: 'props' }, world);
  const shadows = svgEl('g', { class: 'shadows' }, props);
  const objects = svgEl('g', {}, props);

  // ---------- 场景的底 ----------
  /** 不能放东西的地方（水面） */
  const blocked: ((x: number, y: number) => boolean)[] = [];
  if (geo.scene === 'lake') {
    const lx = cx - 30;
    const ly = cy + 40;
    svgEl('ellipse', { cx: lx, cy: ly, rx: 222, ry: 132, fill: '#d6c48f' }, below);
    svgEl('ellipse', { cx: lx, cy: ly, rx: 212, ry: 122, fill: '#8db07a', opacity: 0.6 }, below);
    svgEl('ellipse', { cx: lx, cy: ly, rx: 204, ry: 114, fill: 'url(#rc-water)' }, below);
    svgEl('ellipse', { cx: lx, cy: ly, rx: 204, ry: 114, fill: 'none', stroke: '#1d4f73', 'stroke-opacity': 0.35, 'stroke-width': 10 }, below);
    // 小码头和两条小船
    svgEl('rect', { x: lx + 120, y: ly - 20, width: 46, height: 8, fill: '#8a6a45', stroke: '#5c4429' }, below);
    boat(below, lx + 40, ly + 30, 0.3, '#f4f4f4');
    boat(below, lx - 110, ly - 20, -0.6, '#e8c34a');
    blocked.push((x, y) => ((x - lx) / 240) ** 2 + ((y - ly) / 150) ** 2 < 1);
  } else if (geo.scene === 'harbor') {
    svgEl('path', { d: 'M-600 -600H1600V18C1250 -6 950 34 620 14S120 26 -600 6Z', fill: 'url(#rc-water)' }, below);
    svgEl('path', { d: 'M-600 6C120 26 300 22 620 14S1250 -6 1600 18', fill: 'none', stroke: '#8f9599', 'stroke-width': 10 }, below);
    for (let i = 0; i < 4; i++) {
      const x = 180 + i * 190;
      svgEl('rect', { x, y: -46, width: 16, height: 56, fill: '#7a5b3a', stroke: '#4a3520' }, below);
    }
    boat(below, 300, -30, 0, '#f4f4f4', 1.6);
    boat(below, 720, -34, 0.1, '#c94a3f', 1.9);
    blocked.push((_x, y) => y < 40);
  } else {
    // 山城：几块停车场和广场
    for (let k = 0; k < 6; k++) {
      const x = cx - 420 + r() * 840;
      const y = cy - 300 + r() * 560;
      const w = 80 + r() * 90;
      const h = 50 + r() * 60;
      if (!clear(x + w / 2, y + h / 2, Math.max(w, h) / 2)) continue;
      svgEl('rect', { x, y, width: w, height: h, rx: 4, fill: 'url(#rc-concrete)', stroke: '#6c7174' }, below);
      for (let j = 1; j < 4; j++) svgEl('line', { x1: x + (w * j) / 4, y1: y + 4, x2: x + (w * j) / 4, y2: y + h / 3, stroke: '#f2f2f2', 'stroke-width': 1.5, opacity: 0.8 }, below);
    }
  }
  const free = (x: number, y: number, rad: number): boolean => clear(x, y, rad) && !blocked.some((b) => b(x, y));

  // ---------- 弯外的砂石区和轮胎墙 ----------
  for (const c of track.corners) {
    const b = bendRange(track, geo, c.at);
    const inner = geo.strip(b.from, b.to + 1, b.side * (W / 2 + 4));
    const outer = geo.strip(b.from, b.to + 1, b.side * (W / 2 + 30)).reverse();
    svgEl('path', { d: `${line(inner)}L${line(outer).slice(1)}Z`, fill: 'url(#rc-gravel)', stroke: '#9c8a62', 'stroke-width': 1 }, below);
    const wall = geo.strip(b.from, b.to + 1, b.side * (W / 2 + 34));
    svgEl('path', { d: line(wall), class: 'tyres' }, below);
    svgEl('path', { d: line(wall), class: 'tyres-hi' }, below);
  }

  // ---------- 路面 ----------
  svgEl('path', { d: geo.path, fill: 'none', stroke: '#e9ecef', 'stroke-width': W + 5, 'stroke-linejoin': 'round' }, tr);
  svgEl('path', { d: geo.path, fill: 'none', stroke: 'url(#rc-asphalt)', 'stroke-width': W - 1, 'stroke-linejoin': 'round' }, tr);
  // 行车线：轮胎胶痕把中间磨得深一点
  svgEl('path', { d: geo.path, fill: 'none', stroke: '#000', 'stroke-opacity': 0.13, 'stroke-width': W * 0.38, 'stroke-linejoin': 'round' }, tr);
  // 弯里的红白路肩：内外两侧
  for (const c of track.corners) {
    const b = bendRange(track, geo, c.at);
    for (const side of [1, -1]) {
      const p = line(geo.strip(b.from, b.to, side * (W / 2 + 1.5), 3));
      svgEl('path', { d: p, class: 'kerb' }, tr);
      svgEl('path', { d: p, class: 'kerb-red' }, tr);
    }
  }
  // 格线（数格子用，淡淡的）
  geo.edges.forEach((e, i) => {
    if (i === 0) return;
    const nx = Math.sin(e.angle) * (W / 2 - 2);
    const ny = -Math.cos(e.angle) * (W / 2 - 2);
    svgEl('line', { x1: e.c.x + nx, y1: e.c.y + ny, x2: e.c.x - nx, y2: e.c.y - ny, class: 'cell-line' }, tr);
  });
  // 发车框：线后三格、内外两个车位
  for (let k = 1; k <= 3; k++) {
    const cell = geo.cells[N - k]!;
    for (const spot of cell.spots) {
      const a = (cell.angle * 180) / Math.PI;
      svgEl('path', { d: 'M6 -7H10V7H6', transform: `translate(${spot.x} ${spot.y}) rotate(${a})`, class: 'grid-box' }, tr);
    }
  }
  // 起终点：两排黑白格
  const e0 = geo.edges[0]!;
  const sq = W / 7;
  const g0 = svgEl('g', { transform: `translate(${e0.c.x} ${e0.c.y}) rotate(${(e0.angle * 180) / Math.PI})` }, tr);
  for (let row = 0; row < 2; row++)
    for (let k = 0; k < 7; k++) svgEl('rect', { x: (row - 1) * sq, y: -W / 2 + k * sq, width: sq, height: sq, fill: (k + row) % 2 ? '#111' : '#f5f5f5' }, g0);
  // 弯道线和限速牌（牌子立在弯外侧，带影子）
  for (const c of track.corners) {
    const e = geo.edges[c.at]!;
    const nx = Math.sin(e.angle);
    const ny = -Math.cos(e.angle);
    const half = W / 2;
    svgEl('line', { x1: e.c.x + nx * half, y1: e.c.y + ny * half, x2: e.c.x - nx * half, y2: e.c.y - ny * half, class: 'corner-line' }, tr);
    const side = bendRange(track, geo, c.at).side;
    const sx = e.c.x + nx * side * (half + 46);
    const sy = e.c.y + ny * side * (half + 46);
    svgEl('ellipse', { cx: sx + 4, cy: sy + 5, rx: 15, ry: 13, fill: '#000', opacity: 0.3 }, objects);
    svgEl('circle', { cx: sx, cy: sy, r: 15, class: 'limit-sign' }, objects);
    const tx = svgEl('text', { x: sx, y: sy + 6, class: 'limit-text' }, objects);
    tx.textContent = String(c.limit);
  }

  // ---------- 看台：主直道外侧 ----------
  {
    const c0 = geo.cells[2]!;
    const nx = Math.sin(c0.angle);
    const ny = -Math.cos(c0.angle);
    // 朝向场地中心的一侧是内场，看台放另一侧
    const inside = (cx - c0.c.x) * nx + (cy - c0.c.y) * ny > 0 ? 1 : -1;
    const off = -inside * (W / 2 + 40);
    const base = geo.strip(N - 5, 6, off, 6);
    const roofLine = geo.strip(N - 5, 6, off - inside * 16, 6);
    svgEl('path', { d: line(base), fill: 'none', stroke: '#000', 'stroke-opacity': 0.3, 'stroke-width': 30, transform: 'translate(4 5)' }, shadows);
    svgEl('path', { d: line(base), fill: 'none', stroke: '#6d7378', 'stroke-width': 28 }, objects);
    for (const [color, dash, o] of [
      ['#e5484d', '2 5', 0],
      ['#f5c400', '2 7', 2],
      ['#3e7bfa', '2 6', 4],
      ['#f4f4f4', '2 9', 1],
    ] as const) {
      svgEl('path', { d: line(geo.strip(N - 5, 6, off + inside * 4, 6)), fill: 'none', stroke: color, 'stroke-width': 14, 'stroke-dasharray': dash, 'stroke-dashoffset': o }, objects);
    }
    svgEl('path', { d: line(roofLine), fill: 'none', stroke: '#d6dade', 'stroke-width': 9 }, objects);
    svgEl('path', { d: line(roofLine), fill: 'none', stroke: '#9aa1a7', 'stroke-width': 9, 'stroke-dasharray': '1 11' }, objects);
  }

  // ---------- 树、楼、集装箱 ----------
  const spots: { x: number; y: number }[] = [];
  for (let y = -260; y < 900; y += 46)
    for (let x = -300; x < 1300; x += 46) {
      const px = x + (r() - 0.5) * 30;
      const py = y + (r() - 0.5) * 30;
      if (free(px, py, 18)) spots.push({ x: px, y: py });
    }
  for (const s of spots) {
    const k = r();
    if (geo.scene === 'city' && k < 0.3 && free(s.x, s.y, 40)) building(shadows, objects, s.x, s.y, r);
    else if (geo.scene === 'harbor' && k < 0.3 && free(s.x, s.y, 34)) containers(shadows, objects, s.x, s.y, r);
    else if (k < (geo.scene === 'lake' ? 0.5 : 0.28)) tree(shadows, objects, s.x, s.y, 12 + r() * 10, r);
  }
}

function tree(shadows: SVGGElement, g: SVGGElement, x: number, y: number, size: number, r: () => number): void {
  svgEl('ellipse', { cx: x + size * 0.45, cy: y + size * 0.55, rx: size * 1.15, ry: size, fill: 'url(#rc-shade)' }, shadows);
  const lobes = 3 + Math.floor(r() * 3);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r();
    svgEl('circle', { cx: x + Math.cos(a) * size * 0.45, cy: y + Math.sin(a) * size * 0.45, r: size * (0.55 + r() * 0.2), fill: 'url(#rc-tree)' }, g);
  }
  svgEl('circle', { cx: x - size * 0.15, cy: y - size * 0.15, r: size * 0.45, fill: 'url(#rc-tree)' }, g);
}

function building(shadows: SVGGElement, g: SVGGElement, x: number, y: number, r: () => number): void {
  const w = 40 + r() * 34;
  const h = 30 + r() * 28;
  const tall = 6 + r() * 12;
  // 楼顶：灰色平顶、陶瓦红、深灰、米色几种
  const roofs = ['url(#rc-roof)', '#a8564a', '#4f5b66', '#c9b48a', 'url(#rc-roof)'];
  const roof = roofs[Math.floor(r() * roofs.length)]!;
  svgEl('rect', { x: x - w / 2 + tall, y: y - h / 2 + tall, width: w, height: h, fill: '#000', opacity: 0.32 }, shadows);
  svgEl('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 2, fill: roof, stroke: '#3d4246', 'stroke-width': 1.5 }, g);
  // 斜屋顶的屋脊、平顶的女儿墙
  if (roof === '#a8564a') svgEl('path', { d: `M${x - w / 2} ${y}H${x + w / 2}`, stroke: '#6e3028', 'stroke-width': 2 }, g);
  svgEl('rect', { x: x - w / 2 + 3, y: y - h / 2 + 3, width: w - 6, height: h - 6, rx: 1, fill: 'none', stroke: '#e6e9ec', 'stroke-opacity': 0.5 }, g);
  // 楼顶的空调外机、水箱
  for (let i = 0; i < 2; i++) svgEl('rect', { x: x - w / 2 + 8 + i * 12, y: y - h / 2 + 8, width: 8, height: 6, fill: '#e4e7ea', stroke: '#7d8388' }, g);
  svgEl('circle', { cx: x + w / 2 - 10, cy: y + h / 2 - 10, r: 5, fill: '#c9ced2', stroke: '#6d7378' }, g);
}

function containers(shadows: SVGGElement, g: SVGGElement, x: number, y: number, r: () => number): void {
  const colors = ['#c7473d', '#3d7cc7', '#d9a53a', '#3f9a5b', '#7a5aa8'];
  const rows = 2 + Math.floor(r() * 2);
  for (let i = 0; i < rows; i++) {
    const cy = y - rows * 7 + i * 14;
    svgEl('rect', { x: x - 26 + 4, y: cy + 4, width: 52, height: 12, fill: '#000', opacity: 0.3 }, shadows);
    const c = colors[Math.floor(r() * colors.length)]!;
    svgEl('rect', { x: x - 26, y: cy, width: 52, height: 12, fill: c, stroke: '#000', 'stroke-opacity': 0.35 }, g);
    svgEl('path', { d: `M${x - 24} ${cy + 1}v10M${x - 18} ${cy + 1}v10M${x - 12} ${cy + 1}v10M${x - 6} ${cy + 1}v10M${x} ${cy + 1}v10M${x + 6} ${cy + 1}v10M${x + 12} ${cy + 1}v10M${x + 18} ${cy + 1}v10`, stroke: '#000', 'stroke-opacity': 0.2 }, g);
  }
}

function boat(g: SVGGElement, x: number, y: number, rot: number, color: string, scale = 1): void {
  const b = svgEl('g', { transform: `translate(${x} ${y}) rotate(${(rot * 180) / Math.PI}) scale(${scale})` }, g);
  svgEl('path', { d: 'M-22 0Q-20 -8 -10 -8H14Q24 -6 28 0Q24 6 14 8H-10Q-20 8 -22 0Z', fill: color, stroke: '#2b3a44', 'stroke-width': 1.2 }, b);
  svgEl('rect', { x: -6, y: -5, width: 12, height: 10, rx: 2, fill: '#d9e3ea', stroke: '#2b3a44', 'stroke-width': 0.8 }, b);
  svgEl('path', { d: 'M-34 0H-24', stroke: '#ffffff', 'stroke-opacity': 0.6, 'stroke-width': 3, 'stroke-linecap': 'round' }, b);
}

/** 俯视的方程式赛车，车头朝 +x，长 30、宽 16；影子单独返回，挂在车下面 */
export function carMarkup(seat: number): string {
  const i = seat % CAR_COLORS.length;
  const c = CAR_COLORS[i]!;
  const tyre = (x: number, y: number): string =>
    `<rect x="${x}" y="${y}" width="7" height="4.2" rx="1.2" fill="#141414"/><rect x="${x + 1}" y="${y + 0.6}" width="5" height="1" rx="0.5" fill="#5a5a5a"/>`;
  return `<rect x="-14" y="-6.5" width="30" height="15" rx="6" fill="#000" opacity=".35" transform="translate(2 3)"/>
${tyre(-13, -8.2)}${tyre(-13, 4)}${tyre(6, -7.6)}${tyre(6, 3.4)}
<rect x="-16" y="-6.5" width="3.5" height="13" rx="1" fill="#1d1d1f"/><rect x="-15.5" y="-6" width="2.5" height="12" rx=".8" fill="${c.body}"/>
<path d="M-12 -4.2C-6 -6 -1 -5 4 -3.2L13 -1.4Q15.5 0 13 1.4L4 3.2C-1 5 -6 6 -12 4.2Z" fill="url(#rc-body${i})" stroke="${c.dark}" stroke-width=".6"/>
<path d="M-9 -5.6Q-4 -6.6 0 -4.4L0 4.4Q-4 6.6 -9 5.6Z" fill="url(#rc-body${i})" stroke="${c.dark}" stroke-width=".5"/>
<rect x="13" y="-7.2" width="3" height="14.4" rx="1" fill="#1d1d1f"/><rect x="13.4" y="-6.6" width="2" height="13.2" rx=".6" fill="${c.body}"/>
<ellipse cx="-2" cy="0" rx="4.4" ry="2.6" fill="#0d0f12"/><circle cx="-2.6" cy="0" r="2" fill="#f2f2f2"/><path d="M-1.4 -1.2A2 2 0 0 1 -1.4 1.2" stroke="#2a6fd1" stroke-width="1"/>
<path d="M-11 0H11" stroke="#ffffff" stroke-opacity=".35" stroke-width=".8"/>`;
}
