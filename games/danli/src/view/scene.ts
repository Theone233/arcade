/**
 * 战场画面（DESIGN.md 第 4 节）：底下是镜头那一层（远景和地形块，烘焙好的画布，整层一个 CSS transform），
 * 上面一张 Canvas 2D 每帧按"纸边 → 角色 → 炮弹和特效 → 名牌、角度盘、画面外小牌"的顺序画。
 * 只读规则核心给的状态和事件（AGENTS.md 第 4 节"画面不自己算规则"）：事件按顺序放成动画；地形另存一份副本，放到"爆炸"那一刻才在副本上挖，
 * 炮弹飞的时候看到的还是炸之前的地。
 *
 * 镜头（参照飞驰）：
 * - 跟随当前角色（缩放 1，角色约 44 像素，人在画面偏后、往瞄准方向多看一些）；炮弹飞时跟着炮弹，高抛时拉远到 0.7；
 * - 拖动、双指（电脑上滚轮）缩放 0.28–1.5；动过手这回合就不自动移动，到发射时再跟炮弹；"全图"一键切换，切到全图就一直全图；
 * - 缩放低于 0.7 时角色换成队色图钉；画面外的角色在屏幕边显示小牌（名字、约几米、一截血量）。
 */
import { BODY_CY } from '../core/physics.ts';
import { MAX_HP } from '../core/rules.ts';
import { carve, cloneTerrain } from '../core/terrain.ts';
import type { MapDef } from '../core/maps.ts';
import type { Char, Dir, Ev, Look, State, Team } from '../core/types.ts';
import { Backdrop } from './backdrop.ts';
import { arrow, drawChar, edgeTag, glow, nameTag, pin, type Expr, type Tag } from './chars.ts';
import { FONT, INK, METER, PAPER, RED } from './palette.ts';
import { TerrainArt } from './terrainArt.ts';
import { renderRatio, type Size } from './viewport.ts';

export const ZOOM_MIN = 0.28;
export const ZOOM_MAX = 1.5;
/** 低于这个缩放，角色换成图钉 */
export const PIN_ZOOM = 0.7;

interface Disp {
  id: number;
  name: string;
  team: Team;
  look: Look;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  out: boolean;
  facing: Dir;
  expr: Expr;
  exprUntil: number;
  rot: number;
  alpha: number;
}

export interface Aim {
  angle: number;
  facing: Dir;
  min: number;
  max: number;
  /** 三岔：两边各多画一根细指针，差几度 */
  spread?: number;
}

interface Anim {
  t0: number;
  dur: number;
  fn: (p: number) => void;
  done: () => void;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  t0: number;
  dur: number;
  dx: number;
  dy: number;
}
interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  t0: number;
  dur: number;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
  dur: number;
}

type Mode = 'follow' | 'free' | 'overview';

export class Scene {
  readonly canvas: HTMLCanvasElement;
  /** 镜头那一层：远景和地形块是这里面的画布，按世界坐标摆，整层用一个 CSS transform 平移缩放 */
  private world: HTMLElement;
  private clip: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private W = 1;
  private H = 1;
  /** HUD 顶栏、底栏挡住的高度（屏幕像素）：构图和画面外小牌让开它们 */
  insetTop = 0;
  insetBottom = 0;
  private cam = { x: 1500, y: 400, z: 1 };
  private goal = { x: 1500, y: 400, z: 1 };
  private mode: Mode = 'follow';
  private manual = false;
  private chars: Disp[] = [];
  private actor = -1;
  /** 屏幕前的真人操控的角色：画面外小牌的"约几米"从他量起（量他自己时从当前角色量） */
  viewer = -1;
  /** 画角度盘（轮到真人瞄准时） */
  aim: Aim | null = null;
  /** 角度盘能不能拖 */
  aimEnabled = false;
  /** 飞在天上的炮弹（三岔是三颗）；plane 是纸飞机，vx、vy 用来摆纸飞机的朝向 */
  private bullets: { x: number; y: number; vx: number; vy: number; trail: number[]; plane: boolean }[] = [];
  private puffs: Puff[] = [];
  private crumbs: Crumb[] = [];
  private floaters: Floater[] = [];
  private anims: Anim[] = [];
  private art: TerrainArt;
  private back: Backdrop;
  private shake = 0;
  /** 动画加速（冒烟用 ?turbo） */
  speed = 1;
  onAim: ((angle: number, facing: Dir) => void) | null = null;
  onCamera: ((mode: Mode) => void) | null = null;
  /** 每一帧花的时间（毫秒），性能检查用 */
  readonly frames: number[] = [];
  readonly draws: number[] = [];
  private last = 0;
  private raf = 0;

