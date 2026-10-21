/**
 * 页面入口：选桌页 → 准备房间 → 对局 → 结算（再来一局、回房间、大厅）。规则在 src/core，电脑在 src/ai，单机存档在 solo.ts，
 * 房间设置和 danli.prefs 在 room.ts，画面在 src/view，音效在 view/sound.ts；这里只把它们连起来。
 * 回大厅（AGENTS.md 第 2 节第 6 条）：左上角常驻"大厅"，指向平台首页 /；对局中离开先确认一次（单机存着下次接着打）。
 * 独立部署（kit 的 detectPlatform 说没有平台）时"大厅"改成回游戏首页。还没有接平台的云存档。
 */
import { detectPlatform } from 'arcade-kit/client';
import { reportErrors } from 'arcade-kit/report';
import { plan, planActions, type Plan } from './ai/index.ts';
import { BOOST_COST, FORK_SPREAD as FORK, loadoutCost, MODES, PLAIN, SPECIALS, type Boost, type Loadout, type ShotMode } from './core/items.ts';
import { MAP_IDS, type MapId } from './core/maps.ts';
import { apply, loadoutBlocked, MAX_HP, mapOf, roundLimit, stepTarget } from './core/rules.ts';
import type { Action, Dir, Ev, Setup, Team } from './core/types.ts';
import { weapon } from './core/weapons.ts';
import { loadPrefs, roomSetup, savePrefs, type RoomConfig } from './room.ts';
import { clearSolo, peekSolo, Solo } from './solo.ts';
import { computeStats } from './stats.ts';
import { confirmBox } from './view/dom.ts';
import { CHARGE_MS, Hud, type ItemKey, type ItemView } from './view/hud.ts';
import { renderLobby } from './view/lobby.ts';
import { TEAM_NAME } from './view/palette.ts';
import { renderResult } from './view/result.ts';
import { renderRoom } from './view/room.ts';
import { Scene } from './view/scene.ts';
import type { Stage } from './view/stage.ts';
import { sound } from './view/sound.ts';
import { watchViewport, type Size } from './view/viewport.ts';
import './view/style.css';
import './view/pages.css';

// 页面里没人接住的报错发给平台（kit 0.22，docs/platform-backend.md 第 16 节）：只带报错、调用栈、路径、游戏和版本；
// 单独部署没有平台时发不出去，吞掉，不影响玩
reportErrors({ game: 'danli', version: __DANLI_VERSION__ });

const query = new URLSearchParams(location.search);
/** 冒烟用：?turbo 让动画和电脑几乎不停顿 */
const TURBO = query.has('turbo');
const SPEED = TURBO ? 8 : 1;

const app = document.getElementById('app')!;
app.className = 'dl-app';
// 不支持 overflow: clip 的老浏览器：万一被滚走了（点按钮、键盘焦点会把按钮滚进视野），立刻滚回来
app.addEventListener('scroll', () => {
  if (app.scrollTop || app.scrollLeft) app.scrollTo(0, 0);
});

let myName = '我';
let homeUrl = '/';
let homeText = '大厅';

async function loadMe(): Promise<void> {
  const p = await detectPlatform();
  if (p.platform === true) {
    const u = p.user as { displayName?: string } | null;
    if (u?.displayName) myName = u.displayName.slice(0, 8);
    return;
  }
  if (p.platform !== false) return;
  homeUrl = './';
  homeText = '首页';
  const name = query.get('name')?.trim().slice(0, 8);
  if (name) myName = name;
}

/** localStorage 拿不到（隐私模式、被禁）时当没有 */
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// 设置（danli.prefs）：静音和准备房间上次的选择
const prefs = loadPrefs(store());
sound.muted = prefs.muted;
sound.install();

function toggleMute(): boolean {
  prefs.muted = !prefs.muted;
  sound.setMuted(prefs.muted);
  savePrefs(store(), prefs);
  return prefs.muted;
}

// 按钮的"咔哒"（道具、发射、爬有自己的声音）
app.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button, a.dl-home');
  if (b && !b.matches('.dl-item, .dl-fire, .dl-climb-btn')) sound.play('button');
});

