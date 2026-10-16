/**
 * 赛道和车（DESIGN.md 第 8 节）：一张 SVG。路面、路肩、内外车位线、格线、弯道线和限速牌、起终点格子线，场景背景；
 * 车是俯视的简笔小车，按座位配色。走车一格一格地走（不是瞬移），冲刺带尾焰、尾流带风线、打滑转一圈退回。
 * 镜头：默认看全图，可以跟着自己的车；拖动平移、双指或滚轮缩放（动了手就不再自动跟车，点"跟车"回来）。
 */
import { cellOf, geometry, type Geometry, type Pt } from '../track/shape.ts';
import type { Track } from '../track/types.ts';
import type { Ev } from '../core/types.ts';
import { CAR_COLORS } from './text.ts';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

export interface BoardCar {
  seat: number;
  pos: number;
  lane: number;
  /** 冲线离场了（画在终点线后面，半透明） */
  out: boolean;
}

interface CarGlyph {
  g: SVGGElement;
  body: SVGGElement;
  pos: number;
  lane: number;
  x: number;
  y: number;
  angle: number;
}

const reduceMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

export class Board {
  readonly root: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly carLayer: SVGGElement;
  private readonly fxLayer: SVGGElement;
  private readonly ghost: SVGGElement;
  private readonly geo: Geometry;
  private readonly cars = new Map<number, CarGlyph>();
  private readonly box: { x: number; y: number; w: number; h: number };
  private cam: { x: number; y: number; w: number; h: number };
  private follow = false;
  private me: number | null = null;
  /** 动画速度倍数（单机"快"是 0.5） */
  speed = 1;
  private readonly followBtn: HTMLButtonElement;

  private readonly track: Track;

