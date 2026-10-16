/**
 * 页面入口：选桌页、好友房的等人页、赛道，接单机、好友房、声音和看得见的区域。
 * 规则在 src/core，单机的流程在 solo.ts，好友房的连接在 online.ts，这里只把它们和画面连起来。
 */
import { PERSONAS } from './ai/personas.ts';
import { DEFAULT_OPTS, checkOpts } from './core/rules.ts';
import type { Action, Ev, Opts, Plan } from './core/types.ts';
import type { View } from './core/view.ts';
import { createError, createRoom, Online, type OnlineState } from './online.ts';
import { clearSolo, loadSolo, ME, newSolo, Solo } from './solo.ts';
import { getTrack } from './track/index.ts';
import { Board } from './view/board.ts';
import { Comms } from './view/comms.ts';
import { Dash, type Presets } from './view/dash.ts';
import { closeDialog, confirmBox, dialog } from './view/dialog.ts';
import { button, el } from './view/dom.ts';
import { showRules } from './view/guide.ts';
import { renderLobby } from './view/lobby.ts';
import { renderWaiting, rulesLine, shareRoom } from './view/room.ts';
import { renderSide, type SeatName } from './view/side.ts';
import { play, setSound, unlockAudio, type Sfx } from './view/sound.ts';
import { CAR_COLORS, GAME_NAME, MOVE_ERROR } from './view/text.ts';
import { watchViewport } from './view/viewport.ts';
import './view/style.css';

// ---------- 设置 ----------

const PREFS_KEY = 'racing.prefs';
interface Prefs {
  sound: boolean;
  fast: boolean;
  opts: Opts;
  presets: Presets;
}
const DEFAULT_PRESETS: Presets = { boost: 'ask', adren: 'ask', slip: 'ask', markDiscard: true };

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return { sound: p.sound !== false, fast: p.fast === true, opts: checkOpts(p.opts) ?? { ...DEFAULT_OPTS }, presets: { ...DEFAULT_PRESETS, ...(p.presets ?? {}) } };
  } catch {
    return { sound: true, fast: false, opts: { ...DEFAULT_OPTS }, presets: { ...DEFAULT_PRESETS } };
  }
}
const prefs = loadPrefs();
function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 存不上就这一次有效
  }
}
setSound(prefs.sound);

/** 冒烟用：?turbo 让动画和电脑几乎不停顿 */
const TURBO = new URLSearchParams(location.search).has('turbo');

// ---------- 骨架 ----------

const app = document.getElementById('app')!;
const stage = el('div', 'stage', app);
const top = el('div', 'topbar', stage);
const home = el('a', 'home', top);
home.href = '/';
home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/></svg><span>大厅</span>';
const title = el('span', 'title', top, GAME_NAME);
el('span', 'spacer', top);
const speedBtn = button('icon', top, '', () => {
  prefs.fast = !prefs.fast;
  savePrefs();
  paintTop();
  applySpeed();
});
const soundBtn = button('icon', top, '', () => {
  prefs.sound = !prefs.sound;
  setSound(prefs.sound);
  savePrefs();
  paintTop();
});
button('icon', top, '规则', () => showRules(stage));
const shareBtn = button('pill share', top, '叫朋友', () => void share());
const leaveBtn = button('pill leave', top, '离开', () => void leave());
const screen = el('div', 'screen', stage);

function paintTop(): void {
  speedBtn.textContent = prefs.fast ? '快' : '慢';
  speedBtn.title = prefs.fast ? '动画快' : '动画慢';
  soundBtn.textContent = prefs.sound ? '声' : '静';
  leaveBtn.hidden = !solo && !online;
  shareBtn.hidden = !online || online.state.room?.status === 'over';
}

let toastTimer = 0;
function toast(text: string): void {
  let t = stage.querySelector<HTMLElement>('.toast');
  if (!t) t = el('div', 'toast', stage);
  t.textContent = text;
  t.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t!.hidden = true), 2_600);
}

watchViewport(app, stage, () => {});
document.addEventListener('pointerdown', unlockAudio, { capture: true });

let myName = '我';
async function loadMe(): Promise<void> {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    const b = (await r.json()) as { user?: { displayName?: string } | null };
    if (b.user?.displayName) myName = b.user.displayName;
  } catch {
    // 没登录（开发时）就叫"我"
  }
}

