/**
 * 赛道和车（DESIGN.md 第 8 节）：一张 SVG。路面、路肩、内外车位线、格线、弯道线和限速牌、起终点格子线，场景背景；
 * 车是俯视的简笔小车，按座位配色。走车一格一格地走（不是瞬移），冲刺带尾焰、尾流带风线、打滑转一圈退回。
 * 镜头：默认看全图，可以跟着自己的车；拖动平移、双指或滚轮缩放（动了手就不再自动跟车，点"跟车"回来）。
 */
import { cellOf, geometry, type Geometry, type Pt } from '../track/shape.ts';
import type { Track } from '../track/types.ts';
import type { Ev } from '../core/types.ts';
import { flameSvg } from './cards.ts';
import { carMarkup, drawDefs, drawWorld } from './scenery.ts';

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

/** 纹理文件 → data URL（烘焙位图时内联进 SVG；同一个页面只读一次） */
const textureCache = new Map<string, Promise<string>>();
async function textures(src: string): Promise<[string, string][]> {
  const hrefs = [...new Set([...src.matchAll(/href="(art\/[a-z]+\.webp)"/g)].map((m) => m[1]!))];
  return Promise.all(
    hrefs.map(async (href): Promise<[string, string]> => {
      let p = textureCache.get(href);
      if (!p) {
        p = fetch(href)
          .then((r) => r.blob())
          .then((b) => new Promise<string>((ok, bad) => {
            const fr = new FileReader();
            fr.onload = () => ok(String(fr.result));
            fr.onerror = bad;
            fr.readAsDataURL(b);
          }));
        textureCache.set(href, p);
      }
      return [href, await p];
    }),
  );
}

const reduceMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

export class Board {
  readonly root: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly scenery: SVGGElement;
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
    drawDefs(this.svg);
    this.world = svgEl('g', {}, this.svg);
    // 静止的地面、场景、赛道单独一组（开局后烘焙成位图），车、虚影、飘字在它上面
    this.scenery = svgEl('g', { class: 'scenery' }, this.world);
    drawWorld(this.scenery, track, this.geo);
    this.ghost = svgEl('g', { class: 'ghost' }, this.world);
    this.carLayer = svgEl('g', { class: 'cars' }, this.world);
    this.fxLayer = svgEl('g', { class: 'fx' }, this.world);
    const xs = this.geo.cells.flatMap((c) => [c.c.x]);
    const ys = this.geo.cells.flatMap((c) => [c.c.y]);
    // 留出弯外的砂石区、轮胎墙和看台
    const pad = this.geo.width + 70;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    this.box = { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
    this.cam = { ...this.box };
    void this.bake();
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

  // ---------- 车 ----------

  private spot(pos: number, lane: number): { p: Pt; angle: number } {
    const cell = this.geo.cells[cellOf(this.track, pos)]!;
    return { p: cell.spots[lane === 0 ? 0 : 1], angle: cell.angle };
  }

  private glyph(seat: number): CarGlyph {
    let c = this.cars.get(seat);
    if (c) return c;
    const g = svgEl('g', { class: 'car' }, this.carLayer);
    svgEl('ellipse', { class: 'halo', cx: 0, cy: 0, rx: 21, ry: 13 }, g);
    const body = svgEl('g', {}, g);
    body.innerHTML = carMarkup(seat);
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
    svgEl('rect', { x: -16, y: -8, width: 32, height: 16, rx: 6 }, g);
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
            this.float(e.seat, `−${e.paid}`, 'heat', true);
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
      svgEl('path', { d: 'M-16 -4L-32 0L-16 4Z' }, g);
      svgEl('path', { d: 'M-16 -2L-25 0L-16 2Z', class: 'core' }, g);
    } else {
      for (const y of [-9, 0, 9]) svgEl('line', { x1: -20, y1: y, x2: -40, y2: y }, g);
    }
    window.setTimeout(() => g.remove(), ms + 250);
  }

  /** 车上方冒一行字往上飘 */
  private float(seat: number, text: string, kind: string, flame = false): void {
    const c = this.cars.get(seat);
    if (!c) return;
    const t = svgEl('g', { class: `float ${kind}` }, this.fxLayer);
    const label = svgEl('text', { x: flame ? c.x + 6 : c.x, y: c.y - 14 }, t);
    label.textContent = text;
    // 付热量：字前面一簇火苗
    if (flame) t.insertAdjacentHTML('afterbegin', flameSvg().replace('<svg ', `<svg x="${c.x - 13}" y="${c.y - 29}" width="12" height="16" `));
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

  // ---------- 静止的赛道和场景烘焙成一张位图 ----------

  /**
   * 赛道、场景是静止的，元素却有一两千个：镜头跟车时每帧整张重画，手机上 4 倍降速时一帧 50 毫秒。
   * 所以开局把它们画成一张位图（纹理先内联成 data URL，不然当图片画时不会去加载），之后平移缩放只挪这一张图，
   * 车、虚影、飘字照旧是矢量。手机按 2 倍画（AGENTS.md 的"渲染倍数封顶 2"），电脑 3 倍；画好前、画失败时一直用矢量的
   */
  private baked: string | null = null;

  private async bake(): Promise<void> {
    try {
      const b = this.box;
      // 比赛道框再大一圈，并且至少按 2.2 : 1 的横屏比例取：手机横屏时镜头比赛道框宽，位图边上不露出断开的海面、场景
      const rw = Math.max(b.w * 1.3, b.h * 1.3 * 2.2);
      const rh = b.h * 1.3;
      const r = { x: b.x + b.w / 2 - rw / 2, y: b.y + b.h / 2 - rh / 2, w: rw, h: rh };
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const scale = Math.min(coarse ? 2 : 3, Math.sqrt((coarse ? 5e6 : 1.2e7) / (r.w * r.h)));
      const w = Math.round(r.w * scale);
      const h = Math.round(r.h * scale);
      const defs = this.svg.querySelector('defs')!.outerHTML;
      let src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.x} ${r.y} ${r.w} ${r.h}" width="${w}" height="${h}">${defs}${this.scenery.outerHTML}</svg>`;
      for (const [href, data] of await textures(src)) src = src.split(`href="${href}"`).join(`href="${data}"`);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.9));
      if (!blob || !this.root.isConnected) return;
      this.baked = URL.createObjectURL(blob);
      // 位图外面（镜头比位图宽的时候）照旧铺地面纹理，接缝看不出来
      const ground = this.scenery.querySelector('.ground')!.cloneNode(true);
      const pic = svgEl('image', { href: this.baked, x: r.x, y: r.y, width: r.w, height: r.h, preserveAspectRatio: 'none' });
      this.scenery.replaceChildren(ground, pic);
    } catch {
      // 画不出来（老浏览器、内存不够）就一直用矢量的，只是慢一点
    }
  }

  destroy(): void {
    if (this.baked) URL.revokeObjectURL(this.baked);
    this.root.remove();
  }
}