  constructor(parent: HTMLElement, track: Track) {
    this.track = track;
    this.geo = geometry(track);
    this.root = document.createElement('div');
    this.root.className = 'board';
    parent.appendChild(this.root);
    this.svg = svgEl('svg', { class: 'board-svg', preserveAspectRatio: 'xMidYMid meet' }, this.root);
    this.world = svgEl('g', {}, this.svg);
    this.drawScene();
    this.drawTrack();
    this.ghost = svgEl('g', { class: 'ghost' }, this.world);
    this.carLayer = svgEl('g', { class: 'cars' }, this.world);
    this.fxLayer = svgEl('g', { class: 'fx' }, this.world);
    const xs = this.geo.cells.flatMap((c) => [c.c.x]);
    const ys = this.geo.cells.flatMap((c) => [c.c.y]);
    const pad = this.geo.width + 30;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    this.box = { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
    this.cam = { ...this.box };
    this.applyCam();
    const tools = document.createElement('div');
    tools.className = 'board-tools';
    this.root.appendChild(tools);
    const fit = document.createElement('button');
    fit.type = 'button';
    fit.textContent = '全图';
    fit.addEventListener('click', () => {
      this.follow = false;
      this.paintTools();
      this.flyTo({ ...this.box });
    });
    this.followBtn = document.createElement('button');
    this.followBtn.type = 'button';
    this.followBtn.textContent = '跟车';
    this.followBtn.addEventListener('click', () => {
      this.follow = !this.follow;
      this.paintTools();
      if (this.follow) this.centerOnMe(true);
      else this.flyTo({ ...this.box });
    });
    tools.append(fit, this.followBtn);
    this.paintTools();
    this.bindGestures();
  }

  private paintTools(): void {
    this.followBtn.classList.toggle('on', this.follow);
    this.followBtn.hidden = this.me === null;
  }

  // ---------- 画赛道 ----------

  private drawScene(): void {
    const g = svgEl('g', { class: `scene ${this.geo.scene}` }, this.world);
    svgEl('rect', { x: -400, y: -400, width: 1800, height: 1420, class: 'grass' }, g);
    const cx = this.geo.cells.reduce((a, c) => a + c.c.x, 0) / this.geo.cells.length;
    const cy = this.geo.cells.reduce((a, c) => a + c.c.y, 0) / this.geo.cells.length;
    if (this.geo.scene === 'lake') {
      svgEl('ellipse', { cx: cx - 30, cy: cy + 40, rx: 210, ry: 120, class: 'water' }, g);
      svgEl('ellipse', { cx: cx - 60, cy: cy + 20, rx: 60, ry: 18, class: 'water-hi' }, g);
      for (const [x, y] of [
        [cx + 200, cy - 40],
        [cx - 260, cy - 60],
        [cx + 120, cy + 140],
      ] as [number, number][])
        this.tree(g, x, y);
    } else if (this.geo.scene === 'city') {
      const blocks: [number, number, number, number][] = [
        [cx - 300, cy - 20, 70, 50],
        [cx - 210, cy + 60, 50, 70],
        [cx + 230, cy + 90, 80, 46],
        [cx + 40, cy - 190, 60, 40],
        [cx - 40, cy + 170, 90, 40],
      ];
      for (const [x, y, w, h] of blocks) {
        svgEl('rect', { x, y, width: w, height: h, rx: 4, class: 'house' }, g);
        svgEl('rect', { x: x + 6, y: y + 6, width: w - 12, height: 8, rx: 2, class: 'house-hi' }, g);
      }
    } else {
      svgEl('path', { d: 'M-400 -400H1400V30C1100 0 900 40 600 20S100 30 -400 10Z', class: 'water' }, g);
      for (let i = 0; i < 5; i++) svgEl('rect', { x: 200 + i * 130, y: -40, width: 14, height: 46, class: 'dock' }, g);
      svgEl('rect', { x: cx - 300, y: cy + 10, width: 90, height: 34, rx: 3, class: 'box-a' }, g);
      svgEl('rect', { x: cx - 300, y: cy + 50, width: 90, height: 34, rx: 3, class: 'box-b' }, g);
      svgEl('rect', { x: cx - 200, y: cy + 50, width: 90, height: 34, rx: 3, class: 'box-c' }, g);
    }
  }

  private tree(g: SVGGElement, x: number, y: number): void {
    svgEl('circle', { cx: x, cy: y, r: 22, class: 'tree' }, g);
    svgEl('circle', { cx: x - 6, cy: y - 6, r: 9, class: 'tree-hi' }, g);
  }

  private drawTrack(): void {
    const geo = this.geo;
    const t = this.track;
    const g = svgEl('g', { class: 'track' }, this.world);
    svgEl('path', { d: geo.path, class: 'kerb', 'stroke-width': geo.width + 12 }, g);
    svgEl('path', { d: geo.path, class: 'kerb-dash', 'stroke-width': geo.width + 12 }, g);
    svgEl('path', { d: geo.path, class: 'asphalt', 'stroke-width': geo.width }, g);
    svgEl('path', { d: geo.path, class: 'midline' }, g);
    geo.edges.forEach((e, i) => {
      const nx = Math.sin(e.angle) * (geo.width / 2);
      const ny = -Math.cos(e.angle) * (geo.width / 2);
      if (i === 0) {
        // 起终点：两排黑白格
        const sq = geo.width / 6;
        const tx = Math.cos(e.angle);
        const ty = Math.sin(e.angle);
        for (let row = 0; row < 2; row++)
          for (let k = 0; k < 6; k++) {
            const ox = e.c.x + nx - (nx / (geo.width / 2)) * sq * (k + 0.5) + tx * sq * (row - 0.5);
            const oy = e.c.y + ny - (ny / (geo.width / 2)) * sq * (k + 0.5) + ty * sq * (row - 0.5);
            svgEl('rect', { x: ox - sq / 2, y: oy - sq / 2, width: sq, height: sq, class: (k + row) % 2 ? 'chk-b' : 'chk-w', transform: `rotate(${(e.angle * 180) / Math.PI} ${ox} ${oy})` }, g);
          }
        return;
      }
      svgEl('line', { x1: e.c.x + nx, y1: e.c.y + ny, x2: e.c.x - nx, y2: e.c.y - ny, class: 'cell-line' }, g);
    });
    for (const c of t.corners) {
      const e = geo.edges[c.at]!;
      const nx = Math.sin(e.angle);
      const ny = -Math.cos(e.angle);
      const half = geo.width / 2;
      svgEl('line', { x1: e.c.x + nx * half, y1: e.c.y + ny * half, x2: e.c.x - nx * half, y2: e.c.y - ny * half, class: 'corner-line' }, g);
      // 限速牌放在弯的外侧：往后几格转向的反方向
      let turn = 0;
      for (let k = 0; k < 5; k++) turn += geo.turn[(c.at + k) % t.spaces]!;
      const side = turn > 0 ? 1 : -1;
      const sx = e.c.x + nx * side * (half + 22);
      const sy = e.c.y + ny * side * (half + 22);
      svgEl('circle', { cx: sx, cy: sy, r: 15, class: 'limit-sign' }, g);
      const tx = svgEl('text', { x: sx, y: sy + 6, class: 'limit-text' }, g);
      tx.textContent = String(c.limit);
    }
  }

  // ---------- 车 ----------

  private spot(pos: number, lane: number): { p: Pt; angle: number } {
    const cell = this.geo.cells[cellOf(this.track, pos)]!;
    return { p: cell.spots[lane === 0 ? 0 : 1], angle: cell.angle };
  }

  private glyph(seat: number): CarGlyph {
    let c = this.cars.get(seat);
    if (c) return c;
    const color = CAR_COLORS[seat % CAR_COLORS.length]!;
    const g = svgEl('g', { class: 'car' }, this.carLayer);
    const body = svgEl('g', {}, g);
    svgEl('rect', { x: -12, y: -7, width: 24, height: 14, rx: 4, fill: color.body, stroke: color.dark, 'stroke-width': 1.6 }, body);
    svgEl('rect', { x: 1, y: -5, width: 6, height: 10, rx: 2, fill: '#cfe8ff', stroke: color.dark, 'stroke-width': 0.8 }, body);
    svgEl('rect', { x: -11, y: -9, width: 6, height: 3, rx: 1, class: 'tyre' }, body);
    svgEl('rect', { x: -11, y: 6, width: 6, height: 3, rx: 1, class: 'tyre' }, body);
    svgEl('rect', { x: 5, y: -9, width: 6, height: 3, rx: 1, class: 'tyre' }, body);
    svgEl('rect', { x: 5, y: 6, width: 6, height: 3, rx: 1, class: 'tyre' }, body);
    c = { g, body, pos: 0, lane: 0, x: 0, y: 0, angle: 0 };
    this.cars.set(seat, c);
    return c;
  }

  private put(c: CarGlyph, x: number, y: number, angle: number): void {
    c.x = x;
    c.y = y;
    c.angle = angle;
    c.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`);
  }

  /** 摆好所有车（不放动画） */
  setCars(list: BoardCar[], me: number | null): void {
    this.me = me;
    this.paintTools();
    for (const car of list) {
      const c = this.glyph(car.seat);
      c.pos = car.pos;
      c.lane = car.lane;
      const s = this.spot(car.pos, car.lane);
      this.put(c, s.p.x, s.p.y, s.angle);
      c.g.classList.toggle('out', car.out);
      c.g.classList.toggle('me', car.seat === me);
    }
    if (this.follow) this.centerOnMe(false);
  }

  /** 选牌时的落点预览：pos 是要停的格（null 是不画），warn 是会打滑或付热量 */
  preview(pos: number | null, lane: number, kind: 'ok' | 'pay' | 'spin' = 'ok'): void {
    this.ghost.replaceChildren();
    if (pos === null || this.me === null) return;
    const s = this.spot(pos, lane);
    const g = svgEl('g', { class: `ghost-car ${kind}`, transform: `translate(${s.p.x} ${s.p.y}) rotate(${(s.angle * 180) / Math.PI})` }, this.ghost);
    svgEl('rect', { x: -12, y: -7, width: 24, height: 14, rx: 4 }, g);
  }

  // ---------- 动画 ----------

  /** 按顺序放这一步的事；放完车停在事件里的最终位置 */
  async play(events: readonly Ev[]): Promise<void> {
    const fast = reduceMotion();
    for (const e of events) {
      switch (e.e) {
        case 'reveal':
          this.float(e.seat, `${e.speed}`, 'speed');
          if (!fast) await wait(220 * this.speed);
          break;
        case 'stall':
          this.float(e.seat, '熄火', 'bad');
          if (!fast) await wait(500 * this.speed);
          break;
        case 'move':
          await this.drive(e.seat, e.from, e.to, e.lane, e.why, fast);
          break;
        case 'boost':
          this.float(e.seat, `冲刺 +${e.value}`, 'boost');
          break;
        case 'cool':
          this.float(e.seat, `散热 ${e.n}`, 'cool');
          break;
        case 'corner':
          if (e.paid > 0) {
            this.float(e.seat, `热量 −${e.paid}`, 'heat');
            if (!fast) await wait(300 * this.speed);
          }
          break;
        case 'spin':
          this.float(e.seat, '打滑！', 'bad');
          break;
        case 'finish':
          this.float(e.seat, e.rank === 0 ? '冠军！' : `第 ${e.rank + 1}`, 'finish');
          break;
        default:
          break;
      }
    }
  }

  private async drive(seat: number, from: number, to: number, lane: number, why: string, fast: boolean): Promise<void> {
    const c = this.glyph(seat);
    const end = this.spot(to, lane);
    if (fast || from === to) {
      c.pos = to;
      c.lane = lane;
      this.put(c, end.p.x, end.p.y, end.angle);
      if (this.follow && seat === this.me) this.centerOnMe(false);
      return;
    }
    // 途经每一格的中线，最后落到车位
    const pts: { x: number; y: number; a: number }[] = [{ x: c.x, y: c.y, a: c.angle }];
    const dir = to > from ? 1 : -1;
    for (let p = from + dir; p !== to; p += dir) {
      const cell = this.geo.cells[cellOf(this.track, p)]!;
      pts.push({ x: cell.c.x, y: cell.c.y, a: cell.angle });
    }
    pts.push({ x: end.p.x, y: end.p.y, a: end.angle });
    const per = Math.max(45, Math.min(110, 700 / pts.length)) * this.speed;
    const total = per * (pts.length - 1);
    if (why === 'boost') this.trail(c, 'flame', total);
    if (why === 'slip') this.trail(c, 'wind', total);
    const spin = why === 'spin';
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const frame = (now: number): void => {
        // rAF 给的时间戳可能比 t0 还早一点
        const k = Math.max(0, Math.min(1, (now - t0) / total));
        const f = k * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(f));
        const u = f - i;
        const a = pts[i]!;
        const b = pts[i + 1]!;
        let da = b.a - a.a;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const ang = a.a + da * u + (spin ? k * Math.PI * 2 : 0);
        this.put(c, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, ang);
        if (this.follow && seat === this.me) this.centerOnMe(false);
        if (k < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    c.pos = to;
    c.lane = lane;
    this.put(c, end.p.x, end.p.y, end.angle);
  }

  /** 尾焰、风线：挂在车上，过一会儿淡出 */
  private trail(c: CarGlyph, kind: 'flame' | 'wind', ms: number): void {
    const g = svgEl('g', { class: `trail ${kind}` }, c.g);
    if (kind === 'flame') {
      svgEl('path', { d: 'M-12 -4L-26 0L-12 4Z' }, g);
      svgEl('path', { d: 'M-12 -2L-20 0L-12 2Z', class: 'core' }, g);
    } else {
      for (const y of [-9, 0, 9]) svgEl('line', { x1: -16, y1: y, x2: -34, y2: y }, g);
    }
    window.setTimeout(() => g.remove(), ms + 250);
  }

  /** 车上方冒一行字往上飘 */
  private float(seat: number, text: string, kind: string): void {
    const c = this.cars.get(seat);
    if (!c) return;
    const t = svgEl('text', { x: c.x, y: c.y - 14, class: `float ${kind}` }, this.fxLayer);
    t.textContent = text;
    if (reduceMotion() || !t.animate) {
      window.setTimeout(() => t.remove(), 900);
      return;
    }
    const a = t.animate(
      [
        { transform: 'translate(0px, 0px)', opacity: 0 },
        { transform: 'translate(0px, -8px)', opacity: 1, offset: 0.15 },
        { transform: 'translate(0px, -26px)', opacity: 0 },
      ],
      { duration: 1300 * Math.max(0.6, this.speed), easing: 'ease-out' },
    );
    a.onfinish = () => t.remove();
  }

  // ---------- 镜头 ----------

  private applyCam(): void {
    const { x, y, w, h } = this.cam;
    this.svg.setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  }

  private flyTo(target: { x: number; y: number; w: number; h: number }): void {
    if (reduceMotion()) {
      this.cam = target;
      return this.applyCam();
    }
    const from = { ...this.cam };
    const t0 = performance.now();
    const frame = (now: number): void => {
      const k = Math.max(0, Math.min(1, (now - t0) / 350));
      const e = 1 - (1 - k) * (1 - k);
      this.cam = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e };
      this.applyCam();
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private centerOnMe(fly: boolean): void {
    if (this.me === null) return;
    const c = this.cars.get(this.me);
    if (!c) return;
    const w = this.box.w / 2.2;
    const h = this.box.h / 2.2;
    const target = { x: c.x - w / 2, y: c.y - h / 2, w, h };
    if (fly) this.flyTo(target);
    else {
      this.cam = target;
      this.applyCam();
    }
  }

  private bindGestures(): void {
    const pts = new Map<number, { x: number; y: number }>();
    let last: { cx: number; cy: number; d: number } | null = null;
    const scaleOf = (): number => {
      const r = this.svg.getBoundingClientRect();
      return Math.max(this.cam.w / Math.max(1, r.width), this.cam.h / Math.max(1, r.height));
    };
    const summary = (): { cx: number; cy: number; d: number } => {
      const list = [...pts.values()];
      const cx = list.reduce((a, p) => a + p.x, 0) / list.length;
      const cy = list.reduce((a, p) => a + p.y, 0) / list.length;
      const d = list.length > 1 ? Math.hypot(list[0]!.x - list[1]!.x, list[0]!.y - list[1]!.y) : 0;
      return { cx, cy, d };
    };
    const zoom = (k: number, sx: number, sy: number): void => {
      const r = this.svg.getBoundingClientRect();
      const fx = (sx - r.left) / Math.max(1, r.width);
      const fy = (sy - r.top) / Math.max(1, r.height);
      const w = Math.min(this.box.w * 1.2, Math.max(this.box.w / 5, this.cam.w / k));
      const h = (w * this.cam.h) / this.cam.w;
      this.cam = { x: this.cam.x + (this.cam.w - w) * fx, y: this.cam.y + (this.cam.h - h) * fy, w, h };
      this.applyCam();
    };
    this.svg.addEventListener('pointerdown', (e) => {
      this.svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = summary();
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !last) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = summary();
      const s = scaleOf();
      const dx = (now.cx - last.cx) * s;
      const dy = (now.cy - last.cy) * s;
      if (Math.abs(dx) + Math.abs(dy) > 0.5 || (now.d && last.d)) {
        if (this.follow) {
          this.follow = false;
          this.paintTools();
        }
        this.cam = { ...this.cam, x: this.cam.x - dx, y: this.cam.y - dy };
        this.applyCam();
        if (now.d && last.d) zoom(now.d / last.d, now.cx, now.cy);
      }
      last = now;
    });
    const up = (e: PointerEvent): void => {
      pts.delete(e.pointerId);
      last = pts.size ? summary() : null;
    };
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', up);
    this.svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.follow) {
          this.follow = false;
          this.paintTools();
        }
        zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
      },
      { passive: false },
    );
  }

  destroy(): void {
    this.root.remove();
  }
}
