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
import { fallMs, flightMs, paced, volleyPace } from '../net/anim.ts';
import { MAX_HP } from '../core/rules.ts';
import { buildTerrain } from '../core/maps.ts';
import { CELL, cloneTerrain, dig, MAT_MASK, solidAt } from '../core/terrain.ts';
import type { MapDef } from '../core/maps.ts';
import type { Char, Dir, Ev, Look, State, Team } from '../core/types.ts';
import type { WeaponId } from '../core/weapons.ts';
import { Backdrop } from './backdrop.ts';
import type { Burn } from './scorch.ts';
import { MAP_ART, MATERIALS } from './mapArt.ts';
import { crumbColor, materialAt } from './terrainPaint.ts';
import { arrow, drawChar, edgeTag, glow, nameTag, pin, type Expr, type Tag } from './chars.ts';
import { FONT, INK, METER, PAPER, RED } from './palette.ts';
import { TerrainArt } from './terrainArt.ts';
import { drawShell } from './weaponArt.ts';
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
  weapon: WeaponId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  out: boolean;
  facing: Dir;
  expr: Expr;
  exprUntil: number;
  rot: number;
  /** 顺着脚下地面的倾斜（弧度，画面用）：每帧往地面的坡度缓过去 */
  tilt: number;
  alpha: number;
}

/** 角色贴着地面倾斜（DESIGN.md 2.4，只是画面）：按脚下左右各 TILT_SPAN 的地表算坡度，最多歪 35° */
const TILT_SPAN = 12;
const TILT_MAX = (35 * Math.PI) / 180;

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
  color: string;
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

