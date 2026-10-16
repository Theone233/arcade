import Phaser from 'phaser';
import { isTouch } from '../input.ts';
import { sound } from '../sound.ts';
import type { UiSound } from '../audio/index.ts';
import { COLOR, PHONE } from '../theme.ts';
import type { Glyph } from '../assets.ts';
import { addGlyph, addSlice, type Box } from './art.ts';
import { MIN_TEXT_SIZE, addText, setColor, setWrap } from './text.ts';
import { bindTooltip, type TipContent } from './tooltip.ts';

/** primary 橙色大按钮（开盘）、buy 蓝色买入、default 纸面、ghost 低调、danger 红色。 */
type ButtonVariant = 'primary' | 'buy' | 'default' | 'ghost' | 'danger';

interface ButtonOpts {
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  variant?: ButtonVariant;
  /** 快捷键提示（触屏设备上不显示） */
  hotkey?: string;
  /** 主文字下方的一行小字 */
  subLabel?: string;
  /** 文字左边的小图标（0.5.8「大厅」） */
  icon?: Glyph;
  /** 点击音效；null 表示不发声（由调用方自己发） */
  sound?: UiSound | null;
  onClick?: () => void;
  /** 手机上看不见的点击区往上 / 往下各多出多少（不给时按 HIT_MIN 上下平分）；只往一边撑时用（比如卖出键不能往上盖住卡片） */
  hitPad?: { top: number; bottom: number };
}

/** 手机上点击区至少这么高（世界单位；844×390 上约 44px，手指点得准）。电脑上不撑。 */
export const HIT_MIN = PHONE ? 50 : 0;

interface Look {
  fill: number;
  stroke: number;
  text: number;
  /** 用九宫格素材 */
  slice?: 'button_big' | 'button_buy';
}

const LOOK: Record<ButtonVariant, Look> = {
  primary: { fill: COLOR.accent, stroke: COLOR.ink, text: COLOR.white, slice: 'button_big' },
  buy: { fill: COLOR.info, stroke: COLOR.ink, text: COLOR.white, slice: 'button_buy' },
  default: { fill: COLOR.paperHi, stroke: COLOR.ink, text: COLOR.ink },
  ghost: { fill: COLOR.paper, stroke: COLOR.edge, text: COLOR.muted },
  danger: { fill: 0xfbe1dc, stroke: COLOR.danger, text: COLOR.danger },
};
const DISABLED: Look = { fill: 0xe9dfd2, stroke: 0xb9a9ad, text: 0x6e5966 };
const SELECTED: Look = { fill: 0xffe3c2, stroke: COLOR.accentDark, text: COLOR.ink };

/** 卡通按钮；坐标为左上角。 */
/** 禁用的按钮被点时在场景上发的事件，参数是原因文字。 */
export const DENIED_EVENT = 'kp:denied';