  private map: MapDef;

  constructor(host: HTMLElement, map: MapDef, state: State) {
    this.map = map;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dl-canvas';
    host.prepend(this.canvas);
    // 镜头那一层套一个裁剪框：里面的大画布伸到屏幕外，不能撑出能滚动的区域
    this.clip = document.createElement('div');
    this.clip.className = 'dl-world-clip';
    this.world = document.createElement('div');
    this.world.className = 'dl-world';
    this.clip.appendChild(this.world);
    host.prepend(this.clip);
    this.ctx = this.canvas.getContext('2d')!;
    this.back = new Backdrop(map.width, map.height);
    this.back.mount(this.world);
    this.art = new TerrainArt(cloneTerrain(state.terrain), renderRatio(), this.world);
    this.art.flush();
    this.sync(state);
    this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
    this.clip.remove();
    for (const a of this.anims) a.done();
    this.anims = [];
  }

  resize(s: Size): void {
    this.dpr = renderRatio();
    this.W = s.w;
    this.H = s.h;
    this.canvas.width = Math.round(s.w * this.dpr);
    this.canvas.height = Math.round(s.h * this.dpr);
    this.canvas.style.width = `${s.w}px`;
    this.canvas.style.height = `${s.h}px`;
    if (this.mode === 'overview') this.goal = this.overviewGoal();
    this.clampTo(this.goal);
    this.cam = { ...this.goal };
  }

  /** 按状态摆好角色（读档、每一步动画放完以后对一遍）；地形副本要和状态一致时传 terrain */
  sync(s: State, terrain = false): void {
    this.chars = s.chars.map((c) => this.disp(c, this.chars.find((d) => d.id === c.id)));
    this.actor = s.phase === 'play' ? s.actor : -1;
    if (terrain) this.art.setTerrain(cloneTerrain(s.terrain));
  }

  private disp(c: Char, old?: Disp): Disp {
    return {
      id: c.id,
      name: c.name,
      team: c.team,
      look: c.look,
      x: c.x,
      y: c.y,
      hp: c.hp,
      maxHp: MAX_HP,
      out: c.out,
      facing: c.facing,
      expr: old?.expr ?? 'normal',
      exprUntil: old?.exprUntil ?? 0,
      rot: 0,
      alpha: c.out ? 0 : 1,
    };
  }

  setFacing(id: number, dir: Dir): void {
    const d = this.chars.find((c) => c.id === id);
    if (d) d.facing = dir;
  }

  // ---------- 镜头 ----------

  private viewH(): number {
    return Math.max(1, this.H - this.insetTop - this.insetBottom);
  }

  /** 屏幕上"画面中心"的位置（让开顶栏和底栏） */
  private centerY(): number {
    return this.insetTop + this.viewH() / 2;
  }

  toScreen(x: number, y: number): [number, number] {
    const { x: cx, y: cy, z } = this.cam;
    return [(x - cx) * z + this.W / 2, (y - cy) * z + this.centerY()];
  }

  toWorld(sx: number, sy: number): [number, number] {
    const { x: cx, y: cy, z } = this.cam;
    return [(sx - this.W / 2) / z + cx, (sy - this.centerY()) / z + cy];
  }

  private overviewGoal(): { x: number; y: number; z: number } {
    const z = Math.max(0.2, Math.min(this.W / (this.map.width + 160), this.viewH() / (this.map.height + 260), 1));
    return { x: this.map.width / 2, y: this.map.height / 2 - 40, z };
  }

