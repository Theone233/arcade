/**
 * 好友房的一场（DESIGN.md 第 6 节）：连房间（kit 的 RoomClient）、按顺序播房间发来的帧、发操作。画面由 main.ts 接 OnlineUi。
 * 房间说了算：页面只发意图（坐下、开打、出牌、回答、离座），收到的状态整个替换本地的；断线重连拿全量快照整桌重画。
 * 电脑接着出的几手是几帧，按顺序一帧一帧播（页面播完赛道上的动画再播下一帧）；落下太多（切回前台、重连）就不播了，直接摆最新的。
 * 房间码只在地址栏（?room=123456）：刷新原样回到房间，不另存。
 */
import { closeText, createRoom as kitCreate, createText, RoomClient, type ClientStatus } from 'arcade-kit/client';
import type { DownMsg, RoomInfo, You } from 'arcade-kit/protocol';
import type { Action } from './core/types.ts';
import type { RoomAction, RoomOpts, RoomView } from './room/rules.ts';
import { MOVE_ERROR } from './view/text.ts';

export const CLIENT_VERSION = 1;
const MAX_BACKLOG = 8;

export interface OnlineState {
  code: string;
  opts: RoomOpts | null;
  status: ClientStatus;
  room: RoomInfo | null;
  you: You | null;
  view: RoomView | null;
}

export interface OnlineUi {
  /** 状态变了：重画；fresh 是快照（不放动画）。返回的 Promise 播完动画再 resolve */
  draw(s: OnlineState, fresh: boolean): Promise<void> | void;
  toast(text: string): void;
  emote(seat: number, id: number, to?: number): void;
  ended(text: string, code: number): void;
}

export class Online {
  private readonly client: RoomClient<RoomAction, RoomView>;
  private s: OnlineState;
  private readonly queue: { view: RoomView | null; fresh: boolean }[] = [];
  private playing = false;
  private closed = false;

  private readonly ui: OnlineUi;

  constructor(code: string, ui: OnlineUi) {
    this.ui = ui;
    this.s = { code, opts: null, status: 'connecting', room: null, you: null, view: null };
    this.client = new RoomClient<RoomAction, RoomView>({
      url: roomUrl(code),
      clientVersion: CLIENT_VERSION,
      onMessage: (m) => this.onMessage(m),
      onStatus: (st, c, reason) => this.onStatus(st, c, reason),
      onEmote: (seat, id, to) => this.ui.emote(seat, id, to),
    });
  }

  get state(): OnlineState {
    return this.s;
  }

  sit(seat: number): void {
    this.client.sit(seat);
  }
  start(): void {
    this.client.start();
  }
  play(a: Action): void {
    this.client.act({ t: 'play', a });
  }
  next(code: string): void {
    this.client.act({ t: 'next', code });
  }
  emote(id: number, to?: number): void {
    this.client.emote(id, to);
  }
  leaveSeat(): void {
    this.client.leave();
  }
  close(): void {
    this.closed = true;
    this.queue.length = 0;
    this.client.close();
  }

  private onMessage(m: DownMsg<RoomView>): void {
    if (this.closed) return;
    if (m.t === 'error') {
      const text = errorText(m.code);
      if (text) this.ui.toast(text);
      return;
    }
    this.s = { ...this.s, room: m.room, you: m.you, opts: (m.room.opts as RoomOpts | undefined) ?? null };
    if (m.t === 'welcome') {
      this.queue.length = 0;
      this.queue.push({ view: m.view, fresh: true });
    } else {
      for (const f of m.frames) this.queue.push({ view: (f.view as RoomView | null) ?? null, fresh: false });
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length) {
        if (this.queue.length > MAX_BACKLOG) this.queue.splice(0, this.queue.length - 1, { ...this.queue.at(-1)!, fresh: true });
        const f = this.queue.shift()!;
        if (this.closed) return;
        this.s = { ...this.s, view: f.view ?? this.s.view };
        await this.ui.draw(this.s, f.fresh);
      }
    } finally {
      this.playing = false;
    }
    if (!this.closed) await this.ui.draw(this.s, false);
  }

  private onStatus(st: ClientStatus, code?: number, reason?: string): void {
    if (this.closed) return;
    this.s = { ...this.s, status: st };
    if (!this.playing) void this.ui.draw(this.s, false);
    if ((st === 'closed' || st === 'failed') && code !== undefined && code !== 1000) this.ui.ended(closeText(code, reason), code);
  }
}

/** 房间的 WebSocket 地址：页面在 /games/racing/ 下，相对路径就对 */
function roomUrl(code: string): string {
  const u = new URL(`rooms/${code}/ws`, location.href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.search = '';
  return u.toString();
}

export async function createRoom(opts: RoomOpts): Promise<{ code: string } | { error: string }> {
  return kitCreate('rooms', opts);
}

export const createError = (e: string): string => createText(e);

/** 房间拒了一个操作：规则的错误码按 MOVE_ERROR 说人话，"局面变了"这类不提示 */
function errorText(code: string): string {
  switch (code) {
    case 'seat_taken':
    case 'seat_reserved':
    case 'not_your_seat':
      return '这个座位有人了';
    case 'seat_closed':
      return '这一场用不到这个座位';
    case 'not_host':
      return '只有房主能开跑';
    case 'room_over':
    case 'race_over':
    case 'closed':
      return '这一场已经跑完了';
    case 'stale':
    case 'not_your_turn':
    case 'not_asked':
    case 'not_plan':
    case 'planned':
    case 'emote_too_fast':
    case 'not_over':
      return '';
    default:
      return MOVE_ERROR[code] ?? '这一步没做成，看最新的局面再来';
  }
}
