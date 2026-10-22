/**
 * 好友房的对局页（DESIGN.md 5.6）：和单机一样的战场、顶栏、底栏，多了这些：
 * - 局面按房间下发的视图重放（net/replay.ts：开局、每一回合的 Rec 和风），页面没有种子；
 * - 轮到我：爬、选道具、调角度和力度都只在本机预演（在自己那份局面上算），按"发射"才把这一回合打成一条 act 发出去；
 *   房间结算后所有人（包括我）按服务器的结果放动画（我的爬动已经放过，只放发射以后的）；
 * - 轮到别人：顶上写"某某正在瞄准…"、回合倒计时；他的那一手到了，先转角度盘、蓄力，再放动画（时长和房间的停顿 net/anim.ts 对得上）；
 * - 名牌上挂"掉线""电脑代打"（kit 的座位信息）；落后好几手（切后台回来、重连）就不放动画直接跳过去。
 * 页面上的 __danli 和单机同名（冒烟、截图用）：state 是我看到的局面（轮到我时是预演的那份）。
 */
import type { RoomInfo } from 'arcade-kit/protocol';
import { planLite } from './ai/online.ts';
import { FORK_SPREAD as FORK, loadoutCost, PLAIN, type Loadout } from './core/items.ts';
import { apply, loadoutBlocked, loadoutOf, MAX_HP, mapOf, roundLimit, stepTarget } from './core/rules.ts';
import type { Action, Dir, Ev, State, Team } from './core/types.ts';
import { weapon } from './core/weapons.ts';
import { AIM_MS, CHARGE_MS as PLAY_CHARGE_MS } from './net/anim.ts';
import { burnsOf, type Burn } from './view/scorch.ts';
import { recActions, startOf, stepRec, type Rec } from './net/replay.ts';
import { turnAct, type GameView, type NetAction, type RoomView } from './net/rules.ts';
import { statsFrom, type GameStats } from './stats.ts';
import { confirmBox } from './view/dom.ts';
import { Hud } from './view/hud.ts';
import { addItem, itemViews, pickedList, removeItem } from './view/itemBar.ts';
import { TEAM_NAME } from './view/palette.ts';
import { Scene } from './view/scene.ts';
import { sound } from './view/sound.ts';
import type { Size } from './view/viewport.ts';

export interface NetGameEnv {
  app: HTMLElement;
  /** 动画倍速（冒烟 ?turbo） */
  speed: number;
  muted(): boolean;
  toggleMute(): boolean;
  homeText: string;
  homeUrl: string;
  /** 确认过了，离开房间回大厅 */
  leave(): void;
  /** 发一条 act */
  send(a: NetAction): void;
  /** kit 座位上的昵称 */
  nameOf(seat: number): string;
  /** 房间的钟（毫秒）：按房间消息里带的 now 校过 */
  serverNow(): number;
  /** 这一局放完了（打完了、最后一手的动画也放完了） */
  over(): void;
}

/** 落后这么多手就不放动画、直接跳过去 */
const CATCH_UP = 3;

/** 开局设置换上真人的昵称（房间只给占位的名字） */
export function namedGame(g: GameView, nameOf: (seat: number) => string): GameView {
  return { ...g, setup: { ...g.setup, players: g.setup.players.map((p, i) => (g.owners[i] === null || g.owners[i] === undefined ? p : { ...p, name: nameOf(g.owners[i]!).slice(0, 12) })) } };
}

/** 按视图从头重放：开局、每一回合；burns 收集挖过的坑（焦痕照它重建） */
export function replayGame(g: GameView, burns?: Burn[]): State {
  let s = startOf(g);
  for (const r of g.log) {
    const out = stepRec(s, r, r.w);
    if ('error' in out) break;
    s = out.state;
    burns?.push(...burnsOf(out.events));
  }
  return s;
}

/** 结算页的统计：按视图重放一遍 */
export function gameStats(g: GameView): GameStats {
  return statsFrom(
    startOf(g),
    g.log.map((r: Rec) => ({ actions: recActions(r), wind: r.w })),
  );
}