function showError(text: string, refresh = false): void {
  dialog(stage, 'error', (box) => {
    el('p', '', box, text);
    if (refresh) button('act soft', box, '刷新', () => location.reload());
    button('act go', box, '知道了', closeDialog);
  });
}

// ---------- 赛道画面（单机、好友房共用） ----------

const SFX: Partial<Record<Ev['e'], Sfx>> = { boost: 'boost', spin: 'spin', finish: 'finish' };

class RaceUi {
  readonly root: HTMLElement;
  readonly board: Board;
  readonly side: HTMLElement;
  readonly dash: Dash;
  private prompted = false;

  constructor(parent: HTMLElement, opts: Opts, hooks: { plan(p: Plan): void; answer(a: Action): void }) {
    const track = getTrack(opts.track)!;
    this.root = el('div', 'race', parent);
    this.board = new Board(this.root, track);
    this.side = el('div', 'side', this.root);
    this.dash = new Dash(this.root, prefs.presets, {
      plan: (p) => {
        play('go');
        hooks.plan(p);
      },
      answer: (a) => {
        play('click');
        hooks.answer(a);
      },
      preview: (pos, lane, kind) => this.board.preview(pos, lane, kind),
      presets: (p) => {
        prefs.presets = p;
        savePrefs();
      },
    });
    this.board.speed = speedOf();
  }

  destroy(): void {
    this.dash.destroy();
    this.root.remove();
  }

  rowEl(seat: number): HTMLElement | null {
    return this.side.querySelector<HTMLElement>(`[data-seat="${seat}"]`);
  }

  /** 放这一步的动画（fresh 是整桌重画，不放），再把最新的局面摆上 */
  async show(v: View, names: SeatName[], o: { fresh: boolean; thinking: number[]; until: number | null }): Promise<void> {
    if (!o.fresh && v.events.length) {
      for (const e of v.events) {
        if (e.e === 'move' && e.why === 'cards' && e.seat === v.me?.seat) play('move');
        else if (e.e === 'move' && e.why === 'slip') play('slip');
        else if (e.e === 'corner' && e.paid > 0 && e.seat === v.me?.seat) play('heat');
        else if (SFX[e.e]) play(SFX[e.e]!);
      }
      await this.board.play(v.events);
      this.chatter(v, names);
    }
    this.board.setCars(
      v.cars.map((c) => ({ seat: c.seat, pos: c.pos, lane: c.lane, out: c.rank !== null })),
      v.me?.seat ?? null,
    );
    renderSide(this.side, v, names, o.thinking);
    this.dash.render(v);
    this.dash.setTimer(o.until);
    const mine = !!v.me && ((v.phase === 'plan' && !v.me.plan && v.cars[v.me.seat]!.rank === null) || (v.phase === 'act' && v.cur === v.me.seat));
    if (mine && !this.prompted) {
      play('turn');
      navigator.vibrate?.(40);
    }
    this.prompted = mine;
  }

  /** 电脑的台词：只由公开的事触发 */
  private chatter(v: View, names: SeatName[]): void {
    for (const e of v.events) {
      let pool: string[] | undefined;
      const seat = 'seat' in e ? e.seat : -1;
      const p = PERSONAS[v.cars[seat]?.persona ?? -1];
      if (!p || !names[seat]?.bot) continue;
      if (e.e === 'spin') pool = p.lines.spin;
      else if (e.e === 'finish') pool = p.lines.finish;
      else if (e.e === 'move' && e.why === 'slip') pool = p.lines.slip;
      else if (e.e === 'move' && e.why === 'cards' && e.to - e.from >= 12) pool = p.lines.pass;
      if (!pool || Math.random() > 0.5) continue;
      const text = pool[Math.floor(Math.random() * pool.length)]!;
      window.setTimeout(() => bubble(this.rowEl(seat), text), 200);
    }
  }
}

function bubble(row: HTMLElement | null, text: string): void {
  if (!row) return;
  row.querySelector('.bubble')?.remove();
  const b = el('div', 'bubble', row, text);
  window.setTimeout(() => b.remove(), 2_600);
}

