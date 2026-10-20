/**
 * 页面入口：选桌页 → 对局 → 结算。规则在 src/core，电脑在 src/ai，单机存档在 solo.ts，画面在 src/view；这里只把它们连起来。
 * 回大厅（AGENTS.md 第 2 节第 6 条）：左上角常驻"大厅"，指向平台首页 /；对局中离开先确认一次（单机存着下次接着打）。
 * 独立部署（kit 的 detectPlatform 说没有平台）时"大厅"改成回游戏首页。M1 没有接平台的云存档。
 */
import { detectPlatform } from 'arcade-kit/client';
import { PERSONAS } from './ai/personas.ts';
import { plan, type Plan } from './ai/index.ts';
import { BOOST_COST, FORK_SPREAD as FORK, loadoutCost, MODES, PLAIN, SPECIALS, type Boost, type Loadout, type ShotMode } from './core/items.ts';
import { apply, loadoutBlocked, MAX_HP, MAX_TURNS, mapOf, stepTarget, teamHp } from './core/rules.ts';
import type { Action, Dir, Ev, State, Team } from './core/types.ts';
import { weapon } from './core/weapons.ts';
import { clearSolo, hasSolo, Solo } from './solo.ts';
import { confirmBox, el } from './view/dom.ts';
import { CHARGE_MS, emblemSvg, escapeHtml, Hud, type ItemKey, type ItemView } from './view/hud.ts';
import { renderLobby } from './view/lobby.ts';
import { TEAM_NAME } from './view/palette.ts';
import { Scene } from './view/scene.ts';
import { watchViewport, type Size } from './view/viewport.ts';
import './view/style.css';

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

let size: Size = { w: 0, h: 0, port: false };
let game: Game | null = null;
const viewport = watchViewport(app, (s) => {
  size = s;
  game?.resize(s);
});

// ---------- 选桌页 ----------

function lobby(): void {
  game?.destroy();
  game = null;
  app.replaceChildren();
  renderLobby(app, {
    myName,
    botName: PERSONAS[0]!.name,
    homeText,
    homeUrl,
    canResume: hasSolo(),
    onStart: () => start(Solo.fresh(myName)),
    onResume: () => {
      const s = Solo.load();
      if (s) start(s);
      else lobby();
    },
  });
}

function start(solo: Solo): void {
  app.replaceChildren();
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
    });
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
    const w = weapon(s.chars.find((c) => !c.ai)?.weapon ?? 'steamer');
    this.hud.setWeapon(w.name, w.minAngle, w.maxAngle);
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
    this.hud.setTurn(a.name, a.team, s.turn, MAX_TURNS, !a.ai);
    this.hud.setWind(s.wind);
    this.hud.lastPower = a.power;
    this.hud.setPower(a.power ?? 0, a.power);
  }

  private onEvent = (e: Ev): void => {
    const s = this.solo.state;
    if (e.t === 'hurt') {
      this.hp.set(e.id, e.hp);
      this.paintTeams();
    } else if (e.t === 'fall' && e.to > mapOf(s).height) {
      // 往画本外掉：一开始掉就贴纸签（DESIGN.md 第 4 节"翻着跟头掉进雾里，纸签写'掉出画本啦！'"）
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
  private async turn(): Promise<void> {
    if (!this.alive) return;
    const s = this.solo.state;
    this.scene.sync(s);
    if (s.phase === 'over') return this.result();
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
    const p = plan(s);
    this.hud.think(null);
    if (!this.alive) return;
    for (const dir of p.moves) {
      const r = this.solo.apply({ t: 'move', dir });
      if (!r.ok) break;
      await this.scene.play(r.events, this.onEvent);
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
      this.scene.aim = { ...this.scene.aim, angle: Math.round(from + ((p.angle - from) * i) / steps) };
    }
    const t0 = performance.now();
    const dur = ((p.power / 100) * CHARGE_MS) / SPEED;
    while (performance.now() - t0 < dur) {
      await this.scene.wait(16 * SPEED);
      this.hud.setPower(Math.min(p.power, (p.power * (performance.now() - t0)) / dur), a.power);
    }
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
    void this.turn();
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

  private result(): void {
    this.hud.setEnabled(false);
    this.hud.banner(null);
    this.scene.aim = null;
    const s: State = this.solo.state;
    this.hud.setOver(s.turn);
    const me = s.chars.find((c) => !c.ai)!;
    const win = s.winner === me.team;
    const title = s.winner === null ? '平局' : win ? '你赢了！' : '这局输了';
    const foe = s.chars.find((c) => c.team !== me.team)!;
    const why =
      s.endBy === 'turns'
        ? `打满 ${MAX_TURNS} 回合，按血量定：${TEAM_NAME[0]} ${teamHp(s, 0)} 比 ${TEAM_NAME[1]} ${teamHp(s, 1)}`
        : win
          ? foe.hp <= 0
            ? `${foe.name}血量掉光了`
            : `把${foe.name}轰出了画本`
          : me.hp <= 0
            ? '你的血量掉光了'
            : '你掉出了画本';
    const mask = el('div', 'dl-mask end', app);
    const card = el('div', `dl-card dl-end ${win ? 'win' : s.winner === null ? 'draw' : 'lose'}`, mask);
    el('h2', '', card, title);
    el('p', 'dl-end-why', card, why);
    const row = el('div', 'dl-end-teams', card);
    for (const t of [0, 1] as const) {
      const c = s.chars.find((x) => x.team === t)!;
      row.insertAdjacentHTML('beforeend', `<div class="dl-side t${t}">${emblemSvg(t)}<div><b>${escapeHtml(c.name)}</b><small>${c.out ? '出局' : `血量 ${c.hp}`}</small></div></div>`);
    }
    el('p', 'dl-end-turns', card, `打了 ${s.turn} 回合`);
    const acts = el('div', 'dl-card-row', card);
    el('button', 'dl-btn soft end-home', acts, homeText).addEventListener('click', goHome);
    el('button', 'dl-btn soft', acts, '回选桌').addEventListener('click', () => lobby());
    el('button', 'dl-btn go', acts, '再来一局').addEventListener('click', () => {
      clearSolo();
      start(Solo.fresh(myName));
    });
  }
}

// ---------- 道具栏的按钮 ----------

const ITEMS: readonly { key: ItemKey; label: string; title: string }[] = [
  { key: 'double', label: '连发+1', title: '连扔 2 发，每发伤害 70%' },
  { key: 'triple', label: '连发+2', title: '连扔 3 发，每发伤害 55%' },
  { key: 'fork', label: '三岔', title: '一发分成三颗，角度各差 6°，每颗伤害 50%' },
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