/** 屏幕上的一块地方（像素） */
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

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
  /** 好友房：角色名牌上挂的小签（掉线、电脑代打），按角色编号 */
  readonly badges = new Map<number, string>();
  /** 画角度盘（轮到真人瞄准时） */
  aim: Aim | null = null;
  /** 角度盘能不能拖 */
  aimEnabled = false;
  /** 飞在天上的炮弹（三岔是三颗）；plane 是纸飞机，vx、vy 用来摆纸飞机的朝向 */
  private bullets: { x: number; y: number; vx: number; vy: number; trail: number[]; plane: boolean }[] = [];
  /** 这一发是哪把武器的（炮弹长什么样） */
  private shell: WeaponId = 'steamer';
  private puffs: Puff[] = [];
  private crumbs: Crumb[] = [];
  private floaters: Floater[] = [];
  private anims: Anim[] = [];
  private art: TerrainArt;
  private back: Backdrop;
  private shake = 0;
  /** 这一帧出手的人的名牌占的地方（屏幕坐标），画角度盘时让开 */
  private actorTag: Box | null = null;
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

  /** burns：开局到现在挖过的坑（读档、中途进好友房时从头重放得来），用来把焦痕重建出来 */
  constructor(host: HTMLElement, map: MapDef, state: State, burns: readonly Burn[] = []) {
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
    this.back = new Backdrop(map.width, map.height, MAP_ART[map.id].theme);
    this.back.mount(this.world);
    this.art = new TerrainArt(cloneTerrain(state.terrain), renderRatio(), this.world);
    if (burns.length) this.art.resetScorch(buildTerrain(map), burns);
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

  /** 地形块烘焙、焦痕画了多少次、花了多久（npm run perf 读） */
  get terrainStats(): TerrainArt['stats'] {
    return this.art.stats;
  }

  /** 按状态摆好角色（读档、每一步动画放完以后对一遍）；地形副本要和状态一致时传 burns（开局到现在挖过的坑，焦痕照它重建） */
  sync(s: State, burns?: readonly Burn[]): void {
    this.chars = s.chars.map((c) => this.disp(c, this.chars.find((d) => d.id === c.id)));
    this.actor = s.phase === 'play' ? s.actor : -1;
    if (burns) {
      this.art.setTerrain(cloneTerrain(s.terrain));
      this.art.resetScorch(buildTerrain(this.map), burns);
      this.terrainVer++;
    }
  }

  private disp(c: Char, old?: Disp): Disp {
    return {
      id: c.id,
      name: c.name,
      team: c.team,
      look: c.look,
      weapon: c.weapon,
      x: c.x,
      y: c.y,
      hp: c.hp,
      maxHp: MAX_HP,
      out: c.out,
      facing: c.facing,
      expr: old?.expr ?? 'normal',
      exprUntil: old?.exprUntil ?? 0,
      rot: 0,
      tilt: old ? old.tilt : c.out ? 0 : this.slopeAt(c.x, c.y),
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
    const x = a.x + (facing * this.W * 0.14) / z;
    // 镜头里有比人高的地（夜市的雨棚、冰淇淋塔、浮岛）或站在高处的人，就把镜头往上挪，让它从顶栏下面露出来；人还得留在画面里（脚底离底栏至少 60）
    const half = this.viewH() / 2 / z;
    const x0 = x - this.W / 2 / z;
    const x1 = x + this.W / 2 / z;
    // 站在高处的人连名牌也要露出来（名牌顶在脚底往上约 76）
    let top = this.terrainTop(x0, x1);
    for (const c of this.chars) if (!c.out && c.x >= x0 && c.x <= x1) top = Math.min(top, c.y - 76);
    const y = Math.max(a.y + 60 - half, Math.min(a.y - 30, top - 24 + half));
    this.goal = { x, y, z };
    this.clampTo(this.goal);
  }

  /** 世界 x0..x1 这一段里最高的地面（世界 y）；地形变了才重算 */
  private topCache = { key: '', y: 0 };
  private terrainTop(x0: number, x1: number): number {
    const t = this.art.grid;
    const c0 = Math.max(0, Math.floor(x0 / 8) * 2);
    const c1 = Math.min(t.cols - 1, Math.ceil(x1 / 8) * 2);
    const key = `${c0}:${c1}:${this.terrainVer}`;
    if (this.topCache.key === key) return this.topCache.y;
    let best = t.rows;
    for (let c = c0; c <= c1; c += 2) {
      for (let r = 0; r < best; r++) {
        if (t.cells[r * t.cols + c]! & MAT_MASK) {
          best = r;
          break;
        }
      }
    }
    this.topCache = { key, y: best * CELL };
    return best * CELL;
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
    // 连发第 3 轮起放快，时长和房间的停顿（net/anim.ts 的 playMs）用同一套算法
    let shots = 0;
    let pace = 1;
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
          shots = 0;
          pace = 1;
          this.char(e.id).facing = e.facing;
          this.shell = this.char(e.id).weapon;
          this.aim = null;
          break;
        case 'shot':
          pace = volleyPace(shots++);
          await this.playShot(e.flights.map((f) => f.path), e.plane, pace);
          break;
        case 'warp':
          await this.playWarp(e.id, e.to);
          break;
        case 'boom':
          this.boom(e.x, e.y, e.r, e.w);
          await this.wait(paced(260, pace));
          break;
        case 'hurt': {
          const d = this.char(e.id);
          d.hp = e.hp;
          d.expr = 'hurt';
          d.exprUntil = performance.now() + 1100 / this.speed;
          this.floaters.push({ x: d.x, y: d.y - 50, text: `-${e.dmg}`, color: RED, t0: performance.now(), dur: 1100 / this.speed });
          await this.wait(paced(160, pace));
          break;
        }
        case 'fall':
          await this.playFall(e.id, e.x, e.from, e.to, pace);
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
          pace = 1;
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
  private async playShot(paths: readonly number[][], plane: boolean, pace: number): Promise<void> {
    const n = Math.max(0, ...paths.map((p) => p.length / 2));
    if (n === 0) return;
    if (this.mode === 'free') this.mode = 'follow';
    this.manual = false;
    const live = paths.map((path) => ({ path, b: { x: path[0]!, y: path[1]!, vx: 0, vy: 0, trail: [] as number[], plane }, last: 0 }));
    this.bullets = live.map((l) => l.b);
    await this.tween(flightMs(n, pace), (p) => {
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

  /** 地形副本改过几次（镜头算"最高的地"时用来作废缓存） */
  private terrainVer = 0;

  /**
   * 脚下地面的坡度（弧度，往右下为正）：脚底左右各 TILT_SPAN 处往上下找地表；两边都找不到（悬空、在掉）就是 0。
   * 只看画面那份地形，规则不管；瞄准角度仍按水平线算。
   */
  private slopeAt(x: number, y: number): number {
    const t = this.art.grid;
    const surface = (sx: number): number | null => {
      for (let yy = y - 16; yy <= y + 24; yy += 2) if (solidAt(t, sx, yy)) return yy;
      return null;
    };
    const l = surface(x - TILT_SPAN);
    const r = surface(x + TILT_SPAN);
    if (l === null && r === null) return 0;
    const a = Math.atan2((r ?? y) - (l ?? y), 2 * TILT_SPAN);
    return Math.max(-TILT_MAX, Math.min(TILT_MAX, a));
  }

  private boom(x: number, y: number, r: number, w: WeaponId): void {
    this.terrainVer++;
    // 碎屑的颜色照炸到的材质（炸之前在爆心附近找一格地）
    let mat = null;
    for (const [dx, dy] of [[0, 0], [0, r / 2], [-r / 2, 0], [r / 2, 0], [0, -r / 2]] as const) mat ??= materialAt(this.art.grid, x + dx, y + dy, MATERIALS);
    this.art.touch(dig(this.art.grid, x, y, r, w));
    this.art.burn({ x, y, r, w });
    this.puff(x, y, r);
    const now = performance.now();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 160;
      const color = mat ? crumbColor(mat, i) : '#eba650';
      this.crumbs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, rot: Math.random() * 6, t0: now, dur: (700 + Math.random() * 300) / this.speed, color });
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

  private async playFall(id: number, x: number, from: number, to: number, pace = 1): Promise<void> {
    const d = this.char(id);
    d.x = x;
    const gone = to > this.map.height;
    const h = Math.max(1, to - from);
    const dur = fallMs(to - from, pace);
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
        if (!d.rot && !d.out) {
          d.tilt += (this.slopeAt(d.x, d.y) - d.tilt) * (1 - Math.exp(-dt * 0.012));
          ctx.rotate(d.tilt);
        }
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
    // 炮弹（每把武器一个样子，view/weaponArt.ts），后面拖一串小点
    for (const b of this.bullets) {
      ctx.fillStyle = 'rgba(70,41,26,0.35)';
      for (let i = 0; i < b.trail.length; i += 2) {
        ctx.beginPath();
        ctx.arc(b.trail[i]!, b.trail[i + 1]!, 1.5 + (i / b.trail.length) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.plane) paperPlane(ctx, b.x, b.y, Math.atan2(b.vy, b.vx), Math.max(1, 0.8 / z));
      else drawShell(ctx, this.shell, b.x, b.y, Math.max(1, 0.8 / z), b.vx, b.vy, now);
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
      ctx.fillStyle = c.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.fillRect(-3.5, -3, 7, 6);
      ctx.strokeRect(-3.5, -3, 7, 6);
      ctx.restore();
    }
    // ---------- 屏幕坐标：名牌、图钉、角度盘、飘字、画面外小牌 ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const offscreen: Disp[] = [];
    // 屏幕里的角色连同名牌（和头上的箭头、小签）占的地方：画面外小牌要避开它们
    const keepOut: Box[] = [];
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
      if (pinMode) keepOut.push({ x0: sx - 22, x1: sx + 22, y0: sy - (cur ? 76 : 52), y1: sy + 6 });
      else keepOut.push({ x0: sx - Math.max(42, 30 * z), x1: sx + Math.max(42, 30 * z), y0: sy - 48 * z - 10 - 30 - (cur ? 38 : tag.badge ? 15 : 2), y1: sy + 6 });
      if (pinMode) {
        ctx.globalAlpha = d.alpha;
        pin(ctx, tag, sx, sy, cur, now);
        ctx.globalAlpha = 1;
        if (cur) arrow(ctx, sx, sy - 60, now);
      } else if (!d.rot) {
        nameTag(ctx, tag, sx, sy - 48 * z - 10, cur);
        if (cur) arrow(ctx, sx, sy - 48 * z - 46, now);
      }
      // 出手的人的名牌（连同头上的箭头）：角度盘的度数牌要让开它
      if (d.id === this.actor) this.actorTag = pinMode ? { x0: sx - 22, x1: sx + 22, y0: sy - 76, y1: sy + 6 } : { x0: sx - 41, x1: sx + 43, y0: sy - 48 * z - 10 - 30 - 38, y1: sy - 48 * z - 10 + 4 };
    }
    if (this.aim && !this.bullets.length) this.drawDial(ctx);
    this.actorTag = null;
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
    this.drawEdgeTags(ctx, offscreen, keepOut);
  }

  private tagOf(d: Disp): Tag {
    const badge = this.badges.get(d.id);
    return { name: d.name, team: d.team, hp: d.hp, maxHp: d.maxHp, out: d.out, ...(badge ? { badge } : {}) };
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
    // 度数牌：默认在瞄准线外头；压到出手的人的名牌上时顺着瞄准线往外挪，还压着就摆到名牌朝外的那一侧
    ctx.font = `900 17px ${FONT}`;
    const text = `${angle}°`;
    const w = ctx.measureText(text).width + 14;
    let lx = x + Math.cos(a) * (R + 44);
    let ly = y + Math.sin(a) * (R + 30) - 4;
    const tag = this.actorTag;
    const over = (cx: number, cy: number): boolean => !!tag && cx - w / 2 - 4 < tag.x1 && tag.x0 < cx + w / 2 + 4 && cy - 17 < tag.y1 && tag.y0 < cy + 17;
    if (tag && over(lx, ly)) {
      let ok = false;
      for (let k = 60; k <= 108 && !ok; k += 16) {
        const cx = x + Math.cos(a) * (R + k);
        const cy = y + Math.sin(a) * (R + k - 14) - 4;
        if (!over(cx, cy)) [lx, ly, ok] = [cx, cy, true];
      }
      if (!ok) {
        lx = facing === 1 ? tag.x1 + w / 2 + 6 : tag.x0 - w / 2 - 6;
        ly = (tag.y0 + tag.y1) / 2 + 10;
      }
    }
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
  private drawEdgeTags(ctx: CanvasRenderingContext2D, list: Disp[], keepOut: readonly Box[] = []): void {
    const viewer = this.chars.find((c) => c.id === this.viewer && !c.out);
    const top = this.insetTop + 26;
    const bottom = this.H - this.insetBottom - 26;
    const tags = list.map((d) => {
      const [sx, sy] = this.toScreen(d.x, d.y - 20);
      const dirX = sx < 0 ? -1 : sx > this.W ? 1 : 0;
      const dirY = dirX ? 0 : sy < top ? -1 : 1;
      return { d, x: Math.min(this.W - 58, Math.max(58, sx)), y: Math.min(bottom, Math.max(top, sy)), dirX, dirY };
    });
    // 同一条边上的小牌按位置排好、挨个往后让（3v3 时一边能有五张），挤不下就在两栏之间压紧，不压到顶栏、底栏上
    const spread = (group: typeof tags, key: 'x' | 'y', gap: number, lo: number, hi: number): void => {
      group.sort((a, b) => a[key] - b[key]);
      for (let k = 1; k < group.length; k++) group[k]![key] = Math.max(group[k]![key], group[k - 1]![key] + gap);
      const over = group.length ? group[group.length - 1]![key] - hi : 0;
      if (over > 0) for (const t of group) t[key] -= over;
      if (group.length && group[0]![key] < lo) {
        const step = group.length > 1 ? Math.max(0, (hi - lo) / (group.length - 1)) : 0;
        group.forEach((t, k) => (t[key] = lo + k * Math.min(gap, step)));
      }
    };
    for (const side of [-1, 1]) {
      spread(tags.filter((t) => t.dirX === side), 'y', 40, top, bottom);
      spread(tags.filter((t) => t.dirY === side), 'x', 98, 58, this.W - 58);
    }
    // 压到屏幕里的角色、名牌上的：沿着边挪到最近的空处（左右边上下挪，上下边左右挪），也不压别的小牌
    const box = (t: (typeof tags)[number]): Box => ({ x0: t.x - 56, x1: t.x + 56, y0: t.y - 26, y1: t.y + 26 });
    const hits = (b: Box, others: readonly Box[]): boolean => others.some((o) => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1);
    const placed: Box[] = [];
    for (const t of tags) {
      const key = t.dirX ? 'y' : 'x';
      const [lo, hi] = key === 'y' ? [top, bottom] : [58, this.W - 58];
      const ok = (v: number): boolean => v >= lo && v <= hi && !hits(box({ ...t, [key]: v }), [...keepOut, ...placed]);
      if (!ok(t[key])) {
        const at = t[key];
        const cands = [...keepOut, ...placed].flatMap((o) => (key === 'y' ? [o.y0 - 27, o.y1 + 27] : [o.x0 - 57, o.x1 + 57]));
        const best = cands.filter(ok).sort((p, q) => Math.abs(p - at) - Math.abs(q - at))[0];
        if (best !== undefined) t[key] = best;
      }
      placed.push(box(t));
    }
    for (const { d, x, y, dirX, dirY } of tags) {
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