function speedOf(): number {
  return TURBO ? 0.02 : prefs.fast ? 0.5 : 1;
}

function applySpeed(): void {
  if (race) race.board.speed = speedOf();
  if (solo) solo.speed = speedOf();
}

let race: RaceUi | null = null;

function clearScreen(): void {
  race?.destroy();
  race = null;
  comms?.destroy();
  comms = null;
  closeDialog();
  screen.replaceChildren();
}

// ---------- 选桌页 ----------

let solo: Solo | null = null;

function lobby(friends = false): void {
  stopFollow();
  arrive = null;
  solo?.stop();
  solo = null;
  online?.close();
  online = null;
  setRoomInUrl(null);
  clearScreen();
  title.textContent = GAME_NAME;
  paintTop();
  screen.className = 'screen lobby';
  renderLobby(screen, {
    opts: prefs.opts,
    canResume: loadSolo() !== null,
    friends,
    onSolo: (o) => startSolo(o),
    onResume: () => {
      const save = loadSolo();
      if (save) playSolo(new Solo(save, soloUi));
    },
    onRoom: (o) => void openRoom(o),
    onJoin: (code) => (/^\d{6}$/.test(code) ? enterRoom(code, false) : toast('房间号是 6 位数字')),
    onRules: () => showRules(stage),
  });
}

function startSolo(o: Opts): void {
  prefs.opts = o;
  savePrefs();
  clearSolo();
  playSolo(new Solo(newSolo(o, myName), soloUi));
}

// ---------- 单机 ----------

function soloNames(): SeatName[] {
  return (solo?.save.names ?? []).map((name, i) => ({ name: i === ME && name !== '我' ? `${name}（我）` : name, bot: i !== ME }));
}

const soloUi = {
  async frame(v: View): Promise<void> {
    if (!race) return;
    await race.show(v, soloNames(), { fresh: false, thinking: [], until: null });
  },
  over(v: View): void {
    window.setTimeout(() => showResult(v, soloNames(), [
      ['回选桌', 'soft', () => lobby()],
      ['再来一场', 'go', () => startSolo(prefs.opts)],
    ]), TURBO ? 50 : 900);
  },
};

function playSolo(s: Solo): void {
  solo = s;
  applySpeed();
  clearScreen();
  screen.className = 'screen game';
  const o = s.save.state.opts;
  title.textContent = `${getTrack(o.track)?.name ?? ''} · ${o.laps} 圈`;
  paintTop();
  race = new RaceUi(screen, o, {
    plan: (p) => void act({ t: 'plan', ...p }),
    answer: (a) => void act(a),
  });
  applySpeed();
  void s.resume();
}

async function act(a: Action): Promise<void> {
  if (!solo) return;
  const err = await solo.act(a);
  if (err && err !== 'busy') toast(MOVE_ERROR[err] ?? '这一步不行');
}

/** 结算：名次、每辆车这一场的数 */
function showResult(v: View, names: SeatName[], acts: [string, 'go' | 'soft', () => void][]): void {
  dialog(stage, 'end', (box) => {
    const me = v.me?.seat ?? null;
    const mine = me === null ? null : v.cars[me]!.rank;
    el('h2', '', box, mine === 0 ? '冠军！' : mine !== null ? `第 ${mine + 1} 名` : '比赛结束');
    const tb = el('table', 'result', box);
    const hr = el('tr', '', tb);
    for (const h of ['名次', '车手', '冲刺', '尾流', '打滑', '付热量', '最快']) el('th', '', hr, h);
    for (const seat of v.finished) {
      const c = v.cars[seat]!;
      const tr = el('tr', seat === me ? 'me' : '', tb);
      el('td', '', tr, String((c.rank ?? 0) + 1));
      const td = el('td', 'who', tr);
      const dot = el('span', 'dot', td);
      dot.style.background = CAR_COLORS[seat]!.body;
      el('span', '', td, names[seat]?.name ?? `车${seat + 1}`);
      for (const n of [c.stats.boosts, c.stats.slips, c.stats.spins, c.stats.heat, c.stats.top]) el('td', '', tr, String(n));
    }
    const row = el('div', 'row end-acts', box);
    for (const [text, kind, fn] of acts)
      button(`act ${kind}`, row, text, () => {
        closeDialog();
        fn();
      });
  }, false);
  const mine = v.me ? v.cars[v.me.seat]!.rank : null;
  play(mine !== null && mine <= Math.floor(v.cars.length / 2) - 1 ? 'win' : 'lose');
}