/** "随机"地图：页面里抽（规则核心不管），抽到的写进开局设置，存档里就是定下来的那张 */
function pickMap(ids: readonly MapId[]): MapId {
  return ids[Math.floor(Math.random() * ids.length)]!;
}

let size: Size = { w: 0, h: 0, port: false };
let game: Game | null = null;
/** 选桌页、准备房间、结算（同一时间只有一页，或者一局） */
let page: Stage | null = null;
const viewport = watchViewport(app, (s) => {
  size = s;
  game?.resize(s);
  page?.resize(s);
});

/** 换一页：收掉现在的对局和页面 */
function clear(): void {
  game?.destroy();
  game = null;
  page?.destroy();
  page = null;
  app.replaceChildren();
}

function show(p: Stage): void {
  page = p;
  p.resize(viewport().w ? viewport() : size);
}

// ---------- 选桌页 ----------

function lobby(): void {
  clear();
  show(renderLobby(app, {
    homeText,
    homeUrl,
    resume: peekSolo(),
    muted: prefs.muted,
    onRoom: () => room(),
    onResume: () => {
      const s = Solo.load();
      if (s) start(s);
      else lobby();
    },
    onMute: toggleMute,
  }));
}

// ---------- 准备房间 ----------

function room(): void {
  clear();
  show(renderRoom(app, {
    myName,
    homeText,
    homeUrl,
    cfg: prefs.room,
    muted: prefs.muted,
    onChange: (cfg: RoomConfig) => {
      prefs.room = cfg;
      savePrefs(store(), prefs);
    },
    onMute: toggleMute,
    onStart: (cfg: RoomConfig) => {
      prefs.room = cfg;
      savePrefs(store(), prefs);
      clearSolo();
      start(Solo.fresh(roomSetup(cfg, myName, pickMap)));
    },
  }));
}

// ---------- 结算 ----------

function result(solo: Solo): void {
  const save = solo.save;
  clear();
  show(renderResult(app, {
    stats: computeStats(save.key, save.setup, save.log),
    homeText,
    homeUrl,
    onAgain: () => start(Solo.fresh(again(save.setup))),
    onRoom: () => room(),
    onHome: goHome,
  }));
}

/** "再来一局"：同样的座位和武器；房间里选的是"随机"地图就再抽一张 */
function again(setup: Setup): Setup {
  return prefs.room.map === 'random' ? { ...setup, map: pickMap(MAP_IDS) } : setup;
}

function start(solo: Solo): void {
  clear();
  game = new Game(solo);
}

function goHome(): void {
  location.href = homeUrl;
}

// ---------- 对局 ----------

class Game {
  private scene: Scene;
  private hud: Hud;
  private busy = false;
  private queue: Promise<void> = Promise.resolve();
  private angle = 45;
  /** 这回合选了的道具（发射时才扣体力和次数） */
  private loadout: Loadout = PLAIN;
  private facing: Dir = 1;
  private hp = new Map<number, number>();
  private out = new Set<number>();
  private alive = true;
  private finished = false;
  /** 快进（动画 ×4）、正在跳到结果 */
  private fast = false;
  private skipping = false;
  private keyHandler: (e: KeyboardEvent) => void;
  private keyUp: (e: KeyboardEvent) => void;

  private solo: Solo;

