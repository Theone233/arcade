/**
 * 好友房的等人页（DESIGN.md 第 6 节）：房间号、这一场的设置、座位（点空位坐下）、叫朋友来、房主开跑。
 */
import type { RoomInfo, You } from 'arcade-kit/protocol';
import type { RoomOpts } from '../room/rules.ts';
import { getTrack } from '../track/index.ts';
import { button, el } from './dom.ts';
import { CAR_COLORS, LEVEL_NAME } from './text.ts';

export interface WaitingProps {
  code: string;
  room: RoomInfo;
  you: You | null;
  opts: RoomOpts | null;
  host: boolean;
  /** 跟着"再来一场"过来、还没坐下：上一场我坐的那边（亮一下） */
  suggest: number | null;
  onSit(seat: number): void;
  onStart(): void;
  onShare(): void;
  onLeave(): void;
}

export function rulesLine(o: RoomOpts | null): string {
  if (!o) return '';
  const t = getTrack(o.track);
  return [t?.name ?? o.track, `${o.laps} 圈`, `${o.cars} 辆车`, `电脑${LEVEL_NAME[o.level]}`].join(' · ');
}

export function renderWaiting(box: HTMLElement, p: WaitingProps): void {
  box.replaceChildren();
  const head = el('div', 'room-head', box);
  el('div', 'room-label', head, '房间号');
  el('div', 'room-code', head, p.code);
  el('div', 'room-rules', head, rulesLine(p.opts));
  button('act go big share', box, '叫朋友来', p.onShare);
  const seats = el('div', 'room-seats', box);
  const n = p.opts?.cars ?? p.room.seats.length;
  p.room.seats.slice(0, n).forEach((s, i) => {
    const mine = p.you?.seat === i;
    const card = el('div', `room-seat${mine ? ' me' : ''}${s.kind === 'empty' ? ' empty' : ''}${p.suggest === i && s.kind === 'empty' ? ' spot' : ''}`, seats);
    const dot = el('span', 'car-dot', card);
    dot.style.background = CAR_COLORS[i]!.body;
    if (s.kind === 'empty') {
      el('div', 'name', card, '空位');
      button('act soft', card, p.you?.seat === null || p.you?.seat === undefined ? '坐这里' : '换到这里', () => p.onSit(i));
    } else {
      el('div', 'name', card, `${s.name ?? '电脑'}${mine ? '（我）' : ''}${i === 0 ? ' · 房主' : ''}`);
      if (s.away) el('div', 'tag', card, '掉线了');
    }
  });
  el('p', 'room-hint', box, '空着的座位开跑时由电脑补上；开跑以后朋友也能进来接管电脑的车。');
  const row = el('div', 'go-row', box);
  button('act soft', row, '离开房间', p.onLeave);
  if (p.host) button('act go big', row, '开跑', p.onStart);
  else el('span', 'room-wait', row, '等房主开跑');
}

/** 叫朋友来：手机上走系统分享，没有就复制链接。链接带房间号，朋友点开登录后直接进房 */
export async function shareRoom(code: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = new URL(`?room=${code}`, location.href).toString();
  const text = `来${title}跑一场，房间号 ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
