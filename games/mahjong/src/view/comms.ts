/**
 * 好友房的交流（DESIGN.md 第 6 节）：短语、表情包、扔道具、顺手提示、催促炸弹、屏蔽开关。
 * 编号见 game/emotes.ts；表情包和道具直接用 arcade-kit/fun（kit 0.7.0），不自己画。所有人一样、免费，不挂筹码，不影响对局。
 */
import { createFunLayer, playFunSound, PROPS, propSvg, showSticker, STICKERS, stickerSvg, throwAt, type FunLayer } from 'arcade-kit/fun';
import { PHRASE_COUNT, PROP_BASE, PROP_COUNT, STICKER_BASE, STICKER_COUNT } from '../game/emotes.ts';
import { dialogHooks } from './dialog.ts';
import { button, el } from './dom.ts';
import { audioOut } from './sound.ts';
import { PHRASES } from './text.ts';

export const MUTE_KEY = 'mahjong.mute';
/** 轮到的人想了这么久，别人才能扔催促炸弹（纯画面，不缩计时） */
export const URGE_AFTER_MS = 8_000;
const BOMB = PROP_BASE + PROPS.indexOf('bomb');
/** 顺手提示留多久 */
const HINT_MS = 12_000;

/** 牌桌那边要给的：头像在哪、冒气泡、自己是几号 */
export interface CommsHost {
  me(): number | null;
  avatarRect(seat: number): DOMRect;
  avatarEl(seat: number): HTMLElement | null;
  bubble(seat: number, text: string): void;
  /** 这个座位有人（能当对象） */
  occupied(seat: number): boolean;
}

/** 牌局里刚发生的公开的事（顺手提示用） */
export type CommsEvent = { e: 'hu'; seat: number; from: number | null } | { e: 'kan'; seat: number };

export class Comms {
  private readonly layer: FunLayer;
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly host: CommsHost;
  private readonly send: (id: number, to?: number) => void;
  private muted: boolean;
  private tab: 'phrase' | 'sticker' | 'prop' = 'phrase';
  /** 选了道具、等点对象 */
  private aiming: number | null = null;
  private hints: number[] = [];
  private hintAt = 0;
  private urgeTimer = 0;
  private urgeKey = '';

  constructor(parent: HTMLElement, host: CommsHost, send: (id: number, to?: number) => void) {
    this.host = host;
    this.send = send;
    this.muted = readMute();
    this.layer = createFunLayer();
    // 弹窗在舞台里（带缩放的层叠上下文），z-index 夹不到中间：开弹窗时把好玩图层藏起来
    dialogHooks({ open: () => this.layer.hide(), close: () => this.layer.show() });
    this.root = el('div', 'comms', parent);
    button('comms-btn', this.root, '聊', () => this.toggle());
    this.panel = el('div', 'comms-panel', this.root);
    this.panel.hidden = true;
  }

  destroy(): void {
    window.clearTimeout(this.urgeTimer);
    dialogHooks({ open() {}, close() {} });
    this.layer.destroy();
    this.root.remove();
    document.querySelector('.urge')?.remove();
  }