  constructor(solo: Solo) {
    this.solo = solo;
    const s = solo.state;
    this.hud = new Hud(app, {
      step: (dir) => this.step(dir),
      fire: (power) => void this.fire(power),
      item: (key) => this.toggleItem(key),
      view: () => {
        this.scene.toggleOverview();
      },
      mute: () => this.hud.setMuted(toggleMute()),
      fast: () => this.toggleFast(),
      skip: () => void this.skip(),
      charge: (p) => sound.charge(p),
    });
    this.hud.setMuted(prefs.muted);
    this.scene = new Scene(app, mapOf(s), s);
    this.scene.speed = SPEED;
    this.scene.viewer = s.chars.find((c) => !c.ai)?.id ?? -1;
    this.scene.onAim = (angle, facing) => this.setAim(angle, facing);
    this.scene.onCamera = (mode) => this.hud.setView(mode === 'overview');
    this.hud.home.href = homeUrl;
    this.hud.home.querySelector('span')!.textContent = homeText;
    this.hud.home.addEventListener('click', (e) => {
      if (this.solo.state.phase === 'over') return;
      e.preventDefault();
      void confirmBox(app, `这一局还没打完，存着下次接着打。现在回${homeText}吗？`, `回${homeText}`, '接着打').then((ok) => ok && goHome());
    });
    for (const c of s.chars) {
      this.hp.set(c.id, c.hp);
      if (c.out) this.out.add(c.id);
    }
    this.keyHandler = (e) => this.onKey(e, true);
    this.keyUp = (e) => this.onKey(e, false);
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('keyup', this.keyUp);
    this.resize(viewport().w ? viewport() : size);
    this.paintTeams();
    // 冒烟和截图用的把手（只读状态、问电脑会怎么打、角色在屏幕上的位置、帧时间）
    (window as unknown as { __danli?: unknown }).__danli = {
      state: () => this.solo.state,
      suggest: (): Plan => plan(this.solo.state),
      actorScreen: () => this.scene.actorScreen(),
      aim: () => this.scene.aim,
      zoom: () => this.scene.zoom,
      busy: () => this.busy,
      flying: () => this.scene.flying,
      preview: (a: Action) => apply(this.solo.state, a),
      log: () => this.solo.save.log,
      frames: () => ({ frames: this.scene.frames.slice(), draws: this.scene.draws.slice() }),
      resetFrames: () => {
        this.scene.frames.length = 0;
        this.scene.draws.length = 0;
      },
      nudge: (dx: number, dy: number) => this.scene.nudge(dx, dy),
    };
    void this.turn();
  }

  destroy(): void {
    this.alive = false;
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('keyup', this.keyUp);
    sound.charge(null);
    this.scene.destroy();
  }

  resize(s: Size): void {
    this.hud.layout(s);
    const ins = this.hud.insets();
    this.scene.insetTop = ins.top;
    this.scene.insetBottom = ins.bottom;
    this.scene.resize(s);
  }

  private paintTeams(): void {
    const s = this.solo.state;
    const hp: [number, number] = [0, 0];
    const max: [number, number] = [0, 0];
    for (const c of s.chars) {
      max[c.team] += MAX_HP;
      if (!this.out.has(c.id)) hp[c.team] += this.hp.get(c.id) ?? 0;
    }
    const dead = (t: Team): boolean => s.chars.every((c) => c.team !== t || this.out.has(c.id));
    this.hud.setTeams(hp, max, [dead(0), dead(1)]);
  }

  private paintTurn(): void {
    const s = this.solo.state;
    const a = s.chars[s.actor]!;
    const w = weapon(a.weapon);
    this.hud.setTurn(a.name, a.team, s.round, roundLimit(s.setup), !a.ai);
    this.hud.setWeapon(w.id, w.name, w.minAngle, w.maxAngle);
    this.hud.setWind(s.wind);
    this.hud.lastPower = a.power;
    this.hud.setPower(a.power ?? 0, a.power);
  }

  /** 事件放到时：HUD 跟着变，配上音效 */
  private onEvent = (e: Ev): void => {
    const s = this.solo.state;
    if (e.t === 'move') sound.play('crawl');
    else if (e.t === 'shot') sound.play(e.plane ? 'plane' : 'shot');
    else if (e.t === 'boom') sound.play('boom', e.r);
    else if (e.t === 'warp') sound.play('warp');
    else if (e.t === 'turn' && !s.chars[e.id]!.ai) sound.play('turn');
    else if (e.t === 'over') {
      const me = s.chars.find((c) => !c.ai);
      sound.play(e.winner === null ? 'draw' : me && e.winner === me.team ? 'win' : 'lose');
    }
    if (e.t === 'hurt') {
      sound.play('hit');
      this.hp.set(e.id, e.hp);
      this.paintTeams();
    } else if (e.t === 'fall' && e.to > mapOf(s).height) {
      // 往画本外掉：一开始掉就贴纸签（DESIGN.md 第 4 节"翻着跟头掉进雾里，纸签写'掉出画本啦！'"）
      sound.play('fall');
      this.banner(e.id, '掉出画本啦！');
    } else if (e.t === 'out') {
      this.out.add(e.id);
      this.paintTeams();
      if (e.why === 'hp') this.banner(e.id, '血量掉光，出局！');
    }
  };