  private clampTo(g: { x: number; y: number; z: number }): void {
    g.z = Math.min(ZOOM_MAX, Math.max(Math.min(ZOOM_MIN, this.overviewGoal().z), g.z));
    const hw = this.W / 2 / g.z;
    const hh = this.viewH() / 2 / g.z;
    const X0 = -260;
    const X1 = this.map.width + 260;
    const Y0 = -720;
    const Y1 = this.map.height + 140;
    g.x = X1 - X0 <= 2 * hw ? (X0 + X1) / 2 : Math.min(X1 - hw, Math.max(X0 + hw, g.x));
    g.y = Y1 - Y0 <= 2 * hh ? (Y0 + Y1) / 2 : Math.min(Y1 - hh, Math.max(Y0 + hh, g.y));
  }

  get cameraMode(): Mode {
    return this.mode;
  }

  /** 全图 ↔ 跟随 */
  toggleOverview(): void {
    if (this.mode === 'overview') {
      this.mode = 'follow';
      this.manual = false;
    } else {
      this.mode = 'overview';
      this.goal = this.overviewGoal();
    }
    this.onCamera?.(this.mode);
  }

  /** 新的一回合：没在全图就回到跟随 */
  newTurn(actor: number): void {
    this.actor = actor;
    this.manual = false;
    if (this.mode === 'free') this.mode = 'follow';
    this.onCamera?.(this.mode);
  }

  private followGoal(): void {
    if (this.mode === 'overview') {
      this.goal = this.overviewGoal();
      return;
    }
    const lead = this.bullets[0];
    if (lead) {
      const a = this.chars.find((c) => c.id === this.actor);
      const high = a ? lead.y < a.y - 260 : false;
      this.goal = { x: lead.x, y: lead.y, z: high || this.bullets.length > 1 ? 0.7 : 1 };
      this.clampTo(this.goal);
      return;
    }
    if (this.manual) return;
    const a = this.chars.find((c) => c.id === this.actor && !c.out);
    if (!a) return;
    const z = 1;
    const facing = this.aim?.facing ?? a.facing;
    this.goal = { x: a.x + (facing * this.W * 0.14) / z, y: a.y - 30, z };
    this.clampTo(this.goal);
  }

  /** 跟住某一点（掉落演出用） */
  private lookAt(x: number, y: number, z: number): void {
    if (this.mode === 'overview') return;
    this.goal = { x, y, z };
    this.clampTo(this.goal);
  }

  // ---------- 输入：拖动、双指缩放、滚轮、拖角度盘 ----------