// ---------- 好友房 ----------

let online: Online | null = null;
let hosting = false;
let shownN = -1;
let comms: Comms | null = null;
let arrive: { seat: number; sit: boolean } | null = null;
let followTimer = 0;
const FOLLOW_MS = 5_000;
function stopFollow(): void {
  window.clearTimeout(followTimer);
  followTimer = 0;
}

function setRoomInUrl(code: string | null): void {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code);
  else u.searchParams.delete('room');
  history.replaceState(null, '', u);
}

async function openRoom(o: Opts): Promise<void> {
  prefs.opts = o;
  savePrefs();
  const r = await createRoom(o);
  if ('error' in r) return showError(createError(r.error), r.error === 'login');
  enterRoom(r.code, true);
}

function enterRoom(code: string, host: boolean, from: { seat: number; sit: boolean } | null = null): void {
  stopFollow();
  arrive = from;
  solo?.stop();
  solo = null;
  online?.close();
  clearScreen();
  hosting = host;
  shownN = -1;
  setRoomInUrl(code);
  screen.className = 'screen room';
  el('p', 'room-hint', screen, '正在进房……');
  online = new Online(code, onlineUi);
  paintTop();
}

const onlineUi = {
  async draw(s: OnlineState, fresh: boolean): Promise<void> {
    paintTop();
    if (!s.room) return;
    if (s.room.status === 'waiting' && arrive?.sit && s.you && s.you.seat === null) {
      if (s.room.seats[arrive.seat]?.kind === 'empty') online?.sit(arrive.seat);
      arrive = { ...arrive, sit: false };
    }
    if (s.room.status === 'waiting' || !s.view) return drawWaiting(s);
    await drawRoomRace(s, fresh);
  },
  toast,
  emote(seat: number, id: number, to?: number): void {
    comms?.receive(seat, id, to);
  },
  ended(text: string): void {
    dialog(stage, 'error', (box) => {
      el('p', '', box, text);
      button('act go', box, '回选桌', () => {
        closeDialog();
        lobby();
      });
    }, false);
  },
};

function drawWaiting(s: OnlineState): void {
  if (race) clearScreen();
  title.textContent = `${GAME_NAME} · 好友房`;
  screen.className = 'screen room';
  renderWaiting(screen, {
    code: s.code,
    room: s.room!,
    you: s.you,
    opts: s.opts,
    host: hosting || s.you?.seat === 0,
    suggest: s.you?.seat === null && arrive ? arrive.seat : null,
    onSit: (seat) => online?.sit(seat),
    onStart: () => online?.start(),
    onShare: () => void share(),
    onLeave: () => lobby(),
  });
}

function roomNames(s: OnlineState, v: View): SeatName[] {
  return v.cars.map((c, i): SeatName => {
    const x = s.room!.seats[i];
    const persona = PERSONAS[c.persona]?.name ?? '电脑';
    const me = s.you?.seat === i;
    const name = x?.kind === 'human' ? `${x.name ?? '玩家'}${me ? '（我）' : ''}` : x?.name ? `电脑（代${x.name}）` : persona;
    return { name, bot: x?.kind !== 'human', away: !!(x?.away || x?.auto) };
  });
}

async function drawRoomRace(s: OnlineState, fresh: boolean): Promise<void> {
  const rv = s.view!;
  const v = rv.g;
  if (!race) {
    screen.replaceChildren();
    screen.className = 'screen game';
    title.textContent = `好友房 ${s.code} · ${rulesLine(s.opts)}`;
    race = new RaceUi(screen, v.opts, {
      plan: (p) => online?.play({ t: 'plan', ...p }),
      answer: (a) => online?.play(a),
    });
    const r = race;
    comms = new Comms(
      screen,
      {
        me: () => online?.state.you?.seat ?? null,
        rowEl: (seat) => r.rowEl(seat),
        name: (seat) => roomNames(online!.state, online!.state.view!.g)[seat]?.name ?? `${seat + 1} 号`,
        occupied: (seat) => (online?.state.room?.seats[seat]?.kind ?? 'empty') !== 'empty',
        seats: () => v.cars.length,
      },
      (id, to) => online?.emote(id, to),
    );
  }
  // 同一步重画（有人坐下、掉线）不再放一遍动画
  const replay = fresh || v.n === shownN;
  shownN = v.n;
  const turn = s.room!.turn;
  await race.show(replay ? { ...v, events: [] } : v, roomNames(s, v), {
    fresh: replay,
    thinking: turn?.seats ?? (turn ? [turn.seat] : []),
    until: turn?.deadline ?? null,
  });
  roomOver(s);
}