  private bannerTimer = 0;

  private banner(id: number, title: string): void {
    const s = this.solo.state;
    const c = s.chars[id]!;
    const left = s.chars.filter((x) => x.team === c.team && x.id !== id && !this.out.has(x.id)).length;
    this.hud.banner(title, `${c.name} 出局 · ${TEAM_NAME[c.team]}还剩 ${left} 只`);
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.hud.banner(null), 2200 / SPEED);
  }

  /** 一回合开始：真人就放开底栏和角度盘，电脑就想好了按顺序做 */
  /** 动画的速度：冒烟 ×8、快进 ×4 */
  private get k(): number {
    return SPEED * (this.fast ? 4 : 1);
  }

  /** 页面关了，或者已经在跳到结果：放到一半的回合就此打住 */
  private stopped(): boolean {
    return !this.alive || this.skipping;
  }

  private async turn(): Promise<void> {
    if (this.stopped()) return;
    const s = this.solo.state;
    this.scene.sync(s);
    if (s.phase === 'over') return this.result();
    this.hud.setSpectate(this.spectating() ? { fast: this.fast } : null);
    this.paintTurn();
    const a = s.chars[s.actor]!;
    const w = weapon(a.weapon);
    this.angle = Math.min(w.maxAngle, Math.max(w.minAngle, a.angle));
    this.facing = a.facing;
    this.scene.newTurn(a.id);
    this.loadout = PLAIN;
    if (!a.ai) {
      this.scene.aim = { angle: this.angle, facing: this.facing, min: w.minAngle, max: w.maxAngle };
      this.scene.aimEnabled = true;
      this.hud.setEnabled(true);
      this.paintItems();
      return;
    }
    this.paintItems();
    this.scene.aimEnabled = false;
    this.scene.aim = null;
    this.hud.setEnabled(false);
    this.hud.think(`${a.name}在想…`);
    await this.scene.wait(500);
    if (this.stopped()) return;
    const p = plan(s);
    this.hud.think(null);
    for (const dir of p.moves) {
      const r = this.solo.apply({ t: 'move', dir });
      if (!r.ok) break;
      await this.scene.play(r.events, this.onEvent);
      if (this.stopped()) return;
      this.paintItems();
    }
    // 亮出电脑选的道具，再转角度盘、蓄力：放给人看，电脑也是这么打的
    this.loadout = p.loadout;
    this.paintItems();
    this.scene.aim = { angle: this.angle, facing: p.facing, min: w.minAngle, max: w.maxAngle, spread: p.loadout.mode === 'fork' ? FORK : 0 };
    this.scene.setFacing(a.id, p.facing);
    const from = this.angle;
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await this.scene.wait(30);
      if (this.stopped()) return;
      this.scene.aim = { ...this.scene.aim, angle: Math.round(from + ((p.angle - from) * i) / steps) };
    }
    const t0 = performance.now();
    const dur = ((p.power / 100) * CHARGE_MS) / this.k;
    while (performance.now() - t0 < dur) {
      await this.scene.wait(16 * this.k);
      if (this.stopped()) return sound.charge(null);
      const now = Math.min(p.power, (p.power * (performance.now() - t0)) / dur);
      this.hud.setPower(now, a.power);
      sound.charge(now);
    }
    sound.charge(null);
    this.hud.setPower(p.power, a.power);
    await this.act({ t: 'fire', angle: p.angle, power: p.power, facing: p.facing, ...p.loadout });
  }

  /** 做一步并放动画；发射以后进下一回合 */
  private async act(a: Action): Promise<void> {
    const r = this.solo.apply(a);
    if (!r.ok) return;
    this.busy = true;
    this.hud.setEnabled(false);
    this.scene.aimEnabled = false;
    await this.scene.play(r.events, this.onEvent);
    this.busy = false;
    if (!this.stopped()) void this.turn();
  }

  // ---------- 真人的操作 ----------

  private mine(): boolean {
    const s = this.solo.state;
    return s.phase === 'play' && !s.chars[s.actor]!.ai && !this.busy;
  }

  private step(dir: Dir): boolean {
    if (!this.mine()) return false;
    // 选了的道具要花的体力先留着：爬不能把它吃掉（体力条上黄的那几格）
    const s = this.solo.state;
    const to = stepTarget(s.terrain, mapOf(s).width, s.chars[s.actor]!, dir);
    if (!('error' in to) && s.stamina - to.cost < loadoutCost(this.loadout)) return false;
    const r = this.solo.apply({ t: 'move', dir });
    if (!r.ok) return false;
    if (this.facing !== dir) this.setAim(this.angle, dir, false);
    this.queue = this.queue.then(() => this.scene.play(r.events, this.onEvent));
    this.paintItems();
    return true;
  }

  // ---------- 道具栏 ----------

  /** 点一个道具：发射方式三选一、加力三选一（再点一下取消）；纸飞机不能和别的一起用，选它就清掉别的，选别的就清掉它 */
  private toggleItem(key: ItemKey): void {
    if (!this.mine()) return;
    const next = toggled(this.loadout, key);
    const s = this.solo.state;
    if (loadoutBlocked(s, s.chars[s.actor]!, next)) return;
    sound.play('item');
    this.loadout = next;
    if (this.scene.aim) this.scene.aim = { ...this.scene.aim, spread: next.mode === 'fork' ? FORK : 0 };
    this.paintItems();
  }

  /** 道具栏和体力条：按现在选的、剩的体力和次数，算每个按钮能不能按 */
  private paintItems(): void {
    const s = this.solo.state;
    const me = s.chars[s.actor]!;
    const views: ItemView[] = ITEMS.map(({ key, label, title }) => {
      const on = isOn(this.loadout, key);
      const special = key === 'plane' || key === 'lid' ? key : null;
      const cost = special ? SPECIALS[special].cost : key === 'double' || key === 'triple' || key === 'fork' ? MODES[key].cost : BOOST_COST[boostOf(key)];
      let state: ItemView['state'] = on ? 'on' : 'off';
      if (!on && special && me.special[special] <= 0) state = 'empty';
      else if (!on && loadoutBlocked(s, me, toggled(this.loadout, key)) === 'tired') state = 'tired';
      return { key, label, title, cost, state, ...(special ? { count: me.special[special] } : {}) };
    });
    this.hud.setItems(views);
    this.hud.setStamina(s.stamina, !me.ai, loadoutCost(this.loadout));
  }

  private setAim(angle: number, facing: Dir, log = true): void {
    if (!this.mine()) return;
    if (facing !== this.facing) {
      this.facing = facing;
      if (log) {
        const r = this.solo.apply({ t: 'face', dir: facing });
        if (r.ok) void this.scene.play(r.events, this.onEvent);
      }
      this.scene.setFacing(this.solo.state.actor, facing);
    }
    this.angle = angle;
    if (this.scene.aim) this.scene.aim = { ...this.scene.aim, angle, facing };
  }

  private async fire(power: number): Promise<void> {
    if (!this.mine()) return;
    this.busy = true;
    this.hud.setEnabled(false);
    await this.queue;
    this.busy = false;
    await this.act({ t: 'fire', angle: this.angle, power, facing: this.facing, ...this.loadout });
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
      if (!aim || !this.mine()) return;
      const angle = Math.min(aim.max, Math.max(aim.min, this.angle + (e.key === 'ArrowUp' ? 1 : -1)));
      this.setAim(angle, this.facing);
    }
  }

  // ---------- 结算 ----------

  /** 打完了：顶栏写"打完了"，等胜负的音效和最后一下动画放完，换到结算页 */
  private async result(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.hud.setEnabled(false);
    this.hud.banner(null);
    this.hud.setSpectate(null);
    this.scene.aim = null;
    this.hud.setOver(this.solo.state.round);
    await new Promise((r) => window.setTimeout(r, 900 / this.k));
    if (this.alive) result(this.solo);
  }

  // ---------- 我方真人全部出局以后：快进、跳到结果 ----------

  /** 我这边的真人都出局了吗（只剩电脑在打，看着就行） */
  private spectating(): boolean {
    const humans = this.solo.state.chars.filter((c) => !c.ai);
    return humans.length > 0 && humans.every((c) => c.out);
  }

  private toggleFast(): void {
    this.fast = !this.fast;
    this.scene.speed = this.k;
    this.hud.setSpectate({ fast: this.fast });
  }

  /** 跳到结果：剩下的回合不放动画，电脑一手一手直接算完（每几手让一下，页面不卡死），然后换到结算页 */
  private async skip(): Promise<void> {
    if (this.skipping || this.solo.state.phase !== 'play') return;
    this.skipping = true;
    this.hud.setSpectate(null);
    sound.charge(null);
    let n = 0;
    while (this.alive && this.solo.state.phase === 'play') {
      for (const a of planActions(plan(this.solo.state))) if (!this.solo.apply(a).ok) break;
      if (++n % 2 === 0) {
        this.hud.think(`正在算结果… 第 ${this.solo.state.round} 轮`);
        await new Promise((r) => window.setTimeout(r, 0));
      }
    }
    if (this.alive) result(this.solo);
  }

}