  private bindInput(): void {
    const c = this.canvas;
    const pts = new Map<number, { x: number; y: number }>();
    let gesture: 'none' | 'pan' | 'aim' | 'pinch' = 'none';
    let start = { x: 0, y: 0, cx: 0, cy: 0, z: 1, d: 1, mx: 0, my: 0, moved: false };
    const local = (e: PointerEvent): { x: number; y: number } => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const beginPan = (p: { x: number; y: number }): void => {
      gesture = 'pan';
      start = { ...start, x: p.x, y: p.y, cx: this.cam.x, cy: this.cam.y, z: this.cam.z, moved: false };
    };
    const beginPinch = (): void => {
      const [a, b] = [...pts.values()];
      gesture = 'pinch';
      const mx = (a!.x + b!.x) / 2;
      const my = (a!.y + b!.y) / 2;
      const [wx, wy] = this.toWorld(mx, my);
      start = { ...start, d: Math.max(10, Math.hypot(a!.x - b!.x, a!.y - b!.y)), z: this.cam.z, mx: wx, my: wy };
    };
    const takeManual = (): void => {
      if (!this.manual || this.mode !== 'free') {
        this.manual = true;
        this.mode = 'free';
        this.onCamera?.(this.mode);
      }
    };
    c.addEventListener('pointerdown', (e) => {
      const p = local(e);
      pts.set(e.pointerId, p);
      c.setPointerCapture(e.pointerId);
      if (pts.size === 1) {
        if (this.aimEnabled && this.aim && this.nearActor(p.x, p.y)) {
          gesture = 'aim';
          this.aimFrom(p.x, p.y);
        } else beginPan(p);
      } else if (pts.size === 2) beginPinch();
    });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (gesture === 'aim') this.aimFrom(p.x, p.y);
      else if (gesture === 'pan') {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 5) return;
        start.moved = true;
        takeManual();
        this.goal = { x: start.cx - dx / this.cam.z, y: start.cy - dy / this.cam.z, z: this.cam.z };
        this.clampTo(this.goal);
        this.cam = { ...this.goal };
      } else if (gesture === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        takeManual();
        const d = Math.max(10, Math.hypot(a!.x - b!.x, a!.y - b!.y));
        const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (start.z * d) / start.d));
        const mx = (a!.x + b!.x) / 2;
        const my = (a!.y + b!.y) / 2;
        this.goal = { x: start.mx - (mx - this.W / 2) / z, y: start.my - (my - this.centerY()) / z, z };
        this.clampTo(this.goal);
        this.cam = { ...this.goal };
      }
    });
    const up = (e: PointerEvent): void => {
      pts.delete(e.pointerId);
      if (pts.size === 0) gesture = 'none';
      else if (pts.size === 1 && gesture === 'pinch') beginPan([...pts.values()][0]!);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        takeManual();
        const r = c.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const [wx, wy] = this.toWorld(sx, sy);
        const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.cam.z * Math.exp(-e.deltaY * 0.0015)));
        this.goal = { x: wx - (sx - this.W / 2) / z, y: wy - (sy - this.centerY()) / z, z };
        this.clampTo(this.goal);
        this.cam = { ...this.goal };
      },
      { passive: false },
    );
  }

  /** 当前角色身体中心在屏幕上的位置 */
  actorScreen(): [number, number] | null {
    const a = this.chars.find((c) => c.id === this.actor);
    if (!a) return null;
    return this.toScreen(a.x, a.y - BODY_CY);
  }

  private nearActor(x: number, y: number): boolean {
    const p = this.actorScreen();
    return !!p && Math.hypot(x - p[0], y - p[1]) < 84;
  }

  private aimFrom(x: number, y: number): void {
    const p = this.actorScreen();
    if (!p || !this.aim) return;
    const dx = x - p[0];
    const dy = y - p[1];
    if (Math.hypot(dx, dy) < 10) return;
    const facing: Dir = Math.abs(dx) < 4 ? this.aim.facing : dx > 0 ? 1 : -1;
    const deg = Math.round((Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI);
    const angle = Math.min(this.aim.max, Math.max(this.aim.min, deg));
    if (angle !== this.aim.angle || facing !== this.aim.facing) this.onAim?.(angle, facing);
  }

  // ---------- 动画 ----------

  private tween(ms: number, fn: (p: number) => void): Promise<void> {
    return new Promise((done) => {
      this.anims.push({ t0: performance.now(), dur: Math.max(1, ms / this.speed), fn, done });
    });
  }

  wait(ms: number): Promise<void> {
    return this.tween(ms, () => {});
  }

  private char(id: number): Disp {
    return this.chars.find((c) => c.id === id)!;
  }

  /** 按顺序放一串事件；cb 在每个事件放到时调（HUD 跟着变） */
  async play(events: readonly Ev[], cb: (e: Ev) => void): Promise<void> {
    for (const e of events) {
      cb(e);
      switch (e.t) {
        case 'move': {
          const d = this.char(e.id);
          const x0 = d.x;
          const y0 = d.y;
          d.facing = e.x > x0 ? 1 : e.x < x0 ? -1 : d.facing;
          await this.tween(60, (p) => {
            d.x = x0 + (e.x - x0) * p;
            d.y = y0 + (e.y - y0) * p;
          });
          break;
        }
        case 'face':
          this.char(e.id).facing = e.dir;
          break;
        case 'fire':
          this.char(e.id).facing = e.facing;
          this.aim = null;
          break;
        case 'shot':
          await this.playShot(e.flights.map((f) => f.path), e.plane);
          break;
        case 'warp':
          await this.playWarp(e.id, e.to);
          break;
        case 'boom':
          this.boom(e.x, e.y, e.r);
          await this.wait(260);
          break;
        case 'hurt': {
          const d = this.char(e.id);
          d.hp = e.hp;
          d.expr = 'hurt';
          d.exprUntil = performance.now() + 1100 / this.speed;
          this.floaters.push({ x: d.x, y: d.y - 50, text: `-${e.dmg}`, color: RED, t0: performance.now(), dur: 1100 / this.speed });
          await this.wait(160);
          break;
        }
        case 'push': {
          const d = this.char(e.id);
          const x0 = d.x;
          const y0 = d.y;
          await this.tween(200, (p) => {
            d.x = x0 + (e.x - x0) * p;
            d.y = y0 + (e.y - y0) * p - Math.sin(p * Math.PI) * 10;
          });
          break;
        }
        case 'fall':
          await this.playFall(e.id, e.x, e.from, e.to);
          break;
        case 'out': {
          const d = this.char(e.id);
          d.out = true;
          if (e.why === 'hp') {
            this.puff(d.x, d.y - 20, 22);
            await this.tween(500, (p) => (d.alpha = 1 - p));
          }
          d.alpha = 0;
          break;
        }
        case 'turn':
          await this.wait(600);
          this.newTurn(e.id);
          break;
        case 'over':
          await this.wait(500);
          this.actor = -1;
          break;
      }
    }
  }

  /** 放一批同时飞的炮弹（普通、连发的一颗，三岔的三颗，或者纸飞机）；镜头跟着第一颗还在飞的 */
  private async playShot(paths: readonly number[][], plane: boolean): Promise<void> {
    const n = Math.max(0, ...paths.map((p) => p.length / 2));
    if (n === 0) return;
    if (this.mode === 'free') this.mode = 'follow';
    this.manual = false;
    const live = paths.map((path) => ({ path, b: { x: path[0]!, y: path[1]!, vx: 0, vy: 0, trail: [] as number[], plane }, last: 0 }));
    this.bullets = live.map((l) => l.b);
    await this.tween((n * 1000) / 60, (p) => {
      const at = p * (n - 1);
      for (const l of live) {
        const len = l.path.length / 2;
        if (at > len - 1) {
          const k = this.bullets.indexOf(l.b);
          if (k >= 0) this.bullets.splice(k, 1);
          continue;
        }
        const i = Math.floor(at);
        const b = l.b;
        b.vx = l.path[Math.min(len - 1, i + 1) * 2]! - l.path[i * 2]!;
        b.vy = l.path[Math.min(len - 1, i + 1) * 2 + 1]! - l.path[i * 2 + 1]!;
        b.x = l.path[i * 2]!;
        b.y = l.path[i * 2 + 1]!;
        for (let k = l.last; k < i; k += 3) b.trail.push(l.path[k * 2]!, l.path[k * 2 + 1]!);
        if (b.trail.length > 60) b.trail.splice(0, b.trail.length - 60);
        l.last = i;
      }
    });
    this.bullets = [];
    this.goal = { ...this.cam };
    if (this.mode === 'follow') this.manual = true;
  }

  /** 纸飞机落地：原地一团纸屑，人在落点冒出来；to 是 null 就是飞出画本作废 */
  private async playWarp(id: number, to: { x: number; y: number } | null): Promise<void> {
    const d = this.char(id);
    if (!to) {
      this.lookAt(d.x, d.y - 30, 1);
      this.floaters.push({ x: d.x, y: d.y - 60, text: '纸飞机飞丢了', color: INK, t0: performance.now(), dur: 1400 / this.speed });
      await this.wait(500);
      return;
    }
    this.puff(d.x, d.y - 20, 18);
    await this.tween(180, (p) => (d.alpha = 1 - p));
    d.x = to.x;
    d.y = to.y;
    this.lookAt(to.x, to.y - 30, 1);
    this.puff(to.x, to.y - 20, 18);
    await this.tween(220, (p) => (d.alpha = p));
    d.alpha = 1;
  }

  private boom(x: number, y: number, r: number): void {
    const box = carve(this.art.grid, x, y, r);
    this.art.touch(box);
    this.puff(x, y, r);
    const now = performance.now();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 160;
      this.crumbs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, rot: Math.random() * 6, t0: now, dur: (700 + Math.random() * 300) / this.speed });
    }
    this.shake = 1;
  }

  private puff(x: number, y: number, r: number): void {
    const now = performance.now();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.puffs.push({ x, y, r: r * (0.45 + Math.random() * 0.3), t0: now + i * 15, dur: 650 / this.speed, dx: Math.cos(a) * r * 0.7, dy: Math.sin(a) * r * 0.55 - 6 });
    }
    this.puffs.push({ x, y, r: r * 0.8, t0: now, dur: 700 / this.speed, dx: 0, dy: -8 });
  }

  private async playFall(id: number, x: number, from: number, to: number): Promise<void> {
    const d = this.char(id);
    d.x = x;
    const gone = to > this.map.height;
    const h = Math.max(1, to - from);
    const dur = 140 + Math.sqrt(h) * 26;
    if (gone) {
      this.lookAt(x, Math.min(this.map.height - 160, from + 120), 0.7);
      d.expr = 'hurt';
      d.exprUntil = performance.now() + 3000;
    }
    await this.tween(dur, (p) => {
      d.y = from + h * p * p;
      if (gone) {
        d.rot = p * Math.PI * 3;
        d.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      }
    });
    if (gone) {
      d.alpha = 0;
      this.puff(x, this.map.height - 10, 26);
    }
  }

  // ---------- 每一帧 ----------

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(100, now - this.last) : 16;
    if (this.last) {
      this.frames.push(dt);
      if (this.frames.length > 600) this.frames.shift();
    }
    this.last = now;
    for (const a of this.anims.slice()) {
      const p = Math.min(1, (now - a.t0) / a.dur);
      a.fn(Math.max(0, p));
      if (p >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.done();
      }
    }
    this.followGoal();
    const k = 1 - Math.exp(-dt * 0.006 * Math.max(1, this.speed / 2));
    this.cam.x += (this.goal.x - this.cam.x) * k;
    this.cam.y += (this.goal.y - this.cam.y) * k;
    this.cam.z += (this.goal.z - this.cam.z) * k;
    const t0 = performance.now();
    this.render(now, dt);
    this.draws.push(performance.now() - t0);
    if (this.draws.length > 600) this.draws.shift();
  };

  private render(now: number, dt: number): void {
    const ctx = this.ctx;
    const { dpr, W, H } = this;
    let { x: cx, y: cy } = this.cam;
    const z = this.cam.z;
    if (this.shake > 0) {
      cx += (Math.random() - 0.5) * 6 * this.shake;
      cy += (Math.random() - 0.5) * 6 * this.shake;
      this.shake = Math.max(0, this.shake - dt / 250);
    }
    const ox = W / 2 - cx * z;
    const oy = this.centerY() - cy * z;
    // 远景和地形块：只改镜头那一层的 transform（炸过的块先重画）；这张画布只画会动的东西，每帧清空
    this.art.flush();
    this.world.style.transform = `matrix(${z},0,0,${z},${ox},${oy})`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    this.back.drawEdge(ctx, 1 / z);
    const pinMode = z < PIN_ZOOM;
    // 角色（放大时画本体，缩小时在屏幕坐标里画图钉）
    if (!pinMode) {
      for (const d of this.chars) {
        if (d.alpha <= 0) continue;
        if (d.expr !== 'normal' && now > d.exprUntil) d.expr = 'normal';
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.globalAlpha = d.alpha;
        if (d.id === this.actor && !this.bullets.length) glow(ctx, now);
        if (d.rot) {
          ctx.translate(0, -20);
          ctx.rotate(d.rot);
          ctx.translate(0, 20);
        }
        drawChar(ctx, d.look, d.team, d.facing, d.expr, now);
        ctx.restore();
      }
    }
    // 炮弹：一只包子，后面拖一串小点
    for (const b of this.bullets) {
      ctx.fillStyle = 'rgba(70,41,26,0.35)';
      for (let i = 0; i < b.trail.length; i += 2) {
        ctx.beginPath();
        ctx.arc(b.trail[i]!, b.trail[i + 1]!, 1.5 + (i / b.trail.length) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.plane) paperPlane(ctx, b.x, b.y, Math.atan2(b.vy, b.vx), Math.max(1, 0.8 / z));
      else bun(ctx, b.x, b.y, Math.max(1, 0.8 / z));
    }
    // 面粉团和碎屑
    for (const p of this.puffs.slice()) {
      const t = (now - p.t0) / p.dur;
      if (t < 0) continue;
      if (t >= 1) {
        this.puffs.splice(this.puffs.indexOf(p), 1);
        continue;
      }
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = '#fffdf6';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2 / Math.max(z, 0.5);
      ctx.beginPath();
      ctx.arc(p.x + p.dx * t, p.y + p.dy * t, p.r * (0.6 + t * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const c of this.crumbs.slice()) {
      const t = (now - c.t0) / c.dur;
      if (t >= 1) {
        this.crumbs.splice(this.crumbs.indexOf(c), 1);
        continue;
      }
      const s = (t * c.dur) / 1000;
      const x = c.x + c.vx * s;
      const y = c.y + c.vy * s + 500 * s * s;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.rot + s * 8);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#eba650';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.fillRect(-3.5, -3, 7, 6);
      ctx.strokeRect(-3.5, -3, 7, 6);
      ctx.restore();
    }
    // ---------- 屏幕坐标：名牌、图钉、角度盘、飘字、画面外小牌 ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const offscreen: Disp[] = [];
    for (const d of this.chars) {
      if (d.out && d.alpha <= 0) continue;
      const [sx, sy] = this.toScreen(d.x, d.y);
      const inView = sx > -10 && sx < W + 10 && sy > this.insetTop - 10 && sy < H - this.insetBottom + 50;
      if (!inView) {
        if (!d.out) offscreen.push(d);
        continue;
      }
      const tag = this.tagOf(d);
      const cur = d.id === this.actor && !this.bullets.length;
      if (pinMode) {
        ctx.globalAlpha = d.alpha;
        pin(ctx, tag, sx, sy, cur, now);
        ctx.globalAlpha = 1;
        if (cur) arrow(ctx, sx, sy - 60, now);
      } else if (!d.rot) {
        nameTag(ctx, tag, sx, sy - 48 * z - 10, cur);
        if (cur) arrow(ctx, sx, sy - 48 * z - 46, now);
      }
    }
    if (this.aim && !this.bullets.length) this.drawDial(ctx);
    for (const f of this.floaters.slice()) {
      const t = (now - f.t0) / f.dur;
      if (t >= 1) {
        this.floaters.splice(this.floaters.indexOf(f), 1);
        continue;
      }
      const [sx, sy] = this.toScreen(f.x, f.y);
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `900 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = PAPER;
      ctx.strokeText(f.text, sx, sy - t * 40);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy - t * 40);
      ctx.globalAlpha = 1;
    }
    this.drawEdgeTags(ctx, offscreen);
  }

  private tagOf(d: Disp): Tag {
    return { name: d.name, team: d.team, hp: d.hp, maxHp: d.maxHp, out: d.out };
  }

  /** 角度盘：能用的范围刷蓝，指针是这一发的方向，旁边写度数 */
  private drawDial(ctx: CanvasRenderingContext2D): void {
    const p = this.actorScreen();
    if (!p || !this.aim) return;
    const { angle, facing, min, max } = this.aim;
    const [x, y] = p;
    const R = 54;
    const r0 = 26;
    const rad = (a: number): number => (facing === 1 ? -(a * Math.PI) / 180 : Math.PI + (a * Math.PI) / 180);
    ctx.save();
    // 整个四分之一圈（灰），能用的范围（蓝）
    const sector = (a0: number, a1: number, fill: string): void => {
      ctx.beginPath();
      const s0 = rad(a0);
      const s1 = rad(a1);
      const ccw = facing === 1;
      ctx.arc(x, y, R, s0, s1, ccw);
      ctx.arc(x, y, r0, s1, s0, !ccw);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    sector(0, 90, 'rgba(255,250,240,0.55)');
    sector(min, max, 'rgba(63,141,230,0.55)');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, R, rad(0), rad(90), facing === 1);
    ctx.stroke();
    // 指针
    const a = rad(angle);
    const tipX = x + Math.cos(a) * (R + 14);
    const tipY = y + Math.sin(a) * (R + 14);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(tipX + Math.cos(a) * 9, tipY + Math.sin(a) * 9);
    ctx.lineTo(tipX + Math.cos(a + 2.4) * 8, tipY + Math.sin(a + 2.4) * 8);
    ctx.lineTo(tipX + Math.cos(a - 2.4) * 8, tipY + Math.sin(a - 2.4) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 三岔：两边的细指针
    if (this.aim.spread) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const k of [-1, 1]) {
        const b = rad(angle + k * this.aim.spread);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(b) * 14, y + Math.sin(b) * 14);
        ctx.lineTo(x + Math.cos(b) * (R + 10), y + Math.sin(b) * (R + 10));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
    }
    // 度数牌
    const lx = x + Math.cos(a) * (R + 44);
    const ly = y + Math.sin(a) * (R + 30) - 4;
    ctx.font = `900 17px ${FONT}`;
    const text = `${angle}°`;
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - 13, w, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx, ly + 1);
    ctx.restore();
  }

  /** 画面外的角色：贴着屏幕边、朝它那一侧，尖角指向它；上下让开顶栏和底栏，两张撞上就顺着边挪开 */
  private drawEdgeTags(ctx: CanvasRenderingContext2D, list: Disp[]): void {
    const viewer = this.chars.find((c) => c.id === this.viewer && !c.out);
    const placed: { x: number; y: number }[] = [];
    const top = this.insetTop + 26;
    const bottom = this.H - this.insetBottom - 26;
    for (const d of list) {
      const [sx, sy] = this.toScreen(d.x, d.y - 20);
      let x = Math.min(this.W - 58, Math.max(58, sx));
      let y = Math.min(bottom, Math.max(top, sy));
      let dirX = 0;
      let dirY = 0;
      if (sx < 0) dirX = -1;
      else if (sx > this.W) dirX = 1;
      else if (sy < top) dirY = -1;
      else dirY = 1;
      for (const p of placed) {
        if (Math.abs(p.x - x) < 96 && Math.abs(p.y - y) < 38) {
          if (dirX) y = p.y + (y >= p.y ? 40 : -40);
          else x = p.x + (x >= p.x ? 98 : -98);
        }
      }
      placed.push({ x, y });
      const from = d === viewer ? this.chars.find((c) => c.id === this.actor) : viewer;
      const m = from && from !== d ? Math.max(1, Math.round(Math.hypot(d.x - from.x, d.y - from.y) / METER)) : null;
      edgeTag(ctx, this.tagOf(d), x, y, dirX, dirY, m);
    }
  }

  /** 炮弹正在飞（截图用） */
  get flying(): boolean {
    return this.bullets.length > 0;
  }

  /** 冒烟和性能检查用：镜头现在的缩放 */
  get zoom(): number {
    return this.cam.z;
  }

  /** 冒烟用：把镜头拖一下（模拟手指拖动） */
  nudge(dx: number, dy: number): void {
    this.manual = true;
    this.mode = 'free';
    this.goal = { x: this.cam.x + dx / this.cam.z, y: this.cam.y + dy / this.cam.z, z: this.cam.z };
    this.clampTo(this.goal);
    this.cam = { ...this.goal };
  }
}

/** 纸飞机：白纸折的三角，朝飞的方向 */
function paperPlane(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(k, k);
  ctx.fillStyle = '#fffdf6';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -8);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-10, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-5, 0);
  ctx.strokeStyle = '#7fa7d9';
  ctx.stroke();
  ctx.restore();
}

/** 包子（炮弹）：白面团、顶上一圈褶 */
function bun(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 1, 9, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const a of [-0.9, -0.3, 0.3, 0.9]) {
    ctx.moveTo(0, -5);
    ctx.lineTo(Math.sin(a) * 7, -5 + Math.cos(a) * 5);
  }
  ctx.stroke();
  ctx.fillStyle = '#f2c27c';
  ctx.beginPath();
  ctx.arc(0, -5.5, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