  /** 房间转发来的（含自己发的） */
  receive(seat: number, id: number, to?: number): void {
    const me = this.host.me();
    if (this.muted && seat !== me) return;
    if (id < PHRASE_COUNT) return this.host.bubble(seat, PHRASES[id]!);
    if (id < STICKER_BASE + STICKER_COUNT) {
      void showSticker(this.layer, this.host.avatarRect(seat), STICKERS[id - STICKER_BASE]!);
      return;
    }
    if (id < PROP_BASE + PROP_COUNT && to !== undefined) {
      const prop = PROPS[id - PROP_BASE]!;
      void throwAt(this.layer, this.host.avatarRect(seat), this.host.avatarRect(to), prop, {
        target: to,
        sound: (p, phase) => {
          const a = audioOut();
          if (a) playFunSound(a.ctx, a.out, p, phase);
        },
        onHit: () => {
          const av = this.host.avatarEl(to);
          av?.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.86) rotate(-6deg)' }, { transform: 'scale(1)' }], { duration: 320 });
        },
      });
    }
  }

  /** 新的公开事件：换一组顺手提示（不发，点了才发） */
  events(evs: readonly CommsEvent[]): void {
    const me = this.host.me();
    if (me === null) return;
    let pick: number[] | null = null;
    for (const e of evs) {
      if (e.e === 'hu' && e.seat === me) pick = [1, 8];
      else if (e.e === 'hu' && e.from === me) pick = [10, 13];
      else if (e.e === 'hu') pick = [2, 12];
      else if (e.e === 'kan' && e.seat !== me) pick = [5, 2];
      else if (e.e === 'kan') pick = [5, 0];
    }
    if (!pick) return;
    this.hints = pick;
    this.hintAt = Date.now();
    if (!this.panel.hidden) this.paint();
    this.root.classList.add('nudge');
    window.setTimeout(() => this.root.classList.remove('nudge'), 1_200);
  }

  /**
   * 催促炸弹：seat 是现在一个人在想的别的真人（没有就 null），since 是他开始想的时间。想够 8 秒，他头像旁冒一个炸弹，点了冲他扔一个
   * （和道具一样走房间，所有人都看到）；同一手只能扔一次
   */
  urge(seat: number | null, since: number): void {
    const key = seat === null ? '' : `${seat}@${since}`;
    if (key === this.urgeKey) return;
    this.urgeKey = key;
    window.clearTimeout(this.urgeTimer);
    document.querySelector('.urge')?.remove();
    if (seat === null || this.muted) return;
    this.urgeTimer = window.setTimeout(() => {
      const badge = this.host.avatarEl(seat)?.parentElement;
      if (!badge || this.urgeKey !== key) return;
      const b = button('urge', badge, '', () => {
        b.remove();
        this.send(BOMB, seat);
      });
      b.title = '催一下';
      b.innerHTML = propSvg('bomb');
    }, Math.max(0, since + URGE_AFTER_MS - Date.now()));
  }

  private toggle(): void {
    this.panel.hidden = !this.panel.hidden;
    this.aiming = null;
    if (!this.panel.hidden) this.paint();
  }

  private close(): void {
    this.panel.hidden = true;
    this.aiming = null;
  }

  private paint(): void {
    const p = this.panel;
    p.replaceChildren();
    const tabs = el('div', 'comms-tabs', p);
    for (const [id, text] of [
      ['phrase', '说一句'],
      ['sticker', '表情'],
      ['prop', '道具'],
    ] as const) {
      button(`chip${this.tab === id ? ' on' : ''}`, tabs, text, () => {
        this.tab = id;
        this.aiming = null;
        this.paint();
      });
    }
    button(`chip mute${this.muted ? ' on' : ''}`, tabs, this.muted ? '已屏蔽' : '屏蔽别人', () => {
      this.muted = !this.muted;
      writeMute(this.muted);
      this.paint();
    });
    const body = el('div', `comms-body ${this.tab}`, p);
    if (this.tab === 'phrase') {
      const hints = Date.now() - this.hintAt < HINT_MS ? this.hints : [];
      for (const i of hints) this.say(body, i, 'hint');
      for (let i = 0; i < PHRASE_COUNT; i++) if (!hints.includes(i)) this.say(body, i, '');
    } else if (this.tab === 'sticker') {
      STICKERS.forEach((s, i) => {
        const b = button('pic', body, '', () => this.fire(STICKER_BASE + i));
        b.innerHTML = stickerSvg(s);
      });
    } else if (this.aiming === null) {
      PROPS.forEach((s, i) => {
        const b = button('pic', body, '', () => {
          this.aiming = PROP_BASE + i;
          this.paint();
        });
        b.innerHTML = propSvg(s);
      });
    } else {
      el('div', 'aim', body, '扔给谁？');
      const me = this.host.me();
      for (let s = 0; s < 4; s++) {
        if (s === me || !this.host.occupied(s)) continue;
        button('act soft', body, this.nameOf(s), () => this.fire(this.aiming!, s));
      }
    }
  }

  private nameOf(seat: number): string {
    return this.host.avatarEl(seat)?.parentElement?.querySelector('.name')?.textContent ?? `${seat + 1} 号`;
  }

  private say(box: HTMLElement, i: number, cls: string): void {
    button(`phrase ${cls}`, box, PHRASES[i]!, () => this.fire(i));
  }

  private fire(id: number, to?: number): void {
    this.send(id, to);
    this.close();
  }
}

function readMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMute(on: boolean): void {
  try {
    if (on) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // 存不上就这一次有效
  }
}
