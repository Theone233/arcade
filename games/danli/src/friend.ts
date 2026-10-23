/**
 * 好友房（DESIGN.md 5.6）的页面这一层：开房、进房、连房间（kit 的 RoomClient），按房间的阶段换页——
 * 房间页（view/friendRoom.ts）、对局（friendGame.ts）、结算（view/result.ts）。规则都在 src/net/rules.ts（房间说了算）。
 * - 开房的人进房后马上让 kit 开局（kit 层面从此一直在打），别人进来自动坐下（kit 的座位），坐进空着的位子；对局中进来的人先旁观；
 * - 掉线、重连、切后台由 RoomClient 管，提示用 kit 的默认文案（closeText、createText）；
 * - danli.room 记最近的房间码（和是不是我开的），刷新、切回来时自动回房；点"大厅"、房间关了就删掉；
 * - 有平台时"叫好友"用 kit 的邀请面板（arcade-kit/social）。
 */
import { closeText, createRoom, createText, RoomClient, withNickname } from 'arcade-kit/client';
import type { DownMsg, RoomInfo } from 'arcade-kit/protocol';
import type { SocialHandle } from 'arcade-kit/social';
import type { Look } from './core/types.ts';
import type { WeaponId } from './core/weapons.ts';
import { gameStats, namedGame, NetGame } from './friendGame.ts';
import { CLIENT_VERSION, type NetAction, type RoomView } from './net/rules.ts';
import { el } from './view/dom.ts';
import { renderFriendRoom, seatName } from './view/friendRoom.ts';
import { renderResult } from './view/result.ts';
import type { Stage } from './view/stage.ts';
import type { Size } from './view/viewport.ts';

export const ROOM_KEY = 'danli.room';

export interface SavedRoom {
  code: string;
  /** 是我开的（进房后由我让 kit 开局） */
  host: boolean;
}

export function loadRoom(): SavedRoom | null {
  try {
    const v = JSON.parse(localStorage.getItem(ROOM_KEY) ?? 'null') as Partial<SavedRoom> | null;
    return v && typeof v.code === 'string' && /^\d{6}$/.test(v.code) ? { code: v.code, host: v.host === true } : null;
  } catch {
    return null;
  }
}

function saveRoom(r: SavedRoom): void {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify(r));
  } catch {
    // 存不上就只是刷新以后回不了房
  }
}

export function clearRoom(): void {
  try {
    localStorage.removeItem(ROOM_KEY);
  } catch {
    // 删不掉也不要紧
  }
}

/** 房间拒了操作时给人看的话（固定短码 → 大白话）；不用提示的回 null */
const ERROR_TEXT: Record<string, string> = {
  not_ready: '还有人没准备',
  empty_team: '两队都要有人（真人或电脑）才能开打',
  look_taken: '这只小动物别人在用',
  slot_taken: '这个位子有人了',
  slot_closed: '这一档对阵用不到这个位子',
  not_host: '只有房主能改',
  playing: '正在打，打完再改',
  seat_taken: '这个座位有人了',
  seat_reserved: '这个座位是别人的',
};

export interface FriendEnv {
  app: HTMLElement;
  viewport(): Size;
  homeUrl: string;
  homeText: string;
  myName: string;
  /** 单独部署（没有平台）：开房、进房带上昵称 */
  standalone: boolean;
  speed: number;
  muted(): boolean;
  toggleMute(): boolean;
  /** 准备房间上次选的小动物和武器：进房坐下后告诉房间 */
  me(): { look: Look; weapon: WeaponId };
  social: SocialHandle | null;
  /** 回首页（开房、进房失败或者房间关了时带一句话） */
  toLobby(note: string | null): void;
}

/** 开房：成功回房间码，失败回给人看的话 */
export async function openRoom(env: Pick<FriendEnv, 'standalone' | 'myName'>): Promise<{ code: string } | { error: string }> {
  const url = new URL('rooms', location.href).toString();
  const r = await createRoom(env.standalone ? withNickname(url, env.myName) : url, undefined);
  if ('code' in r && !('error' in r)) return { code: r.code };
  // 已经开着一个房间：回那个房间
  if (r.error === 'has_room' && r.code) return { code: r.code };
  return { error: createText(r.error) };
}

export class Friend {
  readonly code: string;
  private env: FriendEnv;
  private host: boolean;
  private client: RoomClient<NetAction, RoomView>;
  private room: RoomInfo | null = null;
  private view: RoomView | null = null;
  private seat: number | null = null;
  private bound: number | null = null;
  /** 房间的钟减去本机的钟 */
  private offset = 0;
  private stage: Stage | null = null;
  private page: 'room' | 'game' | 'result' | null = null;
  private game: NetGame | null = null;
  /** 结算阶段自己点了"回房间" */
  private backToRoom = false;
  private started = false;
  private sitAt = -1;
  private prefsSent = false;
  private note: string | null = null;
  /** 房间还没开局（kit 的等人）时那一句 */
  private waitNote: string | null = null;
  private noteTimer = 0;
  private netEl: HTMLElement | null = null;
  private closed = false;