function roomOver(s: OnlineState): void {
  const rv = s.view!;
  const v = rv.g;
  if (v.phase !== 'over') return;
  const me = s.you?.seat ?? null;
  const names = roomNames(s, v);
  if (!document.querySelector('.mask.end')) {
    const acts: [string, 'go' | 'soft', () => void][] = [['回选桌', 'soft', () => lobby()]];
    if (me !== null && s.room?.seats[me]?.kind === 'human' && !rv.next) acts.push(['再来一场', 'go', () => void rematch()]);
    showResult(v, names, acts);
  }
  if (rv.next && rv.next.by !== me && !followTimer) {
    const next = rv.next;
    const from = me === null ? null : { seat: (me - next.by + v.cars.length) % v.cars.length, sit: true };
    const go = (): void => enterRoom(next.code, false, from);
    followTimer = window.setTimeout(go, FOLLOW_MS);
    const box = document.querySelector<HTMLElement>('.mask.end .dialog');
    const row = box?.querySelector<HTMLElement>('.end-acts');
    if (box && row) {
      row.before(el('p', 'room-hint', null, `${names[next.by]?.name ?? '有人'} 开了新房间 ${next.code}，马上跟过去`));
      button('act go', row, '现在过去', go);
    }
  }
}

async function rematch(): Promise<void> {
  const opts = online?.state.opts;
  if (!online || !opts) return;
  const r = await createRoom(opts);
  if ('error' in r) return toast(createError(r.error));
  online.next(r.code);
  enterRoom(r.code, true);
}

async function share(): Promise<void> {
  if (!online) return;
  const r = await shareRoom(online.state.code, GAME_NAME);
  if (r === 'copied') toast('链接已复制，发给朋友');
  else if (r === 'failed') toast(`房间号 ${online.state.code}，告诉朋友在选桌页输入`);
}

async function leaveRoom(): Promise<void> {
  const s = online!.state;
  const playing = s.room?.status === 'playing' && s.view && !s.view.done && s.you?.seat !== null && s.you?.seat !== undefined;
  if (playing) {
    const ok = await confirmBox(stage, '离开后你的车交给电脑接着开。离开吗？', '离开', '接着开');
    if (!ok) return;
    online!.leaveSeat();
    await new Promise((r) => window.setTimeout(r, 300));
  }
  lobby();
}

async function leave(): Promise<void> {
  if (online) return leaveRoom();
  if (!solo) return lobby();
  if (solo.save.state.phase !== 'over') {
    const ok = await confirmBox(stage, '这一场还没跑完，存着下次接着跑。现在回选桌吗？', '回选桌', '接着跑');
    if (!ok) return;
  }
  lobby();
}

// 比赛中点"大厅"先确认一次
home.addEventListener('click', (e) => {
  if (online) {
    e.preventDefault();
    void leaveRoom().then(() => {
      if (!online) location.href = '/';
    });
    return;
  }
  if (!solo || solo.save.state.phase === 'over') return;
  e.preventDefault();
  void confirmBox(stage, '这一场还没跑完，存着下次接着跑。回大厅吗？', '回大厅', '接着跑').then((ok) => {
    if (ok) location.href = '/';
  });
});

// ---------- 开始 ----------

void (async () => {
  paintTop();
  await loadMe();
  const q = new URLSearchParams(location.search);
  const code = q.get('room');
  const friends = q.get('online') === '1';
  if (q.has('online')) {
    const u = new URL(location.href);
    u.searchParams.delete('online');
    history.replaceState(null, '', u);
  }
  if (code && /^\d{6}$/.test(code)) return enterRoom(code, false);
  lobby(friends);
})();