// ---------- 道具栏的按钮 ----------

const ITEMS: readonly { key: ItemKey; label: string; title: string }[] = [
  // 提示里的数从规则核心取，调数值时不会漏改
  { key: 'double', label: '连发+1', title: `连扔 ${MODES.double.count} 发，每发伤害 ${MODES.double.pct}%` },
  { key: 'triple', label: '连发+2', title: `连扔 ${MODES.triple.count} 发，每发伤害 ${MODES.triple.pct}%` },
  { key: 'fork', label: '三岔', title: `一发分成三颗，角度各差 ${FORK}°，每颗伤害 ${MODES.fork.pct}%` },
  { key: 'b10', label: '加力10%', title: '这回合伤害 +10%' },
  { key: 'b20', label: '加力20%', title: '这回合伤害 +20%' },
  { key: 'b50', label: '加力50%', title: '这回合伤害 +50%' },
  { key: 'plane', label: '纸飞机', title: '这一发扔纸飞机，人飞到落点；不能和别的道具一起用' },
  { key: 'lid', label: '锅盖', title: '这一发不受风（连发、三岔的每一颗都算）' },
];

function boostOf(key: ItemKey): Boost {
  return key === 'b10' ? 10 : key === 'b20' ? 20 : key === 'b50' ? 50 : 0;
}

function isOn(l: Loadout, key: ItemKey): boolean {
  if (key === 'plane') return l.plane;
  if (key === 'lid') return l.lid;
  if (key === 'b10' || key === 'b20' || key === 'b50') return l.boost === boostOf(key);
  return l.mode === key;
}

/** 点了 key 以后的组合 */
function toggled(l: Loadout, key: ItemKey): Loadout {
  const on = isOn(l, key);
  if (key === 'plane') return on ? PLAIN : { ...PLAIN, plane: true };
  const base = { ...l, plane: false };
  if (key === 'lid') return { ...base, lid: !on };
  if (key === 'b10' || key === 'b20' || key === 'b50') return { ...base, boost: on ? 0 : boostOf(key) };
  return { ...base, mode: on ? 'single' : (key as ShotMode) };
}

// ---------- 开始 ----------

document.addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement).closest('.dl-hud, canvas')) e.preventDefault();
});

void (async () => {
  await loadMe();
  lobby();
})();