  constructor(env: FriendEnv, code: string, host: boolean) {
    this.env = env;
    this.code = code;
    this.host = host;
    saveRoom({ code, host });
    // 地址上带着房间码：刷新、复制地址都回这个房间
    const q = new URLSearchParams(location.search);
    q.set('room', code);
    history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
    const ws = new URL(`rooms/${code}/ws`, location.href);
    ws.search = '';
    ws.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.client = new RoomClient<NetAction, RoomView>({
      url: env.standalone ? withNickname(ws.toString(), env.myName) : ws.toString(),
      clientVersion: CLIENT_VERSION,
      onMessage: (m) => this.onMessage(m),
      onStatus: (s, c, reason) => this.onStatus(s, c, reason),
    });
    env.social?.presenceNow(true);
    // 冒烟、截图用的把手（只读）
    (window as unknown as { __danliNet?: unknown }).__danliNet = {
      code,
      view: () => this.view,
      room: () => this.room,
      seat: () => this.seat,
      page: () => this.page,
      note: () => this.note,
    };
    this.showRoom();
  }

  /** 社交报位置用：我在哪个房间、几个人 */
  where(): { place: 'room'; game: string; room: string; seats: string } {
    const n = this.room ? this.room.seats.filter((s) => s.kind === 'human').length : 1;
    return { place: 'room', game: 'danli', room: this.code, seats: `${n}/6` };
  }

  resize(s: Size): void {
    this.game?.resize(s);
    this.stage?.resize(s);
  }

  destroy(): void {
    this.closed = true;
    this.client.close();
    this.clearPage();
    this.netEl?.remove();
    window.clearTimeout(this.noteTimer);
  }

  // ---------- 房间来的消息 ----------

  private onMessage(m: DownMsg<RoomView>): void {
    if (this.closed) return;
    if (m.t === 'error') {
      if (m.moveId) this.game?.rejected(m.code);
      const text = ERROR_TEXT[m.code];
      if (text) this.say(text);
      return;
    }
    if (typeof m.now === 'number') this.offset = m.now - Date.now();
    this.room = m.room;
    this.seat = m.you.seat;
    this.bound = m.you.bound ?? null;
    if (m.t === 'welcome') {
      this.view = m.view;
      this.hideNet();
    } else this.view = m.frames[m.frames.length - 1]!.view;
    this.route();
  }

  private onStatus(s: string, code?: number, reason?: string): void {
    if (this.closed) return;
    if (s === 'reconnecting') this.showNet(`${closeText(code ?? 1006, reason)}，正在重连…`);
    else if (s === 'failed') this.showNet('连不上房间', '重试', () => this.client.retry());
    else if (s === 'closed') {
      const text = closeText(code ?? 4000, reason);
      this.closed = true;
      clearRoom();
      this.clearPage();
      this.netEl?.remove();
      this.env.toLobby(text);
    }
  }

  /** 按房间的阶段换页，顺便：开房的人让 kit 开局、进来的人自动坐下、坐下后报上次选的小动物和武器 */
  private route(): void {
    const room = this.room;
    const view = this.view;
    if (!room) return;
    if (room.status === 'waiting') {
      if (this.host && !this.started) {
        this.started = true;
        this.client.start();
      }
      this.waitNote = this.host ? '正在开房…' : '等房主进房间…';
      return this.showRoom();
    }
    this.waitNote = null;
    if (!view) return this.showRoom();
    if (this.seat === null) {
      // 坐下：开打后坐过的回自己的座位；没坐过的找一个没人绑的座位（对局中进来的先旁观，打完再坐）
      const k = this.bound ?? (view.phase === 'play' ? -1 : room.seats.findIndex((s) => s.kind !== 'human' && !s.reserved));
      if (k !== null && k >= 0 && this.sitAt !== k) {
        this.sitAt = k;
        this.client.sit(k);
      }
    }
    const mine = this.seat === null ? null : view.slots.find((x) => x?.k === 'human' && x.seat === this.seat);
    if (mine?.k === 'human' && !this.prefsSent) {
      this.prefsSent = true;
      const me = this.env.me();
      // 别的真人已经是这只小动物就不换了（不然一进房就提示"别人在用"）
      const taken = view.slots.some((x) => x?.k === 'human' && x.seat !== this.seat && x.look === me.look);
      if (mine.look !== me.look && !taken) this.act({ t: 'look', look: me.look });
      if (mine.weapon !== me.weapon) this.act({ t: 'weapon', weapon: me.weapon });
    }
    if (view.phase === 'lobby') {
      this.backToRoom = false;
      return this.showRoom();
    }
    if (view.phase === 'play' || (view.phase === 'result' && this.game && view.game && this.game.no === view.game.no && this.page === 'game')) return this.showGame();
    // 打完了：看结算；自己点了"回房间"的留在房间页
    if (this.backToRoom || !view.game) return this.showRoom();
    return this.showResult();
  }