export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Box;
  private readonly lip: Phaser.GameObjects.Rectangle | null;
  private flat: Phaser.GameObjects.Rectangle | null = null;
  private readonly shine: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly key: Phaser.GameObjects.Text | null;
  private readonly sub: Phaser.GameObjects.Text | null;
  private readonly hit: Phaser.GameObjects.Rectangle;
  private readonly sound: UiSound | null;
  private readonly variant: ButtonVariant;
  private onClick: (() => void) | undefined;
  private enabled = true;
  private locked = false;
  private selected = false;
  private hovered = false;
  readonly cw: number;
  readonly ch: number;
  private readonly fontSize: number;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.cw = opts.width;
    this.ch = opts.height;
    this.variant = opts.variant ?? 'default';
    this.onClick = opts.onClick;
    const look = LOOK[this.variant];
    const r = Math.min(12, opts.height / 2);
    if (look.slice) {
      this.lip = null;
      this.bg = addSlice(scene, 0, 0, opts.width, opts.height, look.slice);
      this.flat = scene.add.rectangle(0, 2, opts.width, opts.height - 4, DISABLED.fill).setOrigin(0, 0).setRounded(r).setStrokeStyle(2, DISABLED.stroke, 1).setVisible(false);
    } else {
      // 纸面按钮：底部一道深色厚边，按下时下沉
      this.lip = scene.add.rectangle(0, 3, opts.width, opts.height, COLOR.ink, 0.85).setOrigin(0, 0).setRounded(r);
      this.bg = scene.add.rectangle(0, 0, opts.width, opts.height, look.fill).setOrigin(0, 0).setRounded(r).setStrokeStyle(2, look.stroke, 1);
    }
    this.shine = scene.add.rectangle(3, 3, opts.width - 6, opts.height - 8, 0xffffff, 0).setOrigin(0, 0).setRounded(Math.max(2, r - 3));
    const hotkey = isTouch() ? undefined : opts.hotkey;
    const fs = opts.fontSize ?? 15;
    this.fontSize = fs;
    const subSize = Math.max(MIN_TEXT_SIZE, Math.round(fs * 0.72));
    const lift = look.slice ? -2 : 0;
    const labelY = opts.subLabel !== undefined ? opts.height / 2 - subSize / 2 - 1 + lift : opts.height / 2 + lift;
    this.label = addText(scene, opts.width / 2, labelY, opts.label, { size: fs, bold: true, align: 'center', originX: 0.5, originY: 0.5 });
    // 图标和文字作为一组居中
    const iconSize = Math.round(fs * 1.5);
    const icon = opts.icon ? addGlyph(scene, opts.width / 2 - this.label.width / 2 - 3, labelY, opts.icon, iconSize) : null;
    if (icon) this.label.x += iconSize / 2 + 3;
    this.sub =
      opts.subLabel !== undefined
        ? addText(scene, opts.width / 2, labelY + fs / 2 + 2, opts.subLabel, { size: subSize, align: 'center', originX: 0.5 })
        : null;
    this.key = hotkey
      ? addText(scene, opts.width - 7, opts.height / 2 + lift, hotkey, { size: 11, bold: true, color: look.slice ? 0xffffff : COLOR.dim, originX: 1, originY: 0.5 })
      : null;
    if (this.key && look.slice) this.key.setAlpha(0.8);
    this.fitLabel();
    // 窄按钮：文字和快捷键挤在一起时，文字往左让出快捷键的位置
    if (this.key && this.label.width / 2 + this.key.width + 12 > opts.width / 2) {
      this.label.x = Math.max(this.label.width / 2 + 6, (opts.width - this.key.width - 10) / 2);
      if (this.sub) this.sub.x = this.label.x;
    }
    this.sound = opts.sound === undefined ? 'click' : opts.sound;
    const even = Math.max(0, (HIT_MIN - (opts.height + 3)) / 2);
    const pad = PHONE && opts.hitPad ? opts.hitPad : { top: even, bottom: even };
    const padX = Math.max(0, (HIT_MIN - opts.width) / 2);
    this.hit = scene.add.rectangle(-padX, -pad.top, opts.width + padX * 2, opts.height + 3 + pad.top + pad.bottom, 0xffffff, 0.001).setOrigin(0, 0);
    this.add([...(this.lip ? [this.lip] : []), ...(this.flat ? [this.flat] : []), this.bg, this.shine, ...(icon ? [icon] : []), this.label, ...(this.sub ? [this.sub] : []), ...(this.key ? [this.key] : []), this.hit]);
    this.hit.setInteractive({ useHandCursor: true });
    this.hit.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hovered = true;
      if (this.clickable()) sound.ui('hover');
      this.redraw();
    });
    this.hit.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.hovered = false;
      this.redraw();
    });
    this.hit.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.press();
    });
    this.redraw();
    scene.add.existing(this);
  }

  /** 像被点了一下（键盘快捷键也走这里，按钮会闪一下）。 */
  press(): boolean {
    if (!this.clickable()) {
      if (this.visible) {
        sound.ui('denied');
        // 点了不能点的按钮：说明原因（场景监听 DENIED_EVENT 显示轻提示）
        const why = !this.enabled ? this.deniedReason?.() : null;
        if (why) this.scene.events.emit(DENIED_EVENT, why);
      }
      return false;
    }
    if (this.sound) sound.ui(this.sound);
    this.shine.setAlpha(0.35);
    this.scene.time.delayedCall(90, () => {
      if (this.active) this.redraw();
    });
    this.onClick?.();
    return true;
  }

  setEnabled(enabled: boolean): this {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.redraw();
    }
    return this;
  }

  /** 锁定：不可点击但外观不变（动画进行中）。 */
  setLocked(locked: boolean): this {
    if (this.locked !== locked) {
      this.locked = locked;
      this.redraw();
    }
    return this;
  }

  isEnabled(): boolean {
    return this.clickable();
  }

  /** 按钮本身是不是可用的（不管它此刻在不在屏幕上，比如在没打开的标签页里）。 */
  get usable(): boolean {
    return this.enabled;
  }

  setSelected(selected: boolean): this {
    if (this.selected !== selected) {
      this.selected = selected;
      this.redraw();
    }
    return this;
  }

  setLabel(text: string): this {
    if (this.label.text !== text) {
      this.label.setText(text).setFontSize(this.fontSize);
      this.fitLabel();
    }
    return this;
  }

  /** 文字比按钮宽时缩小字号；高按钮还放不下就折成两行（事件选项），不溢出按钮。 */
  private fitLabel(): void {
    const room = this.cw - 14 - (this.key ? this.key.width + 8 : 0);
    let size = this.fontSize;
    const floor = Math.max(MIN_TEXT_SIZE, this.ch >= 44 ? 13 : 11);
    while (this.label.width > room && size > floor) {
      size -= 1;
      this.label.setFontSize(size);
    }
    if (this.label.width <= room || this.ch < 44) return;
    setWrap(this.label, room).setLineSpacing(2);
    size = this.fontSize;
    this.label.setFontSize(size);
    while ((this.label.height > this.ch - 10 || this.label.width > room) && size > MIN_TEXT_SIZE) {
      size -= 1;
      this.label.setFontSize(size);
    }
  }

  setSubLabel(text: string): this {
    this.sub?.setText(text);
    return this;
  }

  setHandler(fn: () => void): this {
    this.onClick = fn;
    return this;
  }

  /** 悬停说明（绑定在按钮的点击区上）。 */
  private deniedReason: (() => string | null) | null = null;

  /** 按钮禁用时被点（或按了快捷键）要说明的原因。 */
  onDenied(reason: () => string | null): this {
    this.deniedReason = reason;
    return this;
  }

  tooltip(content: () => TipContent | null): this {
    bindTooltip(this.hit, () => this.rect(), content);
    return this;
  }

  /** 世界坐标下的中心点（自动化脚本点击用）。 */
  center(): { x: number; y: number } {
    const m = this.getWorldTransformMatrix();
    return { x: m.tx + (this.cw / 2) * m.scaleX, y: m.ty + (this.ch / 2) * m.scaleY };
  }

  /** 世界坐标下的矩形（引导气泡定位用）。 */
  rect(): { x: number; y: number; w: number; h: number } {
    const m = this.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty, w: this.cw * m.scaleX, h: this.ch * m.scaleY };
  }

  private clickable(): boolean {
    if (!this.enabled || this.locked || !this.visible) return false;
    // 父容器隐藏时也不可点
    let p = this.parentContainer;
    while (p) {
      if (!p.visible) return false;
      p = p.parentContainer;
    }
    return true;
  }

  private redraw(): void {
    const base = LOOK[this.variant];
    const look = !this.enabled ? DISABLED : this.selected ? SELECTED : base;
    const hover = this.hovered && this.clickable();
    if (base.slice) {
      // 停用：彩色素材换成浅灰纸面按钮，文字仍看得清
      this.bg.setVisible(this.enabled);
      this.flat?.setVisible(!this.enabled);
    } else if (this.bg instanceof Phaser.GameObjects.Rectangle) {
      this.bg.setFillStyle(look.fill, 1);
      this.bg.setStrokeStyle(this.selected ? 3 : 2, look.stroke, 1);
    }
    this.shine.setAlpha(hover ? 0.18 : 0);
    this.lip?.setAlpha(this.enabled ? 0.85 : 0.3);
    setColor(this.label, base.slice && this.enabled ? base.text : look.text);
    if (base.slice && this.enabled) this.label.setStroke('#3a2634', 3);
    else this.label.setStroke('#000000', 0);
    // 停用时小字用停用色里最深的那档（银行「N月开」以前是浅灰字落在灰底上，看不清）
    if (this.sub) setColor(this.sub, base.slice && this.enabled ? 0xffffff : this.enabled ? COLOR.muted : DISABLED.text);
    if (this.hit.input) this.hit.input.cursor = this.clickable() ? 'pointer' : 'default';
    this.key?.setVisible(this.enabled && !this.locked);
  }
}