export class NetGame {
  readonly no: number;
  private env: NetGameEnv;
  private game: GameView;
  private scene: Scene;
  private hud: Hud;
  /** 房间认定的局面（放完的那些回合） */
  private base: State;
  /** 已经排进来的回合数、已经放完的回合数 */
  private queued: number;
  private pending: Rec[] = [];
  private playing = false;
  /** 这一局挖过的坑（按顺序），跳到最新的局面、整局重放兜底时用来重建焦痕 */
  private burns: Burn[] = [];
  private room: RoomInfo;
  private seat: number | null;
  /** 我操控的角色（旁观是 -1） */
  private mine: number;
  /** 轮到我时本机预演的局面、爬过的步子；发出去以后 sent 是爬动序列（等房间回结果） */
  private local: State | null = null;
  private moves: Dir[] = [];
  private sent: string | null = null;
  private loadout: Loadout = PLAIN;
  private angle = 45;
  private facing: Dir = 1;
  private queue: Promise<void> = Promise.resolve();
  private hp = new Map<number, number>();
  private out = new Set<number>();
  private alive = true;
  private finished = false;
  /** 已经摆好的是第几次出手（同一回合的小变化不重摆） */
  private shown = 0;
  private timer = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  private keyUp: (e: KeyboardEvent) => void;

