/**
 * 好友房的交流（DESIGN.md 第 6 节）：短语、表情包、扔道具、屏蔽开关。
 * 编号见 game/emotes.ts；表情包和道具直接用 arcade-kit/fun，不自己画。所有人一样、免费，不影响比赛。
 * "头像"是名次栏里那一行的颜色点：短语在那一行冒气泡，表情冒在旁边，道具从发的人那行扔到对象那行。
 */
import { createFunLayer, playFunSound, PROPS, propSvg, showSticker, STICKERS, stickerSvg, throwAt, type FunLayer } from 'arcade-kit/fun';
import { PHRASE_COUNT, PROP_BASE, PROP_COUNT, STICKER_BASE, STICKER_COUNT } from '../game/emotes.ts';
import { dialogHooks } from './dialog.ts';
import { button, el } from './dom.ts';
import { audioOut } from './sound.ts';
import { PHRASES } from './text.ts';

export const MUTE_KEY = 'racing.mute';

export interface CommsHost {
  me(): number | null;
  /** 这个座位在名次栏里的那一行 */
  rowEl(seat: number): HTMLElement | null;
  name(seat: number): string;
  occupied(seat: number): boolean;
  seats(): number;
}

export class Comms {
  private readonly layer: FunLayer;
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private muted: boolean;
  private tab: 'phrase' | 'sticker' | 'prop' = 'phrase';
  private aiming: number | null = null;

  private readonly host: CommsHost;
  private readonly send: (id: number, to?: number) => void;

  constructor(parent: HTMLElement, host: CommsHost, send: (id: number, to?: number) => void) {
    this.host = host;
    this.send = send;
    this.muted = readMute();
    this.layer = createFunLayer();
    dialogHooks({ open: () => this.layer.hide(), close: () => this.layer.show() });
    this.root = el('div', 'comms', parent);
    button('comms-btn', this.root, '聊', () => this.toggle());
    this.panel = el('div', 'comms-panel', this.root);
    this.panel.hidden = true;
  }

  destroy(): void {
    dialogHooks({ open() {}, close() {} });
    this.layer.destroy();
    this.root.remove();
  }

  private rect(seat: number): DOMRect {
    const r = this.host.rowEl(seat)?.querySelector('.dot')?.getBoundingClientRect();
    return r ?? new DOMRect(window.innerWidth - 60, 60, 24, 24);
  }

  /** 房间转发来的（含自己发的） */
  receive(seat: number, id: number, to?: number): void {
    if (this.muted && seat !== this.host.me()) return;
    if (id < PHRASE_COUNT) return this.bubble(seat, PHRASES[id]!);
    if (id < STICKER_BASE + STICKER_COUNT) {
      void showSticker(this.layer, this.rect(seat), STICKERS[id - STICKER_BASE]!);
      return;
    }
    if (id < PROP_BASE + PROP_COUNT && to !== undefined) {
      void throwAt(this.layer, this.rect(seat), this.rect(to), PROPS[id - PROP_BASE]!, {
        target: to,
        sound: (p, phase) => {
          const a = audioOut();
          if (a) playFunSound(a.ctx, a.out, p, phase);
        },
        onHit: () => {
          this.host.rowEl(to)?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 320 });
        },
      });
    }
  }

  /** 名次栏那一行冒一个气泡（电脑的台词也走这里） */
  bubble(seat: number, text: string): void {
    const row = this.host.rowEl(seat);
    if (!row) return;
    row.querySelector('.bubble')?.remove();
    const b = el('div', 'bubble', row, text);
    window.setTimeout(() => b.remove(), 2_600);
  }

  private toggle(): void {
    this.panel.hidden = !this.panel.hidden;
    this.aiming = null;
    if (!this.panel.hidden) this.paint();
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
      for (let i = 0; i < PHRASE_COUNT; i++) button('phrase', body, PHRASES[i]!, () => this.fire(i));
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
      for (let s = 0; s < this.host.seats(); s++) {
        if (s === me || !this.host.occupied(s)) continue;
        button('act soft', body, this.host.name(s), () => this.fire(this.aiming!, s));
      }
    }
  }

  private fire(id: number, to?: number): void {
    this.send(id, to);
    this.panel.hidden = true;
    this.aiming = null;
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