  private act(a: NetAction): void {
    this.client.act(a);
  }

  private nameOf = (seat: number): string => seatName(this.room, seat);

  // ---------- 页面 ----------

  private clearPage(): void {
    this.game?.destroy();
    this.game = null;
    this.stage?.destroy();
    this.stage = null;
    this.page = null;
  }

  private showRoom(): void {
    if (this.page === 'room' && this.stage) {
      this.stage.redraw();
      return;
    }
    this.clearPage();
    this.page = 'room';
    const env = this.env;
    this.stage = renderFriendRoom(env.app, {
      homeText: env.homeText,
      muted: env.muted(),
      data: () => ({
        code: this.code,
        room: this.room,
        view: this.view,
        seat: this.seat,
        note: this.note ?? this.waitNote,
        canSit: !!this.room && this.room.status === 'playing' && this.room.seats.some((s) => s.kind !== 'human' && !s.reserved),
      }),
      act: (a) => this.act(a),
      sit: () => {
        const k = this.room?.seats.findIndex((s) => s.kind !== 'human' && !s.reserved) ?? -1;
        if (k >= 0) {
          this.sitAt = k;
          this.client.sit(k);
        }
      },
      copyLink: () => void this.copyLink(),
      invite: env.social ? () => env.social!.openInvite({ game: 'danli', room: this.code }) : null,
      onHome: () => this.leave(),
      onMute: () => env.toggleMute(),
      onResult: () => {
        this.backToRoom = false;
        this.showResult();
      },
    });
    this.stage.resize(env.viewport());
  }

  private showGame(): void {
    const view = this.view!;
    const room = this.room!;
    if (this.page === 'game' && this.game && this.game.no === view.game!.no) {
      this.game.update(view, room, this.seat);
      return;
    }
    this.clearPage();
    this.page = 'game';
    const env = this.env;
    this.game = new NetGame(
      {
        app: env.app,
        speed: env.speed,
        muted: env.muted,
        toggleMute: env.toggleMute,
        homeText: env.homeText,
        homeUrl: env.homeUrl,
        leave: () => this.leave(),
        send: (a) => this.act(a),
        nameOf: this.nameOf,
        serverNow: () => Date.now() + this.offset,
        over: () => {
          this.page = null;
          this.route();
        },
      },
      view,
      room,
      this.seat,
    );
    this.game.resize(env.viewport());
  }

  private showResult(): void {
    const view = this.view!;
    if (!view.game) return this.showRoom();
    const g = namedGame(view.game, this.nameOf);
    const amHost = this.seat !== null && view.host === this.seat;
    this.clearPage();
    this.page = 'result';
    const me = this.seat === null ? -1 : g.owners.indexOf(this.seat);
    this.stage = renderResult(this.env.app, {
      stats: gameStats(g),
      homeText: this.env.homeText,
      homeUrl: this.env.homeUrl,
      meId: me >= 0 ? me : null,
      onAgain: amHost ? () => this.act({ t: 'again' }) : null,
      againText: '等房主再来一局',
      onRoom: () => {
        this.backToRoom = true;
        this.showRoom();
      },
      onHome: () => this.leave(),
    });
    this.stage.resize(this.env.viewport());
  }

  // ---------- 小东西 ----------

  /** 底下那一行的提示，3 秒后收起 */
  private say(text: string): void {
    this.note = text;
    window.clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => {
      this.note = null;
      if (this.page === 'room') this.stage?.redraw();
    }, 3000);
    if (this.page === 'room') this.stage?.redraw();
  }

  private async copyLink(): Promise<void> {
    const link = `${location.origin}${location.pathname}?room=${this.code}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      // 不让用剪贴板（http、内置浏览器）：用老办法
      const ta = el('textarea', 'dl-copy', this.env.app);
      ta.value = link;
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    this.say(ok ? '链接复制好了，发给朋友' : `复制不了，把房间码 ${this.code} 告诉朋友`);
  }

  private showNet(text: string, button?: string, onClick?: () => void): void {
    this.netEl ??= el('div', 'dl-net', this.env.app);
    this.netEl.replaceChildren();
    el('span', '', this.netEl, text);
    if (button && onClick) el('button', 'dl-btn soft', this.netEl, button).addEventListener('click', onClick);
  }

  private hideNet(): void {
    this.netEl?.remove();
    this.netEl = null;
  }

  /** 离开房间回大厅：kit 的离座（对局中电脑替他打完），不再回这个房间 */
  leave(): void {
    this.client.leave();
    this.closed = true;
    clearRoom();
    this.client.close();
    location.href = this.env.homeUrl;
  }
}