  constructor(env: NetGameEnv, view: RoomView, room: RoomInfo, seat: number | null) {
    this.env = env;
    this.game = namedGame(view.game!, env.nameOf);
    this.no = this.game.no;
    this.room = room;
    this.seat = seat;
    this.base = replayGame(this.game, this.burns);
    this.queued = this.game.log.length;
    this.mine = seat === null ? -1 : this.game.owners.indexOf(seat);
    const s = this.base;
    this.hud = new Hud(env.app, {
      step: (dir) => this.step(dir),
      fire: (power) => void this.fire(power),
      item: (key) => this.setItems(addItem(this.loadout, key)),
      unpick: (key) => this.setItems(removeItem(this.loadout, key)),
      clearItems: () => this.setItems(PLAIN),
      view: () => this.scene.toggleOverview(),
      mute: () => this.hud.setMuted(env.toggleMute()),
      fast: () => {},
      skip: () => {},
      charge: (p) => sound.charge(p),
    });
    this.hud.setMuted(env.muted());
    this.scene = new Scene(env.app, mapOf(s), s, this.burns);
    this.scene.speed = env.speed;
    this.scene.viewer = this.mine;
    this.scene.onAim = (angle, facing) => this.setAim(angle, facing);
    this.scene.onCamera = (mode) => this.hud.setView(mode === 'overview');
    this.hud.home.href = env.homeUrl;
    this.hud.home.querySelector('span')!.textContent = env.homeText;
    this.hud.home.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.base.phase === 'over' || this.mine < 0) return env.leave();
      void confirmBox(env.app, `这一局还没打完，你走了由电脑替你接着打。现在回${env.homeText}吗？`, `回${env.homeText}`, '接着打').then((ok) => ok && env.leave());
    });
    for (const c of s.chars) {
      this.hp.set(c.id, c.hp);
      if (c.out) this.out.add(c.id);
    }
    this.keyHandler = (e) => this.onKey(e, true);
    this.keyUp = (e) => this.onKey(e, false);
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('keyup', this.keyUp);
    this.paintTeams();
    this.badges();
    // 冒烟和截图用的把手（只读）
    (window as unknown as { __danli?: unknown }).__danli = {
      state: () => this.local ?? this.base,
      suggest: () => planLite(this.local ?? this.base),
      actorScreen: () => this.scene.actorScreen(),
      aim: () => this.scene.aim,
      zoom: () => this.scene.zoom,
      busy: () => this.playing || this.sent !== null,
      flying: () => this.scene.flying,
      preview: (a: Action) => apply(this.local ?? this.base, a),
      net: () => ({ no: this.no, log: this.queued, applied: this.queued - this.pending.length - (this.playing ? 1 : 0), seat: this.seat, mine: this.mine, sent: this.sent }),
    };
    this.timer = window.setInterval(() => this.tick(), 250);
    this.refresh();
  }

  destroy(): void {
    this.alive = false;
    window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('keyup', this.keyUp);
    sound.charge(null);
    this.scene.destroy();
    this.hud.root.remove();
  }

  resize(s: Size): void {
    this.hud.layout(s);
    const ins = this.hud.insets();
    this.scene.insetTop = ins.top;
    this.scene.insetBottom = ins.bottom;
    this.scene.resize(s);
  }

  /** 房间发来新的视图（同一局） */
  update(view: RoomView, room: RoomInfo, seat: number | null): void {
    this.room = room;
    this.seat = seat;
    const g = view.game!;
    for (const r of g.log.slice(this.queued)) this.pending.push(r);
    this.queued = Math.max(this.queued, g.log.length);
    this.game = { ...this.game, log: g.log, anim: g.anim };
    this.badges();
    void this.pump();
    if (!this.playing) this.refresh();
  }

  /** 我的那一手被房间拒了（局面变了、网断了重发晚了）：收回预演，这一手还是我的就重来 */
  rejected(code: string): void {
    if (this.sent === null) return;
    this.sent = null;
    this.resetLocal();
    this.hud.banner('这一手没发出去', code === 'stale' || code === 'not_your_turn' ? '局面变了，再瞄一次' : '再试一次');
    window.setTimeout(() => this.hud.banner(null), 1600);
    this.refresh();
  }

  get stats(): GameStats {
    return gameStats(this.game);
  }

  get meId(): number | null {
    return this.mine >= 0 ? this.mine : null;
  }

  // ---------- 放房间的结果 ----------

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.alive && this.pending.length) {
        const rec = this.pending.shift()!;
        if (this.pending.length >= CATCH_UP - 1) this.jump(rec);
        else await this.play(rec);
      }
    } finally {
      this.playing = false;
    }
    if (!this.alive) return;
    this.refresh();
  }

  /** 落后太多：不放动画，直接把局面跳过去 */
  private jump(rec: Rec): void {
    const out = stepRec(this.base, rec, rec.w);
    if ('error' in out) return;
    this.base = out.state;
    this.burns.push(...burnsOf(out.events));
    this.local = null;
    this.sent = null;
    this.moves = [];
    for (const c of this.base.chars) {
      this.hp.set(c.id, c.hp);
      if (c.out) this.out.add(c.id);
    }
    this.scene.sync(this.base, this.burns);
    this.paintTeams();
  }

  private async play(rec: Rec): Promise<void> {
    const actor = this.base.chars[this.base.actor]!;
    let from = this.base;
    let r: Omit<Rec, 'w'> = rec;
    if (actor.id === this.mine && this.sent !== null && this.local && (rec.m ?? '') === this.sent) {
      // 我自己的那一手：爬动已经在本机放过了，从预演的局面接着放发射
      from = this.local;
      r = { ...rec, m: '' };
    } else if (this.local) {
      // 预演作废（超时弃权了、房间结果和预演不一样）：先回到房间的局面
      this.scene.sync(this.base);
    }
    this.local = null;
    this.sent = null;
    this.moves = [];
    this.hud.setEnabled(false);
    this.scene.aimEnabled = false;
    this.hud.setClock(null);
    const out = stepRec(from, r, rec.w);
    if ('error' in out) {
      // 不该发生（房间验过）：整局重放兜底
      this.burns = [];
      this.base = replayGame({ ...this.game, log: this.game.log.slice(0, this.queued - this.pending.length) }, this.burns);
      this.scene.sync(this.base, this.burns);
      return;
    }
    this.burns.push(...burnsOf(out.events));
    const at = out.events.findIndex((e) => e.t !== 'move');
    const moves = at < 0 ? out.events : out.events.slice(0, at);
    const rest = at < 0 ? [] : out.events.slice(at);
    if (moves.length) await this.scene.play(moves, this.onEvent);
    if (!this.alive) return;
    if (!rec.pass && from === this.base) await this.present(actor.id, rec);
    if (!this.alive) return;
    this.hud.think(null);
    await this.scene.play(rest, this.onEvent);
    if (!this.alive) return;
    this.base = out.state;
    this.scene.sync(this.base);
  }

  /** 别人那一手发射前：转角度盘、蓄力（和单机电脑出手一样放给人看；时长不超过房间按 net/anim.ts 停的） */
  private async present(id: number, rec: Rec): Promise<void> {
    const c = this.base.chars[id]!;
    const w = weapon(c.weapon);
    const facing = rec.f ?? c.facing;
    // 按服务器的结果亮出他用了哪些道具
    this.loadout = loadoutOf(rec);
    this.paintItems(this.base);
    this.scene.setFacing(id, facing);
    const from = Math.min(w.maxAngle, Math.max(w.minAngle, c.angle));
    this.scene.aim = { angle: from, facing, min: w.minAngle, max: w.maxAngle, spread: this.loadout.fork ? FORK : 0 };
    await this.scene.wait(AIM_MS - 400);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await this.scene.wait(30);
      if (!this.alive) return;
      this.scene.aim = { ...this.scene.aim!, angle: Math.round(from + (((rec.a ?? from) - from) * i) / steps) };
    }
    const power = rec.p ?? 50;
    const dur = (power / 100) * PLAY_CHARGE_MS;
    const steps2 = Math.max(1, Math.round(dur / 50));
    for (let i = 1; i <= steps2; i++) {
      await this.scene.wait(dur / steps2);
      if (!this.alive) return;
      this.hud.setPower((power * i) / steps2, c.power);
    }
    this.loadout = PLAIN;
  }

  /** 事件放到时：HUD 跟着变，配上音效 */
  private onEvent = (e: Ev): void => {
    const s = this.base;
    if (e.t === 'move') sound.play('crawl');
    else if (e.t === 'shot') sound.play(e.plane ? 'plane' : 'shot');
    else if (e.t === 'boom') sound.play('boom', e.r);
    else if (e.t === 'warp') sound.play('warp');
    else if (e.t === 'over') {
      const me = this.mine >= 0 ? s.chars[this.mine] : null;
      sound.play(e.winner === null || !me ? 'draw' : e.winner === me.team ? 'win' : 'lose');
    } else if (e.t === 'pass') {
      this.hud.banner(`${s.chars[e.id]!.name} 弃权`, '这一手没打');
      window.setTimeout(() => this.hud.banner(null), 800 / this.env.speed);
    }
    if (e.t === 'hurt') {
      sound.play('hit');
      this.hp.set(e.id, e.hp);
      this.paintTeams();
    } else if (e.t === 'fall' && e.to > mapOf(s).height) {
      sound.play('fall');
      this.outBanner(e.id, '掉出画本啦！');
    } else if (e.t === 'out') {
      this.out.add(e.id);
      this.paintTeams();
      if (e.why === 'hp') this.outBanner(e.id, '血量掉光，出局！');
    }
  };

  private bannerTimer = 0;

  private outBanner(id: number, title: string): void {
    const s = this.base;
    const c = s.chars[id]!;
    const left = s.chars.filter((x) => x.team === c.team && x.id !== id && !this.out.has(x.id)).length;
    this.hud.banner(title, `${c.name} 出局 · ${TEAM_NAME[c.team]}还剩 ${left} 只`);
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.hud.banner(null), 2200 / this.env.speed);
  }

  private paintTeams(): void {
    const s = this.base;
    const hp: [number, number] = [0, 0];
    const max: [number, number] = [0, 0];
    for (const c of s.chars) {
      max[c.team] += MAX_HP;
      if (!this.out.has(c.id)) hp[c.team] += this.hp.get(c.id) ?? 0;
    }
    const dead = (t: Team): boolean => s.chars.every((c) => c.team !== t || this.out.has(c.id));
    this.hud.setTeams(hp, max, [dead(0), dead(1)]);
  }

  /** 名牌上的小签：掉线、电脑代打（kit 的座位信息） */
  private badges(): void {
    this.scene.badges.clear();
    this.game.owners.forEach((seat, id) => {
      if (seat === null) return;
      const k = this.room.seats[seat];
      if (!k) return;
      if (k.kind === 'ai' || k.auto) this.scene.badges.set(id, '电脑代打');
      else if (k.away) this.scene.badges.set(id, '掉线');
    });
  }

  // ---------- 该谁出手 ----------

  /** 动画都放完了：打完了交给结算页；轮到我就放开底栏；轮到别人写"某某正在瞄准…" */
  private refresh(): void {
    if (!this.alive || this.playing) return;
    const s = this.base;
    if (s.phase === 'over') {
      if (this.finished) return;
      this.finished = true;
      this.scene.sync(s);
      this.hud.setEnabled(false);
      this.hud.setClock(null);
      this.hud.think(null);
      this.scene.aim = null;
      this.hud.setOver(s.round);
      window.setTimeout(() => this.alive && this.env.over(), 900 / this.env.speed);
      return;
    }
    const a = s.chars[s.actor]!;
    const owner = this.game.owners[a.id];
    // 新的一回合只摆一次（别人掉线、回来这些小变化不打断镜头和我正在预演的）
    if (this.shown !== s.turn) {
      this.shown = s.turn;
      const w = weapon(a.weapon);
      this.scene.sync(s);
      this.scene.newTurn(a.id);
      this.hud.setTurn(a.name, a.team, s.round, roundLimit(s.setup), a.id === this.mine);
      this.hud.setWeapon(w.id, w.name, w.minAngle, w.maxAngle);
      this.hud.setWind(s.wind);
      this.hud.lastPower = a.power;
      this.hud.setPower(a.power ?? 0, a.power);
      this.loadout = PLAIN;
      this.paintItems(s);
    }
    const myTurn = a.id === this.mine && !this.room.pause && this.room.turn?.seat === this.seat && !this.game.anim;
    if (myTurn) {
      this.hud.think(null);
      if (this.sent === null && !this.local) this.beginMine();
      return;
    }
    if (this.local) this.resetLocal();
    this.hud.setEnabled(false);
    this.scene.aimEnabled = false;
    this.scene.aim = null;
    // 房间还在等大家放完上一手（停顿），或者等人出手
    this.hud.think(owner === null ? `${a.name}在想…` : a.id === this.mine ? '马上轮到你…' : `${a.name}正在瞄准…`);
  }

  private beginMine(): void {
    const s = this.base;
    const a = s.chars[s.actor]!;
    const w = weapon(a.weapon);
    this.local = s;
    this.moves = [];
    this.loadout = PLAIN;
    this.angle = Math.min(w.maxAngle, Math.max(w.minAngle, a.angle));
    this.facing = a.facing;
    this.scene.aim = { angle: this.angle, facing: this.facing, min: w.minAngle, max: w.maxAngle };
    this.scene.aimEnabled = true;
    sound.play('turn');
    this.hud.setEnabled(true);
    this.hud.setPower(a.power ?? 0, a.power);
    this.paintItems(s);
  }

  private resetLocal(): void {
    this.local = null;
    this.moves = [];
    this.loadout = PLAIN;
    this.scene.sync(this.base);
  }

  /** 每 250 毫秒：回合倒计时（只在等真人时有） */
  private tick(): void {
    const t = this.room.turn;
    const s = this.base;
    if (!t || t.deadline === null || this.playing || s.phase !== 'play' || this.game.owners[s.actor] === null) {
      this.hud.setClock(null);
      return;
    }
    this.hud.setClock((t.deadline - this.env.serverNow()) / 1000, t.seat === this.seat && s.actor === this.mine);
  }

  // ---------- 我的操作（只在本机预演） ----------

  private canAct(): boolean {
    return !!this.local && this.sent === null && !this.playing;
  }

  private step(dir: Dir): boolean {
    if (!this.canAct()) return false;
    const s = this.local!;
    // 选了的道具要花的体力先留着：爬不能把它吃掉
    const to = stepTarget(s.terrain, mapOf(s).width, s.chars[s.actor]!, dir);
    if (!('error' in to) && s.stamina - to.cost < loadoutCost(this.loadout)) return false;
    if (this.moves.length >= 50) return false;
    const r = apply(s, { t: 'move', dir });
    if (!r.ok) return false;
    this.local = r.state;
    this.moves.push(dir);
    if (this.facing !== dir) {
      this.facing = dir;
      this.angle = this.scene.aim?.angle ?? this.angle;
      if (this.scene.aim) this.scene.aim = { ...this.scene.aim, facing: dir };
    }
    this.queue = this.queue.then(() => this.scene.play(r.events, this.onEvent));
    this.paintItems(this.local);
    return true;
  }

  /** 换一组道具（点道具加一个、"已选"那一行减一个、清空）：组合不合法、体力不够就不换 */
  private setItems(next: Loadout): void {
    if (!this.canAct()) return;
    const s = this.local!;
    if (loadoutBlocked(s, s.chars[s.actor]!, next)) return;
    sound.play('item');
    this.loadout = next;
    if (this.scene.aim) this.scene.aim = { ...this.scene.aim, spread: next.fork ? FORK : 0 };
    this.paintItems(s);
  }

  private paintItems(s: State): void {
    const me = s.chars[s.actor]!;
    this.hud.setItems(itemViews(s, this.loadout));
    this.hud.setPicked(pickedList(this.loadout));
    this.hud.setStamina(s.stamina, me.id === this.mine && !!this.local, loadoutCost(this.loadout));
  }

  private setAim(angle: number, facing: Dir): void {
    if (!this.canAct()) return;
    if (facing !== this.facing) {
      this.facing = facing;
      this.scene.setFacing(this.local!.actor, facing);
    }
    this.angle = angle;
    if (this.scene.aim) this.scene.aim = { ...this.scene.aim, angle, facing };
  }

  /** 按"发射"：这一回合整个打包成一条 act 发出去，等房间的结果再放 */
  private async fire(power: number): Promise<void> {
    if (!this.canAct()) return;
    this.hud.setEnabled(false);
    this.scene.aimEnabled = false;
    await this.queue;
    if (!this.alive || !this.local) return;
    const m = this.moves.map((d) => (d < 0 ? 'L' : 'R')).join('');
    const l = this.loadout;
    this.sent = m;
    this.hud.think('发出去了…');
    this.env.send(turnAct(this.moves, this.angle, power, this.facing, l));
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (document.querySelector('.dl-mask')) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (down) this.hud.startCharge(-2);
      else this.hud.releaseCharge(-2);
      return;
    }
    if (!down) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.step(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const aim = this.scene.aim;
      if (!aim || !this.canAct()) return;
      this.setAim(Math.min(aim.max, Math.max(aim.min, this.angle + (e.key === 'ArrowUp' ? 1 : -1))), this.facing);
    }
  }
}
